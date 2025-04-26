require('dotenv').config(); // Ładuje zmienne z .env
const express = require('express');
const path = require('path');
const ejsLayouts = require('express-ejs-layouts');
const fs = require('fs');
const { google } = require('googleapis');
const bodyParser = require('body-parser');

const { frontendAuth } = require('./config/firebase'); // Import Firebase Client SDK
const { admin } = require('./config/firebase');
const app = express();
const PORT = process.env.PORT || 3000;

const TOKEN_PATH = path.join(__dirname, 'config', 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'config', 'credentials.json');

async function loadCredentials() {
    const content = await fs.promises.readFile(CREDENTIALS_PATH);
    return JSON.parse(content);
}

async function loadToken() {
    const content = await fs.promises.readFile(TOKEN_PATH);
    return JSON.parse(content);
}

const cookieParser = require('cookie-parser');
app.use(cookieParser());


app.use(express.urlencoded({ extended: true })); // Middleware do parsowania danych formularza
app.use(express.json()); // Middleware do parsowania JSON

// Funkcja do pobierania dostępnych godzin
async function getBusyTimes(date) {
    const credentials = await loadCredentials();
    const token = await loadToken();

    const { client_secret, client_id, redirect_uris } = credentials.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    oAuth2Client.setCredentials(token);

    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

    // Ustawienia zakresu czasowego w formacie ISO 8601
    const timeMin = `${date}T08:00:00+02:00`; // Zakładając, że chcesz sprawdzać od 08:00
    const timeMax = `${date}T20:00:00+02:00`; // I do 20:00

    try {
        const response = await calendar.freebusy.query({
            requestBody: {
                timeMin: timeMin, // Parametr startu
                timeMax: timeMax, // Parametr końca
                items: [{ id: 'primary' }] // Lista kalendarzy do sprawdzenia
            }
        });

        console.log('Google Calendar response:', response.data); // Logowanie odpowiedzi
        return response.data.calendars.primary.busy; // Zwróć zajęte godziny
    } catch (error) {
        console.error('Błąd podczas pobierania danych z Google Calendar:', error.message);
        throw new Error('Błąd podczas pobierania danych z Google Calendar');
    }
}


app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(ejsLayouts);
app.set('layout', 'base');

app.use(express.static(path.join(__dirname, 'public')));

app.use(bodyParser.json());

app.use((req, res, next) => {
    const user = req.cookies.authToken
        ? req.user // Jeśli użytkownik jest zalogowany
        : null;    // Jeśli użytkownik nie jest zalogowany

    res.locals.user = user; // Przekazanie danych użytkownika do widoków
    next();
});

app.use(async (req, res, next) => {
    const token = req.cookies.authToken; // Odczytaj token z ciasteczek

    if (token) {
        try {
            // Zweryfikuj token za pomocą Firebase Admin SDK
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = {
                uid: decodedToken.uid,
                email: decodedToken.email,
            };
            res.locals.user = req.user; // Udostępnij użytkownika w widokach
        } catch (error) {
            console.error('Błąd weryfikacji tokena:', error.message);
            req.user = null;
            res.locals.user = null;
        }
    } else {
        req.user = null;
        res.locals.user = null;
    }
    next();
});


async function refreshAccessToken(oAuth2Client) {
    try {
        const newToken = await oAuth2Client.refreshAccessToken(); 
        oAuth2Client.setCredentials(newToken.credentials); 

        await fs.promises.writeFile(TOKEN_PATH, JSON.stringify(newToken.credentials));
        console.log('Токен обновлен успешно');
    } catch (error) {
        console.error('Ошибка при обновлении токена:', error.message);
    }
}

// Funkcja do dodawania wydarzenia
async function addEvent(eventDetails, loyalty) {
    try {
        const credentials = await loadCredentials();
        const token = await loadToken();

        const { client_secret, client_id, redirect_uris } = credentials.web;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        oAuth2Client.setCredentials(token);

        const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

        // Informacje o lojalności do opisu wydarzenia
        const loyaltyInfo = loyalty.level !== 'Brak'
            ? `Poziom lojalności: ${loyalty.level}\nZniżka: ${loyalty.discount}%\nRezerwacje w historii: ${loyalty.totalReservations}`
            : 'Użytkownik niezalogowany – brak poziomu lojalności i zniżek.';

        // Szczegóły wydarzenia
        const event = {
            summary: eventDetails.summary || 'Rezerwacja',
            location: eventDetails.location || 'Nie podano lokalizacji',
            description: `${eventDetails.description || ''}\n\n${loyaltyInfo}`,
            start: {
                dateTime: eventDetails.start.dateTime,
                timeZone: eventDetails.start.timeZone || 'Europe/Warsaw',
            },
            end: {
                dateTime: eventDetails.end.dateTime,
                timeZone: eventDetails.end.timeZone || 'Europe/Warsaw',
            },
            attendees: eventDetails.attendees || [],
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'email', minutes: 1440 },
                    { method: 'popup', minutes: 10 },
                ],
            },
        };

        const response = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
        });

        console.log('Wydarzenie utworzone:', response.data.htmlLink);
        return response.data;
    } catch (error) {
        console.error('Błąd podczas tworzenia wydarzenia:', error.message);
        throw new Error('Nie udało się stworzyć wydarzenia');
    }
}



function getLoyaltyLevel(completedReservations) {
    let level = '';
    let discount = 0;
    let progress = 0;

    if (completedReservations >= 11) {
        level = 'Gold';
        discount = 15;
        progress = 100; // Maksymalny poziom
    } else if (completedReservations >= 6) {
        level = 'Platinum';
        discount = 10;
        progress = ((completedReservations - 6) / 5) * 100 + 50; // 50% już osiągnięte
    } else if (completedReservations >= 1) {
        level = 'Silver';
        discount = 5;
        progress = (completedReservations / 5) * 50; // Progres w zakresie 0-50%
    } else {
        level = 'None';
        discount = 0;
        progress = 0; // Brak rezerwacji
    }

    return { level, discount, progress };
}


// Funkcja pobierająca wydarzenia użytkownika z Google Calendar
async function getUserEvents(userEmail) {
    const credentials = await loadCredentials();
    const token = await loadToken();

    const { client_secret, client_id, redirect_uris } = credentials.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    oAuth2Client.setCredentials(token);

    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

    try {
        const now = new Date();
        const oneYearAgo = new Date(now);
        oneYearAgo.setFullYear(now.getFullYear() - 1);

        // Pobranie wydarzeń z ostatniego roku
        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: oneYearAgo.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
        });

        const events = response.data.items || [];

        // Filtrowanie wydarzeń użytkownika
        const userEvents = events.filter(event => {
            if (event.attendees) {
                return event.attendees.some(attendee => attendee.email === userEmail);
            }
            return event.creator?.email === userEmail || event.organizer?.email === userEmail;
        });

        // Podział na historię i nadchodzące rezerwacje
        const pastEvents = userEvents.filter(event => new Date(event.start.dateTime) < now);
        const upcomingEvents = userEvents.filter(event => new Date(event.start.dateTime) >= now);

        return { pastEvents, upcomingEvents };
    } catch (error) {
        console.error('Błąd podczas pobierania wydarzeń:', error.message);
        throw new Error('Błąd podczas pobierania wydarzeń z Google Calendar');
    }
}



// Obsługa żądania POST do dodania wydarzenia
app.post('/addEvent', async (req, res) => {
    try {
        const authToken = req.cookies.authToken; // Sprawdzenie tokena autoryzacji
        let userEmail = req.body.email; // Pobierz email z formularza rezerwacji
        let loyalty = { level: 'Brak', discount: 0, totalReservations: 0 }; // Domyślne wartości lojalności

        if (authToken) {
            // Jeśli token istnieje, zweryfikuj go i oblicz lojalność
            const decodedToken = await admin.auth().verifyIdToken(authToken);
            userEmail = decodedToken.email;

            // Pobierz historię rezerwacji i oblicz poziom lojalności
            const { pastEvents } = await getUserEvents(userEmail);
            const totalReservations = pastEvents.length;

            if (totalReservations > 10) {
                loyalty = { level: 'Gold', discount: 15, totalReservations };
            } else if (totalReservations > 5) {
                loyalty = { level: 'Platinum', discount: 10, totalReservations };
            } else if (totalReservations > 0) {
                loyalty = { level: 'Silver', discount: 5, totalReservations };
            }
        } else {
            console.log('Użytkownik niezalogowany – brak zniżek.');
        }

        // Dodaj rezerwację do Google Kalendarza
        const eventDetails = req.body;
        await addEvent(eventDetails, loyalty);

        res.status(200).send('Rezerwacja została pomyślnie dodana!');
    } catch (error) {
        console.error('Błąd podczas dodawania rezerwacji:', error.message);
        res.status(500).send('Wystąpił problem z dodaniem rezerwacji.');
    }
});



// Endpoint do pobierania dostępnych godzin
app.post('/getBusyTimes', async (req, res) => {
    try {
        const { date } = req.body;

        const openingHour = 8;
        const closingHour = 20;

        // Fetch busy times from Google Calendar
        const busyTimes = await getBusyTimes(date);
        const busyHours = [];
        busyTimes.forEach(slot => {
            const start = new Date(slot.start).getHours();
            const end = new Date(slot.end).getHours();
            for (let hour = start; hour < end; hour++) {
                busyHours.push(hour);
            }
        });

        const allHours = Array.from({ length: closingHour - openingHour + 1 }, (_, i) => openingHour + i);
        const availableHours = allHours.filter(hour => !busyHours.includes(hour));

        console.log('Available Hours:', availableHours);

        res.json({ availableHours });
    } catch (error) {
        console.error('Error in /getBusyTimes:', error);
        res.status(500).json({ error: 'Failed to fetch available hours' });
    }
});


// Middleware do weryfikacji tokena
async function authenticateToken(req, res, next) {
    const token = req.cookies.authToken;

    if (!token) {
        return res.status(401).json({ message: 'Brak autoryzacji' });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email, // Dodanie e-maila użytkownika
        };
        next();
    } catch (error) {
        console.error('Błąd podczas weryfikacji tokena:', error.message);
        res.status(403).json({ message: 'Nieprawidłowy token' });
    }
}



// Trasa rejestracji
app.post('/register', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Tworzenie użytkownika w Firebase Authentication za pomocą Admin SDK
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
        });
        console.log('Zarejestrowano użytkownika:', userRecord.uid);
        res.send('Rejestracja zakończona sukcesem! Możesz teraz <a href="/login">zalogować się</a>.');
    } catch (error) {
        console.error('Błąd podczas rejestracji:', error.message);
        res.status(400).send(`Błąd rejestracji: ${error.message}`);
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    console.log('Otrzymano żądanie logowania:', { email, password });

    try {
        const userRecord = await admin.auth().getUserByEmail(email);
        console.log('Zalogowano użytkownika w backendzie:', userRecord.uid);

        const customToken = await admin.auth().createCustomToken(userRecord.uid);

        //console.log('Wygenerowano customToken:', customToken);

        res.json({ customToken });
    } catch (error) {
        console.error('Błąd podczas logowania:', error.message);
        res.status(400).json({ error: error.message });
    }
});



// Trasa logowania – weryfikacja tokena
app.post('/verifyToken', async (req, res) => {
    const { idToken } = req.body;

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        console.log('Zweryfikowany użytkownik:', decodedToken.uid);
        res.json({ success: true, uid: decodedToken.uid });
    } catch (error) {
        console.error('Błąd weryfikacji tokena:', error.message);
        res.status(401).json({ success: false, message: 'Nieprawidłowy token' });
    }
});


app.post('/setToken', (req, res) => {
    const { idToken } = req.body;

    console.log('Otrzymano żądanie zapisu tokena:', idToken);

    if (!idToken) {
        console.error('Brak tokena do zapisania.');
        return res.status(400).json({ message: 'Brak tokena do zapisania.' });
    }

    res.cookie('authToken', idToken, {
        httpOnly: true,
        secure: false, // Ustaw na true, jeśli używasz HTTPS
        maxAge: 3600000, // 1 godzina
    });

    console.log('Token zapisany w ciasteczku.');
    res.status(200).json({ message: 'Token zapisany w ciasteczku.' });
});




// Strona glowna
app.get('/', (req, res) => {
    res.render('home', { title: 'OP Detailing - Strona główna' });
});

app.get('/reservations', (req, res) => {
    const userEmail = req.user ? req.user.email : ''; // Pobierz email użytkownika, jeśli jest zalogowany
    res.render('reservations', {
        title: 'Rezerwacja Terminu',
        userEmail, // Przekaż email do widoku
    });
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

// Trasa wyświetlania formularza rejestracji
app.get('/register', (req, res) => {
    res.render('register', { title: 'Rejestracja' });
});

// Trasa wyświetlania formularza logowania
app.get('/login', (req, res) => {
    res.render('login', { title: 'Logowanie' });;
});

app.get('/dashboard', authenticateToken, async (req, res) => {
    const userEmail = req.user.email; // Pobranie e-maila użytkownika z tokena
    try {
        const { pastEvents, upcomingEvents } = await getUserEvents(userEmail); // Pobranie wydarzeń
        const completedReservations = pastEvents ? pastEvents.length : 0;

        // Obliczenie poziomu lojalności
        const loyalty = getLoyaltyLevel(completedReservations);

        res.render('dashboard', {
            title: 'Dashboard',
            user: req.user,
            pastEvents,
            upcomingEvents,
            loyalty, // Przekazanie danych lojalności
        });
    } catch (error) {
        console.error('Błąd w /dashboard:', error);
        res.status(500).send('Wystąpił błąd podczas ładowania wydarzeń.');
    }
});

app.get('/prices', (req, res) => {
    res.render('prices', { title: 'Cennik Usług' });
});


app.post('/logout', (req, res) => {
    res.clearCookie('authToken');
    res.redirect('/login');
});

// Uruchamiamy serwer
app.listen(PORT, () => {
    console.log(`Serwer uruchomiony pod adresem http://localhost:${PORT}`);
});

