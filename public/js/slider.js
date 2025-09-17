const swiper = new Swiper('.swiper-container', {
    autoplay: {
        delay: 2500,
        disableOnInteraction: false,
    },
    loop: true,
    on: {
        slideChange: function () {
            const currentSlide = this.slides[this.activeIndex];
            const text = currentSlide.getAttribute('data-text');
            document.querySelector('.text-overlay').textContent = text; // Меняем текст при смене слайда
        },
    },
});

const initialSlide = swiper.slides[swiper.activeIndex];
const initialText = initialSlide.getAttribute('data-text');
document.querySelector('.text-overlay').textContent = initialText;