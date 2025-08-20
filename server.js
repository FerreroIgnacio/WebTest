// Simple Express server to serve static site and JSON storage per user
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Paths for persistent data
const DATA_DIR = path.join(__dirname, 'data');
const VPS_DIR = path.join(DATA_DIR, 'vps');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Ensure data directories exist
fs.mkdirSync(VPS_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify({ users: {} }, null, 2));
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// In-memory session store keyed by remote IP
const sessionsByIp = new Map();

function getClientIp(req) {
  return (
    (req.headers['x-forwarded-for']?.split(',')[0] || '').trim() ||
    req.socket.remoteAddress ||
    req.ip ||
    'unknown'
  );
}

function userKey(user) {
  const base = (user.email || user.sub || 'anon').toLowerCase();
  return base.replace(/[^a-z0-9._-]+/g, '_');
}

function loadUserVps(key) {
  const file = path.join(VPS_DIR, `${key}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function saveUserVps(key, vpsList) {
  const file = path.join(VPS_DIR, `${key}.json`);
  fs.writeFileSync(file, JSON.stringify(vpsList, null, 2));
}

function ensureUserStored(user) {
  try {
    const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const key = userKey(user);
    if (!data.users[key]) {
      data.users[key] = { name: user.name, email: user.email, sub: user.sub, picture: user.picture, createdAt: new Date().toISOString() };
      fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
    }
  } catch (e) {
    // recreate file on error
    const data = { users: {} };
    const key = userKey(user);
    data.users[key] = { name: user.name, email: user.email, sub: user.sub, picture: user.picture, createdAt: new Date().toISOString() };
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
  }
}

// Set headers to allow Google popup to postMessage back (avoid COOP blocking)
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  // Do not set Cross-Origin-Embedder-Policy here to avoid cross-origin isolation
  next();
});

// Session endpoints
app.get('/api/session', (req, res) => {
  const ip = getClientIp(req);
  const user = sessionsByIp.get(ip) || null;
  res.json({ user });
});

app.post('/api/session', (req, res) => {
  const ip = getClientIp(req);
  const user = req.body?.user;
  if (!user || (!user.email && !user.sub)) return res.status(400).json({ error: 'user required' });
  sessionsByIp.set(ip, user);
  ensureUserStored(user);
  // Ensure VPS file exists but start empty for new users
  const key = userKey(user);
  let vps = loadUserVps(key);
  if (!vps) {
    vps = [];
    saveUserVps(key, vps);
  }
  res.json({ ok: true });
});

// Add missing DELETE to clear session
app.delete('/api/session', (req, res) => {
  const ip = getClientIp(req);
  sessionsByIp.delete(ip);
  res.json({ ok: true });
});

// Accept Google credential directly and create session
app.post('/api/gsicred', (req, res) => {
  try {
    const cred = req.body && req.body.credential;
    if (!cred) return res.status(400).json({ error: 'missing credential' });
    const parts = cred.split('.');
    if (parts.length < 2) return res.status(400).json({ error: 'bad credential' });
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);
    const user = { name: payload.name, email: payload.email, picture: payload.picture, sub: payload.sub };
    const ip = getClientIp(req);
    sessionsByIp.set(ip, user);
    ensureUserStored(user);
    const key = userKey(user);
    let vps = loadUserVps(key);
    if (!vps) { saveUserVps(key, []); }
    res.json({ user });
  } catch (e) {
    console.error('GSICred error:', e);
    res.status(500).json({ error: 'failed to process credential' });
  }
});

// VPS endpoints
app.get('/api/vps', (req, res) => {
  const ip = getClientIp(req);
  const user = sessionsByIp.get(ip);
  if (!user) return res.status(401).json({ error: 'not authenticated' });
  const key = userKey(user);
  let vps = loadUserVps(key);
  if (!vps) {
    vps = [];
    saveUserVps(key, vps);
  }
  res.json(vps);
});

// Create a new VPS for current user
app.post('/api/vps', (req, res) => {
  const ip = getClientIp(req);
  const user = sessionsByIp.get(ip);
  if (!user) return res.status(401).json({ error: 'not authenticated' });
  const key = userKey(user);
  const list = loadUserVps(key) || [];

  const now = Date.now();
  const body = req.body || {};
  const diskNum = parseInt(body.disk, 10) || [20, 40, 80, 160][now % 4];
  const usedNum = Math.min(diskNum - 1, Math.max(1, Math.floor(diskNum * 0.3)));

  const vps = {
    id: body.id || `vps-${now}`,
    name: body.name || `VPS-${(now % 10000)}`,
    region: body.region || 'Buenos Aires',
    status: body.status || 'running',
    cpu: body.cpu || '1 vCPU',
    ram: body.ram || '1024 MB',
    disk: (body.disk ? String(body.disk) : String(diskNum)) + ' GB',
    used: (body.used ? String(body.used) : String(usedNum)) + ' GB'
  };

  list.push(vps);
  saveUserVps(key, list);
  res.status(201).json(vps);
});

// Delete a VPS by id for current user
app.delete('/api/vps/:id', (req, res) => {
  const ip = getClientIp(req);
  const user = sessionsByIp.get(ip);
  if (!user) return res.status(401).json({ error: 'not authenticated' });
  const key = userKey(user);
  const list = loadUserVps(key) || [];
  const id = req.params.id;
  const newList = list.filter(v => v.id !== id);
  if (newList.length === list.length) {
    return res.status(404).json({ error: 'not found' });
  }
  saveUserVps(key, newList);
  res.json({ ok: true });
});

// Delete ALL VPS for current user
app.delete('/api/vps', (req, res) => {
  const ip = getClientIp(req);
  const user = sessionsByIp.get(ip);
  if (!user) return res.status(401).json({ error: 'not authenticated' });
  const key = userKey(user);
  saveUserVps(key, []);
  res.json({ ok: true });
});

// Handle Google Sign-In redirect mode callback
app.post('/auth/callback', (req, res) => {
  try {
    const cred = req.body && req.body.credential;
    if (!cred) return res.status(400).send('Missing credential');
    const parts = cred.split('.');
    if (parts.length < 2) return res.status(400).send('Bad credential');
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);
    const user = {
      name: payload.name,
      email: payload.email,
      picture: payload.picture,
      sub: payload.sub
    };
    const ip = getClientIp(req);
    sessionsByIp.set(ip, user);
    ensureUserStored(user);
    // Ensure VPS file exists
    const key = userKey(user);
    let vps = loadUserVps(key);
    if (!vps) { saveUserVps(key, []); }
    // Redirect to home where client will sync session
    res.redirect('/');
  } catch (e) {
    console.error('Auth callback error:', e);
    res.status(500).send('Auth failed');
  }
});

// Serve a proper Panel page (no blank page)
app.get('/panel', (req, res) => {
  const ip = getClientIp(req);
  const user = sessionsByIp.get(ip);
  if (!user) return res.redirect('/');

  const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const style = `:root{--bg:#0b0f14;--header:#0d1117;--panel:#0f141b;--border:#161b22;--text:#e6edf3;--muted:#9ca3af;--accent:#00d4ff;}*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text)}header{background:var(--header);color:var(--text);padding:16px 20px;position:sticky;top:0;z-index:20;border-bottom:1px solid var(--border)}.layout{display:flex;min-height:calc(100vh - 66px)}.sidebar{width:240px;background:#0c1219;border-right:1px solid var(--border);padding:16px;position:sticky;top:66px;align-self:flex-start;height:calc(100vh - 66px)}.sb-title{font-weight:700;margin-bottom:12px}.sb-nav{display:flex;flex-direction:column;gap:6px}.sb-link{color:var(--text);text-decoration:none;padding:10px 12px;border-radius:8px;display:flex;gap:8px;align-items:center}.sb-link:hover{background:#0f1722}.content{flex:1;padding:24px}.container{max-width:1100px;margin:0 auto}.summary{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px}.bar{height:12px;background:#0e1621;border-radius:999px;overflow:hidden;border:1px solid var(--border)}.bar > span{display:block;height:100%;background:linear-gradient(90deg,#00d4ff,#00b8e6);width:0%}.bar-label{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-top:8px}.list{margin-top:16px}.card{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px;display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.meta{display:flex;gap:10px;flex-wrap:wrap;color:var(--muted);font-size:12px}.badge{background:#111827;border:1px solid #1f2937;color:#9ca3af;border-radius:999px;padding:4px 10px;font-size:12px}.name{font-weight:600;margin-bottom:8px}.vbar{height:8px;background:#0e1621;border-radius:999px;overflow:hidden;border:1px solid var(--border);margin-top:8px}.vbar > span{display:block;height:100%;background:linear-gradient(90deg,#22c55e,#16a34a)}.actions{display:flex;gap:8px;align-items:center}a.btn{background:var(--accent);color:#001018;text-decoration:none;border-radius:8px;padding:10px 14px;font-weight:600}a.btn:hover{background:#00b8e6}a.btn.secondary{background:#111827;color:var(--text);border:1px solid #1f2937}a.btn.secondary:hover{background:#0f1722}a.btn.del{background:#ef4444;color:#fff}a.btn.del:hover{background:#dc2626}.muted{color:var(--muted);font-size:12px}`;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Panel - BitHosting</title><style>${style}</style></head><body>
      <header><div class="container"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h1 style="margin:0;font-size:20px">Panel de Control</h1><div class="muted">${esc(user.name)} · ${esc(user.email||'')}</div></div></div></header>
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
            const cards = list.map(function(item){
              const total = parseInt(item.disk||'0',10);
              const used = parseInt(item.used||'0',10);
              const p = total? Math.min(100, Math.round((used/total)*100)) : 0;
              return (
                '<div class="card" data-id="' + item.id + '">' +
                  '<div style="flex:1">' +
                    '<div class="name">' + item.name + ' <span class="badge">' + item.id + '</span></div>' +
                    '<div class="meta">' +
                      '<span class="badge">' + item.cpu + '</span>' +
                      '<span class="badge">' + item.ram + '</span>' +
                      '<span class="badge">' + item.disk + '</span>' +
                      '<span class="badge">' + item.region + '</span>' +
                      '<span class="badge">' + item.status + '</span>' +
                    '</div>' +
                    '<div class="vbar"><span style="width:' + p + '%"></span></div>' +
                    '<div class="bar-label">' + used + ' / ' + total + ' GB usados (' + p + '%)</div>' +
                  '</div>' +
                  '<div class="actions">' +
                    '<a href="#" class="btn del">Eliminar</a>' +
                    '<a href="#" class="btn">Administrar</a>' +
                  '</div>' +
                '</div>'
              );
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

  res.status(200).send(html);
});

// Static files
app.use(express.static(__dirname));

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
//root key 4e003e52-2917-4d46-bc1f-7524094b1f88