// Variables globales para autenticación
let currentUser = null;
let googleInitialized = false;

// Inicializar Google Sign-In
function initializeGoogleSignIn() {
    console.log('Inicializando Google Sign-In...');

    // Verificar si Google está disponible
    if (typeof google === 'undefined') {
        console.error('Google Sign-In library not loaded');
        document.getElementById('authStatus').textContent = 'Error: Google no disponible';
        return;
    }

    try {
        google.accounts.id.initialize({
            client_id: "614144050505-a02n5fod2ofne58nt9i01tj5ok977eot.apps.googleusercontent.com",
            callback: handleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true
        });

        googleInitialized = true;
        console.log('Google Sign-In inicializado correctamente');
        document.getElementById('authStatus').textContent = 'Google listo';
    } catch (error) {
        console.error('Error al inicializar Google Sign-In:', error);
        document.getElementById('authStatus').textContent = 'Error: ' + error.message;
    }
}

// Manejar respuesta de Google
function handleCredentialResponse(response) {
    console.log('Respuesta de Google recibida');

    try {
        const userInfo = parseJwt(response.credential);

        if (!userInfo) {
            throw new Error('No se pudo decodificar el token');
        }

        currentUser = {
            name: userInfo.name,
            email: userInfo.email,
            picture: userInfo.picture,
            sub: userInfo.sub
        };

        console.log('Usuario logueado:', currentUser);
        updateUserInterface();
        closeLoginModal();

    } catch (error) {
        console.error('Error al procesar login:', error);
        alert('Error al iniciar sesión. Por favor intenta de nuevo.');
    }
}

// Decodificar JWT token
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join('')
        );
        return JSON.parse(jsonPayload);
    } catch (error) {
        console.error('Error al parsear JWT:', error);
        return null;
    }
}

// Función de login
function loginWithGoogle() {
    console.log('Intentando login...');

    if (!googleInitialized) {
        console.error('Google Sign-In no inicializado');
        alert('Google Sign-In no está disponible. Por favor recarga la página.');
        return;
    }

    // Mostrar modal y renderizar botón
    showLoginModal();
}

// Mostrar modal de login
function showLoginModal() {
    const modal = document.getElementById('loginModal');
    modal.classList.add('show');

    // Limpiar contenido previo
    const buttonContainer = document.getElementById('google-signin-button');
    buttonContainer.innerHTML = '';

    try {
        // Renderizar botón de Google
        google.accounts.id.renderButton(buttonContainer, {
            theme: "outline",
            size: "large",
            width: 250,
            text: "signin_with",
            shape: "pill"
        });
    } catch (error) {
        console.error('Error al renderizar botón:', error);
        buttonContainer.innerHTML = '<p>Error al cargar el botón de Google</p>';
    }
}

// Cerrar modal
function closeLoginModal() {
    const modal = document.getElementById('loginModal');
    modal.classList.remove('show');
}

// Actualizar interfaz de usuario
function updateUserInterface() {
    const loginBtn = document.getElementById('loginBtn');
    const userProfile = document.getElementById('userProfile');
    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');
    const miCuentaLink = document.getElementById('miCuentaLink');
    const authStatus = document.getElementById('authStatus');

    if (currentUser) {
        // Usuario logueado
        loginBtn.style.display = 'none';
        userProfile.classList.add('active');
        miCuentaLink.style.display = 'block';

        userName.textContent = currentUser.name;
        userAvatar.src = currentUser.picture;
        userAvatar.alt = currentUser.name;

        authStatus.textContent = 'Logueado: ' + currentUser.name;
    } else {
        // Usuario no logueado
        loginBtn.style.display = 'block';
        userProfile.classList.remove('active');
        miCuentaLink.style.display = 'none';

        authStatus.textContent = 'No logueado';
    }
}

// Toggle dropdown
function toggleDropdown() {
    const dropdown = document.getElementById('dropdownMenu');
    dropdown.classList.toggle('show');
}

// Logout
function logout() {
    console.log('Cerrando sesión...');
    currentUser = null;
    updateUserInterface();

    // Cerrar dropdown
    document.getElementById('dropdownMenu').classList.remove('show');

    // Opcional: revocar acceso de Google
    if (googleInitialized) {
        google.accounts.id.disableAutoSelect();
    }
}