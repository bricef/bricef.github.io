/* ==========================================================================
   Tests for the question generators.  node questions.test.js [--sample]

   A wrong answer here is worse than a bug elsewhere: it teaches the user that
   a correct estimate was wrong, which is the precise opposite of the tool's
   purpose. So the physics and astronomy generators are checked against
   independently published values, not just against themselves.
   ========================================================================== */

'use strict';

const Q = require('./questions.js');

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

/* Draw from one generator until a given predicate matches, so a value can be
   checked against a known published figure. */
function drawUntil(id, match, tries = 4000) {
  const gen = Q.byId.get(id);
  const rng = Q.rngFrom(12345);
  for (let i = 0; i < tries; i++) {
    const q = Q.draw(gen, rng);
    if (match(q)) return q;
  }
  return null;
}

const near = (a, b, tol) => Math.abs(a - b) / b < tol;

/* ---- Answers agree with independently published values ---------------- */

console.log('\nAgainst published values');
{
  // NASA planetary fact sheets quote these directly.
  const moon = drawUntil('surface-gravity', (q) => q.text.includes('the Moon'));
  check('the Moon: surface gravity 1.62 m/s²', moon && near(moon.answer, 1.62, 0.01),
    moon && moon.answer.toFixed(3));

  const mars = drawUntil('surface-gravity', (q) => q.text.includes('Mars'));
  check('Mars: surface gravity 3.72 m/s²', mars && near(mars.answer, 3.72, 0.01),
    mars && mars.answer.toFixed(3));

  const escMoon = drawUntil('escape-velocity', (q) => q.text.includes('the Moon'));
  check('the Moon: escape velocity 2.38 km/s', escMoon && near(escMoon.answer, 2.38, 0.01),
    escMoon && escMoon.answer.toFixed(3));

  const escMars = drawUntil('escape-velocity', (q) => q.text.includes('Mars'));
  check('Mars: escape velocity 5.03 km/s', escMars && near(escMars.answer, 5.03, 0.01),
    escMars && escMars.answer.toFixed(3));

  // Kepler: 1 AU must come out as a year.
  // Also guards the printed-vs-computed parameter trap: the answer must follow
  // from the AU figure the question actually states.
  const earthLike = drawUntil('orbital-period', (q) => q.text.includes('at 1.00 AU'));
  check('a 1.00 AU orbit is 365 days', earthLike && near(earthLike.answer, 365.25, 0.005),
    earthLike && earthLike.answer.toFixed(1));

  // Known prime counts.
  check('π(1000) = 168', Q.countPrimes(1000) === 168, String(Q.countPrimes(1000)));
  check('π(10000) = 1229', Q.countPrimes(10000) === 1229, String(Q.countPrimes(10000)));
  check('π(1000000) = 78498', Q.countPrimes(1000000) === 78498, String(Q.countPrimes(1000000)));

  // 100! has 158 digits; 10! = 3628800 has 7.
  const f100 = drawUntil('factorial-digits', (q) => q.text.startsWith('How many digits are there in 100!'));
  check('100! has 158 digits', f100 && f100.answer === 158, f100 && String(f100.answer));

  // Great-circle distances, cross-checked against published city pairs.
  check('London-ish to Tokyo ≈ 9,550 km',
    near(Q.haversine(52.21, 0.12, 35.68, 139.69), 9550, 0.02),
    Q.haversine(52.21, 0.12, 35.68, 139.69).toFixed(0));
  check('Cape Town to Helsinki ≈ 10,480 km',
    near(Q.haversine(-33.92, 18.42, 60.17, 24.94), 10480, 0.01),
    Q.haversine(-33.92, 18.42, 60.17, 24.94).toFixed(0));
  check('a city is zero km from itself', Q.haversine(35.68, 139.69, 35.68, 139.69) < 1e-9);
}

/* ---- Physics that can be checked by hand ------------------------------ */

console.log('\nArithmetic that can be checked by hand');
{
  const ff = drawUntil('free-fall', (q) => q.text.includes(' 100 m?'));
  check('falling 100 m takes 4.52 s', ff && near(ff.answer, 4.515, 0.01), ff && ff.answer.toFixed(3));

  const pend = drawUntil('pendulum', (q) => q.text.includes('pendulum 1 m long'));
  check('a 1 m pendulum has a 2.01 s period', pend && near(pend.answer, 2.006, 0.01),
    pend && pend.answer.toFixed(3));

  // 1 kg of water, 4186 J/kg/K, 80 K rise, 2000 W -> 167.4 s
  const heat = drawUntil('water-heating', (q) => /2000 W .* 1 litres .* by 80/.test(q.text));
  check('2 kW raising 1 L by 80 °C takes 167 s', heat && near(heat.answer, 167.44, 0.01),
    heat && heat.answer.toFixed(1));

  // Rather than hunt for one specific draw, check the relationship holds on
  // whatever comes out. The atomic weights are restated here deliberately: an
  // independent copy catches a transcription error in the generator's table.
  const WEIGHTS = { hydrogen: 1.008, carbon: 12.011, oxygen: 15.999, aluminium: 26.982,
                    iron: 55.845, copper: 63.546, silver: 107.868, gold: 196.967,
                    lead: 207.2, uranium: 238.029 };
  const gen = Q.byId.get('atoms-in-sample');
  const rng = Q.rngFrom(99);
  let molesOk = true, molesWhy = '';
  for (let i = 0; i < 300; i++) {
    const q = Q.draw(gen, rng);
    const m = q.text.match(/in (\d+) g of (\w+)\?/);
    if (!m) { molesOk = false; molesWhy = `unparseable: ${q.text}`; break; }
    const expected = (Number(m[1]) / WEIGHTS[m[2]]) * 6.02214076e23;
    if (!near(q.answer, expected, 1e-9)) {
      molesOk = false;
      molesWhy = `${q.text} gave ${q.answer.toExponential(4)}, expected ${expected.toExponential(4)}`;
      break;
    }
  }
  check('atom counts match grams / atomic weight x Avogadro', molesOk, molesWhy);
}

/* ---- Every generator behaves ------------------------------------------ */

console.log('\nEvery generator');
{
  for (const gen of Q.GENERATORS) {
    const rng = Q.rngFrom(7);
    let ok = true, why = '';
    for (let i = 0; i < 500; i++) {
      const q = Q.draw(gen, rng);
      if (!Number.isFinite(q.answer)) { ok = false; why = 'non-finite answer'; break; }
      if (q.answer <= 0) { ok = false; why = `non-positive answer ${q.answer}`; break; }
      if (q.answer < gen.band[0] || q.answer > gen.band[1]) {
        ok = false; why = `answer ${q.answer} outside band [${gen.band}]`; break;
      }
      if (!q.text || !/\?$/.test(q.text.trim())) { ok = false; why = `not a question: "${q.text}"`; break; }
      if (typeof q.unit !== 'string') { ok = false; why = 'missing unit'; break; }
    }
    check(`${gen.id}: 500 draws stay finite, positive and in band`, ok, why);
  }
}

/* ---- Rounds ------------------------------------------------------------ */

console.log('\nRounds');
{
  const r = Q.round(20, { seed: 42 });
  check('a round returns the requested size', r.length === 20, String(r.length));

  const same = Q.round(20, { seed: 42 });
  check('the same seed gives the same round',
    JSON.stringify(r.map((q) => q.text)) === JSON.stringify(same.map((q) => q.text)));

  const other = Q.round(20, { seed: 43 });
  check('a different seed gives a different round',
    JSON.stringify(r.map((q) => q.text)) !== JSON.stringify(other.map((q) => q.text)));

  const counts = {};
  for (const q of r) counts[q.id] = (counts[q.id] || 0) + 1;
  const cap = Math.max(1, Math.ceil(20 / 4));
  check('no generator dominates a round',
    Object.values(counts).every((c) => c <= cap), JSON.stringify(counts));

  // The failure this rejects: "surface gravity of Titan (1.35)" followed by
  // "surface gravity of Europa (1.32)" — two draws, effectively one question.
  let tooClose = null;
  for (let i = 0; i < r.length; i++) {
    for (let j = i + 1; j < r.length; j++) {
      if (r[i].id !== r[j].id) continue;
      if (Math.abs(Math.log10(r[i].answer) - Math.log10(r[j].answer)) < 0.15) {
        tooClose = `${r[i].text} / ${r[j].text}`;
      }
    }
  }
  check('no two questions have near-identical answers', tooClose === null, tooClose);

  // Calibration training needs answers across many orders of magnitude, or
  // the user learns one magnitude and coasts.
  const logs = r.map((q) => Math.log10(q.answer));
  const spread = Math.max(...logs) - Math.min(...logs);
  check('answers span several orders of magnitude', spread > 4, `${spread.toFixed(1)} decades`);

  const topics = new Set(r.map((q) => q.topic));
  check('a round covers at least four topics', topics.size >= 4, [...topics].join(', '));

  // Over many rounds every generator should appear.
  const seen = new Set();
  for (let s = 0; s < 40; s++) for (const q of Q.round(20, { seed: s })) seen.add(q.id);
  check('every generator appears across many rounds',
    seen.size === Q.GENERATORS.length, `${seen.size}/${Q.GENERATORS.length}`);
}

/* ---- Optional: eyeball a round ---------------------------------------- */

if (process.argv.includes('--sample')) {
  console.log('\nA sample round\n');
  const fmt = (v) => (Number.isInteger(v) ? v.toLocaleString('en-GB')
    : v >= 1e5 || v < 0.01 ? v.toExponential(3)
    : v < 10 ? v.toFixed(2) : v.toFixed(1));
  for (const q of Q.round(14, { seed: Number(process.argv[3]) || 2026 })) {
    console.log(`  ${q.text}\n      → ${fmt(q.answer)} ${q.unit}`.trimEnd());
  }
  console.log();
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
