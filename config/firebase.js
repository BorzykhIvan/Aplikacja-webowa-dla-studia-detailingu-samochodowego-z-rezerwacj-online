// Import Firebase Admin SDK (backend)
const admin = require('firebase-admin');
// Import Firebase Client SDK (frontend)
const { initializeApp } = require("firebase/app");
const { getAuth } = require("firebase/auth");
const { getFirestore } = require("firebase/firestore");

// Konfiguracja Client SDK (frontend)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// Inicjalizacja Firebase Client SDK
let clientApp;
let frontendAuth;
let frontendDb;

try {
  clientApp = initializeApp(firebaseConfig); // Inicjalizacja Client SDK
  frontendAuth = getAuth(clientApp);        // Autoryzacja na froncie
  frontendDb = getFirestore(clientApp);     // Firestore na froncie
  console.log("Client SDK initialized successfully.");
} catch (error) {
  console.error("Error initializing Client SDK:", error.message);
}

// Konfiguracja Admin SDK (backend)
const serviceAccount = require('./serviceAccountKey.json');

// Inicjalizacja Admin SDK
try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n')
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL // Dodane
  });
  console.log("Firebase Admin SDK initialized");
} catch (error) {
  console.error("Admin SDK init error:", error);
}

// Eksport funkcji i instancji
module.exports = {
  admin,            // Firebase Admin SDK (backend)
  backendAuth: admin.auth(),      // Autoryzacja na backendzie
  backendDb: admin.firestore(),   // Firestore na backendzie
  frontendAuth,     // Firebase Client SDK Auth (frontend)
  frontendDb,       // Firestore na froncie
};
