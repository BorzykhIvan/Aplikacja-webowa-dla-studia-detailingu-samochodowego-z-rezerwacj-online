import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.2/firebase-app.js";
import { getAuth, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/9.17.2/firebase-auth.js";

// Konfiguracja Firebase (teraz pobierana z backendu)
let firebaseConfig = {};

// Najpierw pobierz konfigurację z backendu
async function getFirebaseConfig() {
    try {
        const response = await fetch('/getFirebaseConfig');
        return await response.json();
    } catch (error) {
        console.error('Błąd pobierania konfiguracji Firebase:', error);
        throw new Error('Nie można załadować konfiguracji Firebase');
    }
}

// Inicjalizacja Firebase
async function initializeFirebase() {
    firebaseConfig = await getFirebaseConfig();
    const app = initializeApp(firebaseConfig);
    return getAuth(app);
}

// Inicjalizacja i obsługa logowania
(async function() {
    const frontendAuth = await initializeFirebase();
    
    document.getElementById('login-form').addEventListener('submit', async (event) => {
        event.preventDefault();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value.trim();

        try {
            // Krok 1: Wyślij dane logowania do backendu
            const loginResponse = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (!loginResponse.ok) {
                const errorData = await loginResponse.json();
                throw new Error(errorData.error || 'Logowanie nie powiodło się');
            }

            // Krok 2: Odbierz custom token
            const { customToken } = await loginResponse.json();
            
            // Krok 3: Zaloguj użytkownika w Firebase
            const userCredential = await signInWithCustomToken(frontendAuth, customToken);
            const idToken = await userCredential.user.getIdToken();

            // Krok 4: Zapisz token w ciasteczku via backend
            await fetch('/setToken', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken })
            });

            // Krok 5: Przekieruj do dashboardu
            window.location.href = '/dashboard';
            
        } catch (error) {
            console.error('Błąd logowania:', error);
            alert(error.message || 'Wystąpił błąd podczas logowania');
        }
    });
})();