/* ==========================================================================
   Base rate calculator — the interface.

   The arithmetic is in bayes.js. This file reads three boxes and renders.

   The ordering on the page is the argument: the surprising number first, then
   immediately the same thing counted out in people. Putting the counts second
   rather than as an aside is deliberate — the probability is what people get
   wrong, and the counts are what makes it obvious, so they need to sit
   directly underneath rather than three screens down.
   ========================================================================== */

'use strict';

const STORE_KEY = 'baserate:v1';

const el = {};
for (const id of ['in-prior', 'in-sens', 'in-spec', 'error', 'answer', 'ppv', 'ppv-sub',
                  'words', 'seg-true', 'seg-false', 'seg-true-n', 'seg-false-n',
                  'matrix', 'stats', 'note', 'examples', 'example-note']) {
  el[id] = document.getElementById(id);
}

const FIELDS = ['in-prior', 'in-sens', 'in-spec'];

/* ---------- Persistence ------------------------------------------------ */

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(FIELDS.map((f) => el[f].value)));
  } catch (e) { /* private mode */ }
}

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (Array.isArray(v) && v.length === 3) FIELDS.forEach((f, i) => { el[f].value = v[i]; });
  } catch (e) { /* ignore */ }
}

/* ---------- Formatting -------------------------------------------------- */

/* A percentage is the wrong shape for very small answers — "0%" is not what
   0.98% means, and rounding it away is exactly the error being corrected. */
function asPercent(p) {
  const v = p * 100;
  if (v === 0) return '0%';
  if (v < 0.01) return v.toPrecision(2) + '%';
  if (v < 1) return v.toFixed(2) + '%';
  if (v < 10) return v.toFixed(1) + '%';
  return Math.round(v) + '%';
}

const asOneIn = (p) => (p > 0 ? `about 1 in ${Math.round(1 / p).toLocaleString('en-GB')}` : null);

/* ---------- Rendering --------------------------------------------------- */

function render() {
  const read = (id, what) => {
    const r = Bayes.parseRate(el[id].value);
    el[id].classList.toggle('input--bad', Boolean(r.error));
    return r.error ? { error: `${what}: ${r.error}` } : r;
  };

  const prior = read('in-prior', 'Base rate');
  const sens = read('in-sens', 'True positive rate');
  const spec = read('in-spec', 'True negative rate');

  const bad = [prior, sens, spec].find((r) => r.error);
  if (bad) {
    el.error.textContent = bad.error;
    el.error.hidden = false;
    return;
  }
  el.error.hidden = true;
  save();

  const result = Bayes.analyse({
    prior: prior.p, sensitivity: sens.p, specificity: spec.p,
  });
  const c = Bayes.counts(result);

  /* The headline. */
  if (result.ppv === null) {
    el.ppv.textContent = '—';
    el['ppv-sub'].textContent = 'This test never returns a positive, so there is nothing to be right about.';
    el.answer.className = 'answer';
  } else {
    el.ppv.textContent = asPercent(result.ppv);
    el.answer.className = 'answer' + (result.mostPositivesWrong ? ' answer--surprising' : '');

    const oneIn = asOneIn(result.ppv);
    el['ppv-sub'].textContent = result.mostPositivesWrong
      ? `Most of the time this tests positive it is wrong — ${oneIn} of its positives is real.`
      : `${oneIn ? oneIn[0].toUpperCase() + oneIn.slice(1) : ''} of its positives is real.`;
  }

  /* The same thing, counted out. */
  el.words.textContent = Bayes.inWords(result, c);

  const flagged = result.flagged;
  const truePart = flagged > 0 ? (result.truePos / flagged) * 100 : 0;
  el['seg-true'].style.width = truePart + '%';
  el['seg-false'].style.width = (100 - truePart) + '%';
  // Only label a segment with room for the number.
  el['seg-true-n'].textContent = truePart >= 12 ? c.truePos.toLocaleString('en-GB') : '';
  el['seg-false-n'].textContent = 100 - truePart >= 12 ? c.falsePos.toLocaleString('en-GB') : '';

  renderMatrix(result, c);
  renderStats(result, c);
}

/* ---------- The 2x2 -------------------------------------------------------
   A real <table>: this is tabular data, and building it as one gets the
   header associations — and so the screen reader announcement of each cell —
   for free rather than by hand with ARIA. */

function renderMatrix(result, c) {
  const m = Bayes.matrix(result, c);
  const n = (x) => x.toLocaleString('en-GB');
  const rate = (p) => (p === null || p === undefined || Number.isNaN(p) ? '—' : asPercent(p));

  const mk = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const th = (scope, cls, text) => {
    const e = mk('th', cls, text);
    e.setAttribute('scope', scope);
    return e;
  };

  /* A cell carries its abbreviation, its count and its full name. The
     abbreviation is what the rest of the world calls it; the name is what it
     means; the count is the thing that makes it intuitive. Colour separates
     the correct diagonal from the errors, and is never the only channel —
     every cell says which it is in words. */
  const cellNode = (x) => {
    const td = mk('td', 'cell ' + (x.correct ? 'cell--ok' : 'cell--err'));
    td.append(
      mk('span', 'cell__abbr', x.abbr),
      mk('span', 'cell__n', n(x.n)),
      mk('span', 'cell__name', x.name),
    );
    td.title = `${x.name} — ${x.gloss}`;
    return td;
  };
  const rateNode = (r, cls) => {
    const td = mk('td', 'rate ' + cls);
    td.append(mk('span', 'rate__abbr', r.abbr), mk('span', 'rate__v', rate(r.p)));
    td.title = r.name;
    return td;
  };

  const cap = mk('caption', 'matrix__caption',
    `Out of ${n(m.population)} people, at a base rate of ${asPercent(result.prior)}`);

  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  hr.append(mk('td', 'corner'));
  for (const col of m.cols) hr.append(th('col', 'head head--col', col.label));
  hr.append(th('col', 'head head--corner', 'Across the row'));
  thead.append(hr);

  const tbody = document.createElement('tbody');
  for (const row of m.rows) {
    const tr = document.createElement('tr');
    tr.append(th('row', 'head head--row', row.label));
    for (const x of row.cells) tr.append(cellNode(x));
    tr.append(rateNode(row.rate, 'rate--row'));
    tbody.append(tr);
  }

  const tfoot = document.createElement('tfoot');
  const fr = document.createElement('tr');
  fr.append(th('row', 'head head--row', 'Down the column'));
  for (const col of m.cols) fr.append(rateNode(col.rate, 'rate--col'));
  fr.append(mk('td', 'corner corner--total', n(m.population)));
  tfoot.append(fr);

  el.matrix.replaceChildren(cap, thead, tbody, tfoot);
}

function renderStats(result, c) {
  const lr = result.likelihoodRatio;
  const per = c.population.toLocaleString('en-GB');
  const cells = [
    [result.npv === null ? '—' : asPercent(result.npv), 'NPV — a negative result is right'],
    [c.falseNeg.toLocaleString('en-GB'), `false negatives (FN) missed, per ${per}`],
    [c.falsePos.toLocaleString('en-GB'), `false positives (FP), per ${per}`],
    [lr === Infinity ? '∞' : lr < 10 ? lr.toFixed(1) + '×' : Math.round(lr) + '×',
      'likelihood ratio — how much a positive moves you'],
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

  /* Say the useful thing rather than leaving it to be inferred. */
  let note = '';
  if (result.likelihoodRatio === 1) {
    note = 'This test tells you nothing at all — a positive leaves you exactly where you started. ' +
      'Anything with a likelihood ratio of 1 is a coin flip wearing a lab coat.';
  } else if (result.mostPositivesWrong) {
    note = 'Most positives here are false positives. That is not a broken test — it is what ' +
      'happens to any test, however good, when the thing it looks for is rare. There are so ' +
      'many more people without it that even a tiny false positive rate outnumbers every real ' +
      'case. Raising the true negative rate helps far more than raising the true positive rate: ' +
      'specificity, not sensitivity, is what fixes this.';
  } else if (result.npv !== null && result.npv > result.ppv) {
    note = 'This is better at clearing than at confirming: a negative result here is much more ' +
      'informative than a positive one.';
  }
  el.note.textContent = note;
  el.note.hidden = !note;
}

/* ---------- Examples ---------------------------------------------------- */

function buildExamples() {
  for (const ex of Bayes.EXAMPLES) {
    const b = document.createElement('button');
    b.className = 'ex';
    b.type = 'button';
    b.textContent = ex.label;
    b.dataset.id = ex.id;
    b.addEventListener('click', () => {
      el['in-prior'].value = ex.prior >= 0.01
        ? `${(ex.prior * 100).toFixed(ex.prior >= 0.1 ? 0 : 1)}%`
        : `1 in ${Math.round(1 / ex.prior).toLocaleString('en-GB')}`;
      el['in-sens'].value = `${+(ex.sensitivity * 100).toFixed(1)}%`;
      el['in-spec'].value = `${+(ex.specificity * 100).toFixed(1)}%`;
      el['example-note'].textContent = ex.note;
      render();
    });
    el.examples.append(b);
  }
}

/* ---------- Wiring ------------------------------------------------------ */

for (const f of FIELDS) {
  el[f].addEventListener('input', () => {
    el['example-note'].textContent = '';
    render();
  });
}

load();
buildExamples();
render();
