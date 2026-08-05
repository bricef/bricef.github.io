/* ==========================================================================
   Tests for the calibration statistics.  node stats.test.js

   These matter more than they look. If the verdict fires too easily the tool
   tells a well-calibrated user they are overconfident, on noise — committing
   the error it exists to cure. The binomial figures below are checked against
   hand-computed values.
   ========================================================================== */

'use strict';

const S = require('./stats.js');

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

/* ---- The binomial itself ---------------------------------------------- */

console.log('\nBinomial');
{
  // 0.9^10 = 0.34867844010000004
  check('P(10 of 10 | p=0.9) = 0.3487', near(S.pmf(10, 10, 0.9), 0.9 ** 10, 1e-12),
    S.pmf(10, 10, 0.9).toFixed(6));
  // C(10,9) * 0.9^9 * 0.1 = 10 * 0.387420489 * 0.1
  check('P(9 of 10 | p=0.9) = 0.3874', near(S.pmf(9, 10, 0.9), 10 * 0.9 ** 9 * 0.1, 1e-12),
    S.pmf(9, 10, 0.9).toFixed(6));
  check('a fair coin is symmetric', near(S.pmf(3, 10, 0.5), S.pmf(7, 10, 0.5), 1e-12));

  let total = 0;
  for (let k = 0; k <= 25; k++) total += S.pmf(k, 25, 0.9);
  check('the distribution sums to 1', near(total, 1, 1e-9), total.toFixed(12));

  check('P(X <= 10 | n=10) = 1', near(S.cdfAtMost(10, 10, 0.9), 1, 1e-9));
  check('P(X >= 0 | n=10) = 1', near(S.cdfAtLeast(0, 10, 0.9), 1, 1e-9));
  check('the two tails overlap by exactly one term',
    near(S.cdfAtMost(6, 10, 0.9) + S.cdfAtLeast(6, 10, 0.9) - S.pmf(6, 10, 0.9), 1, 1e-9));
}

/* ---- The verdict is slow to accuse ------------------------------------ */

console.log('\nThe verdict holds its tongue');
{
  // P(X <= 7 | n=10, p=0.9) = 0.0702 — ordinary luck, however bad 70% looks.
  check('7 of 10 is not enough to accuse', S.verdict(7, 10).state === 'unknown',
    `${S.verdict(7, 10).state}, p=${S.verdict(7, 10).p.toFixed(4)}`);
  check('and the p-value is right', near(S.verdict(7, 10).p, 0.0702, 5e-4),
    S.verdict(7, 10).p.toFixed(4));

  // P(X <= 6 | n=10, p=0.9) = 0.0128 — that is real.
  check('6 of 10 is enough', S.verdict(6, 10).state === 'overconfident',
    `${S.verdict(6, 10).state}, p=${S.verdict(6, 10).p.toFixed(4)}`);

  check('a single miss says nothing', S.verdict(0, 1).state === 'unknown');
  check('two answers say nothing', S.verdict(1, 2).state === 'unknown');
  check('no answers say nothing', S.verdict(0, 0).state === 'none');

  // 20 of 20 is p=0.122 — still ordinary at p=0.9.
  check('20 of 20 is not yet proof of over-wide intervals',
    S.verdict(20, 20).state !== 'underconfident', String(S.verdict(20, 20).p.toFixed(4)));
  // 40 of 40 is 0.9^40 = 0.0148.
  check('40 of 40 is', S.verdict(40, 40).state === 'underconfident',
    `${S.verdict(40, 40).state}, p=${S.verdict(40, 40).p.toFixed(4)}`);

  check('badly overconfident is caught quickly', S.verdict(10, 20).state === 'overconfident');
  check('and reported with a small p', S.verdict(10, 20).p < 0.001);
}

/* ---- "Calibrated" is a claim needing evidence too --------------------- */

console.log('\n"Calibrated" needs evidence');
{
  check('18 of 20 is a good rate but too small a sample to confirm',
    S.verdict(18, 20).state === 'unknown', S.verdict(18, 20).state);
  check('a large sample at target does confirm it',
    S.verdict(180, 200).state === 'calibrated', S.verdict(180, 200).state);
  check('more answers are requested while it is unknown', S.moreAnswersNeeded(20) > 0);
  check('and not once there are enough', S.moreAnswersNeeded(200) === 0);
  check('the number needed shrinks as answers accumulate',
    S.moreAnswersNeeded(30) < S.moreAnswersNeeded(20));

  // The reason 20 is not enough: a user whose real coverage is 75% would slip
  // through four times in ten, so a good-looking 18 of 20 confirms nothing.
  check('one round has too little power to confirm', S.power(20) < 0.7, S.power(20).toFixed(3));
  check('two rounds have enough', S.power(40) >= 0.8, S.power(40).toFixed(3));
  check('power rises with sample size', S.power(100) > S.power(50) && S.power(50) > S.power(20));
  check('the critical count for 20 answers is 15', S.criticalCount(20) === 15, String(S.criticalCount(20)));
  // Missing 3 of 5 really is significant — p = 0.0086 — so small samples are
  // not uniformly uninformative. Only a single answer can never be.
  check('2 of 5 hits is already significant', S.criticalCount(5) === 2, String(S.criticalCount(5)));
  check('but one answer can never be', S.criticalCount(1) === -1, String(S.criticalCount(1)));
}

/* ---- The band shown on screen ----------------------------------------- */

console.log('\nWilson band');
{
  const b = S.wilson(17, 20);
  check('17 of 20 gives a band around 85%', b.lo > 0.6 && b.hi < 0.96,
    `${(b.lo * 100).toFixed(1)}–${(b.hi * 100).toFixed(1)}%`);
  check('the band contains the observed rate', b.lo <= 0.85 && b.hi >= 0.85);

  const wide = S.wilson(4, 5), tight = S.wilson(160, 200);
  check('a small sample gives a wider band', (wide.hi - wide.lo) > (tight.hi - tight.lo));

  check('bounds never leave [0, 1]', (() => {
    for (let n = 1; n <= 60; n++) {
      for (let k = 0; k <= n; k++) {
        const w = S.wilson(k, n);
        if (w.lo < 0 || w.hi > 1 || w.lo > w.hi) return false;
      }
    }
    return true;
  })());
  check('no answers gives the whole range', S.wilson(0, 0).lo === 0 && S.wilson(0, 0).hi === 1);
}

/* ---- Interval width — the check on cheating ---------------------------- */

console.log('\nInterval width');
{
  check('a decade-wide interval measures 1',
    near(S.spread([{ low: 10, high: 100 }]), 1, 1e-12));
  check('the median is used, not the mean',
    near(S.spread([{ low: 1, high: 10 }, { low: 1, high: 100 }, { low: 1, high: 1e9 }]), 2, 1e-12));
  check('absurd intervals are visible as a huge width',
    S.spread([{ low: 1e-6, high: 1e12 }]) > 17);
  check('non-positive bounds are skipped', S.spread([{ low: 0, high: 5 }]) === null);
  check('nothing to measure returns null', S.spread([]) === null);
}

/* ---- Containment ------------------------------------------------------ */

console.log('\nContainment');
{
  check('inside counts', S.contains({ low: 1, high: 10, truth: 5 }));
  check('on the low bound counts', S.contains({ low: 1, high: 10, truth: 1 }));
  check('on the high bound counts', S.contains({ low: 1, high: 10, truth: 10 }));
  check('outside does not', !S.contains({ low: 1, high: 10, truth: 10.1 }));
  check('below does not', !S.contains({ low: 1, high: 10, truth: 0.9 }));
}

/* ---- A simulated user behaves as theory predicts ----------------------- */

console.log('\nSimulation');
{
  // A genuinely 90%-calibrated user, over many sessions, should almost never
  // be accused. This is the property that matters most.
  let rng = 12345;
  const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };

  let accused = 0;
  const TRIALS = 2000;
  for (let t = 0; t < TRIALS; t++) {
    let hits = 0;
    for (let i = 0; i < 20; i++) if (rand() < 0.9) hits++;
    if (S.verdict(hits, 20).state === 'overconfident') accused++;
  }
  // The exact size of the test at n=20 is P(X <= 15 | p=0.9) = 4.3%, so the
  // false-accusation rate should sit at or just under that — never above the
  // 5% the test claims.
  const rate = accused / TRIALS;
  check(`a well-calibrated user is wrongly accused ~4% of rounds (${(rate * 100).toFixed(1)}%)`,
    rate < 0.06, `${(rate * 100).toFixed(1)}% vs an exact size of ${(S.cdfAtMost(15, 20, 0.9) * 100).toFixed(1)}%`);

  // A badly overconfident user (50% real coverage) should be caught most of
  // the time within one round.
  let caught = 0;
  for (let t = 0; t < TRIALS; t++) {
    let hits = 0;
    for (let i = 0; i < 20; i++) if (rand() < 0.5) hits++;
    if (S.verdict(hits, 20).state === 'overconfident') caught++;
  }
  check(`an overconfident user is caught in one round (${(caught / TRIALS * 100).toFixed(0)}%)`,
    caught / TRIALS > 0.95, `${(caught / TRIALS * 100).toFixed(0)}%`);
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
