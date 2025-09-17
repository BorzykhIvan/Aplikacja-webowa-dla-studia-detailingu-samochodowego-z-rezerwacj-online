// public/js/initFirebase.js  (используй <script type="module" src="/js/initFirebase.js"></script> или бандлер)
(async () => {
  const res = await fetch('/getFirebaseConfig');
  const cfg = await res.json();

  // динамический импорт веб-SDK
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/9.17.2/firebase-app.js');
  const { getAuth } = await import('https://www.gstatic.com/firebasejs/9.17.2/firebase-auth.js');
  const { getFirestore } = await import('https://www.gstatic.com/firebasejs/9.17.2/firebase-firestore.js');

  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app);

  // Если другие скрипты будут использовать auth/db, положим их в window
  window.firebaseApp = app;
  window.firebaseAuth = auth;
  window.firebaseDb = db;
})();
