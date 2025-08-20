// Carousel functionality
let currentSlideIndex = 0;
const slides = document.querySelectorAll('.carousel-slide');
const totalSlides = slides.length;
const wrapper = document.getElementById('carouselWrapper');
const dots = document.querySelectorAll('.carousel-dot');

function updateCarousel() {
    const translateX = -currentSlideIndex * 100;
    if (wrapper) {
        wrapper.style.transform = `translateX(${translateX}%)`;
    }

    // Update dots
    dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === currentSlideIndex);
    });
}

function changeSlide(direction) {
    currentSlideIndex += direction;

    if (currentSlideIndex >= totalSlides) {
        currentSlideIndex = 0;
    } else if (currentSlideIndex < 0) {
        currentSlideIndex = totalSlides - 1;
    }

    updateCarousel();
}

function currentSlide(slideIndex) {
    currentSlideIndex = slideIndex - 1;
    updateCarousel();
}

// Expose functions for inline handlers
window.changeSlide = changeSlide;
window.currentSlide = currentSlide;

// Auto-advance carousel every 5 segundos
function startCarouselAutoplay() {
    setInterval(() => {
        changeSlide(1);
    }, 5000);
}

// Touch/swipe support for mobile
function initCarouselTouchSupport() {
    let startX = 0;
    let endX = 0;

    if (wrapper) {
        wrapper.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
        });

        wrapper.addEventListener('touchend', (e) => {
            endX = e.changedTouches[0].clientX;
            const diffX = startX - endX;

            if (Math.abs(diffX) > 50) { // Minimum swipe distance
                if (diffX > 0) {
                    changeSlide(1); // Swipe left - next slide
                } else {
                    changeSlide(-1); // Swipe right - previous slide
                }
            }
        });
    }
}

// Initialize carousel when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    if (wrapper && slides.length > 0) {
        startCarouselAutoplay();
        initCarouselTouchSupport();
    }
});
