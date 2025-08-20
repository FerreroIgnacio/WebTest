// Debug: mostrar URL actual
document.addEventListener('DOMContentLoaded', function() {
    const currentUrlElement = document.getElementById('currentUrl');
    if (currentUrlElement) {
        currentUrlElement.textContent = window.location.href;
    }
});

// Inicializar cuando carga la página (robusto)
window.addEventListener('load', async () => {
    console.log('Inicializando aplicación...');
    try {
        if (typeof window.initializeGoogleSignIn === 'function') {
            await window.initializeGoogleSignIn();
        }
    } catch (e) {
        console.warn('No se pudo inicializar Google aún:', e);
    }
    try {
        if (typeof window.updateUserInterface === 'function') {
            window.updateUserInterface();
        }
    } catch (e) {
        console.warn('No se pudo actualizar UI:', e);
    }
});

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

// Reveal-on-scroll animations (no blur)
(() => {
    const REVEAL_SECTIONS = ['.carousel-section', '.features', '.pricing'];
    const STAGGER_CONTAINERS = ['.features-grid', '.pricing-grid'];

    const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const el = entry.target;
            const isSection = el.classList.contains('features') || el.classList.contains('pricing') || el.classList.contains('carousel-section');
            const isStagger = el.classList.contains('stagger');

            if (entry.isIntersecting) {
                if (isSection) el.classList.add('revealed');
                if (isStagger) el.classList.add('in-view');
            } else {
                // Remove classes when leaving so they can animate again later
                if (isSection) el.classList.remove('revealed');
                if (isStagger) el.classList.remove('in-view');
            }
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

    document.addEventListener('DOMContentLoaded', () => {
        // Observe main sections
        REVEAL_SECTIONS.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => io.observe(el));
        });
        // Add and observe stagger containers
        STAGGER_CONTAINERS.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                el.classList.add('stagger');
                io.observe(el);
            });
        });
    });
})();

// Bind login button click to global loginWithGoogle
document.addEventListener('DOMContentLoaded', function() {
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            if (typeof window.loginWithGoogle === 'function') {
                try { await window.loginWithGoogle(); } catch (e) { console.warn('Login error:', e); }
            } else {
                // Fallback: open modal if function is not ready yet
                try { document.getElementById('loginModal')?.classList.add('show'); } catch {}
            }
        });
    }

    // Toggle dropdown al clickear avatar
    const avatar = document.getElementById('userAvatar');
    if (avatar) {
        avatar.addEventListener('click', () => {
            if (typeof window.toggleDropdown === 'function') window.toggleDropdown();
        });
    }

    // Logout desde el menú
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (typeof window.logout === 'function') window.logout();
        });
    }

    // Cerrar modal con la X
    const closeLoginBtn = document.getElementById('closeLoginBtn');
    if (closeLoginBtn) {
        closeLoginBtn.addEventListener('click', () => {
            if (typeof window.closeLoginModal === 'function') window.closeLoginModal();
        });
    }
});
