// Panel page JS (modularized)

// Sync CSS var --ph with actual header height to avoid overlap
(function(){
  function setHeaderVar(){
    const h = document.querySelector('header.sticky');
    if(!h) return;
    const ph = h.offsetHeight || 72;
    document.documentElement.style.setProperty('--ph', ph + 'px');
  }
  window.addEventListener('load', setHeaderVar);
  window.addEventListener('resize', setHeaderVar);
})();

// Sidebar state and handle
(function(){
  const KEY='bh_sb_collapsed';
  try{ if(localStorage.getItem(KEY)==='1'){ document.body.classList.add('sb-collapsed'); } }catch(e){}
  const handle=document.getElementById('sbHandle');
  const updateAria=()=>{ handle?.setAttribute('aria-expanded', String(!document.body.classList.contains('sb-collapsed'))); };
  updateAria();
  handle?.addEventListener('click',()=>{
    document.body.classList.toggle('sb-collapsed');
    updateAria();
    try{ localStorage.setItem(KEY, document.body.classList.contains('sb-collapsed') ? '1' : '0'); }catch(e){}
  });
})();

async function loadUser(){
  try{
    const res = await fetch('/api/session');
    const data = await res.json();
    const user = data && data.user;
    const el = document.getElementById('userInfo');
    if(!user){
      // If somehow reached here without a session, bounce to home
      location.replace('/');
      return;
    }
    if(el){ el.textContent = (user.name||user.email||'Usuario'); }
  }catch(e){
    location.replace('/');
  }
}

async function loadVps(){
  try{
    const res = await fetch('/api/vps');
    if(!res.ok){ if(res.status===401) return location.replace('/'); throw new Error('HTTP '+res.status); }
    const list = await res.json();
    const totalDisk = list.reduce((s,v)=>s+parseInt((v.disk||'0')),0);
    const totalUsed = list.reduce((s,v)=>s+parseInt((v.used||'0')),0);
    const pct = totalDisk? Math.round((totalUsed/totalDisk)*100):0;
    const fill = document.getElementById('totalBarFill');
    if (fill) fill.style.width = pct + '%';
    const label = document.getElementById('totalBarLabel');
    if (label) label.textContent = `${totalUsed} / ${totalDisk} GB usados (${pct}%)`;
    const cards = list.map(item=>{
      const total = parseInt(item.disk||'0');
      const used = parseInt(item.used||'0');
      const p = total? Math.min(100, Math.round((used/total)*100)) : 0;
      return `
        <div class="card" data-id="${item.id}">
          <div style="flex:1">
            <div class="name">${item.name} <span class="badge">${item.id}</span></div>
            <div class="meta">
              <span class="badge">${item.cpu}</span>
              <span class="badge">${item.ram}</span>
              <span class="badge">${item.disk}</span>
              <span class="badge">${item.region}</span>
              <span class="badge">${item.status}</span>
            </div>
            <div class="bar"><span style="width:${p}%"></span></div>
            <div class="meta">${used} / ${total} GB usados (${p}%)</div>
          </div>
          <div class="actions">
            <a href="#" class="btn del">Eliminar</a>
            <a href="#" class="btn">Administrar</a>
          </div>
        </div>`
    }).join('');
    const listEl = document.getElementById('vpsList');
    if (listEl) listEl.innerHTML = cards || '<div class="muted">Sin VPS</div>';
  }catch(e){
    const listEl = document.getElementById('vpsList');
    if (listEl) listEl.innerHTML = '<div class="muted">Error al cargar VPS</div>';
  }
}

async function createVps(){
  try{ await fetch('/api/vps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }); await loadVps(); }catch(e){}
}
async function deleteVps(id){
  try{ await fetch('/api/vps/' + encodeURIComponent(id), { method: 'DELETE' }); await loadVps(); }catch(e){}
}

// Event delegation for buttons
document.addEventListener('click', (e)=>{
  const createBtn = e.target.closest('#createVps');
  if(createBtn){ e.preventDefault(); createVps(); return; }
  const delBtn = e.target.closest('.btn.del');
  if(delBtn){ e.preventDefault(); const card = delBtn.closest('.card'); const id = card && card.getAttribute('data-id'); if(id) deleteVps(id); }
  const exp = e.target.closest('#exportJson');
  if(exp){
    e.preventDefault();
    (async ()=>{
      try{
        const res = await fetch('/api/vps');
        const list = await res.json();
        const url = URL.createObjectURL(new Blob([JSON.stringify(list,null,2)],{type:'application/json'}));
        const a = document.createElement('a'); a.href = url; a.download = 'vps.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      }catch(e){}
    })();
  }
});

// === Proxmox CT (LXC) creation ===
(function(){
  let wired = false;
  function qs(id){ return document.getElementById(id); }
  function show(el){ el && el.classList.add('show'); }
  function hide(el){ el && el.classList.remove('show'); }
  function setStatus(msg){ const s = qs('ctStatus'); if (s) s.textContent = msg || ''; }
  async function loadTemplates(){
    const sel = qs('ctTemplate'); if (!sel) return;
    sel.innerHTML = '<option>Cargando templates...</option>';
    try{
      const r = await fetch('/api/proxmox/templates');
      if (r.status === 501){ sel.innerHTML=''; setStatus('Proxmox no configurado en el servidor'); return; }
      const data = await r.json();
      const list = (data && data.templates) || [];
      if (!list.length){ sel.innerHTML=''; setStatus('No hay templates disponibles'); return; }
      sel.innerHTML = '';
      list.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = v; sel.appendChild(opt);
      });
    }catch(e){ sel.innerHTML=''; setStatus('Error cargando templates'); }
  }
  function openCtModal(){
    const m = qs('ctModal'); if (!m) return;
    // reset form
    qs('ctForm')?.reset();
    setStatus('');
    show(m);
    loadTemplates();
  }
  function closeCtModal(){ hide(qs('ctModal')); }
  async function submitCt(e){
    e.preventDefault();
    const btn = qs('ctSubmitBtn');
    const form = qs('ctForm');
    if (!form) return;
    const payload = {
      hostname: qs('ctHostname')?.value?.trim(),
      password: qs('ctPassword')?.value || '',
      template: qs('ctTemplate')?.value || '',
      cores: Number(qs('ctCores')?.value || 1),
      memory: Number(qs('ctMemory')?.value || 1024),
      rootfs: Number(qs('ctDisk')?.value || 8),
      swap: Number(qs('ctSwap')?.value || 512),
      netBridge: qs('ctBridge')?.value || 'vmbr0',
      start: qs('ctStart')?.checked ? 1 : 0
    };
    if (!payload.hostname || !payload.password){ setStatus('Completa hostname y password'); return; }
    try{
      btn && (btn.disabled = true); setStatus('Creando contenedor...');
      const r = await fetch('/api/proxmox/ct', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (r.status === 401){ setStatus('No autenticado'); btn && (btn.disabled=false); return; }
      if (r.status === 501){ setStatus('Proxmox no configurado en el servidor'); btn && (btn.disabled=false); return; }
      if (!r.ok){ const t = await r.json().catch(()=>({})); setStatus('Error: '+(t.error||r.status)); btn && (btn.disabled=false); return; }
      const { upid, vmid } = await r.json();
      setStatus(`Tarea iniciada (VMID ${vmid}). Esperando finalización...`);
      // poll status
      await pollTask(upid);
      setStatus('Contenedor creado exitosamente');
      setTimeout(()=>{ closeCtModal(); }, 1200);
    }catch(err){ setStatus('Error creando contenedor'); }
    finally{ btn && (btn.disabled = false); }
  }
  async function pollTask(upid){
    let attempts = 0;
    while (attempts < 120){ // ~4 minutos
      attempts++;
      try{
        const r = await fetch(`/api/proxmox/ct/${encodeURIComponent(upid)}/status`);
        const data = await r.json();
        // data typically: { status: 'running'|'stopped', exitstatus: 'OK'|'ERROR' }
        if (data.status){ setStatus(`Estado: ${data.status}${data.exitstatus? ' · '+data.exitstatus: ''}`); }
        if (data.status === 'stopped'){
          if (String(data.exitstatus||'').toUpperCase().includes('OK')) return true;
          // ended but not OK
          throw new Error(data.exitstatus || 'Tarea detenida');
        }
      }catch(e){ setStatus('Error consultando estado'); throw e; }
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('Timeout esperando tarea');
  }
  function wire(){
    if (wired) return; wired = true;
    document.addEventListener('click', (e)=>{
      const openBtn = e.target.closest('#createCtBtn');
      if (openBtn){ e.preventDefault(); openCtModal(); return; }
      const closeBtn = e.target.closest('#ctCloseBtn, #ctCancelBtn');
      if (closeBtn){ e.preventDefault(); closeCtModal(); return; }
    });
    qs('ctForm')?.addEventListener('submit', submitCt);
  }
  document.addEventListener('DOMContentLoaded', wire);
})();

// === Proxmox VM (QEMU) management ===
(function(){
  let wiredVm = false;
  function qs(id){ return document.getElementById(id); }
  function show(el){ el && el.classList.add('show'); }
  function hide(el){ el && el.classList.remove('show'); }
  function setVmStatus(msg){ const s = qs('vmStatus'); if (s) s.textContent = msg || ''; }

  function openVmModal(){ setVmStatus(''); show(qs('vmModal')); qs('vmForm')?.reset(); }
  function closeVmModal(){ hide(qs('vmModal')); }

  async function submitVm(e){
    e.preventDefault();
    const btn = qs('vmSubmitBtn');
    const payload = {
      name: qs('vmName')?.value?.trim(),
      cores: Number(qs('vmCores')?.value || 1),
      memory: Number(qs('vmMemory')?.value || 1024),
      disk: Number(qs('vmDisk')?.value || 10),
      bridge: qs('vmBridge')?.value || 'vmbr0'
    };
    if (!payload.name){ setVmStatus('Ingresa un nombre'); return; }
    try{
      btn && (btn.disabled = true); setVmStatus('Creando VM...');
      const r = await fetch('/api/proxmox/vm', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (r.status === 401){ setVmStatus('No autenticado'); return; }
      if (r.status === 501){ setVmStatus('Proxmox no configurado en el servidor'); return; }
      if (!r.ok){ const t = await r.json().catch(()=>({})); setVmStatus('Error: ' + (t.error||r.status)); return; }
      const { upid, vmid } = await r.json();
      setVmStatus(`Tarea iniciada (VMID ${vmid}). Esperando finalización...`);
      // Optional: poll generic CT status endpoint (works for any task)
      try { await pollTaskStatus(upid); } catch {}
      setVmStatus('VM creada');
      setTimeout(()=>{ closeVmModal(); }, 800);
      // refresh list a bit later
      setTimeout(()=>{ loadVMs(); }, 1200);
    } catch(err){ setVmStatus('Error creando VM'); }
    finally{ btn && (btn.disabled = false); }
  }

  async function pollTaskStatus(upid){
    let tries = 0;
    while (tries < 90){
      tries++;
      const r = await fetch(`/api/proxmox/ct/${encodeURIComponent(upid)}/status`);
      const data = await r.json().catch(()=>({}));
      if (data && data.status){ setVmStatus(`Estado: ${data.status}${data.exitstatus? ' · '+data.exitstatus: ''}`); }
      if (data && data.status === 'stopped') return data;
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('timeout');
  }

  function renderVMCard(vm){
    const vmid = String(vm.vmid);
    const name = (vm.name || ('VM ' + vmid));
    const status = vm.status || 'unknown';
    const maxmem = vm.maxmem ? Math.round(vm.maxmem/1024/1024) + ' MB' : '—';
    const maxdisk = vm.maxdisk ? Math.round(vm.maxdisk/1024/1024/1024) + ' GB' : '—';
    return `
      <div class="card" data-vmid="${vmid}">
        <div style="flex:1">
          <div class="name">${name} <span class="badge">${vmid}</span></div>
          <div class="meta">
            <span class="badge">Estado: ${status}</span>
            <span class="badge">vCPUs: ${vm.cpus ?? '—'}</span>
            <span class="badge">RAM máx: ${maxmem}</span>
            <span class="badge">Disco máx: ${maxdisk}</span>
          </div>
        </div>
        <div class="actions">
          <a href="#" class="btn secondary" data-action="info-vm" data-vmid="${vmid}">Info</a>
          <a href="#" class="btn" data-action="start-vm" data-vmid="${vmid}">Start</a>
          <a href="#" class="btn" data-action="stop-vm" data-vmid="${vmid}">Stop</a>
          <a href="#" class="btn" data-action="reboot-vm" data-vmid="${vmid}">Reboot</a>
          <a href="#" class="btn del" data-action="delete-vm" data-vmid="${vmid}">Eliminar</a>
        </div>
      </div>`;
  }

  async function loadVMs(){
    const listEl = qs('vmsList');
    if (!listEl) return;
    listEl.textContent = 'Cargando VMs...';
    try{
      const r = await fetch('/api/proxmox/vms');
      if (r.status === 501){ listEl.textContent = 'Proxmox no configurado en el servidor'; return; }
      if (r.status === 401){ listEl.textContent = 'No autenticado'; return; }
      const list = await r.json();
      if (!Array.isArray(list) || !list.length){ listEl.textContent = 'Sin VMs'; return; }
      listEl.innerHTML = list.map(renderVMCard).join('');
    }catch(e){ listEl.textContent = 'Error al cargar VMs'; }
  }

  async function vmAction(vmid, action){
    try{
      const url = action === 'delete' ? `/api/proxmox/vm/${encodeURIComponent(vmid)}`
        : `/api/proxmox/vm/${encodeURIComponent(vmid)}/${action}`;
      const opts = { method: action === 'delete' ? 'DELETE' : 'POST' };
      const r = await fetch(url, opts);
      if (!r.ok){ return false; }
      return true;
    }catch{ return false; }
  }

  function wireVm(){
    if (wiredVm) return; wiredVm = true;
    document.addEventListener('click', (e)=>{
      const openBtn = e.target.closest('#createVmBtn');
      if (openBtn){ e.preventDefault(); openVmModal(); return; }
      const closeBtn = e.target.closest('#vmCloseBtn, #vmCancelBtn');
      if (closeBtn){ e.preventDefault(); closeVmModal(); return; }
      const refresh = e.target.closest('#refreshVms');
      if (refresh){ e.preventDefault(); loadVMs(); return; }

      const start = e.target.closest('[data-action="start-vm"]');
      if (start){ e.preventDefault(); const id = start.getAttribute('data-vmid'); vmAction(id, 'start').then(loadVMs); return; }
      const stop = e.target.closest('[data-action="stop-vm"]');
      if (stop){ e.preventDefault(); const id = stop.getAttribute('data-vmid'); vmAction(id, 'stop').then(loadVMs); return; }
      const reboot = e.target.closest('[data-action="reboot-vm"]');
      if (reboot){ e.preventDefault(); const id = reboot.getAttribute('data-vmid'); vmAction(id, 'reboot').then(loadVMs); return; }
      const del = e.target.closest('[data-action="delete-vm"]');
      if (del){ e.preventDefault(); const id = del.getAttribute('data-vmid'); if (confirm('¿Eliminar VM '+id+'?')) vmAction(id, 'delete').then(loadVMs); return; }
      const info = e.target.closest('[data-action="info-vm"]');
      if (info){
        e.preventDefault(); const id = info.getAttribute('data-vmid');
        (async ()=>{
          try{
            const r = await fetch(`/api/proxmox/vm/${encodeURIComponent(id)}/info`);
            const data = await r.json();
            const mem = data?.mem ? Math.round(data.mem/1024/1024)+' MB' : '—';
            const maxmem = data?.maxmem ? Math.round(data.maxmem/1024/1024)+' MB' : '—';
            const disk = data?.disk ? Math.round(data.disk/1024/1024/1024)+' GB' : '—';
            const maxdisk = data?.maxdisk ? Math.round(data.maxdisk/1024/1024/1024)+' GB' : '—';
            alert(`VM ${id}\nEstado: ${data?.status || '—'}\nCPU: ${(data?.cpu??0)*100}% de ${data?.cpus||'—'}\nRAM: ${mem} / ${maxmem}\nDisco: ${disk} / ${maxdisk}`);
          }catch{ alert('No se pudo obtener la información'); }
        })();
        return;
      }
    });

    qs('vmForm')?.addEventListener('submit', submitVm);
    // initial load
    loadVMs();
  }

  document.addEventListener('DOMContentLoaded', wireVm);
})();

// Init
loadUser();
loadVps();
