// Proxmox management library
// Provides helpers for CT and VM operations via Proxmox API v2

const https = require('https');
const querystring = require('querystring');

// Config from environment
const PMX_HOST = process.env.PMX_HOST || '';
const PMX_PORT = process.env.PMX_PORT ? Number(process.env.PMX_PORT) : 8006;
const PMX_USER = process.env.PMX_USER || '';
const PMX_TOKEN_NAME = process.env.PMX_TOKEN_NAME || '';
const PMX_TOKEN_VALUE = process.env.PMX_TOKEN_VALUE || '';
const PMX_NODE = process.env.PMX_NODE || 'pve';
const PMX_STORAGE = process.env.PMX_STORAGE || 'local';
const PMX_NET_BRIDGE = process.env.PMX_NET_BRIDGE || 'vmbr0';

function haveConfig() {
  return PMX_HOST && PMX_USER && PMX_TOKEN_NAME && PMX_TOKEN_VALUE;
}

function headers(extra = {}) {
  return Object.assign({
    'Authorization': `PVEAPIToken=${PMX_USER}!${PMX_TOKEN_NAME}=${PMX_TOKEN_VALUE}`
  }, extra);
}

function request(method, apiPath, { headers: h = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: PMX_HOST,
      port: PMX_PORT,
      path: `/api2/json${apiPath}`,
      method,
      headers: headers(h),
      rejectUnauthorized: false
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data || '{}');
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve(parsed);
          const err = new Error(`Proxmox API ${res.statusCode}`);
          err.response = parsed; err.statusCode = res.statusCode; return reject(err);
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve({});
          const err = new Error(`Proxmox API ${res.statusCode}`);
          err.response = data; err.statusCode = res.statusCode; return reject(err);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function nextId() {
  const resp = await request('GET', '/cluster/nextid');
  return resp?.data; // string id
}

// ----- CT helpers -----
async function listCTTemplates() {
  const resp = await request('GET', `/nodes/${encodeURIComponent(PMX_NODE)}/storage/${encodeURIComponent(PMX_STORAGE)}/content?content=vztmpl`);
  return (resp?.data || []).filter(x => x.content === 'vztmpl').map(x => x.volid);
}

async function createCT(opts = {}) {
  const vmid = await nextId();
  const {
    hostname,
    password,
    template = `${PMX_STORAGE}:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst`,
    storage = PMX_STORAGE,
    cores = 1,
    memory = 1024,
    swap = 512,
    rootfs = 8,
    netBridge = PMX_NET_BRIDGE,
    start = 1
  } = opts;

  const net0 = `name=eth0,bridge=${netBridge},ip=dhcp`;
  const form = querystring.stringify({
    vmid,
    hostname,
    ostemplate: template,
    storage,
    rootfs: `${storage}:${Number(rootfs)}`,
    cores: Number(cores),
    memory: Number(memory),
    swap: Number(swap),
    password,
    net0,
    start: String(start)
  });

  const resp = await request('POST', `/nodes/${encodeURIComponent(PMX_NODE)}/lxc`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form) },
    body: form
  });
  return { upid: resp?.data, vmid };
}

async function getTaskStatus(upid) {
  const resp = await request('GET', `/nodes/${encodeURIComponent(PMX_NODE)}/tasks/${encodeURIComponent(upid)}/status`);
  return resp?.data || {};
}

// ----- VM (QEMU) helpers -----
async function createVM(opts = {}) {
  const vmid = await nextId();
  const {
    name,
    cores = 1,
    memory = 1024,
    disk = 10,
    storage = PMX_STORAGE,
    bridge = PMX_NET_BRIDGE
  } = opts;

  // Minimal blank VM with virtio disk and network, no ISO
  const formObj = {
    vmid,
    name,
    cores: Number(cores),
    memory: Number(memory),
    scsihw: 'virtio-scsi-pci',
    'scsi0': `${storage}:${Number(disk)}`,
    net0: `virtio,bridge=${bridge}`,
    ostype: 'l26',
    agent: 1
  };
  const form = querystring.stringify(formObj);
  const resp = await request('POST', `/nodes/${encodeURIComponent(PMX_NODE)}/qemu`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form) },
    body: form
  });
  return { upid: resp?.data, vmid };
}

async function deleteVM(vmid) {
  const resp = await request('DELETE', `/nodes/${encodeURIComponent(PMX_NODE)}/qemu/${encodeURIComponent(vmid)}`);
  return resp?.data;
}

async function startVM(vmid) {
  const resp = await request('POST', `/nodes/${encodeURIComponent(PMX_NODE)}/qemu/${encodeURIComponent(vmid)}/status/start`);
  return resp?.data;
}

async function stopVM(vmid) {
  const resp = await request('POST', `/nodes/${encodeURIComponent(PMX_NODE)}/qemu/${encodeURIComponent(vmid)}/status/stop`);
  return resp?.data;
}

async function rebootVM(vmid) {
  const resp = await request('POST', `/nodes/${encodeURIComponent(PMX_NODE)}/qemu/${encodeURIComponent(vmid)}/status/reboot`);
  return resp?.data;
}

async function getVMInfo(vmid) {
  const resp = await request('GET', `/nodes/${encodeURIComponent(PMX_NODE)}/qemu/${encodeURIComponent(vmid)}/status/current`);
  // resp.data typically includes: name, status, cpu, cpus, maxmem, mem, maxdisk, disk, uptime
  return resp?.data;
}

async function listVMs() {
  const resp = await request('GET', `/nodes/${encodeURIComponent(PMX_NODE)}/qemu`);
  return resp?.data || [];
}

module.exports = {
  haveConfig,
  // shared
  getTaskStatus,
  // CT
  listCTTemplates,
  createCT,
  // VM
  listVMs,
  createVM,
  deleteVM,
  startVM,
  stopVM,
  rebootVM,
  getVMInfo,
};
