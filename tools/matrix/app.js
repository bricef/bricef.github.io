/* ==========================================================================
   Decision matrix — score options against criteria you have weighed.

   The part people get wrong about decision matrices is the weights: asked to
   put numbers on "how much does cost matter", everyone invents them, and the
   invented numbers decide the outcome. So the weights are not typed in. They
   come out of the same pairwise comparison engine Ranker uses — you answer
   "which matters more?" a handful of times, and the ranking that falls out is
   turned into weights.

   Turning a rank order into numbers uses rank-order centroid weights: the
   average of every weighting consistent with that order. It is the honest
   answer to "I know cost beats latency, but not by how much" — no magnitude
   is invented beyond the ordering you actually gave.

   Scores stay direct: a 1-5 rating per option per criterion. People are good
   at "how does this option do on this one axis" and bad at trading axes off,
   so the comparison engine is spent where it earns its keep.
   ========================================================================== */

'use strict';

const STORE_KEY = 'matrix:v1';
const MAX_CRITERIA = 8;          // one per categorical colour; more is unreadable
const SCALE = 5;

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SETTLE_MS = REDUCED_MOTION ? 0 : 180;

const SERIES = Array.from({ length: MAX_CRITERIA }, (_, i) => `var(--series-${i + 1})`);

/* ---------- State ------------------------------------------------------ */

let title = '';
let options = [];
let criteria = [];
let scores = [];          // scores[optIdx][critIdx] — 0 means unrated
let cmp = Compare.create([]);
let weightOrder = [];     // criterion indices, most important first
let weights = [];         // weights[critIdx], summing to 1
let equalWeights = false;

let pair = null;
let busy = false;

/* ---------- Weights ---------------------------------------------------- */

/* Rank-order centroid: the centroid of every weight vector consistent with
   the ranking. w_i = (1/n) * sum over k >= i of 1/k. */
function rocWeights(n) {
  const w = [];
  for (let i = 1; i <= n; i++) {
    let s = 0;
    for (let k = i; k <= n; k++) s += 1 / k;
    w.push(s / n);
  }
  return w;
}

/* Build weights from the comparison. Criteria the engine put in one class are
   genuinely tied, so they share the mean of the positions they occupy. */
function weightsFromComparison() {
  const n = criteria.length;
  const roc = rocWeights(n);
  const { placed, unplaced } = cmp.order();
  const order = [...placed, ...unplaced];

  weightOrder = [];
  weights = new Array(n).fill(0);

  let pos = 0;
  for (const c of order) {
    const members = cmp.classItems(c);
    let share = 0;
    for (let k = 0; k < members.length; k++) share += roc[pos + k];
    share /= members.length;
    for (const m of members) { weights[m] = share; weightOrder.push(m); }
    pos += members.length;
  }
  equalWeights = false;
}

function weightsFromOrder() {
  const roc = rocWeights(criteria.length);
  weights = new Array(criteria.length).fill(0);
  weightOrder.forEach((c, i) => { weights[c] = roc[i]; });
  equalWeights = false;
}

function setEqualWeights() {
  const n = criteria.length;
  weightOrder = criteria.map((_, i) => i);
  weights = new Array(n).fill(1 / n);
  equalWeights = true;
}

/* ---------- Scoring maths ---------------------------------------------- */

const contribution = (o, c) => weights[c] * (scores[o][c] || 0);
const totalFor = (o) => criteria.reduce((sum, _, c) => sum + contribution(o, c), 0);

function ranked(useWeights = weights) {
  return options
    .map((name, o) => ({
      o, name,
      total: criteria.reduce((s, _, c) => s + useWeights[c] * (scores[o][c] || 0), 0),
    }))
    .sort((a, b) => b.total - a.total || a.o - b.o);
}

const ratedCount = () => scores.reduce((n, row) => n + row.filter((v) => v > 0).length, 0);
const cellCount = () => options.length * criteria.length;
const allRated = () => ratedCount() === cellCount() && cellCount() > 0;

/* ---------- Persistence ------------------------------------------------ */

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      title, options, criteria, scores, history: cmp.history, weightOrder, equalWeights,
    }));
  } catch (e) { /* private browsing or quota — still works in-session */ }
}

function loadSaved() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!d || !Array.isArray(d.options) || !Array.isArray(d.criteria)) return null;
    if (d.options.length < 2 || d.criteria.length < 2) return null;
    return d;
  } catch (e) { return null; }
}

/* ---------- DOM -------------------------------------------------------- */

const el = {};
for (const id of [
  'screen-setup', 'screen-weigh', 'screen-score', 'screen-results',
  'in-title', 'in-options', 'in-criteria', 'setup-tally', 'btn-start', 'btn-resume',
  'weigh-title', 'weigh-count', 'weigh-rail', 'weigh-fill', 'btn-undo', 'btn-equal',
  'cards', 'card-a', 'card-b', 'card-a-text', 'card-b-text', 'btn-tie',
  'score-title', 'score-count', 'score-fill', 'btn-reweigh', 'scoresheet',
  'btn-results', 'score-hint',
  'res-title', 'verdict', 'legend', 'bars', 'sensitivity',
  'weights-list', 'table',
  'btn-copy', 'btn-csv', 'btn-table', 'btn-edit', 'btn-restart',
  'tip', 'toast',
]) el[id] = document.getElementById(id);

let toastTimer = 0;

function show(screen) {
  for (const s of ['setup', 'weigh', 'score', 'results']) el['screen-' + s].hidden = (s !== screen);
  window.scrollTo(0, 0);
}

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 1900);
}

/* ---------- Setup ------------------------------------------------------ */

function parseLines(text) {
  const seen = new Set();
  const out = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function updateTally() {
  const o = parseLines(el['in-options'].value);
  const c = parseLines(el['in-criteria'].value);
  const tooMany = c.length > MAX_CRITERIA;
  el['btn-start'].disabled = o.length < 2 || c.length < 2 || tooMany;

  if (o.length < 2 || c.length < 2) {
    el['setup-tally'].textContent = 'Add at least two options and two criteria.';
    return;
  }
  if (tooMany) {
    el['setup-tally'].textContent =
      `${c.length} criteria — ${MAX_CRITERIA} is the limit. Past that they usually overlap; merge the ones that measure the same thing.`;
    return;
  }
  const qs = Compare.predictTotal(c.length);
  el['setup-tally'].innerHTML =
    `<strong>${o.length}</strong> options &times; <strong>${c.length}</strong> criteria ` +
    `&middot; &asymp;<strong>${qs}</strong> comparisons, then <strong>${o.length * c.length}</strong> ratings`;
}

function startFromSetup() {
  options = parseLines(el['in-options'].value);
  criteria = parseLines(el['in-criteria'].value);
  if (options.length < 2 || criteria.length < 2 || criteria.length > MAX_CRITERIA) return;

  title = el['in-title'].value.trim();
  scores = options.map(() => new Array(criteria.length).fill(0));
  cmp = Compare.create(criteria);
  save();
  advanceWeigh();
}

/* ---------- Weighing --------------------------------------------------- */

function advanceWeigh() {
  pair = cmp.next();
  if (!pair) {
    weightsFromComparison();
    save();
    return openScoring();
  }

  el['weigh-title'].textContent = title || 'Untitled decision';
  el['card-a-text'].textContent = criteria[pair.a];
  el['card-b-text'].textContent = criteria[pair.b];

  const p = cmp.progress();
  el['weigh-count'].textContent = `${p.done} of ~${p.total}`;
  el['weigh-fill'].style.width = p.pct + '%';
  el['weigh-rail'].setAttribute('aria-valuenow', String(p.pct));
  el['btn-undo'].disabled = cmp.history.length === 0;

  el.cards.classList.remove('cards--settling');
  for (const c of [el['card-a'], el['card-b']]) c.classList.remove('card--win', 'card--lose', 'card--tie');

  show('weigh');
}

function answerWeigh(result) {
  if (busy || !pair) return;
  if (!cmp.record(pair.a, pair.b, result)) return;
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
  setTimeout(() => { busy = false; advanceWeigh(); }, SETTLE_MS);
}

/* ---------- Scoring sheet ---------------------------------------------- */

function colourOf(critIdx) {
  const rank = weightOrder.indexOf(critIdx);
  return SERIES[(rank < 0 ? critIdx : rank) % SERIES.length];
}

function openScoring() {
  el['score-title'].textContent = title || 'Untitled decision';
  el.scoresheet.replaceChildren();

  for (const c of weightOrder) {
    const sec = document.createElement('section');
    sec.className = 'crit';
    sec.style.setProperty('--series', colourOf(c));

    const head = document.createElement('header');
    head.className = 'crit__head';

    const sw = document.createElement('span');
    sw.className = 'swatch';

    const name = document.createElement('h2');
    name.className = 'crit__name';
    name.textContent = criteria[c];

    const pct = document.createElement('span');
    pct.className = 'crit__weight';
    pct.textContent = `${Math.round(weights[c] * 100)}% of the decision`;

    head.append(sw, name, pct);

    const list = document.createElement('ul');
    list.className = 'rate';

    options.forEach((optName, o) => {
      const li = document.createElement('li');
      li.className = 'rate__row';

      const nm = document.createElement('span');
      nm.className = 'rate__name';
      nm.textContent = optName;

      const scale = document.createElement('div');
      scale.className = 'scale';
      scale.setAttribute('role', 'radiogroup');
      scale.setAttribute('aria-label', `${optName} on ${criteria[c]}, 1 poor to ${SCALE} excellent`);

      for (let v = 1; v <= SCALE; v++) {
        const b = document.createElement('button');
        b.className = 'dot';
        b.type = 'button';
        b.textContent = String(v);
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(scores[o][c] === v));
        b.setAttribute('aria-label', `${v} of ${SCALE}`);
        b.addEventListener('click', () => setScore(o, c, v, scale));
        b.addEventListener('keydown', (e) => {
          if (e.key >= '1' && e.key <= String(SCALE)) { e.preventDefault(); setScore(o, c, +e.key, scale); }
        });
        scale.append(b);
      }

      li.append(nm, scale);
      list.append(li);
    });

    sec.append(head, list);
    el.scoresheet.append(sec);
  }

  updateScoreProgress();
  show('score');
}

function setScore(o, c, v, scaleEl) {
  scores[o][c] = v;
  [...scaleEl.children].forEach((b, i) => b.setAttribute('aria-checked', String(i + 1 === v)));
  save();
  updateScoreProgress();
}

function updateScoreProgress() {
  const done = ratedCount(), all = cellCount();
  el['score-count'].textContent = `${done} of ${all} rated`;
  el['score-fill'].style.width = (all ? (done / all) * 100 : 0) + '%';
  el['btn-results'].disabled = !allRated();
  el['score-hint'].textContent = allRated() ? '' : `${all - done} left`;
}

/* ---------- Results ---------------------------------------------------- */

function openResults() {
  el['res-title'].textContent = title || 'Untitled decision';
  const rows = ranked();
  const [first, second] = rows;

  const margin = second ? first.total - second.total : 0;
  const marginPct = (margin / SCALE) * 100;

  el.verdict.replaceChildren();
  const strong = document.createElement('strong');
  strong.textContent = first.name;
  el.verdict.append(strong);
  const tail = !second
    ? ` scores ${first.total.toFixed(2)} out of ${SCALE}.`
    : ` scores ${first.total.toFixed(2)} out of ${SCALE}, ` +
      `${marginPct < 3 ? 'barely ahead of' : 'ahead of'} ${second.name} at ${second.total.toFixed(2)}.`;
  el.verdict.append(document.createTextNode(tail));

  renderLegend();
  renderBars(rows);
  renderSensitivity(rows);
  renderWeights();
  renderTable(rows);
  show('results');
}

function renderLegend() {
  el.legend.replaceChildren();
  for (const c of weightOrder) {
    const item = document.createElement('span');
    item.className = 'legend__item';
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.setProperty('--series', colourOf(c));
    const nm = document.createElement('span');
    nm.textContent = criteria[c];
    const pct = document.createElement('span');
    pct.className = 'legend__pct';
    pct.textContent = `${Math.round(weights[c] * 100)}%`;
    item.append(sw, nm, pct);
    el.legend.append(item);
  }
}

function renderBars(rows) {
  el.bars.replaceChildren();
  rows.forEach((r, i) => {
    const li = document.createElement('li');
    li.className = 'barrow' + (i === 0 ? ' barrow--win' : '');

    const top = document.createElement('div');
    top.className = 'barrow__top';
    const nm = document.createElement('span');
    nm.className = 'barrow__name';
    nm.textContent = r.name;
    const tot = document.createElement('span');
    tot.className = 'barrow__total';
    tot.textContent = `${r.total.toFixed(2)} / ${SCALE}`;
    top.append(nm, tot);

    const track = document.createElement('div');
    track.className = 'bar-track';

    for (const c of weightOrder) {
      const contrib = contribution(r.o, c);
      if (contrib <= 0) continue;
      const widthPct = (contrib / SCALE) * 100;

      const seg = document.createElement('div');
      seg.className = 'seg';
      seg.style.setProperty('--series', colourOf(c));
      seg.style.width = widthPct + '%';

      // Direct-label the segments with room for it; the rest rely on the
      // legend, the hover tooltip and the table.
      if (widthPct >= 12) {
        const lab = document.createElement('span');
        lab.className = 'seg__label';
        lab.textContent = criteria[c];
        seg.append(lab);
      }

      const tipText = {
        name: criteria[c],
        colour: colourOf(c),
        math: `scored ${scores[r.o][c]}/${SCALE} × weight ${Math.round(weights[c] * 100)}% = ${contrib.toFixed(2)}`,
      };
      seg.addEventListener('mouseenter', (e) => showTip(e, tipText));
      seg.addEventListener('mousemove', (e) => moveTip(e));
      seg.addEventListener('mouseleave', hideTip);

      track.append(seg);
    }

    li.append(top, track);
    el.bars.append(li);
  });
}

/* Which conclusions survive a nudge to the weights? Cheap and exact: rerun
   the ranking with equal weights, and once per criterion with that criterion
   dropped. Anything that flips is worth knowing before you commit. */
function renderSensitivity(rows) {
  const winner = rows[0].name;
  const notes = [];

  const equal = new Array(criteria.length).fill(1 / criteria.length);
  const equalWinner = ranked(equal)[0].name;
  if (equalWinner !== winner) {
    notes.push(`If every criterion mattered equally, <strong>${equalWinner}</strong> would win instead.`);
  }

  for (const c of weightOrder) {
    if (criteria.length < 3) break;
    const without = weights.map((w, i) => (i === c ? 0 : w));
    const sum = without.reduce((a, b) => a + b, 0);
    if (sum <= 0) continue;
    const norm = without.map((w) => w / sum);
    const w2 = ranked(norm)[0].name;
    if (w2 !== winner) {
      notes.push(`Drop <strong>${criteria[c]}</strong> and <strong>${w2}</strong> wins.`);
    }
  }

  const margin = rows[1] ? ((rows[0].total - rows[1].total) / SCALE) * 100 : 100;
  if (margin < 3) {
    notes.unshift(`<strong>${rows[0].name}</strong> and <strong>${rows[1].name}</strong> are within ${margin.toFixed(1)}% of each other — this is a coin flip, not a result.`);
  }

  if (!notes.length) {
    el.sensitivity.hidden = true;
    return;
  }
  el.sensitivity.innerHTML =
    '<strong>How solid is this?</strong><ul>' + notes.map((n) => `<li>${n}</li>`).join('') + '</ul>';
  el.sensitivity.hidden = false;
}

function renderWeights() {
  el['weights-list'].replaceChildren();
  weightOrder.forEach((c, i) => {
    const li = document.createElement('li');
    li.className = 'wrow';

    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.setProperty('--series', colourOf(c));

    const nm = document.createElement('span');
    nm.className = 'wrow__name';
    nm.textContent = criteria[c];

    const pct = document.createElement('span');
    pct.className = 'wrow__pct';
    pct.textContent = `${Math.round(weights[c] * 100)}%`;

    const moves = document.createElement('span');
    moves.className = 'wrow__moves';
    for (const [dir, glyph, label] of [[-1, '↑', 'More important'], [1, '↓', 'Less important']]) {
      const b = document.createElement('button');
      b.className = 'movebtn';
      b.textContent = glyph;
      b.title = label;
      b.setAttribute('aria-label', `${label}: ${criteria[c]}`);
      b.disabled = (dir < 0 && i === 0) || (dir > 0 && i === weightOrder.length - 1);
      b.addEventListener('click', () => moveCriterion(i, dir));
      moves.append(b);
    }

    li.append(sw, nm, pct, moves);
    el['weights-list'].append(li);
  });
}

function moveCriterion(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= weightOrder.length) return;
  [weightOrder[i], weightOrder[j]] = [weightOrder[j], weightOrder[i]];
  weightsFromOrder();
  save();
  openResults();
}

function renderTable(rows) {
  const head = document.createElement('thead');
  const hr = document.createElement('tr');
  hr.append(th('Option'));
  for (const c of weightOrder) hr.append(th(`${criteria[c]} (${Math.round(weights[c] * 100)}%)`));
  hr.append(th('Total'));
  head.append(hr);

  const body = document.createElement('tbody');
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.append(td(r.name));
    for (const c of weightOrder) tr.append(td(String(scores[r.o][c] || '—')));
    tr.append(td(r.total.toFixed(2)));
    body.append(tr);
  }

  el.table.replaceChildren(head, body);

  function th(text) { const e = document.createElement('th'); e.textContent = text; e.scope = 'col'; return e; }
  function td(text) { const e = document.createElement('td'); e.textContent = text; return e; }
}

/* ---------- Tooltip ---------------------------------------------------- */

function showTip(e, data) {
  el.tip.replaceChildren();
  const name = document.createElement('div');
  name.className = 'tip__name';
  const sw = document.createElement('span');
  sw.className = 'swatch';
  sw.style.setProperty('--series', data.colour);
  const t = document.createElement('span');
  t.textContent = data.name;
  name.append(sw, t);
  const math = document.createElement('div');
  math.className = 'tip__math';
  math.textContent = data.math;
  el.tip.append(name, math);
  el.tip.hidden = false;
  moveTip(e);
}

function moveTip(e) {
  const pad = 14;
  const r = el.tip.getBoundingClientRect();
  let x = e.clientX + pad, y = e.clientY + pad;
  if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
  if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - pad;
  el.tip.style.left = Math.max(8, x) + 'px';
  el.tip.style.top = Math.max(8, y) + 'px';
}

function hideTip() { el.tip.hidden = true; }

/* ---------- Export ----------------------------------------------------- */

function resultText() {
  const rows = ranked();
  const lines = [title || 'Decision', ''];
  rows.forEach((r, i) => lines.push(`${i + 1}. ${r.name} — ${r.total.toFixed(2)} / ${SCALE}`));
  lines.push('', 'Weights:');
  for (const c of weightOrder) lines.push(`  ${criteria[c]} — ${Math.round(weights[c] * 100)}%`);
  return lines.join('\n');
}

function copyResult() {
  const text = resultText();
  const done = () => toast('Copied');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
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
  const header = ['option', ...weightOrder.map((c) => criteria[c]), 'total'];
  const weightRow = ['weight', ...weightOrder.map((c) => weights[c].toFixed(4)), ''];
  const rows = ranked().map((r) => [r.name, ...weightOrder.map((c) => scores[r.o][c] || ''), r.total.toFixed(3)]);
  const csv = [header, weightRow, ...rows].map((r) => r.map(q).join(',')).join('\r\n');

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (title ? title.replace(/[^\w\-]+/g, '-').replace(/^-|-$/g, '') : 'decision') + '.csv';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Wiring ----------------------------------------------------- */

for (const id of ['in-options', 'in-criteria']) el[id].addEventListener('input', updateTally);
el['btn-start'].addEventListener('click', startFromSetup);

el['card-a'].addEventListener('click', () => answerWeigh('a'));
el['card-b'].addEventListener('click', () => answerWeigh('b'));
el['btn-tie'].addEventListener('click', () => answerWeigh('tie'));
el['btn-undo'].addEventListener('click', () => {
  if (busy || !cmp.history.length) return;
  cmp.undo();
  save();
  advanceWeigh();
});
el['btn-equal'].addEventListener('click', () => {
  setEqualWeights();
  save();
  openScoring();
  toast('Every criterion counts the same');
});

el['btn-results'].addEventListener('click', openResults);
el['btn-reweigh'].addEventListener('click', () => {
  cmp = Compare.create(criteria);
  save();
  advanceWeigh();
});

el['btn-edit'].addEventListener('click', openScoring);
el['btn-copy'].addEventListener('click', copyResult);
el['btn-csv'].addEventListener('click', downloadCsv);
el['btn-table'].addEventListener('click', () => {
  const showing = !el.table.hidden;
  el.table.hidden = showing;
  el['btn-table'].textContent = showing ? 'Show table' : 'Hide table';
});

el['btn-restart'].addEventListener('click', () => {
  title = ''; options = []; criteria = []; scores = [];
  cmp = Compare.create([]);
  weightOrder = []; weights = [];
  save();
  el['in-title'].value = '';
  el['in-options'].value = '';
  el['in-criteria'].value = '';
  el['btn-resume'].hidden = true;
  updateTally();
  show('setup');
  el['in-title'].focus();
});

el['btn-resume'].addEventListener('click', () => {
  const d = loadSaved();
  if (!d) return;
  title = d.title || '';
  options = d.options;
  criteria = d.criteria;
  scores = Array.isArray(d.scores) && d.scores.length === options.length
    ? d.scores
    : options.map(() => new Array(criteria.length).fill(0));
  cmp = Compare.create(criteria);
  cmp.loadHistory(d.history || []);

  if (d.equalWeights) setEqualWeights();
  else if (Array.isArray(d.weightOrder) && d.weightOrder.length === criteria.length) {
    weightOrder = d.weightOrder;
    weightsFromOrder();
  }

  if (!cmp.done) advanceWeigh();
  else {
    if (!weightOrder.length) weightsFromComparison();
    allRated() ? openResults() : openScoring();
  }
});

document.addEventListener('keydown', (e) => {
  if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (el['screen-weigh'].hidden) return;
  switch (e.key) {
    case 'ArrowLeft':   e.preventDefault(); answerWeigh('a'); break;
    case 'ArrowRight':  e.preventDefault(); answerWeigh('b'); break;
    case ' ':           e.preventDefault(); answerWeigh('tie'); break;
    case 'u': case 'U': e.preventDefault(); el['btn-undo'].click(); break;
  }
});

/* ---------- Boot ------------------------------------------------------- */

(function init() {
  const saved = loadSaved();
  if (saved) {
    el['btn-resume'].hidden = false;
    el['btn-resume'].textContent = saved.title ? `Resume “${saved.title}”` : 'Resume last decision';
  }
  updateTally();
  show('setup');
})();
