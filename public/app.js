'use strict';
/* Panel de pruebas y demostración. Sin dependencias ni build.
   Todo texto de usuario/servidor se inserta con textContent (nunca innerHTML). */

const $ = (id) => document.getElementById(id);
const HOURS = Array.from({ length: 14 }, (_, i) => 7 + i); // 07:00-20:00 UTC
const DAY_MS = 24 * 3600 * 1000;
const state = { token: null, user: null, rooms: [], reservations: new Map(), polling: null };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, '0');
const utcDay = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const iso = (v) => new Date(v).toISOString();

/* ---------- avisos visibles ---------- */
function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('toasts').append(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 6000 : 3500);
}
const logEl = $('log');
function log(line) {
  logEl.textContent += `[${new Date().toLocaleTimeString()}] ${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}
$('btn-clear').onclick = () => { logEl.textContent = ''; };
function narrate(text) { $('narration').textContent = text; }

/* ---------- HTTP ---------- */
async function api(method, path, body, extraHeaders = {}, quiet = false) {
  const headers = { ...extraHeaders };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const t0 = performance.now();
  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    log(`${method} ${path} -> error de red: ${e.message}`);
    if (!quiet) toast(`Error de red: ${e.message}`, 'bad');
    return { status: 0, data: null, ms: 0 };
  }
  const ms = Math.round(performance.now() - t0);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  const shown = typeof data === 'string' ? data : JSON.stringify(data);
  log(`${method} ${path} -> ${res.status} (${ms} ms) ${(shown || '').slice(0, 300)}`);
  if (!quiet) {
    const kind = res.status < 300 ? 'ok' : res.status === 429 ? 'warn' : 'bad';
    const detail = data && data.error ? ` · ${data.error}` : '';
    toast(`${method} ${path.split('?')[0]} → ${res.status}${detail}`, kind);
  }
  return { status: res.status, data, ms };
}

function busy(btn, fn) {
  return async () => {
    btn.disabled = true;
    try { await fn(); } catch (e) { toast(`Error: ${e.message}`, 'bad'); } finally { btn.disabled = false; }
  };
}
function needSession() {
  if (state.user && state.token) return true;
  toast('Primero inicia sesión (pestaña «Sesión»).', 'warn');
  return false;
}

/* ---------- sesión ---------- */
function setWho() {
  $('who').textContent = state.user ? `${state.user.name} · ${state.user.role} · #${state.user.id}` : 'Sin sesión';
  const st = $('ses-status');
  st.textContent = state.user
    ? `✔ Sesión activa: ${state.user.email} (${state.user.role})`
    : 'Sin sesión iniciada.';
  st.className = `statusline ${state.user ? 'ok' : ''}`;
}
$('btn-register').onclick = busy($('btn-register'), async () => {
  const r = await api('POST', '/api/users/register', {
    email: $('email').value, name: $('name').value, password: $('password').value,
  });
  if (r.status === 201) toast('Cuenta creada. Ahora pulsa «Iniciar sesión».', 'ok');
  if (r.status === 409) toast('Ese email ya existe: pulsa «Iniciar sesión» (o cambia el email).', 'warn');
});
$('btn-login').onclick = busy($('btn-login'), async () => {
  state.token = null; state.user = null;
  const r = await api('POST', '/api/users/login', { email: $('email').value, password: $('password').value });
  if (r.status === 200) { state.token = r.data.token; state.user = r.data.user; await refreshBalance(); }
  setWho();
});
$('btn-me').onclick = busy($('btn-me'), async () => {
  if (!needSession()) return;
  const r = await api('GET', '/api/users/me');
  if (r.status === 200) { state.user = r.data; setWho(); toast(`Soy ${r.data.name} (${r.data.role}), saldo ${r.data.balance}`, 'ok'); }
});
$('btn-logout').onclick = busy($('btn-logout'), async () => {
  if (!needSession()) return;
  await api('POST', '/api/users/logout');
  state.token = null; state.user = null; $('balance').textContent = ''; setWho();
});
$('fill-user').onclick = () => { $('email').value = 'demo@coworking.demo'; $('password').value = 'Demo1234!'; toast('Datos de la cuenta demo cargados. Pulsa «Iniciar sesión».'); };
$('fill-admin').onclick = () => { $('email').value = 'admin@coworking.demo'; $('password').value = 'Admin1234!'; toast('Datos del admin demo cargados. Pulsa «Iniciar sesión».'); };

async function refreshBalance() {
  if (!state.user) return;
  const r = await api('GET', `/api/users/${state.user.id}`, undefined, {}, true);
  if (r.status === 200) $('balance').textContent = `Saldo: ${r.data.balance}`;
}

/* ---------- salas y reservas ---------- */
async function loadRooms() {
  const r = await api('GET', '/api/rooms', undefined, {}, true);
  if (r.status !== 200) return;
  state.rooms = r.data;
  $('room').replaceChildren(...state.rooms.map((room) => {
    const o = document.createElement('option');
    o.value = room.id;
    o.textContent = `${room.name} (${room.hourlyRate}/h)`;
    return o;
  }));
  renderGrid();
}
function defaultSlot() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(9, 0, 0, 0);
  const local = (x) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
  $('start').value = local(d);
  d.setUTCHours(11);
  $('end').value = local(d);
}
function bookBody() {
  if (!needSession()) return null;
  if (!$('start').value || !$('end').value) { toast('Completa inicio y fin.', 'warn'); return null; }
  return { userId: state.user.id, roomId: Number($('room').value), startDate: iso($('start').value), endDate: iso($('end').value) };
}
$('btn-book').onclick = busy($('btn-book'), async () => {
  const body = bookBody(); if (!body) return;
  const key = $('idem').value.trim();
  await api('POST', '/api/reservations', body, key ? { 'X-Idempotency-Key': key } : {});
  await refreshBalance();
});
$('btn-race').onclick = busy($('btn-race'), async () => {
  const body = bookBody(); if (!body) return;
  const rs = await Promise.all(Array.from({ length: 5 }, () => api('POST', '/api/reservations', body, {}, true)));
  const n = (s) => rs.filter((r) => r.status === s).length;
  const msg = `Carrera ×5 al mismo horario: ${n(201)} creada, ${n(409)} conflicto(s), ${n(400)} rechazo(s)`;
  log(msg); toast(msg, n(201) === 1 ? 'ok' : 'warn');
  await refreshBalance();
});
$('btn-balance').onclick = busy($('btn-balance'), async () => {
  if (!needSession()) return;
  await api('POST', `/api/users/${state.user.id}/balance`, { amount: 50 });
  await refreshBalance();
});
$('btn-mine').onclick = busy($('btn-mine'), loadMine);
async function loadMine() {
  if (!needSession()) return;
  const r = await api('GET', `/api/users/${state.user.id}/reservations`);
  if (r.status !== 200) return;
  if (r.data.length === 0) toast('Aún no tienes reservas.');
  $('mine').replaceChildren(...r.data.slice(0, 30).map((res) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = `#${res.id} sala ${res.roomId} · ${res.startDate.slice(5, 16).replace('T', ' ')} · ${res.status}`;
    li.append(span);
    if (res.status === 'CONFIRMED') {
      const b = document.createElement('button');
      b.textContent = 'Cancelar';
      b.onclick = async () => { await api('DELETE', `/api/reservations/${res.id}`); await loadMine(); await refreshBalance(); };
      li.append(b);
    }
    return li;
  }));
}

/* ---------- simulador y tráfico en vivo ---------- */
const selectedDay = () => $('day').value;

function renderSimReport(d) {
  const o = d.outcomes, i = d.invariants;
  const t = document.createElement('table');
  [['Confirmadas', o.confirmed], ['Conflictos de horario (409)', o.conflicts],
   ['Saldo insuficiente', o.insufficientBalance], ['Canceladas', o.cancelled],
   ['Cancelación rechazada', o.cancelRejected], ['Estados avanzados', o.advanced],
   ['Errores inesperados', o.errors], ['Duración', `${d.durationMs} ms`], ['Semilla', d.seed],
  ].forEach(([k, v]) => { const tr = t.insertRow(); tr.insertCell().textContent = k; tr.insertCell().textContent = v; });
  const verdict = document.createElement('p');
  const ok = i.noOverlaps && i.noNegativeBalances;
  verdict.className = ok ? 'ok' : 'bad';
  verdict.textContent = ok ? '✔ Invariantes: sin solapes y sin saldos negativos'
    : `✘ Invariantes rotos: ${i.overlapsFound} solapes, ${i.negativeBalances} saldos negativos`;
  $('sim-out').replaceChildren(t, verdict);
}
async function runSim(body, quiet) {
  const r = await api('POST', '/api/sim/run', { ...body, day: selectedDay() }, {}, quiet);
  if (r.status === 404) { toast('Simulador apagado (ENABLE_SIMULATOR=true).', 'bad'); return null; }
  if (r.status !== 200) return null;
  renderSimReport(r.data);
  return r.data;
}
$('btn-sim').onclick = busy($('btn-sim'), async () => {
  const body = { operations: Number($('sim-ops').value), concurrency: Number($('sim-conc').value), delayMs: Number($('sim-delay').value) };
  if ($('sim-seed').value !== '') body.seed = Number($('sim-seed').value);
  $('sim-out').textContent = 'Ejecutando…';
  await runSim(body);
});
$('btn-burst').onclick = busy($('btn-burst'), async () => {
  narrate('Ráfaga: 300 operaciones, 50 a la vez, contra la misma base de datos…');
  const d = await runSim({ operations: 300, concurrency: 50, delayMs: 150 }, true);
  if (d) {
    const ok = d.invariants.noOverlaps && d.invariants.noNegativeBalances;
    narrate(`Ráfaga terminada: ${d.outcomes.confirmed} creadas, ${d.outcomes.conflicts} rechazadas por horario ocupado. ${ok ? '✔ Cero solapes y cero saldos negativos.' : '✘ ¡Invariantes rotos!'}`);
    toast(ok ? 'Ráfaga OK: la base de datos mantuvo la consistencia' : 'Invariantes rotos', ok ? 'ok' : 'bad');
  }
});
async function startAuto(rate, maxSeconds = 120) {
  const r = await api('POST', '/api/sim/auto', { ratePerSec: rate, maxSeconds, day: selectedDay() }, {}, true);
  if (r.status === 404) { toast('Simulador apagado (ENABLE_SIMULATOR=true).', 'bad'); return false; }
  if (r.status === 200) startPolling();
  return r.status === 200;
}
$('btn-auto').onclick = busy($('btn-auto'), async () => {
  const rate = Number($('auto-rate').value);
  if (await startAuto(rate)) {
    narrate(`Tráfico en vivo: llegan ~${rate} peticiones por segundo al azar (a veces en ráfagas). Mira el calendario y la actividad.`);
    toast('Tráfico en vivo iniciado', 'ok');
  }
});
$('btn-stop').onclick = busy($('btn-stop'), async () => {
  await api('POST', '/api/sim/auto/stop', undefined, {}, true);
  narrate('Tráfico detenido.'); toast('Tráfico detenido');
});
$('btn-reset').onclick = busy($('btn-reset'), async () => {
  await api('POST', '/api/sim/reset', undefined, {}, true);
  resetCounters();
  await loadDay();
  toast('Calendario vaciado y saldos repuestos', 'ok');
});

function startPolling() {
  if (state.polling) return;
  state.polling = setInterval(async () => {
    try {
      const res = await fetch('/api/sim/auto');
      if (!res.ok) return;
      const s = await res.json();
      $('t-inflight').textContent = s.running ? s.inFlight : 0;
      if (s.running) $('t-peak').textContent = s.peakInFlight;
      else { clearInterval(state.polling); state.polling = null; }
    } catch { /* se reintenta en el siguiente ciclo */ }
  }, 500);
}

/* ---------- tasa limitada ---------- */
$('btn-rl').onclick = busy($('btn-rl'), async () => {
  const n = Math.min(200, Math.max(1, Number($('rl-n').value)));
  const t0 = performance.now();
  const rs = await Promise.all(Array.from({ length: n }, () => fetch('/api/sim/rate-test').then((r) => r.status).catch(() => 0)));
  const ok = rs.filter((s) => s === 200).length, lim = rs.filter((s) => s === 429).length;
  const p = document.createElement('p');
  p.textContent = `${n} peticiones en ${Math.round(performance.now() - t0)} ms → ${ok} × 200 · ${lim} × 429 (limitadas) · ${n - ok - lim} otras`;
  p.className = lim > 0 ? 'warn' : 'ok';
  $('rl-out').replaceChildren(p);
  log(`Ráfaga rate-test: ${ok} OK, ${lim} limitadas (429)`);
  toast(`${ok} aceptadas, ${lim} rechazadas con 429`, lim > 0 ? 'warn' : 'ok');
});

/* ---------- petición libre ---------- */
$('btn-raw').onclick = busy($('btn-raw'), async () => {
  const method = $('raw-method').value;
  const txt = $('raw-body').value.trim();
  let body;
  if (txt) { try { body = JSON.parse(txt); } catch { toast('El cuerpo no es JSON válido.', 'bad'); return; } }
  await api(method, $('raw-path').value, method === 'GET' || method === 'DELETE' ? undefined : body);
});

/* ---------- calendario ---------- */
let flash = new Map(); // "roomId|hour" -> 'ok' | 'rej'
function dayRange() {
  const from = new Date(`${$('day').value}T00:00:00.000Z`);
  return { from, to: new Date(from.getTime() + DAY_MS) };
}
async function loadDay() {
  const { from, to } = dayRange();
  const r = await fetch(`/api/reservations?from=${from.toISOString()}&to=${to.toISOString()}`);
  if (!r.ok) return;
  state.reservations = new Map((await r.json()).map((x) => [x.id, x]));
  renderGrid();
}
function hoursOf(r, from) {
  const s = new Date(r.startDate).getTime(), e = new Date(r.endDate).getTime();
  return HOURS.filter((h) => { const hs = from.getTime() + h * 3600000; return s < hs + 3600000 && e > hs; });
}
function renderGrid() {
  const { from } = dayRange();
  const cell = new Map();
  for (const r of state.reservations.values()) {
    hoursOf(r, from).forEach((h) => {
      const key = `${r.roomId}|${h}`;
      const prev = cell.get(key);
      if (!prev || prev.status === 'CANCELLED') cell.set(key, r);
    });
  }
  const head = document.createElement('tr');
  head.append(document.createElement('th'));
  state.rooms.forEach((room) => {
    const th = document.createElement('th');
    th.scope = 'col'; th.textContent = room.name.replace('Sala ', ''); head.append(th);
  });
  const rows = HOURS.map((h) => {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row'; th.textContent = `${pad(h)}:00`; tr.append(th);
    state.rooms.forEach((room) => {
      const td = document.createElement('td');
      const key = `${room.id}|${h}`;
      const r = cell.get(key);
      if (r) { td.className = `s-${r.status}`; td.title = `Reserva #${r.id} · ${r.status}`; if (r.status === 'CANCELLED') td.textContent = '✕'; }
      const f = flash.get(key);
      if (f === 'ok') td.classList.add('flash');
      if (f === 'rej') { td.classList.add('rej'); td.textContent = '⚠'; td.title = 'Intento rechazado (horario ocupado)'; }
      tr.append(td);
    });
    return tr;
  });
  $('grid').replaceChildren(head, ...rows);
}
function flashCells(roomId, reservation, kind) {
  const { from } = dayRange();
  hoursOf({ startDate: reservation.startDate, endDate: reservation.endDate }, from).forEach((h) => flash.set(`${roomId}|${h}`, kind));
  renderGrid();
  setTimeout(() => { flash = new Map(); renderGrid(); }, 700);
}
function shiftDay(delta) {
  const d = new Date(`${$('day').value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  $('day').value = utcDay(d);
  loadDay();
}
$('day-prev').onclick = () => shiftDay(-1);
$('day-next').onclick = () => shiftDay(1);
$('day').onchange = loadDay;

/* ---------- eventos en vivo, contadores y actividad ---------- */
const counters = { created: 0, cancelled: 0, status: 0, conflict: 0, balance: 0 };
let recent = []; // marcas de tiempo para eventos/seg
function resetCounters() {
  Object.keys(counters).forEach((k) => { counters[k] = 0; });
  recent = []; paintCounters();
  $('feed').replaceChildren();
}
function paintCounters() {
  $('t-created').textContent = counters.created;
  $('t-cancelled').textContent = counters.cancelled;
  $('t-status').textContent = counters.status;
  $('t-conflict').textContent = counters.conflict;
  $('t-balance').textContent = counters.balance;
}
setInterval(() => {
  const now = Date.now();
  recent = recent.filter((t) => now - t < 3000);
  $('t-rate').textContent = (recent.length / 3).toFixed(1);
}, 500);

const LABEL = {
  'reservation.created': ['b-created', 'CREADA'], 'reservation.cancelled': ['b-cancelled', 'CANCELADA'],
  'reservation.status': ['b-status', 'ESTADO'], 'reservation.rejected': ['b-rejected', 'RECHAZADA'],
  'calendar.reset': ['b-reset', 'REINICIO'],
};
function roomName(id) {
  const r = state.rooms.find((x) => x.id === id);
  return r ? r.name.replace('Sala ', '') : `#${id}`;
}
function addFeed(ev) {
  const [cls, text] = LABEL[ev.type];
  const li = document.createElement('li');
  const b = document.createElement('span');
  b.className = `badge ${cls}`; b.textContent = text;
  const r = ev.reservation;
  const span = document.createElement('span');
  if (ev.type === 'calendar.reset') span.textContent = 'Calendario vaciado';
  else {
    const hh = (v) => new Date(v).toISOString().slice(11, 16);
    const why = ev.reason === 'CONFLICT' ? ' · horario ocupado' : ev.reason === 'INSUFFICIENT_BALANCE' ? ' · saldo insuficiente' : '';
    span.textContent = `${roomName(r.roomId)} ${hh(r.startDate)}–${hh(r.endDate)}${r.id ? ` · #${r.id}` : ''}${why}`;
  }
  li.append(b, span);
  const feed = $('feed');
  feed.prepend(li);
  while (feed.children.length > 40) feed.lastChild.remove();
}
function onEvent(ev) {
  recent.push(Date.now());
  addFeed(ev);
  const r = ev.reservation;
  switch (ev.type) {
    case 'calendar.reset': loadDay(); return;
    case 'reservation.created': counters.created++; break;
    case 'reservation.cancelled': counters.cancelled++; break;
    case 'reservation.status': counters.status++; break;
    case 'reservation.rejected':
      if (ev.reason === 'CONFLICT') counters.conflict++; else counters.balance++;
      flashCells(r.roomId, r, 'rej');
      paintCounters();
      return;
    default: return;
  }
  paintCounters();
  state.reservations.set(r.id, r);
  flashCells(r.roomId, r, 'ok');
}
function connectLive() {
  const es = new EventSource('/api/events');
  es.onopen = () => { $('live-dot').classList.add('on'); $('live-text').textContent = 'En vivo'; };
  es.onerror = () => { $('live-dot').classList.remove('on'); $('live-text').textContent = 'Reconectando…'; };
  Object.keys(LABEL).forEach((type) => es.addEventListener(type, (m) => onEvent(JSON.parse(m.data))));
}

/* ---------- demo guiada ---------- */
$('btn-demo').onclick = busy($('btn-demo'), async () => {
  const day = selectedDay();
  narrate('1/6 · Preparando: vaciando el calendario y reponiendo saldos…');
  await api('POST', '/api/sim/reset', undefined, {}, true);
  resetCounters(); await loadDay(); await sleep(1500);

  narrate('2/6 · Tráfico real: llegan reservas al azar (~4 por segundo). Observa cómo se llenan las celdas del calendario.');
  if (!(await startAuto(4, 60))) return;
  await sleep(12000);

  narrate('3/6 · Más carga: sube a ~12 peticiones por segundo. Fíjate en «En vuelo ahora» y en los ⚠ de intentos rechazados.');
  await startAuto(12, 60);
  await sleep(12000);

  narrate('4/6 · Ráfaga de concurrencia: 300 operaciones, 50 a la vez, sobre el mismo calendario…');
  const d = await runSim({ operations: 300, concurrency: 50, delayMs: 200 }, true);
  if (d) {
    const ok = d.invariants.noOverlaps && d.invariants.noNegativeBalances;
    narrate(`5/6 · Resultado: ${d.outcomes.confirmed} creadas y ${d.outcomes.conflicts} rechazadas por horario ocupado. ${ok ? '✔ Cero solapes y cero saldos negativos: la base de datos mantuvo la consistencia.' : '✘ ¡Invariantes rotos!'}`);
  }
  await sleep(5000);

  narrate('6/6 · Límite de tasa: 60 peticiones simultáneas a un punto con tope de 20 por 10 s…');
  const rs = await Promise.all(Array.from({ length: 60 }, () => fetch('/api/sim/rate-test').then((r) => r.status)));
  const ok = rs.filter((s) => s === 200).length, lim = rs.filter((s) => s === 429).length;
  $('rl-out').textContent = `60 peticiones → ${ok} × 200 · ${lim} × 429`;
  await api('POST', '/api/sim/auto/stop', undefined, {}, true);
  narrate(`Fin de la demo: ${ok} peticiones aceptadas y ${lim} rechazadas con 429 por el límite de tasa. Sistema consistente y estable.`);
  toast('Demo guiada terminada', 'ok');
});

/* ---------- navegación (barra lateral) ---------- */
const VIEWS = {
  live: 'En vivo', session: 'Sesión', book: 'Reservas', sim: 'Simulador',
  rate: 'Límite de tasa', raw: 'Petición libre', console: 'Consola',
};
function showView() {
  const name = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'live';
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== name; });
  document.querySelectorAll('nav a').forEach((a) => {
    if (a.dataset.nav === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('view-title').textContent = VIEWS[name];
  document.title = `Coworking · ${VIEWS[name]}`;
  $('sidebar').classList.remove('open');
  if (name === 'live') renderGrid();
}
window.addEventListener('hashchange', showView);
$('menu').onclick = () => $('sidebar').classList.toggle('open');

/* ---------- arranque ---------- */

(async function init() {
  $('day').value = utcDay(new Date(Date.now() + DAY_MS));
  defaultSlot();
  setWho();
  showView();
  await loadRooms();
  await loadDay();
  connectLive();
  startPolling();
})();
