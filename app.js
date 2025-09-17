require('dotenv').config();
const { DateTime } = require('luxon');
const express = require('express');
const path = require('path');
const ejsLayouts = require('express-ejs-layouts');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { admin } = require('./config/firebase');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Middleware ----
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(bodyParser.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(ejsLayouts);
app.set('layout', 'base');
app.use(express.static(path.join(__dirname, 'public')));

// ---- Helper: OAuth2 client ----
function createOAuthClient() {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oAuth2Client;
}

// ---- Get busy times ----
async function getBusyTimes(date) {
  const oAuth2Client = createOAuthClient();
  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

  const timeMin = `${date}T08:00:00+02:00`;
  const timeMax = `${date}T20:00:00+02:00`;

  try {
    const response = await calendar.freebusy.query({
      requestBody: { timeMin, timeMax, items: [{ id: 'primary' }] }
    });

    const busy = response.data.calendars.primary.busy || [];
    return busy;
  } catch (error) {
    console.error('Ошибка при получении busy times:', error.message);
    throw error;
  }
}

// ---- Get user events ----
async function getUserEvents(userEmail) {
  const oAuth2Client = createOAuthClient();
  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

  try {
    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: oneYearAgo.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    const userEvents = events.filter(event => {
      if (event.attendees) return event.attendees.some(a => a.email === userEmail);
      return event.creator?.email === userEmail || event.organizer?.email === userEmail;
    });

    const pastEvents = userEvents.filter(event => new Date(event.start.dateTime) < now);
    const upcomingEvents = userEvents.filter(event => new Date(event.start.dateTime) >= now);

    return { pastEvents, upcomingEvents };
  } catch (error) {
    console.error('Ошибка при получении событий пользователя:', error.message);
    throw error;
  }
}

// ---- Add event ----
async function addEvent(eventDetails, loyalty) {
  try {
    const oAuth2Client = createOAuthClient();
    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

    const loyaltyInfo = loyalty.level !== 'Brak'
      ? `Poziom lojalności: ${loyalty.level}\nZniżka: ${loyalty.discount}%\nRezerwacje w historii: ${loyalty.totalReservations}`
      : 'Użytkownik niezalogowany – brak poziomu lojalności i zniżek.';

    const event = {
      summary: eventDetails.summary || 'Rezerwacja',
      location: eventDetails.location || 'Nie podano lokalizacji',
      description: `${eventDetails.description || ''}\n\n${loyaltyInfo}`,
      start: { dateTime: eventDetails.start.dateTime, timeZone: eventDetails.start.timeZone || 'Europe/Warsaw' },
      end: { dateTime: eventDetails.end.dateTime, timeZone: eventDetails.end.timeZone || 'Europe/Warsaw' },
      attendees: eventDetails.attendees || [],
      reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 1440 }, { method: 'popup', minutes: 10 }] }
    };

    const response = await calendar.events.insert({ calendarId: 'primary', resource: event });
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Ошибка при создании события:', error);
    throw error;
  }
}

// ---- Loyalty ----
function getLoyaltyLevel(completedReservations) {
  let level = '', discount = 0, progress = 0;
  if (completedReservations >= 11) { level = 'Gold'; discount = 15; progress = 100; }
  else if (completedReservations >= 6) { level = 'Platinum'; discount = 10; progress = ((completedReservations - 6) / 5) * 100 + 50; }
  else if (completedReservations >= 1) { level = 'Silver'; discount = 5; progress = (completedReservations / 5) * 50; }
  else { level = 'None'; discount = 0; progress = 0; }
  return { level, discount, progress };
}

// ---- Middleware: Firebase token ----
app.use(async (req, res, next) => {
  const token = req.cookies.authToken;
  if (!token) { req.user = null; res.locals.user = null; return next(); }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = { uid: decodedToken.uid, email: decodedToken.email };
    res.locals.user = req.user;
  } catch {
    req.user = null;
    res.locals.user = null;
  }
  next();
});

// ---- Routes ----
app.post('/addEvent', async (req, res) => {
  try {
    let userEmail = req.body.email;
    let loyalty = { level: 'Brak', discount: 0, totalReservations: 0 };

    if (req.user) {
      userEmail = req.user.email;
      const { pastEvents } = await getUserEvents(userEmail);
      loyalty = getLoyaltyLevel(pastEvents.length);
    }

    const eventResult = await addEvent(req.body, loyalty);
    res.json({ status: 'success', eventUrl: eventResult.data.htmlLink });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/getBusyTimes', async (req, res) => {
  try {
    const { date } = req.body;
    const busyTimes = await getBusyTimes(date);

    const busyHours = [];
    busyTimes.forEach(slot => {
      const start = DateTime.fromISO(slot.start, { zone: 'Europe/Warsaw' }).hour;
      const end = DateTime.fromISO(slot.end, { zone: 'Europe/Warsaw' }).hour;
      for (let h = start; h < end; h++) busyHours.push(h);
    });

    const allHours = Array.from({ length: 13 }, (_, i) => i + 8);
    const availableHours = allHours.filter(h => !busyHours.includes(h));

    res.json({ availableHours });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch available hours' });
  }
});


// Authentication routes (register/login/verifyToken/setToken) — оставляем как есть
// (скопируем/используем оригинальные обработчики из твоего файла)

app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    const userRecord = await admin.auth().createUser({ email, password });
    console.log('Зарегистрирован пользовател:', userRecord.uid);
    res.send('Rejestracja zakończona sukcesem! Możesz teraz <a href="/login">zalogować się</a>.');
  } catch (error) {
    console.error('Błąd podczas rejestracji:', error.message);
    res.status(400).send(`Błąd rejestracji: ${error.message}`);
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    const customToken = await admin.auth().createCustomToken(userRecord.uid);
    res.json({ customToken });
  } catch (error) {
    console.error('Błąd podczas logowania:', error.message);
    res.status(400).json({ error: error.message });
  }
});

app.post('/verifyToken', async (req, res) => {
  const { idToken } = req.body;
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    res.json({ success: true, uid: decodedToken.uid });
  } catch (error) {
    console.error('Błąd weryfikacji tokena:', error.message);
    res.status(401).json({ success: false, message: 'Неprawidłowy token' });
  }
});

app.post('/setToken', (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ message: 'Brak tokena do zapisania.' });

  res.cookie('authToken', idToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // true на проде
    maxAge: 3600000,
    sameSite: 'lax'
  });

  res.status(200).json({ message: 'Token zapisany w ciasteczku.' });
});

// Views routes
app.get('/', (req, res) => res.render('home', { title: 'OP Detailing - Strona główna' }));

app.get('/reservations', (req, res) => {
  const userEmail = req.user ? req.user.email : '';
  res.render('reservations', { title: 'Rezerwacja Terminu', userEmail });
});

app.get('/getFirebaseConfig', (req, res) => {
  res.json({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
  });
});

app.get('/register', (req, res) => res.render('register', { title: 'Rejestracja' }));
app.get('/login', (req, res) => res.render('login', { title: 'Logowanie' }));

app.get('/dashboard', async (req, res) => {
  try {
    if (!req.user) return res.redirect('/login');
    const userEmail = req.user.email;
    const { pastEvents, upcomingEvents } = await getUserEvents(userEmail);
    const completedReservations = pastEvents ? pastEvents.length : 0;
    const loyalty = getLoyaltyLevel(completedReservations);

    res.render('dashboard', { title: 'Dashboard', user: req.user, pastEvents, upcomingEvents, loyalty });
  } catch (error) {
    console.error('Błąд w /dashboard:', error);
    res.status(500).send('Wystąpił błąd podczas ładowania wydarzeń.');
  }
});

app.get('/prices', (req, res) => res.render('prices', { title: 'Cennik Usług' }));

app.post('/logout', (req, res) => {
  res.clearCookie('authToken');
  res.redirect('/login');
});

// Start server
app.listen(PORT, () => {
  console.log(`Serwer uruchomiony pod adresem http://localhost:${PORT}`);
});
