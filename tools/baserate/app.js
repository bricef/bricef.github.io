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
                  'stats', 'note', 'examples', 'example-note']) {
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

  const prior = read('in-prior', 'How common');
  const sens = read('in-sens', 'Catches a real case');
  const spec = read('in-spec', 'Leaves the rest alone');

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
    el['ppv-sub'].textContent = 'This test never fires, so there is nothing to be right about.';
    el.answer.className = 'answer';
  } else {
    el.ppv.textContent = asPercent(result.ppv);
    el.answer.className = 'answer' + (result.mostPositivesWrong ? ' answer--surprising' : '');

    const oneIn = asOneIn(result.ppv);
    el['ppv-sub'].textContent = result.mostPositivesWrong
      ? `Most of the time this fires, it is wrong — ${oneIn} of the results it flags is real.`
      : `${oneIn ? oneIn[0].toUpperCase() + oneIn.slice(1) : ''} of the results it flags is real.`;
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

  renderStats(result, c);
}

function renderStats(result, c) {
  const lr = result.likelihoodRatio;
  const cells = [
    [result.npv === null ? '—' : asPercent(result.npv), 'a negative result is right'],
    [c.falseNeg.toLocaleString('en-GB'), `missed, per ${c.population.toLocaleString('en-GB')}`],
    [c.falsePos.toLocaleString('en-GB'), `false alarms, per ${c.population.toLocaleString('en-GB')}`],
    [lr === Infinity ? '∞' : lr < 10 ? lr.toFixed(1) + '×' : Math.round(lr) + '×', 'how much a hit moves you'],
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
    note = 'Most positives here are false alarms. That is not a broken test — it is what happens ' +
      'to any test, however good, when the thing it looks for is rare. Improving specificity ' +
      'helps far more than improving sensitivity when that is the case.';
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
