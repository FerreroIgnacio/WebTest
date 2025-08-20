// Simple Express server to serve static site and JSON storage per user
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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