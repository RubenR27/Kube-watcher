
/* ─────────────────────────────────────────
   CONFIG — change to your API address
───────────────────────────────────────── */
const host = window.location.host; 
const protocol = window.location.protocol;

const API_BASE = `${protocol}//${host}`;
const WS_BASE  = `${protocol}//${host}`;


/* ─────────────────────────────────────────
   STATE
───────────────────────────────────────── */
let allPods        = [];
let statusFilter   = '';
let sortKey        = 'name';
let sortAsc        = true;
let pendingDelete  = null;
let ws             = null;
let wsRetryTimer   = null;
let eventCount     = 0;

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadPods();
  connectWebSocket();
});

/* ─────────────────────────────────────────
   FETCH PODS
───────────────────────────────────────── */
async function loadPods() {
  const btn = document.getElementById('btn-refresh');
  btn.classList.add('spinning');
  btn.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/pods`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allPods = await res.json();
    populateNamespaces();
    renderAll();
    toast('Pods refreshed', 'ok');
  } catch (e) {
    toast(`Error fetching pods: ${e.message}`, 'err');
  } finally {
    btn.classList.remove('spinning');
    btn.disabled = false;
  }
}

/* ─────────────────────────────────────────
   WEBSOCKET
───────────────────────────────────────── */
function connectWebSocket() {
  const ns = document.getElementById('ns-select').value || 'all';
  setWsStatus('connecting');

  try {
    ws = new WebSocket(`${WS_BASE}/ws/pods?namespace=${ns}`);
  } catch(e) {
    setWsStatus('error');
    scheduleWsRetry();
    return;
  }

  ws.onopen = () => {
    setWsStatus('on');
    clearTimeout(wsRetryTimer);
    addEvent('SYSTEM', '—', 'WebSocket connected');
  };

  ws.onmessage = (e) => {
    let ev;
    try { ev = JSON.parse(e.data); } catch { return; }
    handleWsEvent(ev);
  };

  ws.onclose = () => {
    setWsStatus('error');
    addEvent('SYSTEM', '—', 'WebSocket disconnected — retrying...');
    scheduleWsRetry();
  };

  ws.onerror = () => {
    setWsStatus('error');
  };
}

function scheduleWsRetry() {
  clearTimeout(wsRetryTimer);
  wsRetryTimer = setTimeout(connectWebSocket, 5000);
}

function setWsStatus(state) {
  const dot   = document.getElementById('ws-dot');
  const label = document.getElementById('ws-label');
  dot.className = 'ws-dot';
  if (state === 'on')          { dot.classList.add('on');  label.textContent = 'Live'; }
  else if (state === 'error')  { dot.classList.add('err'); label.textContent = 'Disconnected'; }
  else                         {                           label.textContent = 'Connecting...'; }
}

function handleWsEvent(ev) {
  // ev = { type: "ADDED" | "MODIFIED" | "DELETED", pod: { name, namespace, status, ready, restarts, node, age } }
  const { type, pod } = ev;
  if (!pod || !pod.name) return;

  addEvent(type, pod.name, pod.namespace || '—');

  if (type === 'ADDED') {
    if (!allPods.find(p => p.name === pod.name && p.namespace === pod.namespace)) {
      allPods.push(pod);
      populateNamespaces();
      renderAll();
      flashRow(pod.name, 'flash-new');
      toast(`Pod added: ${pod.name}`, 'info');
    }
  } else if (type === 'MODIFIED') {
    const idx = allPods.findIndex(p => p.name === pod.name && p.namespace === pod.namespace);
    if (idx !== -1) {
      allPods[idx] = pod;
      renderAll();
      flashRow(pod.name, 'flash-new');
    }
  } else if (type === 'DELETED') {
    flashRow(pod.name, 'flash-del');
    setTimeout(() => {
      allPods = allPods.filter(p => !(p.name === pod.name && p.namespace === pod.namespace));
      populateNamespaces();
      renderAll();
      toast(`Pod deleted: ${pod.name}`, 'info');
    }, 500);
  }
}

/* ─────────────────────────────────────────
   RENDER
───────────────────────────────────────── */
function getStatusClass(status) {
  if (!status) return 'Unknown';
  if (['Running'].includes(status))                              return 'Running';
  if (['Pending', 'ContainerCreating'].includes(status))        return 'Pending';
  if (['Failed','Error','CrashLoopBackOff','OOMKilled'].includes(status)) return 'Failed';
  if (['Terminating'].includes(status))                          return 'Terminating';
  return 'Unknown';
}

function filteredPods() {
  const ns     = document.getElementById('ns-select').value;
  const search = document.getElementById('search-box').value.toLowerCase();
  return allPods
    .filter(p =>
      (!ns || p.namespace === ns) &&
      (!statusFilter || getStatusClass(p.status) === statusFilter) &&
      (!search || p.name.toLowerCase().includes(search))
    )
    .sort((a, b) => {
      let va = a[sortKey] ?? '', vb = b[sortKey] ?? '';
      if (sortKey === 'restarts') { va = Number(va); vb = Number(vb); }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ?  1 : -1;
      return 0;
    });
}

function renderAll() {
  renderStats();
  renderTable();
}

function renderStats() {
  let running = 0, pending = 0, failed = 0;
  allPods.forEach(p => {
    const sc = getStatusClass(p.status);
    if (sc === 'Running') running++;
    else if (sc === 'Pending') pending++;
    else if (sc === 'Failed') failed++;
  });
  document.getElementById('s-running').textContent = running;
  document.getElementById('s-pending').textContent = pending;
  document.getElementById('s-failed').textContent  = failed;
  document.getElementById('s-total').textContent   = allPods.length;
}

function renderTable() {
  const pods  = filteredPods();
  const tbody = document.getElementById('pods-tbody');
  const empty = document.getElementById('empty-state');

  if (pods.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = pods.map(p => {
    const sc = getStatusClass(p.status);
    const restartsCls = (Number(p.restarts) >= 5) ? 'restarts-high' : 'muted-cell';
    return `<tr id="row-${p.name}">
      <td><div class="pod-name-cell"><span class="name" title="${p.name}">${p.name}</span></div></td>
      <td><span class="ns-badge">${p.namespace || '—'}</span></td>
      <td><span class="status-pill s-${sc}"><span class="s-dot"></span>${p.status || 'Unknown'}</span></td>
      <td class="muted-cell">${p.ready || '—'}</td>
      <td class="${restartsCls}">${p.restarts ?? '—'}</td>
      <td class="node-cell" title="${p.node || ''}">${p.node || '—'}</td>
      <td class="muted-cell">${p.age || '—'}</td>
      <td><div class="actions-cell">
        <button class="btn-sm" onclick="openLogs('${p.name}','${p.namespace}')">Logs</button>
        <button class="btn-sm danger" onclick="confirmDelete('${p.name}','${p.namespace}')">Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}

function flashRow(name, cls) {
  const row = document.getElementById(`row-${name}`);
  if (row) { row.classList.add(cls); }
}

/* ─────────────────────────────────────────
   FILTERS / SORT
───────────────────────────────────────── */
function populateNamespaces() {
  const sel = document.getElementById('ns-select');
  const current = sel.value;
  const nsList = [...new Set(allPods.map(p => p.namespace).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">All namespaces</option>' +
    nsList.map(ns => `<option value="${ns}" ${ns === current ? 'selected' : ''}>${ns}</option>`).join('');
}

function setFilter(val, btn) {
  statusFilter = val;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTable();
}

function applyFilters() { renderTable(); }

function sortBy(key) {
  if (sortKey === key) sortAsc = !sortAsc;
  else { sortKey = key; sortAsc = true; }
  document.querySelectorAll('.sort-arrow').forEach(el => el.style.color = '');
  const el = document.getElementById(`sort-${key}`);
  if (el) { el.style.color = 'var(--accent)'; el.textContent = sortAsc ? '↑' : '↓'; }
  renderTable();
}

/* ─────────────────────────────────────────
   DELETE
───────────────────────────────────────── */
function confirmDelete(name, ns) {
  pendingDelete = { name, ns };
  const strip = document.getElementById('confirm-strip');
  document.getElementById('confirm-msg').textContent = `Delete pod "${name}" in namespace "${ns}"?`;
  document.getElementById('confirm-yes').onclick = () => deletePod(name, ns);
  strip.classList.add('visible');
  strip.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function cancelDelete() {
  pendingDelete = null;
  document.getElementById('confirm-strip').classList.remove('visible');
}

async function deletePod(name, ns) {
  cancelDelete();
  flashRow(name, 'flash-del');
  try {
    const res = await fetch(`${API_BASE}/pods/${ns}/${name}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setTimeout(() => {
      allPods = allPods.filter(p => !(p.name === name && p.namespace === ns));
      populateNamespaces();
      renderAll();
      toast(`Deleted: ${name}`, 'ok');
    }, 500);
  } catch (e) {
    const row = document.getElementById(`row-${name}`);
    if (row) row.classList.remove('flash-del');
    toast(`Delete failed: ${e.message}`, 'err');
  }
}

/* ─────────────────────────────────────────
   LOGS DRAWER
───────────────────────────────────────── */
async function openLogs(name, ns) {
  document.getElementById('drawer-pod-name').textContent = name;
  document.getElementById('drawer-ns-name').textContent  = ns;
  document.getElementById('log-body').textContent = 'Fetching logs...';
  document.getElementById('overlay').classList.add('open');

  try {
    const res = await fetch(`${API_BASE}/pods/${ns}/${name}/logs`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.text();
    renderLogs(raw);
  } catch (e) {
    document.getElementById('log-body').textContent = `Could not fetch logs: ${e.message}`;
  }
}

function renderLogs(raw) {
  const body = document.getElementById('log-body');
  body.innerHTML = raw.split('\n').map(line => {
    if (/ERROR|FATAL|error|fatal/i.test(line)) return `<span class="log-error">${escHtml(line)}</span>`;
    if (/WARN|warn/i.test(line))               return `<span class="log-warn">${escHtml(line)}</span>`;
    if (/INFO|info/i.test(line))               return `<span class="log-info">${escHtml(line)}</span>`;
    return escHtml(line);
  }).join('\n');
  body.scrollTop = body.scrollHeight;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function closeDrawer(e) {
  if (e.target === document.getElementById('overlay')) closeDrawerDirect();
}
function closeDrawerDirect() {
  document.getElementById('overlay').classList.remove('open');
}

/* ─────────────────────────────────────────
   EVENT LOG
───────────────────────────────────────── */
function addEvent(type, pod, ns) {
  eventCount++;
  document.getElementById('event-count').textContent = `${eventCount} events`;

  const body = document.getElementById('event-log-body');
  const now  = new Date().toLocaleTimeString('en-US', { hour12: false, hour:'2-digit', minute:'2-digit', second:'2-digit' });

  if (eventCount === 1) body.innerHTML = '';

  const div = document.createElement('div');
  div.className = 'event-item';
  div.innerHTML = `
    <span class="event-time">${now}</span>
    <span class="event-type ${type}">${type}</span>
    <span class="event-pod">${pod}</span>
    <span class="muted-cell" style="font-size:11px">${ns}</span>
  `;
  body.prepend(div);

  // keep max 60 entries
  while (body.children.length > 60) body.removeChild(body.lastChild);
}

/* ─────────────────────────────────────────
   TOAST
───────────────────────────────────────── */
function toast(msg, type = '') {
  const ct = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  ct.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}