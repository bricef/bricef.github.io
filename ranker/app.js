/* ==========================================================================
   Ranker — rank any list by comparing two things at a time.

   MODEL
   The answer history is the only durable state; everything else is derived
   from it by replay. That makes undo, resume-after-refresh and "un-tie these
   two" all the same cheap operation: change the history, rebuild.

   Ties merge items into an equivalence class (union-find). Strict preferences
   become edges between classes, and we keep the full transitive closure of
   that graph. Two consequences fall out:

     · We never ask a question whose answer is already implied. If A > B and
       B > C, "A or C?" is never shown.
     · The graph cannot develop a preference cycle. A tie is only ever offered
       between two classes with no path either way, and merging two classes
       with no path between them cannot close a loop.

   The price of never re-asking is that a misclick is permanent, which is why
   undo goes all the way back to the first answer.
   ========================================================================== */

'use strict';

const STORE_KEY = 'ranker:v1';

/* How many questions this list will take, predicted once from its size.

   A live estimate reads better on paper and behaves worse in practice. The
   obvious one — sum each item's remaining position range — overcounts early,
   because those ranges are highly correlated: it fell more slowly than the
   answer count rose, so the predicted total climbed through the first half of
   every run. Measured at up to +48% on a 50-item list before falling back. A
   finish line that moves away from you is worse than one that is slightly
   wrong, so this is fixed at the start and only ever revised if a run actually
   overruns it. Measured against random inputs it runs about 15% high on a
   10-item list and 2% low on a 50-item one, so most runs finish a little early
   and the rest creep past the target one question at a time. */
const estimateDiscount = (n) => 1 - 0.85 / Math.log2(Math.max(8, n));
const predictTotal = (n) => (n < 2 ? 0 : Math.ceil(n * Math.log2(n) * estimateDiscount(n)));

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SETTLE_MS = REDUCED_MOTION ? 0 : 180;

/* ---------- Durable state -------------------------------------------- */

let state = {
  title: '',
  items: [],
  /* {a, b, r} where a and b are item indices and r is 'a' | 'b' | 'tie' */
  history: [],
};

/* ---------- Transient state ------------------------------------------ */

let model = null;        // derived; see rebuild()
let pair = null;         // {a, b} item indices currently on screen
let forcedPair = null;   // [a, b] item indices to ask next, from "settle it"
let refineTop = 0;       // >0 restricts questions to the top N positions
let resultOrder = null;  // array of classes (each an array of item indices)
let addMode = false;     // setup screen is adding to an existing run
let busy = false;        // mid-answer animation
let predictedTotal = 0;  // questions this list is expected to need
let undoCount = 0;
let startedAt = 0;

/* ==========================================================================
   Bitsets — one bit per class. Small enough to be exact, fast enough that
   pair selection stays O(pairs) instead of O(pairs x closure).
   ========================================================================== */

const bsNew = (m) => new Uint32Array((m + 31) >> 5);
const bsSet = (s, i) => { s[i >> 5] |= (1 << (i & 31)); };
const bsGet = (s, i) => (s[i >> 5] >>> (i & 31)) & 1;

function popcount(x) {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return (Math.imul(x, 0x01010101) >>> 24);
}

function bsCount(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) n += popcount(s[i]);
  return n;
}

/* ==========================================================================
   Derive everything from the history
   ========================================================================== */

function rebuild() {
  const n = state.items.length;

  // 1. Union-find over ties.
  const parent = new Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (x, y) => { const rx = find(x), ry = find(y); if (rx !== ry) parent[rx] = ry; };

  for (const h of state.history) if (h.r === 'tie') union(h.a, h.b);

  // 2. Compact class indices, preserving first-appearance order.
  const classOf = new Array(n);
  const classes = [];          // classes[c] = [item indices]
  const rootToClass = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let c = rootToClass.get(r);
    if (c === undefined) { c = classes.length; rootToClass.set(r, c); classes.push([]); }
    classOf[i] = c;
    classes[c].push(i);
  }
  const m = classes.length;

  // 3. Strict-preference edges between classes.
  const adj = Array.from({ length: m }, () => new Set());
  const radj = Array.from({ length: m }, () => new Set());
  let directCount = 0;
  for (const h of state.history) {
    if (h.r === 'tie') continue;
    const hi = classOf[h.r === 'a' ? h.a : h.b];
    const lo = classOf[h.r === 'a' ? h.b : h.a];
    if (hi === lo) continue;               // absorbed by a later tie
    if (!adj[hi].has(lo)) directCount++;
    adj[hi].add(lo);
    radj[lo].add(hi);
  }

  // 4. Transitive closure, both directions. down[c] and up[c] include c.
  const reach = (graph) => {
    const out = [];
    for (let s = 0; s < m; s++) {
      const bs = bsNew(m);
      bsSet(bs, s);
      const stack = [s];
      while (stack.length) {
        const u = stack.pop();
        for (const v of graph[u]) if (!bsGet(bs, v)) { bsSet(bs, v); stack.push(v); }
      }
      out.push(bs);
    }
    return out;
  };
  const down = reach(adj);
  const up = reach(radj);

  const downN = down.map(bsCount);
  const upN = up.map(bsCount);

  // 5. Position bounds. An item cannot rank above everything known to beat
  //    it, nor below everything it beats — when those meet, it is settled.
  const minPos = [], maxPos = [];
  for (let c = 0; c < m; c++) {
    minPos.push(upN[c] - 1 + 1);
    maxPos.push(m - (downN[c] - 1));
  }

  model = { n, m, classes, classOf, down, up, downN, upN, minPos, maxPos, directCount };
}

const related = (x, y) => x === y || !!bsGet(model.down[x], y) || !!bsGet(model.down[y], x);
const isUnplaced = (c) => model.upN[c] === 1 && model.downN[c] === 1 && model.m > 1;

function unknownPairs(limitTop) {
  const out = [];
  const { m, minPos } = model;
  for (let x = 0; x < m; x++) {
    if (limitTop && minPos[x] > limitTop) continue;
    for (let y = x + 1; y < m; y++) {
      if (limitTop && minPos[y] > limitTop) continue;
      if (!related(x, y)) out.push([x, y]);
    }
  }
  return out;
}

/* Pick the pair that guarantees the most progress whichever way it is
   answered. Answering x > y implies every (ancestor of x, descendant of y)
   pair at once, so |up[x]| * |down[y]| counts what that answer settles. We
   score a pair by its worse outcome and maximise that — a minimax choice,
   so a question is never a gamble that might tell us almost nothing. */
function nextPair() {
  if (forcedPair) {
    const [a, b] = forcedPair;
    forcedPair = null;
    const ca = model.classOf[a], cb = model.classOf[b];
    if (ca !== cb && !related(ca, cb)) return { a, b };
  }

  const cands = unknownPairs(refineTop);
  if (!cands.length) return null;

  let best = -1;
  let bestPairs = [];
  for (const [x, y] of cands) {
    const score = Math.min(model.upN[x] * model.downN[y], model.upN[y] * model.downN[x]);
    if (score > best) { best = score; bestPairs = [[x, y]]; }
    else if (score === best) bestPairs.push([x, y]);
  }

  const [cx, cy] = bestPairs[Math.floor(Math.random() * bestPairs.length)];
  // Randomise which side of the screen each lands on, so position carries no
  // signal about what the app already believes.
  const [lo, hi] = Math.random() < 0.5 ? [cx, cy] : [cy, cx];
  return { a: model.classes[lo][0], b: model.classes[hi][0] };
}

function progress() {
  const done = state.history.length;
  const open = unknownPairs(refineTop).length;
  if (open === 0) return { done, total: done, pct: 100 };
  // Refining a slice is a short burst, so count what is actually left.
  const total = refineTop ? done + open : Math.max(predictedTotal, done + 1);
  return { done, total, pct: Math.min(99, Math.round((done / total) * 100)) };
}

/* Display order: most-constrained first, with never-compared items pushed to
   the end rather than given a fake position. */
function orderedClasses() {
  const placed = [], unplaced = [];
  for (let c = 0; c < model.m; c++) (isUnplaced(c) ? unplaced : placed).push(c);
  placed.sort((p, q) =>
    model.minPos[p] - model.minPos[q] ||
    model.maxPos[p] - model.maxPos[q] ||
    model.classes[p][0] - model.classes[q][0]);
  unplaced.sort((p, q) => model.classes[p][0] - model.classes[q][0]);
  return { placed, unplaced };
}

function confidenceOf(c) {
  if (isUnplaced(c)) return 'unplaced';
  const width = model.maxPos[c] - model.minPos[c] + 1;
  if (width === 1) return 'settled';
  if (width <= Math.max(2, Math.round(model.m * 0.2))) return 'close';
  return 'loose';
}

const CONFIDENCE_LABEL = {
  settled: 'settled',
  close: '',
  loose: 'still moving',
  unplaced: 'not yet placed',
};

/* ==========================================================================
   Persistence
   ========================================================================== */

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      title: state.title, items: state.items, history: state.history,
    }));
  } catch (e) { /* private browsing, quota — the app still works in-session */ }
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.items) || d.items.length < 2) return null;
    if (!Array.isArray(d.history)) return null;
    return d;
  } catch (e) { return null; }
}

/* ==========================================================================
   DOM
   ========================================================================== */

const $ = (id) => document.getElementById(id);
const el = {};
for (const id of [
  'screen-setup', 'screen-compare', 'screen-results',
  'in-title', 'in-items', 'setup-tally', 'btn-start', 'btn-resume',
  'cmp-title', 'cmp-count', 'cmp-rail', 'cmp-fill', 'btn-undo', 'btn-standings',
  'cards', 'card-a', 'card-b', 'card-a-text', 'card-b-text', 'btn-tie',
  'res-eyebrow', 'res-title', 'res-list', 'res-stats',
  'res-joints', 'joints-lead', 'joints-list',
  'btn-copy', 'btn-csv', 'btn-add', 'btn-refine', 'btn-restart',
  'standings', 'sheet-list', 'btn-close-standings', 'btn-keepgoing', 'btn-stophere',
  'toast',
]) el[id] = $(id);

let lastFocus = null;
let toastTimer = 0;

function show(screen) {
  for (const s of ['setup', 'compare', 'results']) el['screen-' + s].hidden = (s !== screen);
  window.scrollTo(0, 0);
}

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 1900);
}

/* ---------- Setup ----------------------------------------------------- */

function parseItems(text) {
  const seen = new Set();
  const out = [];
  let dupes = 0;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) { dupes++; continue; }
    seen.add(key);
    out.push(t);
  }
  return { items: out, dupes };
}

function updateTally() {
  const { items, dupes } = parseItems(el['in-items'].value);
  const n = items.length;
  el['btn-start'].disabled = n < 2;

  if (n < 2) {
    el['setup-tally'].textContent = 'Add at least two items to start.';
    return;
  }
  const est = predictTotal(n);
  const mins = Math.max(1, Math.round(est * 4 / 60));
  const bits = [`<strong>${n}</strong> items`];
  if (dupes) bits.push(`${dupes} duplicate${dupes > 1 ? 's' : ''} removed`);
  bits.push(`&asymp;<strong>${est}</strong> comparisons, about ${mins} min`);
  el['setup-tally'].innerHTML = bits.join(' &middot; ');
}

function startFromSetup() {
  const { items } = parseItems(el['in-items'].value);
  if (items.length < 2) return;

  const title = el['in-title'].value.trim();

  // Appending to an existing run keeps the history only if the items already
  // ranked are untouched — item indices must stay stable for replay to mean
  // the same thing.
  let keep = false;
  if (addMode && state.items.length && items.length >= state.items.length) {
    keep = state.items.every((v, i) => items[i] === v);
  }

  const carried = keep ? state.history : [];
  if (addMode && !keep && state.history.length) {
    toast('Existing items changed — starting fresh');
  }

  state = { title, items, history: carried };
  predictedTotal = predictTotal(items.length);
  addMode = false;
  refineTop = 0;
  resultOrder = null;
  undoCount = 0;
  startedAt = Date.now();
  save();
  rebuild();
  advance();
}

/* ---------- Compare --------------------------------------------------- */

function advance() {
  pair = nextPair();

  if (!pair) {
    if (refineTop) { refineTop = 0; pair = nextPair(); }
    if (!pair) return finish();
  }

  el['cmp-title'].textContent = state.title || 'Untitled list';
  el['card-a-text'].textContent = state.items[pair.a];
  el['card-b-text'].textContent = state.items[pair.b];

  const p = progress();
  el['cmp-count'].textContent = `${p.done} of ~${p.total}`;
  el['cmp-fill'].style.width = p.pct + '%';
  el['cmp-rail'].setAttribute('aria-valuenow', String(p.pct));

  el['btn-undo'].disabled = state.history.length === 0;

  el.cards.classList.remove('cards--settling');
  for (const c of [el['card-a'], el['card-b']]) c.classList.remove('card--win', 'card--lose', 'card--tie');

  show('compare');
}

function answer(result) {
  if (busy || !pair) return;

  const ca = model.classOf[pair.a], cb = model.classOf[pair.b];
  if (result === 'tie' && (ca === cb || related(ca, cb))) return;   // defensive

  busy = true;
  el.cards.classList.add('cards--settling');
  if (result === 'tie') {
    el['card-a'].classList.add('card--tie');
    el['card-b'].classList.add('card--tie');
  } else {
    const win = result === 'a' ? el['card-a'] : el['card-b'];
    const lose = result === 'a' ? el['card-b'] : el['card-a'];
    win.classList.add('card--win');
    lose.classList.add('card--lose');
  }

  state.history.push({ a: pair.a, b: pair.b, r: result });
  save();

  setTimeout(() => {
    busy = false;
    rebuild();
    advance();
  }, SETTLE_MS);
}

function undo() {
  if (busy || !state.history.length) return;
  state.history.pop();
  undoCount++;
  save();
  rebuild();
  advance();
}

/* ---------- Ranking rows (shared by standings and results) ------------ */

function nameOf(c) {
  return model.classes[c].map((i) => state.items[i]).join('  =  ');
}

function rowFor(c, rank, opts = {}) {
  const li = document.createElement('li');
  const conf = confidenceOf(c);
  li.className = 'row row--' + conf + (opts.moves ? ' row--movable' : '');

  const r = document.createElement('span');
  r.className = 'row__rank';
  r.textContent = conf === 'unplaced' && !opts.forceRank ? '—' : String(rank);

  const nm = document.createElement('span');
  nm.className = 'row__name';
  nm.textContent = nameOf(c);

  const tag = document.createElement('span');
  tag.className = 'row__tag';
  const parts = [];
  if (model.classes[c].length > 1) parts.push('tied');
  if (CONFIDENCE_LABEL[conf]) parts.push(CONFIDENCE_LABEL[conf]);
  tag.textContent = parts.join(' · ');

  li.append(r, nm, tag);

  if (opts.moves) {
    tag.remove();
    const moves = document.createElement('span');
    moves.className = 'row__moves';
    for (const [dir, glyph, label] of [[-1, '↑', 'Move up'], [1, '↓', 'Move down']]) {
      const b = document.createElement('button');
      b.className = 'movebtn';
      b.textContent = glyph;
      b.title = label;
      b.setAttribute('aria-label', `${label}: ${nameOf(c)}`);
      b.disabled = (dir < 0 && opts.index === 0) || (dir > 0 && opts.index === opts.count - 1);
      b.addEventListener('click', () => moveRow(opts.index, dir));
      moves.append(b);
    }
    li.append(tag, moves);
  }

  // The band covers every position this item could still occupy. It shrinks to
  // a tick once the position is locked.
  const rail = document.createElement('span');
  rail.className = 'row__rail';
  const band = document.createElement('span');
  band.className = 'row__band';
  const span = model.maxPos[c] - model.minPos[c] + 1;
  band.style.left = ((model.minPos[c] - 1) / model.m) * 100 + '%';
  band.style.width = (span / model.m) * 100 + '%';
  band.title = span === 1
    ? `Locked at ${model.minPos[c]}`
    : `Somewhere between ${model.minPos[c]} and ${model.maxPos[c]}`;
  rail.append(band);
  li.append(rail);
  return li;
}

/* ---------- Standings ------------------------------------------------- */

function openStandings() {
  const { placed, unplaced } = orderedClasses();
  el['sheet-list'].replaceChildren();
  let rank = 1;
  for (const c of placed) {
    el['sheet-list'].append(rowFor(c, rank));
    rank += model.classes[c].length;
  }
  unplaced.forEach((c) => el['sheet-list'].append(rowFor(c, 0)));

  lastFocus = document.activeElement;
  el.standings.hidden = false;
  el['btn-close-standings'].focus();
}

function closeStandings() {
  el.standings.hidden = true;
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

/* ---------- Results --------------------------------------------------- */

function finish() {
  const { placed, unplaced } = orderedClasses();
  resultOrder = [...placed, ...unplaced];
  renderResults();
  show('results');
}

function moveRow(index, dir) {
  const j = index + dir;
  if (j < 0 || j >= resultOrder.length) return;
  const t = resultOrder[index];
  resultOrder[index] = resultOrder[j];
  resultOrder[j] = t;
  renderResults();
}

function renderResults() {
  el['res-title'].textContent = state.title || 'Untitled list';

  const open = unknownPairs(0).length;
  el['res-eyebrow'].textContent = open === 0 ? 'Ranked' : 'Ranked so far';

  el['res-list'].replaceChildren();
  // Competition ranking, so a tie shares a number and the next one skips —
  // matching what Copy and the CSV produce.
  let rank = 1;
  resultOrder.forEach((c, i) => {
    el['res-list'].append(rowFor(c, rank, { moves: true, index: i, count: resultOrder.length, forceRank: true }));
    rank += model.classes[c].length;
  });

  const ties = state.history.filter((h) => h.r === 'tie').length;
  const mins = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 60000)) : 0;
  const bits = [`${state.history.length} comparisons`];
  if (ties) bits.push(`${ties} tie${ties > 1 ? 's' : ''}`);
  if (undoCount) bits.push(`${undoCount} undo${undoCount > 1 ? 's' : ''}`);
  if (mins) bits.push(`${mins} min`);
  el['res-stats'].textContent = bits.join(' · ');

  renderJoints();
  el['btn-refine'].hidden = resultOrder.length <= 5 || open === 0;
}

/* The weakest points in a finished ranking are the neighbours we never
   actually compared, and the pairs called a tie. Both are one question away
   from being resolved, so offer exactly that question. */
function renderJoints() {
  const joints = [];

  const short = (s) => (s.length > 28 ? s.slice(0, 27).trimEnd() + '…' : s);

  for (let i = 0; i < resultOrder.length - 1; i++) {
    const x = resultOrder[i], y = resultOrder[i + 1];
    if (!related(x, y)) {
      const a = model.classes[x][0], b = model.classes[y][0];
      joints.push({
        label: `${short(state.items[a])} and ${short(state.items[b])} were never compared`,
        a, b, untie: null,
      });
    }
  }

  for (const h of state.history) {
    if (h.r !== 'tie') continue;
    joints.push({
      label: `${short(state.items[h.a])} and ${short(state.items[h.b])} were too close to call`,
      a: h.a, b: h.b, untie: h,
    });
  }

  if (!joints.length) { el['res-joints'].hidden = true; return; }

  el['joints-lead'].textContent = joints.length === 1
    ? 'One place the order is still soft:'
    : `${joints.length} places the order is still soft:`;

  el['joints-list'].replaceChildren();
  for (const j of joints.slice(0, 6)) {
    const b = document.createElement('button');
    b.className = 'jointbtn';
    b.textContent = `${j.label} — settle it`;
    b.addEventListener('click', () => settle(j));
    el['joints-list'].append(b);
  }
  el['res-joints'].hidden = false;
}

function settle(j) {
  if (j.untie) {
    const idx = state.history.indexOf(j.untie);
    if (idx >= 0) state.history.splice(idx, 1);
    save();
    rebuild();
  }
  forcedPair = [j.a, j.b];
  refineTop = 0;
  advance();
}

/* ---------- Export ---------------------------------------------------- */

/* Tied items share a rank, and the next rank skips accordingly. */
function rankedLines() {
  const out = [];
  let rank = 1;
  for (const c of resultOrder) {
    for (const i of model.classes[c]) out.push({ rank, item: state.items[i] });
    rank += model.classes[c].length;
  }
  return out;
}

function copyList() {
  const text = rankedLines().map((r) => `${r.rank}. ${r.item}`).join('\n');
  const done = () => toast('Copied');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.append(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed'); }
  ta.remove();
}

function downloadCsv() {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [['rank', 'item'], ...rankedLines().map((r) => [r.rank, r.item])];
  const csv = rows.map((r) => r.map(q).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (state.title ? state.title.replace(/[^\w\-]+/g, '-').replace(/^-|-$/g, '') : 'ranking') + '.csv';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ==========================================================================
   Wiring
   ========================================================================== */

el['in-items'].addEventListener('input', updateTally);
el['btn-start'].addEventListener('click', startFromSetup);

el['in-title'].addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); el['in-items'].focus(); }
});

el['card-a'].addEventListener('click', () => answer('a'));
el['card-b'].addEventListener('click', () => answer('b'));
el['btn-tie'].addEventListener('click', () => answer('tie'));
el['btn-undo'].addEventListener('click', undo);
el['btn-standings'].addEventListener('click', openStandings);

el['btn-close-standings'].addEventListener('click', closeStandings);
el['btn-keepgoing'].addEventListener('click', closeStandings);
el['btn-stophere'].addEventListener('click', () => { closeStandings(); finish(); });

el['btn-copy'].addEventListener('click', copyList);
el['btn-csv'].addEventListener('click', downloadCsv);
el['btn-restart'].addEventListener('click', () => {
  state = { title: '', items: [], history: [] };
  save();
  el['in-title'].value = '';
  el['in-items'].value = '';
  addMode = false;
  updateTally();
  show('setup');
  el['in-title'].focus();
});

el['btn-add'].addEventListener('click', () => {
  addMode = true;
  el['in-title'].value = state.title;
  el['in-items'].value = state.items.join('\n') + '\n';
  updateTally();
  show('setup');
  el['in-items'].focus();
  el['in-items'].setSelectionRange(el['in-items'].value.length, el['in-items'].value.length);
  toast('Add new lines at the end — existing ranking is kept');
});

el['btn-refine'].addEventListener('click', () => {
  refineTop = 5;
  advance();
});

el['btn-resume'].addEventListener('click', () => {
  const d = loadSaved();
  if (!d) return;
  state = { title: d.title || '', items: d.items, history: d.history };
  predictedTotal = predictTotal(d.items.length);
  refineTop = 0;
  undoCount = 0;
  startedAt = Date.now();
  rebuild();
  advance();
});

document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);

  if (!el.standings.hidden) {
    if (e.key === 'Escape') { e.preventDefault(); closeStandings(); }
    return;
  }

  if (typing) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !el['btn-start'].disabled) {
      e.preventDefault();
      startFromSetup();
    }
    return;
  }

  if (el['screen-compare'].hidden) return;

  switch (e.key) {
    case 'ArrowLeft':  e.preventDefault(); answer('a'); break;
    case 'ArrowRight': e.preventDefault(); answer('b'); break;
    case ' ':          e.preventDefault(); answer('tie'); break;
    case 'u': case 'U': e.preventDefault(); undo(); break;
    case 's': case 'S': e.preventDefault(); openStandings(); break;
    case 'Escape':     e.preventDefault(); openStandings(); break;
  }
});

/* ---------- Boot ------------------------------------------------------ */

(function init() {
  const saved = loadSaved();
  if (saved) {
    el['btn-resume'].hidden = false;
    el['btn-resume'].textContent = saved.title
      ? `Resume “${saved.title}”`
      : `Resume last list (${saved.items.length} items)`;
  }
  updateTally();
  show('setup');
})();
