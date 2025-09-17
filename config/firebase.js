// config/firebase.js (server-only)
require('dotenv').config();
const admin = require('firebase-admin');

const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY || '';
const privateKey = rawKey.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey;

admin.initializeApp({
  credential: admin.credential.cert({
    project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
    private_key: privateKey,
    client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

module.exports = { admin };
