// register.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.17.2/firebase-auth.js";

let firebaseConfig = {};

// Получаем конфиг с backend
async function getFirebaseConfig() {
    try {
        const response = await fetch('/getFirebaseConfig');
        return await response.json();
    } catch (error) {
        console.error('Błąd pobierania konfiguracji Firebase:', error);
        throw new Error('Nie można załadować konfiguracji Firebase');
    }
}

// Инициализация Firebase
async function initializeFirebase() {
    firebaseConfig = await getFirebaseConfig();
    const app = initializeApp(firebaseConfig);
    return getAuth(app);
}

// Модальное окно с коллбеком при закрытии
function showModal(title, message, onClose = null) {
    const modal = document.createElement('div');
    modal.classList.add('modal-overlay');
    modal.innerHTML = `
        <div class="modal-content">
            <h2>${title}</h2>
            <p>${message}</p>
            <button class="close-button">Zamknij</button>
        </div>
    `;
    document.body.appendChild(modal);
    document.body.classList.add('modal-open');

    // Закрытие по кнопке или по оверлею
    modal.addEventListener('click', (e) => {
        if (e.target.classList.contains('close-button') || e.target.classList.contains('modal-overlay')) {
            modal.remove();
            document.body.classList.remove('modal-open');
            if (onClose) onClose(); // вызываем редирект
        }
    });
}

// Основная логика регистрации
(async function() {
    const auth = await initializeFirebase();

    const form = document.getElementById('register-form');
    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value.trim();

        try {
            await createUserWithEmailAndPassword(auth, email, password);

            // Показываем модалку и при закрытии редирект на логин
            showModal(
                'Rejestracja zakończona sukcesem!',
                'Możesz teraz zalogować się.',
                () => window.location.href = '/login'
            );

            form.reset();
        } catch (error) {
            console.error('Błąd rejestracji:', error);
            let message = 'Coś poszło nie tak. Spróbuj ponownie.';
            if (error.code === 'auth/email-already-in-use') {
                message = 'Ten e-mail jest już zajęty.';
            } else if (error.code === 'auth/invalid-email') {
                message = 'Nieprawidłowy e-mail.';
            } else if (error.code === 'auth/weak-password') {
                message = 'Hasło jest za słabe (min. 6 znaków).';
            }
            showModal('Błąd rejestracji', message);
        }
    });
})();