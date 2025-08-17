// Debug: mostrar URL actual
document.addEventListener('DOMContentLoaded', function() {
    const currentUrlElement = document.getElementById('currentUrl');
    if (currentUrlElement) {
        currentUrlElement.textContent = window.location.href;
    }
});

// Inicializar cuando carga la página
window.onload = function() {
    console.log('Inicializando aplicación...');
    initializeGoogleSignIn();
    updateUserInterface();
}

// Smooth scrolling para los enlaces del menú
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Efecto hover en las tarjetas de pricing
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.pricing-card').forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.boxShadow = '0 10px 30px rgba(0, 212, 255, 0.3)';
        });

        card.addEventListener('mouseleave', function() {
            this.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
        });
    });
});

// Cerrar dropdown al hacer click fuera
document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('dropdownMenu');
    const avatar = document.getElementById('userAvatar');

    if (dropdown && dropdown.classList.contains('show') &&
        !dropdown.contains(event.target) &&
        event.target !== avatar) {
        dropdown.classList.remove('show');
    }
});

// Cerrar modal al hacer click fuera
document.addEventListener('DOMContentLoaded', function() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeLoginModal();
            }
        });
    }
});

// Cerrar modal con tecla Escape
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeLoginModal();
    }
});

// Función utilitaria para mostrar notificaciones (opcional)
function showNotification(message, type = 'info') {
    // Crear elemento de notificación
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'error' ? '#dc3545' : '#00d4ff'};
        color: white;
        border-radius: 5px;
        z-index: 10001;
        transition: opacity 0.3s;
    `;

    document.body.appendChild(notification);

    // Remover después de 3 segundos
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}