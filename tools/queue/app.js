/* ==========================================================================
   Queueing calculator — the interface.

   The maths is in queue.js. This file reads the boxes, renders, and draws the
   curve.

   The curve is plotted on a linear y axis capped at 20× rather than a log one.
   A log axis would make the hyperbola into a gentle slope, which is accurate
   and useless — the entire point being made is that the rise is not gentle,
   and a linear axis is what shows a flat stretch turning vertical.
   ========================================================================== */

'use strict';

const STORE_KEY = 'queue:v1';
const CAP = 20;                    // multiples of service time shown on the chart

const el = {};
for (const id of ['in-rate', 'in-rate-unit', 'in-service', 'in-service-unit', 'in-servers',
                  'in-target', 'in-target-unit', 'error', 'answer', 'util', 'util-sub',
                  'notes', 'stats', 'chart', 'target-answer']) {
  el[id] = document.getElementById(id);
}

const FIELDS = ['in-rate', 'in-rate-unit', 'in-service', 'in-service-unit',
                'in-servers', 'in-target', 'in-target-unit'];

/* ---------- Persistence ------------------------------------------------ */

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(FIELDS.map((f) => el[f].value))); }
  catch (e) { /* private mode */ }
}

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (Array.isArray(v) && v.length === FIELDS.length) {
      FIELDS.forEach((f, i) => { el[f].value = v[i]; });
    }
  } catch (e) { /* ignore */ }
}

/* ---------- Formatting -------------------------------------------------- */

/* Durations span microseconds to days here, so pick the unit rather than
   picking a format and living with 0.003 hours. */
function duration(seconds) {
  if (!Number.isFinite(seconds)) return '∞';
  if (seconds === 0) return 'none';
  if (seconds < 0.001) return `${(seconds * 1e6).toFixed(0)} µs`;
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)} ms`;
  if (seconds < 90) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`;
  if (seconds < 5400) return `${(seconds / 60).toFixed(1)} min`;
  if (seconds < 172800) return `${(seconds / 3600).toFixed(1)} hours`;
  return `${(seconds / 86400).toFixed(1)} days`;
}

const count = (n) => (!Number.isFinite(n) ? '∞'
  : n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString('en-GB'));

/* ---------- Reading the boxes -------------------------------------------- */

function read() {
  const num = (id, what, { min = 0, integer = false } = {}) => {
    const raw = el[id].value.replace(/[,\s_]/g, '');
    const n = Number(raw);
    const bad = !Number.isFinite(n) || n < min || (integer && !Number.isInteger(n));
    el[id].classList.toggle('input--bad', bad);
    return bad ? { error: `${what} needs to be a ${integer ? 'whole ' : ''}number${min > 0 ? ` above ${min - 1}` : ' of zero or more'}.` } : { n };
  };

  const rate = num('in-rate', 'The arrival rate');
  const service = num('in-service', 'The time each takes', { min: 0 });
  const servers = num('in-servers', 'The number of workers', { min: 1, integer: true });
  const target = num('in-target', 'The target wait', { min: 0 });

  const bad = [rate, service, servers, target].find((r) => r.error);
  if (bad) return { error: bad.error };

  if (!(service.n > 0)) return { error: 'The time each takes needs to be above zero.' };

  return {
    arrivalRate: rate.n / Number(el['in-rate-unit'].value),
    serviceTime: service.n * Number(el['in-service-unit'].value),
    servers: servers.n,
    targetWait: target.n * Number(el['in-target-unit'].value),
  };
}

/* ---------- Rendering ---------------------------------------------------- */

function render() {
  const input = read();
  if (input.error) {
    el.error.textContent = input.error;
    el.error.hidden = false;
    return;
  }
  el.error.hidden = true;
  save();

  const r = Queue.analyse(input);

  /* Headline. */
  if (!r.stable) {
    el.util.textContent = '> 100%';
    el.answer.className = 'answer answer--bad';
    el['util-sub'].textContent = 'More work arrives than can be finished. The queue grows without limit.';
  } else {
    el.util.textContent = `${(r.utilisation * 100).toFixed(r.utilisation < 0.1 ? 1 : 0)}%`;
    el.answer.className = 'answer' +
      (r.utilisation >= 0.9 ? ' answer--bad' : r.utilisation >= 0.8 ? ' answer--warn' : '');
    // "1.00 worker' worth" — the possessive apostrophe needs the singular and
    // plural forms spelled out, not an "s" bolted on before it.
    el['util-sub'].textContent =
      `${r.servers} worker${r.servers === 1 ? '' : 's'} handling ` +
      `${r.offered.toFixed(2)} workers' worth of work.`;
  }

  renderNotes(r);
  renderStats(r);
  renderChart(input, r);
  renderTarget(input, r);
}

function renderNotes(r) {
  const titles = { alarm: 'Careful', warn: 'Worth knowing', note: 'Note' };
  el.notes.replaceChildren();
  for (const n of Queue.notes(r)) {
    const box = document.createElement('div');
    box.className = 'note note--' + n.kind;
    const k = document.createElement('span');
    k.className = 'note__k';
    k.textContent = titles[n.kind];
    box.append(k, document.createTextNode(n.text));
    el.notes.append(box);
  }
}

function renderStats(r) {
  const cells = [
    [duration(r.waitTime), 'waiting before it starts'],
    [duration(r.systemTime), 'from arriving to done'],
    [r.stable ? `${(r.waitRatio < 10 ? r.waitRatio.toFixed(1) : Math.round(r.waitRatio))}×` : '∞',
      'waiting, vs the work itself'],
    [count(r.queueLength), 'typically queued'],
    [r.stable ? `${Math.round(r.probWait * 100)}%` : '100%', 'arrive to find a queue'],
    [String(r.minServers), 'workers, bare minimum'],
  ];
  el.stats.replaceChildren();
  for (const [v, k] of cells) {
    const box = document.createElement('div');
    box.className = 'stat';
    const val = document.createElement('div');
    val.className = 'stat__v';
    val.textContent = v;
    const key = document.createElement('div');
    key.className = 'stat__k';
    key.textContent = k;
    box.append(val, key);
    el.stats.append(box);
  }
}

/* ---------- The curve ----------------------------------------------------- */

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (name, attrs) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

function renderChart(input, r) {
  const W = 640, H = 260, PAD_L = 34, PAD_R = 14, PAD_T = 12, PAD_B = 26;
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;

  const x = (u) => PAD_L + u * plotW;
  const y = (ratio) => PAD_T + plotH - (Math.min(ratio, CAP) / CAP) * plotH;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': 'Waiting time against utilisation — flat until roughly 70%, then rising steeply' });

  for (const ratio of [5, 10, 15, 20]) {
    svg.append(svgEl('line', { class: 'grid-line', x1: PAD_L, x2: W - PAD_R, y1: y(ratio), y2: y(ratio) }));
    const t = svgEl('text', { class: 'axis-text', x: PAD_L - 6, y: y(ratio) + 3, 'text-anchor': 'end' });
    t.textContent = `${ratio}×`;
    svg.append(t);
  }
  svg.append(svgEl('line', { class: 'axis-line', x1: PAD_L, x2: W - PAD_R, y1: y(0), y2: y(0) }));

  for (const u of [0, 0.25, 0.5, 0.75, 1]) {
    const t = svgEl('text', { class: 'axis-text', x: x(u), y: H - 8, 'text-anchor': u === 0 ? 'start' : u === 1 ? 'end' : 'middle' });
    t.textContent = `${Math.round(u * 100)}%`;
    svg.append(t);
  }

  const pts = Queue.curve({ serviceTime: input.serviceTime, servers: input.servers, points: 120 });
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.utilisation).toFixed(2)},${y(p.waitRatio).toFixed(2)}`).join(' ');
  svg.append(svgEl('path', { class: 'curve-path', d }));

  /* Where you are. Only drawn when it is on the chart at all. */
  if (r.stable && r.utilisation <= 1) {
    const px = x(r.utilisation), py = y(r.waitRatio);
    svg.append(svgEl('line', { class: 'here-line', x1: px, x2: px, y1: py, y2: y(0) }));
    svg.append(svgEl('circle', { class: 'here-dot', cx: px, cy: py, r: 5 }));
    const label = svgEl('text', {
      class: 'here-text', x: Math.min(px + 10, W - PAD_R - 60), y: Math.max(py - 10, PAD_T + 10),
    });
    label.textContent = `${Math.round(r.utilisation * 100)}% · ${r.waitRatio < 10 ? r.waitRatio.toFixed(1) : Math.round(r.waitRatio)}×`;
    svg.append(label);
  }

  el.chart.replaceChildren(svg);
}

/* ---------- Sizing -------------------------------------------------------- */

function renderTarget(input, r) {
  const needed = Queue.serversForWait({
    arrivalRate: input.arrivalRate,
    serviceTime: input.serviceTime,
    targetWait: input.targetWait,
  });

  if (needed === null) {
    el['target-answer'].innerHTML =
      'No number of workers gets the wait that low — with a target of zero, ' +
      'something always has to wait occasionally.';
    return;
  }

  const at = Queue.analyse({ ...input, servers: needed });
  const diff = needed - input.servers;
  const change = diff > 0 ? `<strong>${diff} more than you have</strong>`
    : diff < 0 ? `${-diff} fewer than you have`
    : 'exactly what you have';

  el['target-answer'].innerHTML =
    `To keep waiting under ${duration(input.targetWait)} you need ` +
    `<strong>${needed} worker${needed === 1 ? '' : 's'}</strong> — ${change}. ` +
    `That runs at ${Math.round(at.utilisation * 100)}% utilisation, waiting ${duration(at.waitTime)}.`;
}

/* ---------- Wiring -------------------------------------------------------- */

for (const f of FIELDS) el[f].addEventListener('input', render);
for (const f of FIELDS) el[f].addEventListener('change', render);

load();
render();
