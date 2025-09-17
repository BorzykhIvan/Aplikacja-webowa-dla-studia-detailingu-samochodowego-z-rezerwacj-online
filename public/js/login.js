import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.17.2/firebase-auth.js";

// ----------------- Модальные окна -----------------
function showModal(title, message) {
    const modal = document.createElement('div');
    modal.classList.add('modal-overlay');

    modal.innerHTML = `
        <div class="modal-content">
            <h2>${title}</h2>
            <p>${message}</p>
            <button class="close-button" onclick="closeModal()">Zamknij</button>
        </div>
    `;

    document.body.appendChild(modal);
    document.body.classList.add('modal-open');

    modal.querySelector('.close-button').addEventListener('click', closeModal);
}

function closeModal() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) modal.remove();
    document.body.classList.remove('modal-open');
}

// ----------------- Firebase -----------------
let frontendAuth;

async function getFirebaseConfig() {
    try {
        const response = await fetch('/getFirebaseConfig');
        return await response.json();
    } catch (error) {
        console.error('Błąd pobierania konfiguracji Firebase:', error);
        showModal('Błąd', 'Nie można załadować konfiguracji Firebase');
        throw error;
    }
}

async function initializeFirebase() {
    const firebaseConfig = await getFirebaseConfig();
    const app = initializeApp(firebaseConfig);
    frontendAuth = getAuth(app);
}

// ----------------- Login -----------------
(async function() {
    await initializeFirebase();

    const loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value.trim();

        try {
            const userCredential = await signInWithEmailAndPassword(frontendAuth, email, password);
            const idToken = await userCredential.user.getIdToken();

            // Przekaż token do backendu (jeśli musisz go zapisać w ciasteczku)
            await fetch('/setToken', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken })
            });

            showModal('Zalogowano!', 'Witaj z powrotem!');
            // Можно редиректить через 1-2 секунды после модала
            setTimeout(() => window.location.href = '/dashboard', 1500);

        } catch (error) {
            console.error('Błąd logowania:', error);
            showModal('Błąd logowania', 'Nieprawidłowy e-mail lub hasło');
        }
    });
})();
