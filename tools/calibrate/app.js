/* ==========================================================================
   Calibration trainer — the interface.

   Questions come from questions.js, units from units.js, and every judgement
   about whether you are actually miscalibrated from stats.js. This file only
   asks, shows and remembers.

   The design constraint that shapes most of it: never claim more than the
   sample supports. Seven hits out of ten looks like a disaster next to a 90%
   target and is nothing of the kind, so the screen says so. A tool that tells
   a well-calibrated user they are overconfident, on noise, is doing the exact
   thing it exists to cure.
   ========================================================================== */

'use strict';

const STORE_KEY = 'calibrate:v1';

/* ---------- State ------------------------------------------------------ */

let round = [];          // the questions for this round
let answers = [];        // {question, low, high, truth, quantity, hit}
let index = 0;
let awaitingNext = false;
let history = { rounds: [], hits: 0, n: 0 };   // lifetime

/* ---------- Persistence ------------------------------------------------ */

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(history)); } catch (e) { /* private mode */ }
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (d && Array.isArray(d.rounds) && Number.isFinite(d.hits) && Number.isFinite(d.n)) history = d;
  } catch (e) { /* ignore */ }
}

/* ---------- DOM -------------------------------------------------------- */

const el = {};
for (const id of [
  'screen-start', 'screen-ask', 'screen-results',
  'lifetime', 'lifetime-line', 'in-length', 'btn-start', 'btn-history',
  'ask-count', 'ask-fill', 'ask-tally', 'ask-topic', 'ask-question',
  'answer-form', 'in-low', 'in-high', 'in-unit', 'answer-error', 'btn-submit',
  'bet', 'feedback', 'feedback-line', 'numberline', 'feedback-truth', 'btn-next',
  'res-eyebrow', 'res-hero', 'gauge-band', 'gauge-point', 'gauge-target',
  'say', 'say-sub', 'stats', 'review',
  'btn-again', 'btn-copy', 'btn-home', 'btn-reset', 'toast',
]) el[id] = document.getElementById(id);

let toastTimer = 0;

function show(screen) {
  for (const s of ['start', 'ask', 'results']) el['screen-' + s].hidden = (s !== screen);
  window.scrollTo(0, 0);
}

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 1900);
}

const pct = (x) => `${Math.round(x * 100)}%`;

/* ---------- Start screen ----------------------------------------------- */

function renderLifetime() {
  if (!history.n) { el.lifetime.hidden = true; el['btn-history'].hidden = true; return; }

  const v = Stats.verdict(history.hits, history.n);
  const bits = [
    `<strong>${history.hits} of ${history.n}</strong> intervals contained the answer`,
    `(<strong>${pct(v.rate)}</strong>, aiming at 90%)`,
    `over ${history.rounds.length} round${history.rounds.length > 1 ? 's' : ''}.`,
  ];
  const more = Stats.moreAnswersNeeded(history.n);
  if (v.state === 'unknown' && more > 0) bits.push(`About ${more} more answers before that means much.`);
  if (v.state === 'overconfident') bits.push('Your ranges are too narrow.');
  if (v.state === 'underconfident') bits.push('Your ranges are wider than they need to be.');
  if (v.state === 'calibrated') bits.push('That is well calibrated.');

  el['lifetime-line'].innerHTML = bits.join(' ');
  el.lifetime.hidden = false;
  el['btn-history'].hidden = history.rounds.length === 0;
}

/* ---------- A round ----------------------------------------------------- */

function startRound() {
  const n = Number(el['in-length'].value) || 20;
  // Date.now() as the seed so each round differs; the engine itself is seeded
  // so a round can be reproduced from its seed if ever needed.
  round = Questions.round(n, { seed: Date.now() % 2147483647 });
  answers = [];
  index = 0;
  awaitingNext = false;
  askCurrent();
  show('ask');
}

function askCurrent() {
  const q = round[index];

  el['ask-topic'].textContent = q.topic;
  el['ask-question'].textContent = q.text;
  el['ask-count'].textContent = `${index + 1} of ${round.length}`;
  el['ask-fill'].style.width = (index / round.length) * 100 + '%';

  const hits = answers.filter((a) => a.hit).length;
  el['ask-tally'].innerHTML = answers.length
    ? `<b>${hits} in</b> · <i>${answers.length - hits} out</i>`
    : '';

  // The unit list defaults to the quantity's base unit, never to whichever
  // unit happens to suit the answer — that would leak the magnitude.
  el['in-unit'].replaceChildren();
  const units = Units.unitsFor(q.quantity);
  const base = Units.baseUnit(q.quantity);
  for (const [name] of units) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name || '(count)';
    if (name === base) opt.selected = true;
    el['in-unit'].append(opt);
  }
  el['in-unit'].parentElement.hidden = q.quantity === 'count';

  el['in-low'].value = '';
  el['in-high'].value = '';
  el['answer-error'].hidden = true;
  el.feedback.hidden = true;
  el['answer-form'].hidden = false;
  el.bet.hidden = false;
  awaitingNext = false;
  el['in-low'].focus();
}

function submitAnswer(e) {
  if (e) e.preventDefault();
  if (awaitingNext) return;

  const q = round[index];
  const unit = el['in-unit'].value;
  const low = Units.parse(el['in-low'].value, q.quantity, unit);
  const high = Units.parse(el['in-high'].value, q.quantity, unit);

  const fail = (msg) => {
    el['answer-error'].textContent = msg;
    el['answer-error'].hidden = false;
  };

  if (low === null || high === null) return fail('Give both a low and a high, as numbers.');
  if (!(low > 0) || !(high > 0)) return fail('Both bounds need to be greater than zero.');
  if (low > high) return fail('The low needs to be below the high.');
  el['answer-error'].hidden = true;

  const record = { text: q.text, quantity: q.quantity, topic: q.topic,
                   low, high, truth: q.answer };
  record.hit = Stats.contains(record);
  answers.push(record);

  showFeedback(record);
}

function showFeedback(a) {
  awaitingNext = true;
  el['answer-form'].hidden = true;
  el.bet.hidden = true;

  el.feedback.className = 'verdict ' + (a.hit ? 'verdict--hit' : 'verdict--miss');
  el['feedback-line'].textContent = a.hit ? 'Inside your range' : 'Outside your range';

  const shown = Units.format(a.truth, a.quantity);
  if (a.hit) {
    el['feedback-truth'].innerHTML = `The answer is <strong>${shown}</strong>.`;
  } else {
    const factor = a.truth > a.high ? a.truth / a.high : a.low / a.truth;
    const way = a.truth > a.high ? 'above your high' : 'below your low';
    el['feedback-truth'].innerHTML =
      `The answer is <strong>${shown}</strong> — a factor of ${factor < 10 ? factor.toFixed(1) : Math.round(factor)} ${way}.`;
  }

  drawNumberLine(a);
  el.feedback.hidden = false;
  el['btn-next'].textContent = index === round.length - 1 ? 'See the result' : 'Next';
  el['btn-next'].focus();
}

/* Your interval and the truth on a log scale — the only scale on which being
   out by a factor of 40 looks like being out by a factor of 40. */
function drawNumberLine(a) {
  const lo = Math.log10(Math.min(a.low, a.truth));
  const hi = Math.log10(Math.max(a.high, a.truth));
  const padding = Math.max(0.25, (hi - lo) * 0.15);
  const from = lo - padding, to = hi + padding;
  const at = (v) => ((Math.log10(v) - from) / (to - from)) * 100;

  el.numberline.className = 'numberline ' + (a.hit ? 'numberline--hit' : 'numberline--miss');
  el.numberline.replaceChildren();

  const axis = document.createElement('div');
  axis.className = 'numberline__axis';

  const span = document.createElement('div');
  span.className = 'numberline__span';
  span.style.left = at(a.low) + '%';
  span.style.width = Math.max(0.6, at(a.high) - at(a.low)) + '%';

  const truth = document.createElement('div');
  truth.className = 'numberline__truth';
  truth.style.left = at(a.truth) + '%';

  const label = document.createElement('div');
  label.className = 'numberline__label';
  label.style.left = Math.min(94, Math.max(6, at(a.truth))) + '%';
  label.textContent = 'answer';

  el.numberline.append(axis, span, truth, label);
}

function next() {
  if (index === round.length - 1) return finishRound();
  index++;
  askCurrent();
}

/* ---------- Results ----------------------------------------------------- */

function finishRound() {
  const hits = answers.filter((a) => a.hit).length;
  history.rounds.push({ n: answers.length, hits, at: Date.now() });
  history.hits += hits;
  history.n += answers.length;
  save();

  renderResults();
  show('results');
}

function renderResults() {
  const hits = answers.filter((a) => a.hit).length;
  const n = answers.length;
  const roundV = Stats.verdict(hits, n);
  const lifeV = Stats.verdict(history.hits, history.n);

  el['res-eyebrow'].textContent = 'This round';
  el['res-hero'].textContent = `${hits} of ${n} inside — ${pct(roundV.rate)}`;

  // The gauge shows the lifetime picture, which is the one that can actually
  // support a conclusion; the round is just the latest contribution to it.
  const band = lifeV.band;
  el['gauge-band'].style.left = band.lo * 100 + '%';
  el['gauge-band'].style.width = (band.hi - band.lo) * 100 + '%';
  el['gauge-point'].style.left = `calc(${lifeV.rate * 100}% - 1.5px)`;
  el['gauge-target'].style.left = '90%';

  renderSay(lifeV);
  renderStats(roundV, lifeV);
  renderReview();
}

function renderSay(v) {
  const more = Stats.moreAnswersNeeded(history.n);

  const lines = {
    unknown: [
      `Across all ${history.n} answers you are at <strong>${pct(v.rate)}</strong>, against a target of 90%.`,
      more > 0
        ? `That is not yet enough to tell whether you are calibrated — the range above is where your true rate plausibly sits, and it still spans ${pct(v.band.hi - v.band.lo)}. About <strong>${more} more answers</strong> would settle it.`
        : `Nothing conclusive either way yet.`,
    ],
    overconfident: [
      `Across all ${history.n} answers you are at <strong>${pct(v.rate)}</strong>, against a target of 90%. That gap is real, not luck (p = ${v.p.toFixed(3)}).`,
      `Your ranges are too narrow. The fix is not to know more — it is to widen the bounds until you genuinely would not bet against them.`,
    ],
    underconfident: [
      `Across all ${history.n} answers you are at <strong>${pct(v.rate)}</strong>, above the 90% target, and that is real rather than luck (p = ${v.p.toFixed(3)}).`,
      `Your ranges are wider than they need to be. Being right every time is not the goal — an interval nothing can fall outside tells nobody anything.`,
    ],
    calibrated: [
      `Across all ${history.n} answers you are at <strong>${pct(v.rate)}</strong>, and the sample is now big enough to say that is genuinely calibrated.`,
      `When you say 90%, you mean it. Worth re-checking occasionally — calibration drifts.`,
    ],
    none: ['', ''],
  };

  const [main, sub] = lines[v.state] || lines.none;
  el.say.innerHTML = main;
  el['say-sub'].innerHTML = sub;
}

function renderStats(roundV, lifeV) {
  const width = Stats.spread(answers);
  const lifeWidthNote = width === null ? '—'
    : width < 1 ? `${(10 ** width).toFixed(1)}×`
    : `${Math.round(10 ** width).toLocaleString('en-GB')}×`;

  const cells = [
    [`${pct(roundV.rate)}`, 'this round'],
    [`${pct(lifeV.rate)}`, `lifetime, ${history.n} answers`],
    [lifeWidthNote, 'typical range width'],
    [`${history.rounds.length}`, `round${history.rounds.length > 1 ? 's' : ''} played`],
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

function renderReview() {
  el.review.replaceChildren();
  for (const a of answers) {
    const li = document.createElement('li');
    li.className = 'rev ' + (a.hit ? 'rev--hit' : 'rev--miss');

    const mark = document.createElement('span');
    mark.className = 'rev__mark';
    mark.textContent = a.hit ? '✓' : '✗';

    const q = document.createElement('span');
    q.className = 'rev__q';
    q.textContent = a.text;

    const nums = document.createElement('span');
    nums.className = 'rev__n';
    nums.textContent = `${Units.format(a.low, a.quantity)} – ${Units.format(a.high, a.quantity)} · ${Units.format(a.truth, a.quantity)}`;

    li.append(mark, q, nums);
    el.review.append(li);
  }
}

/* ---------- Export ------------------------------------------------------ */

function summaryText() {
  const hits = answers.filter((a) => a.hit).length;
  const v = Stats.verdict(history.hits, history.n);
  const lines = [
    `Calibration round: ${hits} of ${answers.length} intervals contained the answer.`,
    `Lifetime: ${history.hits} of ${history.n} (${pct(v.rate)}), target 90%.`,
    '',
  ];
  for (const a of answers) {
    lines.push(`${a.hit ? 'in ' : 'out'}  ${a.text}`);
    lines.push(`      you ${Units.format(a.low, a.quantity)} – ${Units.format(a.high, a.quantity)}, answer ${Units.format(a.truth, a.quantity)}`);
  }
  return lines.join('\n');
}

function copySummary() {
  const text = summaryText();
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

/* ---------- Wiring ------------------------------------------------------ */

el['btn-start'].addEventListener('click', startRound);
el['answer-form'].addEventListener('submit', submitAnswer);
el['btn-next'].addEventListener('click', next);

el['btn-again'].addEventListener('click', startRound);
el['btn-copy'].addEventListener('click', copySummary);
el['btn-home'].addEventListener('click', () => { renderLifetime(); show('start'); });
el['btn-history'].addEventListener('click', () => { renderLifetime(); toast('Your record is on this screen'); });

el['btn-reset'].addEventListener('click', () => {
  history = { rounds: [], hits: 0, n: 0 };
  save();
  renderLifetime();
  show('start');
  toast('History cleared');
});

document.addEventListener('keydown', (e) => {
  if (el['screen-ask'].hidden) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    if (answers.length) finishRound();
    else { renderLifetime(); show('start'); }
    return;
  }
  if (e.key === 'Enter' && awaitingNext) { e.preventDefault(); next(); }
});

/* ---------- Boot -------------------------------------------------------- */

(function init() {
  load();
  renderLifetime();
  show('start');
})();
