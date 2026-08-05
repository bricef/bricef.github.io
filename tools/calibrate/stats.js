/* ==========================================================================
   Statistics for the calibration trainer.

   The whole tool turns on one judgement: given k hits out of n intervals, is
   the user actually miscalibrated, or is this just a small sample? Get that
   wrong and the tool commits the exact error it exists to cure — telling
   someone they are overconfident on evidence that does not support it.

   So the verdict comes from an exact one-sided binomial test against the 90%
   target, not from eyeballing the hit rate. 7 hits out of 10 looks alarming —
   70% against a 90% target — but P(X ≤ 7 | n=10, p=0.9) is 0.070, so it is
   entirely ordinary luck and the tool says nothing. 6 out of 10 gives 0.013,
   which is real, and then it speaks.

   Exact rather than a normal approximation because n is small and p is near 1,
   which is precisely where the approximation is worst.
   ========================================================================== */

'use strict';

var Stats = (function () {

  const TARGET = 0.9;      // a 90% interval should contain the truth 90% of the time
  const ALPHA = 0.05;

  /* log n! by summation, memoised. n stays small enough that this beats a
     Lanczos approximation for both accuracy and simplicity. */
  const logFactCache = [0, 0];
  function logFactorial(n) {
    for (let i = logFactCache.length; i <= n; i++) {
      logFactCache[i] = logFactCache[i - 1] + Math.log(i);
    }
    return logFactCache[n];
  }

  const logChoose = (n, k) => logFactorial(n) - logFactorial(k) - logFactorial(n - k);

  function pmf(k, n, p) {
    if (k < 0 || k > n) return 0;
    if (p === 0) return k === 0 ? 1 : 0;
    if (p === 1) return k === n ? 1 : 0;
    return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log1p(-p));
  }

  /* P(X <= k) and P(X >= k) for X ~ Binomial(n, p). */
  function cdfAtMost(k, n, p) {
    let s = 0;
    for (let i = 0; i <= Math.min(k, n); i++) s += pmf(i, n, p);
    return Math.min(1, s);
  }
  function cdfAtLeast(k, n, p) {
    let s = 0;
    for (let i = Math.max(0, k); i <= n; i++) s += pmf(i, n, p);
    return Math.min(1, s);
  }

  /* Wilson score interval — what the hit rate itself could plausibly be. Used
     for the band drawn on screen; the verdict uses the exact test above. Wilson
     rather than the textbook normal interval because the latter produces
     nonsense (bounds beyond 0 or 1) exactly where this tool operates. */
  function wilson(k, n, z = 1.96) {
    if (n === 0) return { lo: 0, hi: 1 };
    const p = k / n;
    const d = 1 + (z * z) / n;
    const centre = (p + (z * z) / (2 * n)) / d;
    const half = (z / d) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
    return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
  }

  /* The verdict. `state` is deliberately 'unknown' until the evidence is
     strong enough — silence is the honest answer for most of a first session. */
  function verdict(k, n, { target = TARGET, alpha = ALPHA } = {}) {
    if (n === 0) return { state: 'none', p: 1, hits: k, n, rate: 0, band: wilson(0, 0) };

    const rate = k / n;
    const pOver = cdfAtMost(k, n, target);     // too few hits => overconfident
    const pUnder = cdfAtLeast(k, n, target);   // too many hits => intervals too wide

    let state = 'unknown';
    if (pOver < alpha) state = 'overconfident';
    else if (pUnder < alpha) state = 'underconfident';
    else if (moreAnswersNeeded(n, { target, alpha }) === 0) state = 'calibrated';

    return { state, p: Math.min(pOver, pUnder), hits: k, n, rate, band: wilson(k, n) };
  }

  /* The largest hit count that would still count as significantly low, or -1
     if no result at this sample size could. */
  function criticalCount(n, target = TARGET, alpha = ALPHA) {
    let crit = -1;
    for (let i = 0; i <= n; i++) {
      if (cdfAtMost(i, n, target) < alpha) crit = i; else break;
    }
    return crit;
  }

  /* Probability that a user who is genuinely off by `effect` gets caught at
     this sample size. */
  function power(n, { target = TARGET, alpha = ALPHA, effect = 0.15 } = {}) {
    const crit = criticalCount(n, target, alpha);
    if (crit < 0) return 0;
    return cdfAtMost(crit, n, target - effect);
  }

  /* "Calibrated" is a claim too, and it needs evidence. Saying it means "if you
     were meaningfully off, I would have noticed" — so it waits until the test
     actually has the power to have noticed. At 20 answers that power is only
     about 0.59: a user whose real coverage is 75% slips through four times in
     ten, so 18 of 20 is a good-looking result that confirms nothing. */
  function moreAnswersNeeded(n, { target = TARGET, alpha = ALPHA, minPower = 0.8 } = {}) {
    if (power(n, { target, alpha }) >= minPower) return 0;
    for (let extra = 1; extra <= 500; extra++) {
      if (power(n + extra, { target, alpha }) >= minPower) return extra;
    }
    return 500;
  }

  /* An interval can always be made to contain the truth by making it absurd.
     Width is the check on that: the ratio of high to low, in orders of
     magnitude, so it can be compared across questions whose answers differ by
     factors of a billion. */
  function spread(answers) {
    const widths = answers
      .filter((a) => a.low > 0 && a.high > 0)
      .map((a) => Math.log10(a.high / a.low))
      .sort((x, y) => x - y);
    if (!widths.length) return null;
    const mid = Math.floor(widths.length / 2);
    return widths.length % 2 ? widths[mid] : (widths[mid - 1] + widths[mid]) / 2;
  }

  const contains = (a) => a.low <= a.truth && a.truth <= a.high;

  return { TARGET, ALPHA, pmf, cdfAtMost, cdfAtLeast, wilson, verdict,
           criticalCount, power, moreAnswersNeeded, spread, contains };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Stats;
