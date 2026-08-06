/* ==========================================================================
   Base rates — what a positive result actually means.

   The arithmetic is four lines. The reason the tool exists is that almost
   everyone, including people who know Bayes' theorem, gets the answer wrong by
   an order of magnitude when it is posed as probabilities — and gets it right
   when the same question is posed as counts. So the counts are not a
   supporting illustration here; they are the primary output, and the
   probability is the thing derived from them.

     "A 99% accurate test for something that affects 1 in 10,000."

   Posed that way people say 99%. Posed as "out of 10,000 people, 1 has it and
   the test finds them, and of the 9,999 who do not, the test wrongly flags
   100" the same people say "about 1 in 100" without effort. Same numbers.

   Runs in the browser as a global and under Node for the tests.
   ========================================================================== */

'use strict';

var Bayes = (function () {

  /* ---- Reading a rate -----------------------------------------------------
     People write base rates three ways and all three should work. */

  function parseRate(text) {
    if (typeof text !== 'string') return { error: 'Nothing to read.' };
    // Commas and underscores are thousands separators, not gaps: strip them,
    // then tidy whitespace. Turning "10,000" into "10 000" breaks the number.
    const s = text.replace(/[,_]/g, '').replace(/\s+/g, ' ').trim();
    if (!s) return { error: 'Nothing to read.' };

    // "1 in 10000"
    const inN = s.match(/^([\d.]+)\s*(?:in|\/)\s*([\d.]+)$/i);
    if (inN) {
      const a = Number(inN[1]), b = Number(inN[2]);
      if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return { error: 'That is not a ratio I can read.' };
      const p = a / b;
      return p > 1 ? { error: 'That works out above 100%.' } : { p };
    }

    // "0.01%" or "0.0001"
    const pct = s.endsWith('%');
    const n = Number(pct ? s.slice(0, -1) : s);
    if (!Number.isFinite(n)) return { error: 'That is not a number.' };
    const p = pct ? n / 100 : n;
    if (p < 0) return { error: 'A rate cannot be negative.' };
    if (p > 1) return { error: pct ? 'That is above 100%.' : 'Give a fraction between 0 and 1, or use a % sign.' };
    return { p };
  }

  /* ---- The whole of it ------------------------------------------------------

     prior       how common the thing is
     sensitivity P(flagged | has it)      — how often it catches a real case
     specificity P(not flagged | does not) — how often it leaves the rest alone
  */

  function analyse({ prior, sensitivity, specificity }) {
    const falsePositiveRate = 1 - specificity;

    const truePos = prior * sensitivity;
    const falsePos = (1 - prior) * falsePositiveRate;
    const falseNeg = prior * (1 - sensitivity);
    const trueNeg = (1 - prior) * specificity;

    const flagged = truePos + falsePos;
    const clear = trueNeg + falseNeg;

    return {
      prior, sensitivity, specificity, falsePositiveRate,
      truePos, falsePos, trueNeg, falseNeg,
      flagged, clear,

      /* The answer people get wrong: given a positive, how likely is it real? */
      ppv: flagged === 0 ? null : truePos / flagged,

      /* And the one they rarely ask about, which is often the reassuring one. */
      npv: clear === 0 ? null : trueNeg / clear,

      /* How much a positive result actually moved you. A likelihood ratio of 1
         means the test told you nothing at all. */
      likelihoodRatio: falsePositiveRate === 0 ? Infinity : sensitivity / falsePositiveRate,

      /* Most positives being wrong is the headline finding when it happens. */
      mostPositivesWrong: flagged > 0 && truePos / flagged < 0.5,
    };
  }

  /* ---- Counts ---------------------------------------------------------------
     A population big enough that the interesting group is not a fraction of a
     person. Rounded to a power of ten because "out of 10,000" is a sentence
     someone can hold in their head and "out of 8,391" is not. */

  function populationFor(prior) {
    if (!(prior > 0)) return 10000;
    const needed = 10 / prior;                       // ~10 real cases to talk about
    const magnitude = Math.pow(10, Math.ceil(Math.log10(needed)));
    return Math.min(10000000, Math.max(100, magnitude));
  }

  function counts(result, population) {
    const n = population || populationFor(result.prior);
    const r = (x) => Math.round(x * n);
    return {
      population: n,
      withIt: r(result.prior),
      withoutIt: r(1 - result.prior),
      truePos: r(result.truePos),
      falsePos: r(result.falsePos),
      falseNeg: r(result.falseNeg),
      trueNeg: r(result.trueNeg),
      flagged: r(result.flagged),
    };
  }

  /* The sentence that does the work. Deliberately in counts throughout — the
     moment it becomes a percentage it stops being obvious. */
  function inWords(result, c) {
    const n = c.population.toLocaleString('en-GB');
    if (c.flagged === 0) return `Out of ${n}, nobody is flagged at all.`;

    const one = c.truePos === 1;
    return `Out of ${n} people, ${c.withIt.toLocaleString('en-GB')} ` +
      `${c.withIt === 1 ? 'has' : 'have'} it — the test finds ${c.truePos.toLocaleString('en-GB')} of them. ` +
      `Of the ${c.withoutIt.toLocaleString('en-GB')} who do not, it wrongly flags ` +
      `${c.falsePos.toLocaleString('en-GB')}. So ${c.flagged.toLocaleString('en-GB')} ` +
      `${c.flagged === 1 ? 'person is' : 'people are'} flagged, and ` +
      `${c.truePos.toLocaleString('en-GB')} of them actually ${one ? 'has' : 'have'} it.`;
  }

  /* ---- Worked examples ------------------------------------------------------
     Real published figures where the intuitive answer is badly wrong. */

  const EXAMPLES = [
    { id: 'mammography', label: 'Mammography, age 40',
      prior: 0.01, sensitivity: 0.8, specificity: 0.904,
      note: 'Gigerenzer\'s classic. Most doctors shown these numbers guess around 80%.' },
    { id: 'rare', label: 'A 99% accurate test, 1 in 10,000',
      prior: 0.0001, sensitivity: 0.99, specificity: 0.99,
      note: '"99% accurate" sounds conclusive. It is not, when the thing is rare.' },
    { id: 'screening', label: 'Security alert, 1 in 1,000',
      prior: 0.001, sensitivity: 0.95, specificity: 0.98,
      note: 'Why an alerting system with excellent numbers still drowns you in false alarms.' },
    { id: 'common', label: 'Something common, 1 in 4',
      prior: 0.25, sensitivity: 0.9, specificity: 0.9,
      note: 'When the base rate is high, the same test becomes genuinely informative.' },
  ];

  return { parseRate, analyse, counts, populationFor, inWords, EXAMPLES };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Bayes;
