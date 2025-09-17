document.addEventListener('DOMContentLoaded', () => {
    const progressBar = document.querySelector('.loyalty-progress');
    const progressValue = parseFloat(progressBar.getAttribute('data-progress')) || 0;
    const label = progressBar.querySelector('.loyalty-label');

    // Funkcja do wypełniania paska lojalności
    function animateProgress() {
        let currentProgress = 0;

        // Stopniowe wypełnianie paska
        const interval = setInterval(() => {
            if (currentProgress >= progressValue) {
                clearInterval(interval);
            } else {
                currentProgress += 1; // Wypełniaj o 1% w każdej iteracji
                progressBar.style.width = `${currentProgress}%`;
                label.textContent = `${currentProgress}%`;
            }
        }, 10); // Czas między aktualizacjami (10ms)
    }

    animateProgress();
});
