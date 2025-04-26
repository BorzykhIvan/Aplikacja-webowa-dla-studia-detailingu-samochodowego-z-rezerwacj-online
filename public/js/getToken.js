const fs = require('fs');
const { google } = require('googleapis');
const path = require('path');

const TOKEN_PATH = path.join(__dirname, 'token.json');

// Загрузка учетных данных клиента
fs.readFile('credentials.json', (err, content) => {
    if (err) return console.error('Ошибка загрузки файла credentials.json:', err);
    authorize(JSON.parse(content), getAccessToken);
});

/**
 * Autoryzacja w API Google i uzyskanie tokenu dostępu
 * @param {Object} credentials - Dane uwierzytelniające z pliku credentials.json
 * @param {Function} callback - Funkcja zwrotna po autoryzacji
 */
function autoryzuj(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.web;
    const klientOAuth2 = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Sprawdzenie czy istnieje zapisany token
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) {
            return pobierzTokenDostepu(klientOAuth2);
        }
        klientOAuth2.setCredentials(JSON.parse(token));
        callback(klientOAuth2);
    });
}

/**
 * Pobieranie nowego tokenu dostępu
 * @param {Object} klientOAuth2 - Instancja klienta OAuth2
 */
function pobierzTokenDostepu(klientOAuth2) {
    // Generowanie URL do autoryzacji
    const authUrl = klientOAuth2.generateAuthUrl({
        access_type: 'offline', // Token z możliwością odświeżania
        scope: ['https://www.googleapis.com/auth/calendar'], // Zakres dostępu do kalendarza
    });
    
    console.log('Aby autoryzować aplikację, odwiedź następujący URL:', authUrl);

    // Pobranie kodu autoryzacyjnego od użytkownika
    const interfejs = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    interfejs.question('Wprowadź kod z URL: ', (code) => {
        interfejs.close();
        
        // Wymiana kodu na token dostępu
        klientOAuth2.getToken(code, (err, token) => {
            if (err) {
                return console.error('Błąd podczas pobierania tokenu:', err);
            }
            
            // Ustawienie pobranego tokenu
            klientOAuth2.setCredentials(token);

            // Zapis tokenu do pliku
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) {
                    return console.error('Błąd podczas zapisywania tokenu:', err);
                }
                console.log('Token został zapisany w:', TOKEN_PATH);
            });
        });
    });
}