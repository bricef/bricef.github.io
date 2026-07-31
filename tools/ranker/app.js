/* ==========================================================================
   Ranker — rank any list by comparing two things at a time.

   This file is the interface only. The ordering itself — which question to
   ask, what is already implied, what is locked — lives in the shared engine
   at ../lib/compare.js, which the decision matrix uses too.
   ========================================================================== */

'use strict';

const STORE_KEY = 'ranker:v1';

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SETTLE_MS = REDUCED_MOTION ? 0 : 180;

/* ---------- State ------------------------------------------------------ */

let title = '';
let items = [];
let cmp = Compare.create([]);   // the comparison in progress

let pair = null;         // {a, b} item indices currently on screen
let resultOrder = null;  // array of class indices, in final display order
let refining = false;    // "Refine top 5" is active
let addMode = false;     // setup screen is adding to an existing run
let busy = false;        // mid-answer animation
let undoCount = 0;
let startedAt = 0;

/* ---------- Persistence ------------------------------------------------ */

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      title, items, history: cmp.history, startedAt,
    }));
  } catch (e) { /* private browsing, quota — the app still works in-session */ }
}

function loadSaved() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!d || !Array.isArray(d.items) || d.items.length < 2) return null;
    if (!Array.isArray(d.history)) return null;
    return d;
  } catch (e) { return null; }
}

/* ---------- DOM -------------------------------------------------------- */

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
]) el[id] = document.getElementById(id);

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

/* ---------- Setup ------------------------------------------------------ */

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
  return { list: out, dupes };
}

function updateTally() {
  const { list, dupes } = parseItems(el['in-items'].value);
  const n = list.length;
  el['btn-start'].disabled = n < 2;

  if (n < 2) {
    el['setup-tally'].textContent = 'Add at least two items to start.';
    return;
  }
  const est = Compare.predictTotal(n);
  const mins = Math.max(1, Math.round(est * 4 / 60));
  const bits = [`<strong>${n}</strong> items`];
  if (dupes) bits.push(`${dupes} duplicate${dupes > 1 ? 's' : ''} removed`);
  bits.push(`&asymp;<strong>${est}</strong> comparisons, about ${mins} min`);
  el['setup-tally'].innerHTML = bits.join(' &middot; ');
}

function startFromSetup() {
  const { list } = parseItems(el['in-items'].value);
  if (list.length < 2) return;

  // Appending to an existing run keeps the history only if the items already
  // ranked are untouched — indices must stay stable for replay to mean the
  // same thing.
  let carried = [];
  if (addMode && items.length && list.length >= items.length &&
      items.every((v, i) => list[i] === v)) {
    carried = cmp.history;
  } else if (addMode && cmp.history.length) {
    toast('Existing items changed — starting fresh');
  }

  title = el['in-title'].value.trim();
  items = list;
  cmp = Compare.create(items);
  cmp.loadHistory(carried);

  addMode = false;
  refining = false;
  resultOrder = null;
  undoCount = 0;
  startedAt = Date.now();
  save();
  advance();
}

/* ---------- Compare ---------------------------------------------------- */

function advance() {
  pair = cmp.next();

  if (!pair && refining) {         // the slice is done; open it back up
    refining = false;
    cmp.refineTop(0);
    pair = cmp.next();
  }
  if (!pair) return finish();

  el['cmp-title'].textContent = title || 'Untitled list';
  el['card-a-text'].textContent = items[pair.a];
  el['card-b-text'].textContent = items[pair.b];

  const p = cmp.progress();
  el['cmp-count'].textContent = `${p.done} of ~${p.total}`;
  el['cmp-fill'].style.width = p.pct + '%';
  el['cmp-rail'].setAttribute('aria-valuenow', String(p.pct));

  el['btn-undo'].disabled = cmp.history.length === 0;

  el.cards.classList.remove('cards--settling');
  for (const c of [el['card-a'], el['card-b']]) c.classList.remove('card--win', 'card--lose', 'card--tie');

  show('compare');
}

function answer(result) {
  if (busy || !pair) return;
  if (!cmp.record(pair.a, pair.b, result)) return;   // engine refused an illegal tie
  save();

  busy = true;
  el.cards.classList.add('cards--settling');
  if (result === 'tie') {
    el['card-a'].classList.add('card--tie');
    el['card-b'].classList.add('card--tie');
  } else {
    (result === 'a' ? el['card-a'] : el['card-b']).classList.add('card--win');
    (result === 'a' ? el['card-b'] : el['card-a']).classList.add('card--lose');
  }

  setTimeout(() => { busy = false; advance(); }, SETTLE_MS);
}

function undo() {
  if (busy || !cmp.history.length) return;
  cmp.undo();
  undoCount++;
  save();
  advance();
}

/* ---------- Ranking rows (shared by standings and results) ------------- */

const CONFIDENCE_LABEL = { settled: 'settled', close: '', loose: 'still moving', unplaced: 'not yet placed' };

const nameOf = (c) => cmp.label(c).join('  =  ');

function rowFor(c, rankNo, opts = {}) {
  const li = document.createElement('li');
  const r = cmp.rank(c);
  li.className = 'row row--' + r.confidence + (opts.moves ? ' row--movable' : '');

  const num = document.createElement('span');
  num.className = 'row__rank';
  num.textContent = r.confidence === 'unplaced' && !opts.forceRank ? '—' : String(rankNo);

  const nm = document.createElement('span');
  nm.className = 'row__name';
  nm.textContent = nameOf(c);

  const tag = document.createElement('span');
  tag.className = 'row__tag';
  const parts = [];
  if (cmp.classItems(c).length > 1) parts.push('tied');
  if (CONFIDENCE_LABEL[r.confidence]) parts.push(CONFIDENCE_LABEL[r.confidence]);
  tag.textContent = parts.join(' · ');

  li.append(num, nm, tag);

  if (opts.moves) {
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
    li.append(moves);
  }

  // The band covers every position this item could still occupy. It shrinks
  // to a tick once the position is locked.
  const rail = document.createElement('span');
  rail.className = 'row__rail';
  const band = document.createElement('span');
  band.className = 'row__band';
  band.style.left = ((r.min - 1) / cmp.size) * 100 + '%';
  band.style.width = (r.width / cmp.size) * 100 + '%';
  band.title = r.settled ? `Locked at ${r.min}` : `Somewhere between ${r.min} and ${r.max}`;
  rail.append(band);
  li.append(rail);
  return li;
}

/* ---------- Standings -------------------------------------------------- */

function openStandings() {
  const { placed, unplaced } = cmp.order();
  el['sheet-list'].replaceChildren();
  let rank = 1;
  for (const c of placed) {
    el['sheet-list'].append(rowFor(c, rank));
    rank += cmp.classItems(c).length;
  }
  for (const c of unplaced) el['sheet-list'].append(rowFor(c, 0));

  lastFocus = document.activeElement;
  el.standings.hidden = false;
  el['btn-close-standings'].focus();
}

function closeStandings() {
  el.standings.hidden = true;
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

/* ---------- Results ---------------------------------------------------- */

function finish() {
  refining = false;
  cmp.refineTop(0);
  const { placed, unplaced } = cmp.order();
  resultOrder = [...placed, ...unplaced];
  renderResults();
  show('results');
}

function moveRow(index, dir) {
  const j = index + dir;
  if (j < 0 || j >= resultOrder.length) return;
  [resultOrder[index], resultOrder[j]] = [resultOrder[j], resultOrder[index]];
  renderResults();
}

function renderResults() {
  el['res-title'].textContent = title || 'Untitled list';
  el['res-eyebrow'].textContent = cmp.done ? 'Ranked' : 'Ranked so far';

  el['res-list'].replaceChildren();
  // Competition ranking, so a tie shares a number and the next one skips —
  // matching what Copy and the CSV produce.
  let rank = 1;
  resultOrder.forEach((c, i) => {
    el['res-list'].append(rowFor(c, rank, { moves: true, index: i, count: resultOrder.length, forceRank: true }));
    rank += cmp.classItems(c).length;
  });

  const history = cmp.history;
  const ties = history.filter((h) => h.r === 'tie').length;
  const mins = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 60000)) : 0;
  const bits = [`${history.length} comparisons`];
  if (ties) bits.push(`${ties} tie${ties > 1 ? 's' : ''}`);
  if (undoCount) bits.push(`${undoCount} undo${undoCount > 1 ? 's' : ''}`);
  if (mins) bits.push(`${mins} min`);
  el['res-stats'].textContent = bits.join(' · ');

  renderJoints();
  el['btn-refine'].hidden = resultOrder.length <= 5 || cmp.done;
}

/* The weakest points in a finished ranking are the neighbours never actually
   compared, and the pairs called a tie. Both are one question from resolved,
   so offer exactly that question. */
function renderJoints() {
  const joints = [];
  const short = (s) => (s.length > 28 ? s.slice(0, 27).trimEnd() + '…' : s);

  for (let i = 0; i < resultOrder.length - 1; i++) {
    const x = resultOrder[i], y = resultOrder[i + 1];
    if (!cmp.related(x, y)) {
      const a = cmp.classItems(x)[0], b = cmp.classItems(y)[0];
      joints.push({ label: `${short(items[a])} and ${short(items[b])} were never compared`, a, b, untie: null });
    }
  }
  for (const h of cmp.history) {
    if (h.r !== 'tie') continue;
    joints.push({ label: `${short(items[h.a])} and ${short(items[h.b])} were too close to call`, a: h.a, b: h.b, untie: h });
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
  if (j.untie) { cmp.dropEntry(j.untie); save(); }
  cmp.force(j.a, j.b);
  refining = false;
  cmp.refineTop(0);
  advance();
}

/* ---------- Export ----------------------------------------------------- */

/* Tied items share a rank, and the next rank skips accordingly. */
function rankedLines() {
  const out = [];
  let rank = 1;
  for (const c of resultOrder) {
    for (const i of cmp.classItems(c)) out.push({ rank, item: items[i] });
    rank += cmp.classItems(c).length;
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
  a.download = (title ? title.replace(/[^\w\-]+/g, '-').replace(/^-|-$/g, '') : 'ranking') + '.csv';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Wiring ----------------------------------------------------- */

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
  title = '';
  items = [];
  cmp = Compare.create([]);
  save();
  el['in-title'].value = '';
  el['in-items'].value = '';
  el['btn-resume'].hidden = true;
  addMode = false;
  updateTally();
  show('setup');
  el['in-title'].focus();
});

el['btn-add'].addEventListener('click', () => {
  addMode = true;
  el['btn-resume'].hidden = true;
  el['in-title'].value = title;
  el['in-items'].value = items.join('\n') + '\n';
  updateTally();
  show('setup');
  el['in-items'].focus();
  el['in-items'].setSelectionRange(el['in-items'].value.length, el['in-items'].value.length);
  toast('Add new lines at the end — existing ranking is kept');
});

el['btn-refine'].addEventListener('click', () => {
  refining = true;
  cmp.refineTop(5);
  advance();
});

el['btn-resume'].addEventListener('click', () => {
  const d = loadSaved();
  if (!d) return;
  title = d.title || '';
  items = d.items;
  cmp = Compare.create(items);
  cmp.loadHistory(d.history);
  refining = false;
  undoCount = 0;
  startedAt = d.startedAt || Date.now();
  advance();
});

document.addEventListener('keydown', (e) => {
  if (!el.standings.hidden) {
    if (e.key === 'Escape') { e.preventDefault(); closeStandings(); }
    return;
  }

  if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !el['btn-start'].disabled) {
      e.preventDefault();
      startFromSetup();
    }
    return;
  }

  if (el['screen-compare'].hidden) return;

  switch (e.key) {
    case 'ArrowLeft':   e.preventDefault(); answer('a'); break;
    case 'ArrowRight':  e.preventDefault(); answer('b'); break;
    case ' ':           e.preventDefault(); answer('tie'); break;
    case 'u': case 'U': e.preventDefault(); undo(); break;
    case 's': case 'S': e.preventDefault(); openStandings(); break;
    case 'Escape':      e.preventDefault(); openStandings(); break;
  }
});

/* ---------- Boot ------------------------------------------------------- */

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
