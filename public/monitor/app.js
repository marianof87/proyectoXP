// Monitor de recursos (HU-13): recibe muestras por SSE (/monitor/events) y dibuja con SVG.
// Sin dependencias ni build: el navegador ejecuta este archivo tal cual.

const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString('es-AR', { maximumFractionDigits: d, minimumFractionDigits: d }) : '–');
const hora = (t) => new Date(t).toLocaleTimeString('es-AR', { hour12: false });

const state = { history: [], info: null, windowSec: 60, table: false };

// ---------------------------------------------------------------------------
// Gráficos de línea: uno por magnitud (un solo eje Y cada uno).
// ---------------------------------------------------------------------------

const CHARTS = [
  {
    id: 'traffic', title: 'Tráfico que llega a la API', unit: 'pet/s',
    sub: 'Peticiones por segundo que el rate limit admitió y las que rechazó con 429.',
    series: [
      { key: 'admittedPerSec', label: 'Admitidas', color: 'var(--series-1)' },
      { key: 'rateLimitedPerSec', label: 'Rechazadas 429', color: 'var(--series-2)' },
      { key: 'serverErrorsPerSec', label: 'Errores 5xx', color: 'var(--series-3)' },
    ],
  },
  {
    id: 'cpu', title: 'Uso de CPU', unit: '%', max: 100,
    sub: 'Toda la máquina contra el proceso de la API (hilo principal + worker threads), como % de los núcleos lógicos.',
    series: [
      { key: 'hostCpuPct', label: 'Máquina', color: 'var(--series-1)' },
      { key: 'processCpuPct', label: 'API', color: 'var(--series-2)' },
    ],
  },
  {
    id: 'loop', title: 'Hilo principal (event loop)', unit: '%', max: 100,
    sub: 'Tiempo ocupado del único hilo que atiende Express. Si llega a 100 %, todo espera.',
    series: [{ key: 'eventLoopPct', label: 'Ocupado', color: 'var(--series-1)' }],
  },
  {
    id: 'lag', title: 'Demora del event loop (p99)', unit: 'ms',
    sub: 'Cuánto tarda el hilo principal en atender un callback listo. Sube cuando algo lo bloquea.',
    series: [{ key: 'loopDelayP99Ms', label: 'p99', color: 'var(--series-1)' }],
  },
  {
    id: 'pool', title: 'Worker threads ocupados (promedio)', unit: '%', max: 100,
    sub: 'Promedio del pool: con carga de login/registro se acerca a 100 % y aparece cola.',
    series: [{ key: 'poolAvg', label: 'Promedio', color: 'var(--series-1)', get: (s) => s.pool.avgPct }],
  },
  {
    id: 'inflight', title: 'Peticiones en vuelo', unit: '',
    sub: 'Concurrencia real dentro de la API en cada lectura.',
    series: [{ key: 'inFlight', label: 'En vuelo', color: 'var(--series-1)' }],
  },
  {
    id: 'dbtx', title: 'PostgreSQL: transacciones', unit: 'tx/s', needsDb: true,
    sub: 'Confirmadas y revertidas por segundo. Una reserva que pierde la carrera por una franja se revierte.',
    series: [
      { key: 'commits', label: 'Confirmadas', color: 'var(--series-1)', get: (s) => s.db?.commitsPerSec },
      { key: 'rollbacks', label: 'Revertidas', color: 'var(--series-2)', get: (s) => s.db?.rollbacksPerSec },
    ],
  },
  {
    id: 'dbconn', title: 'PostgreSQL: conexiones', unit: '', needsDb: true,
    sub: 'Conexiones del pool de Prisma ejecutando una consulta, ociosas o esperando un bloqueo.',
    series: [
      { key: 'active', label: 'Activas', color: 'var(--series-1)', get: (s) => s.db?.active },
      { key: 'idle', label: 'Ociosas', color: 'var(--series-2)', get: (s) => s.db?.idle },
      { key: 'waitingLock', label: 'Esperando bloqueo', color: 'var(--series-3)', get: (s) => s.db?.waitingLock },
    ],
  },
  {
    id: 'osthreads', title: 'Hilos del sistema operativo', unit: '',
    sub: 'Hilos reales del proceso de la API según /proc. Fijo con un pool precalentado.',
    series: [{ key: 'osThreads', label: 'Hilos', color: 'var(--series-1)' }],
  },
];

const valueOf = (serie, sample) => (serie.get ? serie.get(sample) : sample[serie.key]);

const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
};

const el = (tag, attrs = {}, parent) => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
};

const activeCharts = () => CHARTS.filter((c) => !c.needsDb || state.info?.database);

const buildCharts = () => {
  const root = $('charts');
  root.replaceChildren();
  for (const c of activeCharts()) {
    const card = document.createElement('div');
    card.className = 'card chart';
    card.innerHTML = `<h2>${c.title}</h2><p class="sub">${c.sub}</p>`;
    if (c.series.length > 1) {
      const legend = document.createElement('div');
      legend.className = 'legend';
      legend.innerHTML = c.series.map((s) => `<span style="--swatch:${s.color}">${s.label}</span>`).join('');
      card.appendChild(legend);
    }
    const svg = el('svg', { role: 'img', 'aria-label': c.title });
    card.appendChild(svg);
    const tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.hidden = true;
    card.appendChild(tip);
    root.appendChild(card);
    c.svg = svg;
    c.tip = tip;
    svg.addEventListener('pointermove', (e) => hover(c, e));
    svg.addEventListener('pointerleave', () => { c.hoverX = null; tip.hidden = true; drawChart(c); });
  }
};

const M = { top: 10, right: 92, bottom: 22, left: 40 };

const geometry = (c) => {
  const w = c.svg.clientWidth || 400;
  const h = c.svg.clientHeight || 190;
  const data = visible();
  const now = data.length ? data[data.length - 1].t : Date.now();
  const t0 = now - state.windowSec * 1000;
  const peak = Math.max(0, ...data.flatMap((s) => c.series.map((se) => valueOf(se, s) ?? 0)));
  const yMax = c.max ?? niceMax(peak * 1.1);
  const x = (t) => M.left + ((t - t0) / (now - t0)) * (w - M.left - M.right);
  const y = (v) => h - M.bottom - (Math.min(v, yMax) / yMax) * (h - M.top - M.bottom);
  return { w, h, data, now, t0, yMax, x, y };
};

const drawChart = (c) => {
  const svg = c.svg;
  svg.replaceChildren();
  const { w, h, data, now, yMax, x, y } = geometry(c);

  for (let i = 0; i <= 4; i += 1) {
    const v = (yMax / 4) * i;
    el('line', { x1: M.left, x2: w - M.right, y1: y(v), y2: y(v), class: i === 0 ? 'baseline' : 'gridline' }, svg);
    el('text', { x: M.left - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' }, svg).textContent =
      fmt(v, v < 10 && v % 1 ? 1 : 0) + (c.unit === '%' ? '%' : '');
  }
  for (const secs of state.windowSec === 60 ? [60, 30, 0] : [300, 150, 0]) {
    const label = secs === 0 ? 'ahora' : `−${secs >= 120 ? `${secs / 60} min` : `${secs} s`}`;
    el('text', { x: x(now - secs * 1000), y: h - 4, 'text-anchor': secs === 0 ? 'end' : 'start', class: 'tick' }, svg).textContent = label;
  }
  if (data.length < 2) return;

  const ends = [];
  for (const s of c.series) {
    const d = data.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(valueOf(s, p) ?? 0).toFixed(1)}`).join('');
    el('path', { d, class: 'line', stroke: s.color }, svg);
    const last = data[data.length - 1];
    ends.push({ s, v: valueOf(s, last) ?? 0, y: y(valueOf(s, last) ?? 0) });
  }
  // Etiquetas directas al final de cada línea, separadas para que no se pisen.
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i += 1) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 14);
  for (const e of ends) {
    const t = el('text', { x: w - M.right + 8, y: e.y + 4, class: 'end-label' }, svg);
    t.textContent = `${c.series.length > 1 ? `${e.s.label} ` : ''}${fmt(e.v, 1)}${c.unit === '%' ? '%' : ''}`;
  }

  if (c.hoverX != null) {
    const idx = data.reduce((best, p, i) => (Math.abs(x(p.t) - c.hoverX) < Math.abs(x(data[best].t) - c.hoverX) ? i : best), 0);
    const p = data[idx];
    el('line', { x1: x(p.t), x2: x(p.t), y1: M.top, y2: h - M.bottom, class: 'cross' }, svg);
    for (const s of c.series) el('circle', { cx: x(p.t), cy: y(valueOf(s, p) ?? 0), r: 4, fill: s.color, class: 'dot' }, svg);
    c.tip.innerHTML = `<div class="t">${hora(p.t)}</div>` + c.series
      .map((s) => `<div class="r"><span style="--swatch:${s.color}">${s.label}</span><span>${fmt(valueOf(s, p), 1)} ${c.unit}</span></div>`)
      .join('');
    c.tip.hidden = false;
    const box = c.svg.getBoundingClientRect();
    const left = x(p.t) + c.svg.offsetLeft;
    c.tip.style.top = `${c.svg.offsetTop + 8}px`;
    c.tip.style.left = left > box.width / 2 ? `${left - c.tip.offsetWidth - 12}px` : `${left + 12}px`;
  }
};

const hover = (c, e) => {
  const box = c.svg.getBoundingClientRect();
  c.hoverX = e.clientX - box.left;
  drawChart(c);
};

const visible = () => {
  const h = state.history;
  if (!h.length) return h;
  const from = h[h.length - 1].t - state.windowSec * 1000;
  return h.filter((s) => s.t >= from);
};

// ---------------------------------------------------------------------------
// Núcleos, hilos, valores y tabla
// ---------------------------------------------------------------------------

const drawCores = (sample) => {
  const info = state.info;
  if (!info || !sample) return;
  const root = $('cores');
  if (root.dataset.built !== String(info.logicalCpus)) {
    root.replaceChildren();
    info.physicalCores.forEach((lps, i) => {
      const core = document.createElement('div');
      core.className = 'core';
      core.dataset.ht = String(lps.length > 1);
      core.innerHTML = `<div class="lps">${lps
        .map((cpu) => `<div class="lp" id="lp${cpu}" title="CPU lógica ${cpu}"><div class="fill"></div><span class="id">cpu${cpu}</span><span class="pct"></span></div>`)
        .join('')}</div><div class="name">núcleo ${i}${lps.length > 1 ? ' · HT' : ''}</div>`;
      root.appendChild(core);
    });
    root.dataset.built = String(info.logicalCpus);
  }
  sample.cores.forEach((pct, cpu) => {
    const lp = $(`lp${cpu}`);
    if (!lp) return;
    lp.querySelector('.fill').style.height = `${pct}%`;
    lp.querySelector('.pct').textContent = `${Math.round(pct)}%`;
    lp.title = `CPU lógica ${cpu}: ${fmt(pct, 1)} % de uso`;
  });
};

const drawThreads = (sample) => {
  const root = $('threads');
  const info = state.info;
  if (info && !info.pool.enabled) {
    root.innerHTML = '<div class="empty">Sin pool de worker threads: bcrypt corre en los ' +
      `${info.uvThreadpoolSize} hilos de libuv, que el proceso no expone uno por uno.</div>`;
    return;
  }
  if (!sample || sample.pool.threads.length === 0) return;
  root.replaceChildren(...sample.pool.threads.map((t) => {
    const col = document.createElement('div');
    col.className = 'thread';
    col.title = `Worker thread ${t.threadId}: ${fmt(t.pct, 1)} % ocupado`;
    col.innerHTML = `<div class="bar" style="height:${Math.max(0.5, t.pct)}%"></div><div class="tid">#${t.threadId}</div>`;
    return col;
  }));
};

const drawTiles = (s) => {
  if (!s) return;
  $('vAdmitted').textContent = fmt(s.admittedPerSec, 1);
  $('vLimited').textContent = fmt(s.rateLimitedPerSec, 1);
  $('vInFlight').textContent = fmt(s.inFlight);
  $('vCores').textContent = fmt(s.processCores, 2);
  $('vCpuPct').textContent = `${fmt(s.processCpuPct, 1)} % de la máquina · RAM ${fmt(s.rssMb)} MB`;
  $('vLoop').textContent = fmt(s.eventLoopPct, 0);
  $('vLag').textContent = `demora p99 ${fmt(s.loopDelayP99Ms, 1)} ms · máx ${fmt(s.loopDelayMaxMs, 0)} ms`;
  $('vQueue').textContent = fmt(s.pool.queue);
  $('vDone').textContent = `${fmt(s.pool.completedPerSec, 1)} hashes/s completados`;

  $('vOsThreads').textContent = fmt(s.osThreads ?? NaN);
  const ct = s.container;
  $('vCtMem').textContent = ct ? fmt(ct.memoryMb) : '–';
  $('vCtHint').textContent = ct
    ? `${fmt(ct.cpuCores, 2)} núcleos · ${ct.tasks ?? '–'} tareas · límite ${ct.memoryLimitMb === null ? 'ninguno' : `${fmt(ct.memoryLimitMb)} MB`}`
    : 'sin cgroup v2 (fuera de un contenedor Linux)';
  const db = s.db;
  $('vTps').textContent = db ? fmt(db.commitsPerSec + db.rollbacksPerSec, 1) : '–';
  $('vDbHint').textContent = db
    ? `${fmt(db.rollbacksPerSec, 1)} revertidas/s · caché ${db.cacheHitPct === null ? '–' : `${fmt(db.cacheHitPct, 1)} %`} · ${fmt(db.sizeMb)} MB`
    : 'sin PostgreSQL (repositorios en memoria)';
  $('vConn').textContent = db ? fmt(db.active) : '–';
  $('vConnHint').textContent = db
    ? `${db.idle} ociosas · ${db.waitingLock} esperando bloqueo · máx ${db.maxConnections}`
    : '–';
};

const drawTable = () => {
  if (!state.table) return;
  $('tbody').innerHTML = state.history.slice(-30).reverse().map((s) => `<tr>
    <td>${hora(s.t)}</td><td>${fmt(s.admittedPerSec, 1)}</td><td>${fmt(s.rateLimitedPerSec, 1)}</td>
    <td>${fmt(s.serverErrorsPerSec, 1)}</td><td>${s.inFlight}</td><td>${fmt(s.hostCpuPct, 1)}</td>
    <td>${fmt(s.processCpuPct, 1)}</td><td>${fmt(s.eventLoopPct, 1)}</td><td>${fmt(s.loopDelayP99Ms, 1)}</td>
    <td>${fmt(s.pool.avgPct, 1)}</td><td>${s.pool.queue}</td><td>${s.osThreads ?? '–'}</td>
    <td>${fmt(s.db?.commitsPerSec, 1)}</td><td>${fmt(s.db?.rollbacksPerSec, 1)}</td><td>${s.db?.active ?? '–'}</td></tr>`).join('');
};

const drawInfo = () => {
  const i = state.info;
  if (!i) return;
  const physical = i.physicalCores.length;
  $('info').innerHTML =
    `<b>${i.cpuModel}</b> · ${physical} núcleos físicos, <b>${i.logicalCpus} lógicos</b> ` +
    `(${i.hyperthreadedCores} con hyperthreading) · ` +
    (i.pool.enabled
      ? `pool: <b>${i.pool.maxThreads} worker threads</b> para ${i.pool.purpose}`
      : 'pool de worker threads deshabilitado') +
    ` · libuv: ${i.uvThreadpoolSize} hilos · Node ${i.nodeVersion}` +
    (i.inContainer ? ' · en contenedor' : '') +
    (i.database ? ' · PostgreSQL' : ' · sin base de datos');
  $('poolTitle').textContent = i.pool.enabled ? `Worker threads del pool (${i.pool.maxThreads})` : 'Worker threads del pool';
  if (i.pool.enabled) $('poolSub').textContent = `${i.pool.purpose}: % del último segundo que cada hilo estuvo trabajando.`;
};

// Tamaño del pool en caliente: de 1 hilo a todos los núcleos lógicos.
const drawPoolControl = () => {
  const i = state.info;
  if (!i) return;
  const actual = i.pool.enabled ? i.pool.maxThreads : 0;
  const opciones = [...new Set([0, 1, 2, 4, Math.max(1, Math.floor(i.logicalCpus / 2)), i.logicalCpus])].sort((a, b) => a - b);
  $('poolCtl').replaceChildren(...opciones.map((n) => {
    const b = document.createElement('button');
    b.textContent = n === 0 ? 'libuv' : n === i.logicalCpus ? `${n} (todos)` : String(n);
    b.title = n === 0 ? 'Sin pool: bcrypt en los 4 hilos de libuv' : `${n} worker thread${n > 1 ? 's' : ''}`;
    b.setAttribute('aria-pressed', String(n === actual));
    b.onclick = () => cambiarHilos(n);
    return b;
  }));
};

const cambiarHilos = async (n) => {
  $('poolMsg').textContent = 'cambiando…';
  try {
    const res = await fetch('/monitor/hilos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hilos: n }),
    });
    const body = await res.json();
    $('poolMsg').textContent = res.ok ? '' : body.error;
  } catch (err) {
    $('poolMsg').textContent = String(err);
  }
};

const redraw = () => {
  const last = state.history[state.history.length - 1];
  drawTiles(last);
  drawCores(last);
  drawThreads(last);
  activeCharts().forEach(drawChart);
  drawTable();
};

// ---------------------------------------------------------------------------
// Conexión y controles
// ---------------------------------------------------------------------------

const setStatus = (st) => {
  const node = $('status');
  node.dataset.ok = String(st.connected);
  node.textContent = st.connected ? `en vivo, una muestra por segundo` : `sin conexión con ${st.target}: ${st.error ?? ''}`;
};

const connect = () => {
  const es = new EventSource('/monitor/events');
  es.onopen = () => setStatus({ connected: true, target: 'la API' });
  es.addEventListener('info', (e) => {
    state.info = JSON.parse(e.data);
    $('cores').dataset.built = '';
    drawInfo();
    drawPoolControl();
    buildCharts();
    redraw();
  });
  es.addEventListener('history', (e) => { state.history = JSON.parse(e.data); redraw(); });
  es.addEventListener('sample', (e) => {
    state.history.push(JSON.parse(e.data));
    if (state.history.length > 300) state.history.shift();
    redraw();
  });
  es.onerror = () => setStatus({ connected: false, target: 'la API', error: 'reconectando…' });
};

const setWindow = (sec) => {
  state.windowSec = sec;
  $('win60').setAttribute('aria-pressed', String(sec === 60));
  $('win300').setAttribute('aria-pressed', String(sec === 300));
  activeCharts().forEach(drawChart);
};

$('win60').onclick = () => setWindow(60);
$('win300').onclick = () => setWindow(300);
$('toggleTable').onclick = () => {
  state.table = !state.table;
  $('toggleTable').setAttribute('aria-pressed', String(state.table));
  $('tableWrap').hidden = !state.table;
  drawTable();
};
window.addEventListener('resize', () => activeCharts().forEach(drawChart));

buildCharts();
connect();
