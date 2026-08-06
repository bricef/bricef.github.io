/* ==========================================================================
   Tests for the base rate arithmetic.  node bayes.test.js

   The whole point of the tool is that the right answer is surprising. If the
   arithmetic is wrong it will still look plausible, because nobody's intuition
   is going to catch it — so these check against published worked examples
   rather than against a re-derivation of the same formula.
   ========================================================================== */

'use strict';

const B = require('./bayes.js');

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ---- Against published examples -------------------------------------------- */

console.log('\nPublished worked examples');
{
  // Gigerenzer's mammography figures: 1% prevalence, 80% sensitivity,
  // 9.6% false positive rate. The published answer is about 7.8%.
  const mammo = B.analyse({ prior: 0.01, sensitivity: 0.8, specificity: 0.904 });
  check('mammography gives about 7.8%', near(mammo.ppv, 0.0776, 0.0005),
    (mammo.ppv * 100).toFixed(2) + '%');
  check('and most positives are wrong', mammo.mostPositivesWrong === true);

  // A "99% accurate" test for something affecting 1 in 10,000 is right about
  // 1% of the time it fires — the single most useful number in the tool.
  const rare = B.analyse({ prior: 0.0001, sensitivity: 0.99, specificity: 0.99 });
  check('a 99% test on a 1-in-10,000 thing is right ~1% of the time',
    near(rare.ppv, 0.0098, 0.0005), (rare.ppv * 100).toFixed(2) + '%');
  check('while its negative result is nearly certain', rare.npv > 0.9999);

  // Same test, common condition: now it is genuinely informative.
  const common = B.analyse({ prior: 0.25, sensitivity: 0.9, specificity: 0.9 });
  check('the same quality of test on a 1-in-4 thing is right 75% of the time',
    near(common.ppv, 0.75, 0.0001), (common.ppv * 100).toFixed(2) + '%');
  check('and most positives are now right', common.mostPositivesWrong === false);
}

/* ---- The parts add up -------------------------------------------------------- */

console.log('\nInternal consistency');
{
  for (const prior of [0.0001, 0.01, 0.25, 0.5, 0.9]) {
    for (const sens of [0.5, 0.8, 0.99]) {
      for (const spec of [0.5, 0.9, 0.999]) {
        const r = B.analyse({ prior, sensitivity: sens, specificity: spec });
        const total = r.truePos + r.falsePos + r.trueNeg + r.falseNeg;
        if (!near(total, 1, 1e-12)) {
          check(`the four outcomes sum to 1 (${prior}/${sens}/${spec})`, false, String(total));
          break;
        }
      }
    }
  }
  check('the four outcomes always sum to 1', true);

  const r = B.analyse({ prior: 0.02, sensitivity: 0.9, specificity: 0.95 });
  check('flagged is true positives plus false positives',
    near(r.flagged, r.truePos + r.falsePos, 1e-12));
  check('the likelihood ratio is sensitivity over the false positive rate',
    near(r.likelihoodRatio, 0.9 / 0.05, 1e-12), String(r.likelihoodRatio));
}

/* ---- Where it should say something is off ------------------------------------ */

console.log('\nDegenerate cases');
{
  const useless = B.analyse({ prior: 0.1, sensitivity: 0.5, specificity: 0.5 });
  check('a coin-flip test has a likelihood ratio of 1', near(useless.likelihoodRatio, 1, 1e-12));
  check('and leaves the answer at the base rate', near(useless.ppv, 0.1, 1e-12),
    String(useless.ppv));

  const perfect = B.analyse({ prior: 0.001, sensitivity: 1, specificity: 1 });
  check('a perfect test is certain when positive', perfect.ppv === 1);
  check('and certain when negative', perfect.npv === 1);
  check('with an infinite likelihood ratio', perfect.likelihoodRatio === Infinity);

  const never = B.analyse({ prior: 0, sensitivity: 0.9, specificity: 0.9 });
  check('if nothing has it, a positive is always wrong', never.ppv === 0);

  const always = B.analyse({ prior: 1, sensitivity: 0.9, specificity: 0.9 });
  check('if everything has it, a positive is always right', always.ppv === 1);

  const noneFlagged = B.analyse({ prior: 0.5, sensitivity: 0, specificity: 1 });
  check('a test that never fires has no positive predictive value', noneFlagged.ppv === null);
}

/* ---- Counts ------------------------------------------------------------------- */

console.log('\nNatural frequencies');
{
  const r = B.analyse({ prior: 0.0001, sensitivity: 0.99, specificity: 0.99 });
  const c = B.counts(r, 1000000);
  check('a million people, a hundred with it', c.withIt === 100, String(c.withIt));
  check('99 of them found', c.truePos === 99, String(c.truePos));
  check('and 9,999 wrongly flagged', c.falsePos === 9999, String(c.falsePos));
  check('so about 10,098 flagged in total', c.flagged === 10098, String(c.flagged));

  check('the population is chosen so the rare group is countable',
    B.populationFor(0.0001) === 100000, String(B.populationFor(0.0001)));
  check('a common thing needs a smaller population',
    B.populationFor(0.25) === 100, String(B.populationFor(0.25)));
  check('a zero base rate still gives a usable population', B.populationFor(0) > 0);
  check('the population is a round number', (() => {
    for (const p of [0.5, 0.1, 0.01, 0.003, 1e-6]) {
      const n = B.populationFor(p);
      if (!/^10*$/.test(String(n))) return false;
    }
    return true;
  })());

  const words = B.inWords(r, c);
  check('the sentence is in counts, not percentages', !/%/.test(words), words);
  check('and names both groups', /100/.test(words) && /9,999/.test(words), words);

  /* Four independently rounded cells need not sum to the population. They are
     displayed as a table with margins, so if they ever fail to add up the
     table is visibly wrong. */
  check('the four cells always sum to the population exactly', (() => {
    for (const prior of [1e-6, 1e-4, 0.003, 0.01, 0.25, 0.5, 0.9, 0.999, 1]) {
      for (const sens of [0, 0.333, 0.5, 0.8, 0.99, 1]) {
        for (const spec of [0, 0.333, 0.5, 0.9, 0.999, 1]) {
          const res = B.analyse({ prior, sensitivity: sens, specificity: spec });
          for (const n of [100, 1000, 10000, 1e6]) {
            const k = B.counts(res, n);
            if (k.truePos + k.falsePos + k.falseNeg + k.trueNeg !== n) return false;
            if (k.withIt + k.withoutIt !== n) return false;
            if (k.flagged + k.clear !== n) return false;
            if (Math.min(k.truePos, k.falsePos, k.falseNeg, k.trueNeg) < 0) return false;
          }
        }
      }
    }
    return true;
  })());
}

/* ---- The 2x2 -------------------------------------------------------------- */

console.log('\nThe confusion matrix');
{
  const r = B.analyse({ prior: 0.0001, sensitivity: 0.99, specificity: 0.99 });
  const m = B.matrix(r, B.counts(r, 100000));

  check('it has all four cells', ['tp', 'fp', 'fn', 'tn'].every((k) => m.cells[k]));
  check('each cell is named as well as abbreviated',
    Object.values(m.cells).every((c) => /^[TF][PN]$/.test(c.abbr) && c.name && c.gloss));
  check('the diagonal is the correct one',
    m.cells.tp.correct && m.cells.tn.correct &&
    !m.cells.fp.correct && !m.cells.fn.correct);

  const sum = Object.values(m.cells).reduce((a, c) => a + c.n, 0);
  check('the cells sum to the population', sum === m.population, `${sum} vs ${m.population}`);
  check('the row totals sum to the population',
    m.rows[0].total + m.rows[1].total === m.population);
  check('the column totals sum to the population',
    m.cols[0].total + m.cols[1].total === m.population);
  check('each row total is its own two cells',
    m.rows.every((row) => row.cells[0].n + row.cells[1].n === row.total));

  check('the row rates are PPV and NPV',
    m.rows[0].rate.abbr === 'PPV' && m.rows[0].rate.p === r.ppv &&
    m.rows[1].rate.abbr === 'NPV' && m.rows[1].rate.p === r.npv);
  check('the column rates are TPR and TNR',
    m.cols[0].rate.abbr === 'TPR' && m.cols[0].rate.p === r.sensitivity &&
    m.cols[1].rate.abbr === 'TNR' && m.cols[1].rate.p === r.specificity);

  /* This is the claim the panel makes in prose, so it should be a claim the
     code actually keeps: the column rates are properties of the test and do
     not move when the base rate does, while the row rates move a great deal.
     If that ever stopped being true the panel would be lying. */
  const at = (prior) => B.matrix(B.analyse({ prior, sensitivity: 0.99, specificity: 0.99 }));
  const priors = [1e-5, 1e-4, 0.01, 0.1, 0.5, 0.9];
  const cols = priors.map(at).map((x) => [x.cols[0].rate.p, x.cols[1].rate.p]);
  check('the column rates never move with the base rate',
    cols.every(([tpr, tnr]) => tpr === 0.99 && tnr === 0.99));

  const ppvs = priors.map(at).map((x) => x.rows[0].rate.p);
  check('while the row rate moves across two orders of magnitude',
    ppvs[ppvs.length - 1] / ppvs[0] > 100, `${ppvs[0]} -> ${ppvs[ppvs.length - 1]}`);
  check('and rises monotonically with the base rate',
    ppvs.every((p, i) => i === 0 || p > ppvs[i - 1]), ppvs.join(' '));

  check('the matrix works without being handed counts', (() => {
    const m2 = B.matrix(B.analyse({ prior: 0.01, sensitivity: 0.8, specificity: 0.904 }));
    return m2.population > 0 && Object.values(m2.cells).every((c) => Number.isFinite(c.n));
  })());
}

/* ---- Reading a rate ------------------------------------------------------------ */

console.log('\nReading a rate');
{
  const p = (s) => B.parseRate(s).p;
  check('a plain fraction', p('0.0001') === 0.0001);
  check('a percentage', p('1%') === 0.01);
  check('a small percentage', near(p('0.01%'), 0.0001, 1e-12));
  check('one in N', near(p('1 in 10000'), 0.0001, 1e-12));
  check('with separators', near(p('1 in 10,000'), 0.0001, 1e-12));
  check('as a slash', near(p('1/500'), 0.002, 1e-12));
  check('spaces do not matter', near(p('  1 in 4  '), 0.25, 1e-12));

  check('above 100% is refused', B.parseRate('101%').error !== undefined);
  check('a ratio above one is refused', B.parseRate('5 in 4').error !== undefined);
  check('a bare number above one is refused', B.parseRate('5').error !== undefined);
  check('and says how to fix it', /% sign/.test(B.parseRate('5').error));
  check('negative is refused', B.parseRate('-1').error !== undefined);
  check('rubbish is refused', B.parseRate('lots').error !== undefined);
  check('empty is refused', B.parseRate('').error !== undefined);
  check('nothing throws on odd input', (() => {
    for (const s of ['', ' ', 'in', '1 in ', ' in 4', '%', '1 in 0', null, undefined, 42, {}]) {
      try { B.parseRate(s); } catch (e) { return false; }
    }
    return true;
  })());
}

/* ---- The worked examples ship correctly ----------------------------------------- */

console.log('\nBuilt-in examples');
{
  check('there are several', B.EXAMPLES.length >= 4);
  check('each is complete', B.EXAMPLES.every((e) =>
    e.id && e.label && e.note &&
    e.prior >= 0 && e.prior <= 1 &&
    e.sensitivity >= 0 && e.sensitivity <= 1 &&
    e.specificity >= 0 && e.specificity <= 1));
  check('each produces a real answer', B.EXAMPLES.every((e) => {
    const r = B.analyse(e);
    return r.ppv !== null && Number.isFinite(r.ppv);
  }));
  // The set should teach the lesson: mostly surprising, with one counterexample.
  const surprising = B.EXAMPLES.filter((e) => B.analyse(e).mostPositivesWrong).length;
  check('most examples are counter-intuitive', surprising >= 3, String(surprising));
  check('but not all — one shows a test that does work',
    surprising < B.EXAMPLES.length, String(surprising));
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
