// Variables globales para autenticación
let currentUser = null;
let googleInitialized = false;

// Restore session from localStorage (same browser/IP context)
(function restoreSession() {
    try {
        const stored = localStorage.getItem('bh_currentUser');
        if (stored) {
            currentUser = JSON.parse(stored);
            console.log('Sesión restaurada para:', currentUser?.email || currentUser?.name);
        }
    } catch (e) {
        console.warn('No se pudo restaurar sesión:', e);
    }
})();

// Helper: wait until Google library is available
async function waitForGoogle(timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (typeof google !== 'undefined' && google?.accounts?.id) return true;
        await new Promise(r => setTimeout(r, 100));
    }
    return false;
}

// Inicializar Google Sign-In (resilient)
async function initializeGoogleSignIn() {
    console.log('Inicializando Google Sign-In...');

    const ok = await waitForGoogle(10000);
    if (!ok) {
        console.error('Google Sign-In library not loaded aún');
        const s = document.getElementById('authStatus');
        if (s) s.textContent = 'Google no disponible';
        return;
    }

    try {
        google.accounts.id.initialize({
            client_id: "614144050505-a02n5fod2ofne58nt9i01tj5ok977eot.apps.googleusercontent.com",
            callback: handleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
            // Usar popup para ejecutar el callback en esta misma página
            ux_mode: 'popup'
            // login_uri eliminado para evitar modo redirect
        });
        googleInitialized = true;
        console.log('Google Sign-In inicializado correctamente');
        const s = document.getElementById('authStatus');
        if (s) s.textContent = 'Google listo';
    } catch (error) {
        console.error('Error al inicializar Google Sign-In:', error);
        const s = document.getElementById('authStatus');
        if (s) s.textContent = 'Error: ' + error.message;
    }
}

// Función de login (abre modal y delega render en showLoginModal para evitar duplicados)
async function loginWithGoogle() {
    console.log('Intentando login...');

    // Abrir modal primero
    showLoginModal();

    // Asegurar inicialización en segundo plano; el render lo hace showLoginModal
    if (!googleInitialized) {
        try { await initializeGoogleSignIn(); } catch {}
    }
}

// Manejar respuesta de Google
function handleCredentialResponse(response) {
    console.log('Respuesta de Google recibida');

    (async () => {
        try {
            if (!response || !response.credential) {
                throw new Error('No se recibió credencial de Google');
            }

            // 1) Intentar crear sesión en el servidor con la credencial cruda (más robusto)
            try {
                const res = await fetch('/api/gsicred', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ credential: response.credential })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.user) {
                        currentUser = data.user;
                        try { localStorage.setItem('bh_currentUser', JSON.stringify(currentUser)); } catch {}
                        updateUserInterface();
                        closeLoginModal();
                        console.log('Usuario logueado vía servidor:', currentUser);
                        return; // listo
                    }
                }
            } catch (e) {
                console.warn('Fallo creando sesión en servidor con credencial directa, usando fallback local:', e);
            }

            // 2) Fallback: decodificar en el cliente y luego guardar sesión en servidor
            const userInfo = parseJwt(response.credential);
            if (!userInfo) throw new Error('No se pudo decodificar el token');

            currentUser = {
                name: userInfo.name,
                email: userInfo.email,
                picture: userInfo.picture,
                sub: userInfo.sub
            };

            const ok = await setServerSession(currentUser);
            try { localStorage.setItem('bh_currentUser', JSON.stringify(currentUser)); } catch {}
            if (!ok) {
                const s = document.getElementById('authStatus');
                if (s) s.textContent = 'Error guardando sesión en servidor';
                try { window.showNotification?.('No se pudo guardar la sesión en el servidor', 'error'); } catch {}
            }
            console.log('Usuario logueado (fallback):', currentUser);
            updateUserInterface();
            closeLoginModal();

        } catch (error) {
            console.error('Error al procesar login:', error);
            try { window.showNotification?.(error.message || 'Error al iniciar sesión', 'error'); } catch {}
            const s = document.getElementById('authStatus');
            if (s) s.textContent = 'Error de login';
        }
    })();
}

// Surface GIS errors from declarative button
function onGoogleSignInError(err) {
    console.error('Google Sign-In error:', err);
    const msg = (err && (err.error || err.type || err.message)) || 'Fallo de Google Sign-In';
    const s = document.getElementById('authStatus');
    if (s) s.textContent = 'Google Sign-In: ' + msg;
    try { window.showNotification?.('Google Sign-In: ' + msg, 'error'); } catch {}
}

// Decodificar JWT token
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        if (!base64Url) return null;
        // Convertir base64url a base64 y agregar padding si es necesario
        let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const pad = base64.length % 4;
        if (pad) base64 += '='.repeat(4 - pad);
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


// Mostrar modal de login
function showLoginModal() {
    const modal = document.getElementById('loginModal');
    modal.classList.add('show');

    const buttonContainer = document.getElementById('google-signin-button');
    if (!buttonContainer) return;

    // Show loading state
    buttonContainer.innerHTML = '<div style="color:#666">Cargando botón de Google...</div>';

    const renderBtn = () => {
        try {
            buttonContainer.innerHTML = '';
            google.accounts.id.renderButton(buttonContainer, {
                theme: 'outline',
                size: 'large',
                width: 280,
                text: 'signin_with',
                shape: 'pill'
            });
            const fb = document.getElementById('google-signin-fallback');
            if (fb) fb.style.display = 'none';
            return true;
        } catch (e) {
            return false;
        }
    };

    // Si ya está lista la librería, render inmediato (una sola vez)
    if (typeof google !== 'undefined' && google?.accounts?.id) {
        if (!renderBtn()) {
            buttonContainer.innerHTML = '<p>No se pudo cargar el botón de Google. Reintenta.</p>';
        }
        return;
    }

    // Iniciar inicialización en segundo plano si no se hizo
    (async () => {
        try {
            if (!googleInitialized) {
                await initializeGoogleSignIn();
            }
        } catch {}
    })();

    // Reintentar hasta que la librería esté lista (máx ~10s)
    let tries = 0;
    const iv = setInterval(() => {
        tries++;
        if (typeof google !== 'undefined' && google?.accounts?.id) {
            clearInterval(iv);
            if (!renderBtn()) {
                buttonContainer.innerHTML = '<p>No se pudo cargar el botón de Google. Reintenta.</p>';
            }
        } else if (tries > 50) { // ~10s total
            clearInterval(iv);
            buttonContainer.innerHTML = '<p>Google no disponible. Reintenta en unos segundos.</p>';
            const fb = document.getElementById('google-signin-fallback');
            if (fb) fb.style.display = '';
        }
    }, 200);
}

// Cerrar modal
function closeLoginModal() {
    const modal = document.getElementById('loginModal');
    modal.classList.remove('show');
}

// Util: generar avatar como data URL (SVG) con la inicial del usuario
function makeAvatarDataUrl(initial = 'U') {
    const ch = encodeURIComponent((initial || 'U').toUpperCase());
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'>
      <defs>
        <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
          <stop offset='0%' stop-color='#00d4ff'/>
          <stop offset='100%' stop-color='#00b8e6'/>
        </linearGradient>
      </defs>
      <rect rx='20' ry='20' width='40' height='40' fill='url(#g)'/>
      <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Segoe UI, Roboto, sans-serif' font-size='20' fill='#001018'>${ch}</text>
    </svg>`;
    return 'data:image/svg+xml;utf8,' + svg;
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
        if (loginBtn) loginBtn.style.display = 'none';
        if (userProfile) userProfile.classList.add('active');
        if (miCuentaLink) miCuentaLink.style.display = 'block';

        if (userName) userName.textContent = currentUser.name || currentUser.email || 'Usuario';
        if (userAvatar) {
            const fallback = makeAvatarDataUrl(currentUser.name?.[0] || currentUser.email?.[0] || 'U');
            userAvatar.referrerPolicy = 'no-referrer';
            userAvatar.alt = currentUser.name || 'Usuario';
            userAvatar.onerror = () => { userAvatar.onerror = null; userAvatar.src = fallback; };
            userAvatar.src = currentUser.picture || fallback;
        }

        if (authStatus) authStatus.textContent = 'Logueado: ' + (currentUser.name || '');
    } else {
        // Usuario no logueado
        if (loginBtn) loginBtn.style.display = 'block';
        if (userProfile) userProfile.classList.remove('active');
        if (miCuentaLink) miCuentaLink.style.display = 'none';

        if (authStatus) authStatus.textContent = 'No logueado';
    }
}

// Toggle dropdown
function toggleDropdown() {
    const dropdown = document.getElementById('dropdownMenu');
    const profile = document.getElementById('userProfile');
    if (!dropdown || !profile) return;
    const willShow = !dropdown.classList.contains('show');
    dropdown.classList.toggle('show', willShow);
    profile.setAttribute('aria-expanded', String(willShow));
}

// Simple session API helpers
async function getServerSession() {
    try {
        const res = await fetch('/api/session');
        if (!res.ok) return null;
        const data = await res.json();
        return data?.user || null;
    } catch { return null; }
}
async function setServerSession(user) {
    try {
        const res = await fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return true;
    } catch (e) {
        console.error('No se pudo guardar la sesión en el servidor:', e);
        return false;
    }
}
async function clearServerSession() {
    try {
        const res = await fetch('/api/session', { method: 'DELETE' });
        return !!res.ok;
    } catch (e) {
        console.warn('No se pudo limpiar la sesión del servidor:', e);
        return false;
    }
}

// On load, sync session from server (IP-based persistence)
document.addEventListener('DOMContentLoaded', async () => {
    const srvUser = await getServerSession();
    if (srvUser) {
        currentUser = srvUser;
        try { updateUserInterface(); } catch {}
    }
    // Hook Panel de Control
    const panelLink = document.getElementById('panelLink');
    if (panelLink) {
        panelLink.addEventListener('click', function(e) {
            e.preventDefault();
            // navegar a la página del panel del servidor
            window.location.assign('/panel');
        });
    }
});

// Persistent VPS store in localStorage
const VPS_STORE_KEY = 'bh_vpsByUser';
function loadVpsStore() {
    try { return JSON.parse(localStorage.getItem(VPS_STORE_KEY) || '{}'); } catch { return {}; }
}
function saveVpsStore(store) {
    try { localStorage.setItem(VPS_STORE_KEY, JSON.stringify(store)); } catch {}
}

// Generate or get user's VPS list (persisted as JSON in localStorage)
function getUserVps(user) {
    if (!user) return [];
    const key = user.email || user.sub || 'anon';
    const store = loadVpsStore();
    if (!store[key]) {
        const base = (user.sub ? parseInt(user.sub.slice(-3), 10) : (user.email?.length || 7)) || 7;
        const count = Math.max(2, (base % 4) + 2);
        const regions = ['Buenos Aires', 'Córdoba', 'Mendoza', 'Rosario'];
        const statuses = ['running', 'stopped', 'pending'];
        store[key] = Array.from({ length: count }).map((_, i) => {
            const disk = [20, 40, 80, 160][(base + i) % 4];
            const used = Math.min(disk - 1, Math.max(2, (disk * ((base + i) % 70 + 20) / 100) | 0));
            return {
                id: 'vps-' + (base + i),
                name: `VPS-${(base + i) % 9999}`,
                region: regions[(base + i) % regions.length],
                status: statuses[(base + i) % statuses.length],
                cpu: ((base + i) % 4) + 1 + ' vCPU',
                ram: [512, 1024, 2048, 4096][(base + i) % 4] + ' MB',
                disk: disk + ' GB',
                used: used + ' GB'
            };
        });
        saveVpsStore(store);
    }
    return store[key];
}

// Export user's VPS JSON
function exportUserVpsJson(user) {
    const data = getUserVps(user);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vps.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// Open control panel in a new tab with user's VPS list and sidebar
function openControlPanel() {
    if (!currentUser) {
        alert('Inicia sesión para ver tu panel.');
        return;
    }
    const w = window.open('', '_blank');
    if (!w) return;
    const style = `
        :root{--bg:#0b0f14;--header:#0d1117;--panel:#0f141b;--border:#161b22;--text:#e6edf3;--muted:#9ca3af;--accent:#00d4ff;}
        *{box-sizing:border-box}
        body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text)}
        header{background:var(--header);color:var(--text);padding:16px 20px;position:sticky;top:0;z-index:20;border-bottom:1px solid var(--border)}
        .layout{display:flex;min-height:calc(100vh - 66px)}
        .sidebar{width:240px;background:#0c1219;border-right:1px solid var(--border);padding:16px;position:sticky;top:66px;align-self:flex-start;height:calc(100vh - 66px)}
        .sb-title{font-weight:700;margin-bottom:12px}
        .sb-nav{display:flex;flex-direction:column;gap:6px}
        .sb-link{color:var(--text);text-decoration:none;padding:10px 12px;border-radius:8px;display:flex;gap:8px;align-items:center}
        .sb-link:hover{background:#0f1722}
        .content{flex:1;padding:24px}
        .container{max-width:1100px;margin:0 auto}
        .summary{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px}
        .bar{height:12px;background:#0e1621;border-radius:999px;overflow:hidden;border:1px solid var(--border)}
        .bar > span{display:block;height:100%;background:linear-gradient(90deg,#00d4ff,#00b8e6);width:0%}
        .bar-label{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-top:8px}
        .list{margin-top:16px}
        .card{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px;display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
        .meta{display:flex;gap:10px;flex-wrap:wrap;color:var(--muted);font-size:12px}
        .badge{background:#111827;border:1px solid #1f2937;color:#9ca3af;border-radius:999px;padding:4px 10px;font-size:12px}
        .name{font-weight:600;margin-bottom:8px}
        .vbar{height:8px;background:#0e1621;border-radius:999px;overflow:hidden;border:1px solid var(--border);margin-top:8px}
        .vbar > span{display:block;height:100%;background:linear-gradient(90deg,#22c55e,#16a34a)}
        .actions{display:flex;gap:8px;align-items:center}
        a.btn{background:var(--accent);color:#001018;text-decoration:none;border-radius:8px;padding:10px 14px;font-weight:600}
        a.btn:hover{background:#00b8e6}
        a.btn.secondary{background:#111827;color:var(--text);border:1px solid #1f2937}
        a.btn.secondary:hover{background:#0f1722}
        a.btn.del{background:#ef4444;color:#fff}
        a.btn.del:hover{background:#dc2626}
        .muted{color:var(--muted);font-size:12px}
    `;
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Panel - BitHosting</title><style>${style}</style></head><body>
      <header><div class="container"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h1 style="margin:0;font-size:20px">Panel de Control</h1><div class="muted">${currentUser.name} · ${currentUser.email}</div></div></div></header>
      <div class="layout">
        <aside class="sidebar">
          <div class="sb-title">Navegación</div>
          <nav class="sb-nav">
            <a class="sb-link" href="#">Dashboard</a>
            <a class="sb-link" href="#">Mis VPS</a>
            <a class="sb-link" href="#">Facturación</a>
            <a class="sb-link" href="#">Soporte</a>
          </nav>
        </aside>
        <main class="content">
          <div class="container">
            <section class="summary">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px">
                <div><strong>Uso total de almacenamiento</strong></div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <a href="#" id="createVps" class="btn secondary">Crear VPS (debug)</a>
                  <a href="#" id="exportJson" class="btn">Exportar JSON</a>
                </div>
              </div>
              <div class="bar"><span id="totalBarFill"></span></div>
              <div class="bar-label" id="totalBarLabel">Cargando...</div>
            </section>
            <section class="list" id="vpsList">
              <div class="muted">Cargando VPS...</div>
            </section>
          </div>
        </main>
      </div>
      <script>
        async function loadVps() {
          try {
            const res = await fetch('/api/vps');
            const list = await res.json();
            const totalDisk = list.reduce((s,v)=>s+parseInt((v.disk||'0')),0);
            const totalUsed = list.reduce((s,v)=>s+parseInt((v.used||'0')),0);
            const pct = totalDisk? Math.round((totalUsed/totalDisk)*100):0;
            document.getElementById('totalBarFill').style.width = pct + '%';
            document.getElementById('totalBarLabel').textContent = totalUsed + ' / ' + totalDisk + ' GB usados ('+pct+'%)';
            const cards = list.map(item=>{
              const total = parseInt(item.disk||'0');
              const used = parseInt(item.used||'0');
              const p = total? Math.min(100, Math.round((used/total)*100)) : 0;
              return \`
                <div class=\"card\" data-id=\"${item.id}\">\n                  <div style=\"flex:1\">\n                    <div class=\"name\">${item.name} <span class=\"badge\">${item.id}</span></div>\n                    <div class=\"meta\">\n                      <span class=\"badge\">${item.cpu}</span>\n                      <span class=\"badge\">${item.ram}</span>\n                      <span class=\"badge\">${item.disk}</span>\n                      <span class=\"badge\">${item.region}</span>\n                      <span class=\"badge\">${item.status}</span>\n                    </div>\n                    <div class=\"vbar\"><span style=\"width:${p}%\"></span></div>\n                    <div class=\"bar-label\">${used} / ${total} GB usados (${p}%)</div>\n                  </div>\n                  <div class=\"actions\">\n                    <a href=\"#\" class=\"btn del\">Eliminar</a>\n                    <a href=\"#\" class=\"btn\">Administrar</a>\n                  </div>\n                </div>\`
            }).join('');
            document.getElementById('vpsList').innerHTML = cards || '<div class="muted">Sin VPS</div>';
          } catch (e) {
            document.getElementById('vpsList').innerHTML = '<div class="muted">Error al cargar VPS</div>';
          }
        }
        async function createVps() {
          try {
            await fetch('/api/vps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
            await loadVps();
          } catch {}
        }
        async function deleteVps(id) {
          try {
            await fetch('/api/vps/' + encodeURIComponent(id), { method: 'DELETE' });
            await loadVps();
          } catch {}
        }
        document.addEventListener('click', (e)=>{
          const createBtn = e.target.closest('#createVps');
          if (createBtn) { e.preventDefault(); createVps(); return; }
          const delBtn = e.target.closest('.btn.del');
          if (delBtn) {
            e.preventDefault();
            const card = delBtn.closest('.card');
            const id = card?.getAttribute('data-id');
            if (id) deleteVps(id);
          }
          const exp = e.target.closest('#exportJson');
          if (exp) {
            e.preventDefault();
            (async ()=>{
              try {
                const res = await fetch('/api/vps');
                const list = await res.json();
                const url = URL.createObjectURL(new Blob([JSON.stringify(list,null,2)],{type:'application/json'}));
                const a = document.createElement('a'); a.href = url; a.download = 'vps.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
              } catch {}
            })();
          }
        });
        loadVps();
      </script>
    </body></html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
    const dropdown = document.getElementById('dropdownMenu');
    if (dropdown) dropdown.classList.remove('show');
}

// Logout
function logout() {
    console.log('Cerrando sesión...');
    currentUser = null;
    updateUserInterface();
    clearServerSession();

    // Clear local storage persisted user
    try { localStorage.removeItem('bh_currentUser'); } catch {}

    // Cerrar dropdown
    const dd = document.getElementById('dropdownMenu');
    const profile = document.getElementById('userProfile');
    if (dd) dd.classList.remove('show');
    if (profile) profile.setAttribute('aria-expanded', 'false');

    // Opcional: revocar acceso de Google
    if (googleInitialized) {
        google.accounts.id.disableAutoSelect();
    }
}

// Provide safe global stubs so inline handlers exist immediately
window.loginWithGoogle = window.loginWithGoogle || function() {
    try { document.getElementById('loginModal')?.classList.add('show'); } catch {}
};
window.closeLoginModal = window.closeLoginModal || function() {
    try { document.getElementById('loginModal')?.classList.remove('show'); } catch {}
};
window.toggleDropdown = window.toggleDropdown || function() {
    const dd = document.getElementById('dropdownMenu');
    const profile = document.getElementById('userProfile');
    const willShow = dd ? !dd.classList.contains('show') : false;
    if (dd) dd.classList.toggle('show', willShow);
    if (profile) profile.setAttribute('aria-expanded', String(willShow));
};
window.logout = window.logout || function() { console.warn('Logout not ready'); };

// Expose functions to global scope for inline handlers
window.initializeGoogleSignIn = initializeGoogleSignIn;
window.updateUserInterface = updateUserInterface;
window.openControlPanel = openControlPanel;
// Ensure real implementations are exported for inline handlers
window.loginWithGoogle = loginWithGoogle;
window.closeLoginModal = closeLoginModal;
window.toggleDropdown = toggleDropdown;
window.logout = logout;

// Ensure declarative callback is globally accessible
window.handleCredentialResponse = handleCredentialResponse;
window.onGoogleSignInError = onGoogleSignInError;
