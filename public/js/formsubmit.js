document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('date');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const localToday = today.toLocaleDateString('en-CA'); // Format: YYYY-MM-DD
    dateInput.setAttribute('min', localToday);

    document.getElementById('submit-button').addEventListener('click', handleSubmit);
});

function handleSubmit(event) {
    event.preventDefault();

    const categorySelect = document.getElementById('category-select');
    const sizeSelect = document.getElementById('size-select');
    const serviceSelect = document.getElementById('service-select');
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const date = document.getElementById('date').value;
    const time = document.getElementById('time').value;

    const category = categorySelect.value;
    const size = sizeSelect.value;
    const service = serviceSelect.value;

    const categoryText = categorySelect.options[categorySelect.selectedIndex].text;
    const sizeText = sizeSelect.options[sizeSelect.selectedIndex].text;
    const serviceText = serviceSelect.options[serviceSelect.selectedIndex].text;

    // Walidacja daty: sprawdzenie, czy wybrana data nie jest wcześniejsza niż dzisiejsza
    const today = new Date();
    const selectedDate = new Date(date);
    today.setHours(0, 0, 0, 0);


    if (selectedDate < today) {
        alert('Nie możesz wybrać daty wcześniejszej niż dzisiaj!');
        return;
    }

    console.log("Date:", date, "Time:", time);  // Check values

    // Ensure the time is in a valid format, default to 08:00 if not set
    if (!time) {
        alert('Please select a time!');
        return;
    }

    // Combine selected date with the selected time (ensure correct time format)
    const hour = time.split(':')[0].padStart(2, '0');
    const minute = time.split(':')[1] || '00'; // Ustawienie minut na 00, jeśli brak
    const formattedTime = `${hour}:${minute}`;


    const startDateTime = new Date(`${date}T${formattedTime}:00`);
    if (isNaN(startDateTime)) {
        console.error('Invalid start date and time:', `${date}T${time}:00`);
        return;
    }

    // Set the end time to 2 hours later (for a fixed 2-hour service duration, change if needed)
    let duration = 2; // Domyślny czas trwania (w godzinach)

    // Ustaw czas trwania na podstawie rozmiaru samochodu
    if (size === "small") {
        duration = 1; // 1 godzina dla małego samochodu
    } else if (size === "medium") {
        duration = 2; // 1,5 godziny dla średniego samochodu
    } else if (size === "large") {
        duration = 2; // 2 godziny dla dużego samochodu
    }

    // Ustaw czas zakończenia
    const endDateTime = new Date(startDateTime.getTime() + duration * 60 * 60 * 1000);
    console.log("Start DateTime:", startDateTime.toISOString());
    console.log("End DateTime:", endDateTime.toISOString());

    const eventData = {
        summary: `Usługa: ${serviceText} (${categoryText})`,
        location: `Wielkość auta: ${sizeText}`,
        description: `Imie: ${name}\nEmail: ${email}`,
        start: {
            dateTime: startDateTime.toISOString(),
            timeZone: 'Europe/Warsaw',
        },
        end: {
            dateTime: endDateTime.toISOString(),
            timeZone: 'Europe/Warsaw',
        },
        attendees: [{ email }],
    };

    fetch('/addEvent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData),
    })
        .then(response => {
            if (response.ok) {
                console.log('Событие успешно добавлено!');
                showSuccessMessage(); // Wyświetl komunikat
                resetForm();          // Zresetuj formularz
            } else {
                console.error('Ошибка при добавлении события:', response.statusText);
            }
        })
        .catch(error => console.error('Ошибка при отправке запроса:', error));
}

function showSuccessMessage() {
    // Tworzenie okna dialogowego
    const modal = document.createElement('div');
    modal.classList.add('modal-overlay');

    modal.innerHTML = `
        <div class="modal-content">
            <h2>Rezerwacja udana!</h2>
            <p>Czekamy Państwa na wizytę!</p>
            <button class="close-button" onclick="closeModal()">Zamknij</button>
        </div>
    `;

    document.body.appendChild(modal);

    // Wyłączenie przewijania strony
    document.body.classList.add('modal-open');
}

function closeModal() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.remove();
    }
    document.body.classList.remove('modal-open'); // Przywrócenie przewijania
}

function resetForm() {
    const form = document.getElementById('event-form');
    if (form) {
        // Resetuje wszystkie pola w formularzu
        form.reset();

        // Ukrywa kroki poza pierwszym
        document.querySelectorAll('.step').forEach(step => step.classList.remove('show'));
        document.getElementById('step-1').classList.add('show'); // Pokaż pierwszy krok

        // Resetuje pole wyboru godziny i usuwa zaznaczenia
        const timeSlotsContainer = document.getElementById('time-slots-container');
        if (timeSlotsContainer) {
            timeSlotsContainer.innerHTML = ''; // Usuń wszystkie sloty czasowe
        }

        // Resetuje ukryte pole godziny
        document.getElementById('time').value = '';

        // Ukrywa przycisk "Zarezerwuj"
        document.getElementById('submit-button').style.display = 'none';
    }
}