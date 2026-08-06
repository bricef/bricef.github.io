/* ==========================================================================
   Tests for the queueing arithmetic.  node queue.test.js

   Erlang C is checked against published values and against the M/M/1 closed
   form, which it must reduce to exactly when there is one server. The rest
   checks the properties that make the tool worth having: that the curve really
   does bend where it is claimed to, and that an unstable configuration is
   reported as unstable rather than given a plausible-looking number.
   ========================================================================== */

'use strict';

const Q = require('./queue.js');

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ---- Erlang C against known values ------------------------------------------ */

console.log('\nErlang C');
{
  // One server reduces to M/M/1, where the probability of waiting is exactly
  // the utilisation. Any implementation error shows up here immediately.
  for (const rho of [0.1, 0.5, 0.8, 0.95]) {
    if (!near(Q.erlangC(1, rho), rho, 1e-12)) {
      check(`one server at ρ=${rho} gives P(wait)=ρ`, false, String(Q.erlangC(1, rho)));
    }
  }
  check('one server reduces exactly to M/M/1', true);

  // Published Erlang C values.
  check('C(2, 1.0) = 0.3333', near(Q.erlangC(2, 1.0), 1 / 3, 1e-9), Q.erlangC(2, 1).toFixed(6));
  check('C(3, 2.0) = 0.4444', near(Q.erlangC(3, 2.0), 4 / 9, 1e-9), Q.erlangC(3, 2).toFixed(6));
  check('C(10, 5.0) ≈ 0.03610', near(Q.erlangC(10, 5), 0.036098, 1e-5), Q.erlangC(10, 5).toFixed(6));

  check('a saturated system always waits', Q.erlangC(2, 2) === 1);
  check('an over-saturated system always waits', Q.erlangC(2, 5) === 1);
  check('no load means no waiting', Q.erlangC(4, 0) === 0);
  check('more servers at the same load means less waiting',
    Q.erlangC(6, 4) < Q.erlangC(5, 4) && Q.erlangC(5, 4) < Q.erlangC(4.0001, 4));

  // The reason for the iterative form: factorials overflow long before this.
  const big = Q.erlangC(400, 380);
  check('a large server count does not overflow to NaN',
    Number.isFinite(big) && big > 0 && big < 1, String(big));
  check('and a very large one still works', Number.isFinite(Q.erlangC(1500, 1400)));
}

/* ---- Little's Law and the basics ---------------------------------------------- */

console.log('\nThe easy half');
{
  // 40 tasks/hour at 90s each: 1.0 workers' worth of work.
  const r = Q.analyse({ arrivalRate: 40 / 3600, serviceTime: 90, servers: 2 });
  check('offered load is arrival rate times service time', near(r.offered, 1, 1e-9),
    String(r.offered));
  check('utilisation is that over the server count', near(r.utilisation, 0.5, 1e-9));
  check('two workers is stable', r.stable === true);
  check('queue length obeys Little\'s Law',
    near(r.queueLength, r.arrivalRate * r.waitTime, 1e-12));
  check('and so does the whole system',
    near(r.inSystem, r.arrivalRate * r.systemTime, 1e-12));
  check('total time is waiting plus working',
    near(r.systemTime, r.waitTime + r.serviceTime, 1e-12));
}

/* ---- The half that matters ----------------------------------------------------- */

console.log('\nThe knee');
{
  // Single worker, one-second tasks: wait/service ratio is ρ/(1-ρ) exactly.
  const at = (u) => Q.analyse({ arrivalRate: u, serviceTime: 1, servers: 1 });

  check('at 50% you wait about as long as the work takes',
    near(at(0.5).waitRatio, 1, 1e-9), at(0.5).waitRatio.toFixed(3));
  check('at 80% you wait four times the work',
    near(at(0.8).waitRatio, 4, 1e-9), at(0.8).waitRatio.toFixed(3));
  check('at 90% you wait nine times the work',
    near(at(0.9).waitRatio, 9, 1e-9), at(0.9).waitRatio.toFixed(3));
  check('at 95% you wait nineteen times the work',
    near(at(0.95).waitRatio, 19, 1e-8), at(0.95).waitRatio.toFixed(3));

  // The claim the tool makes in prose, verified.
  check('the wait more than doubles between 80% and 90%',
    at(0.9).waitTime > 2 * at(0.8).waitTime);
  check('and more than doubles again by 95%',
    at(0.95).waitTime > 2 * at(0.9).waitTime);

  check('waiting rises monotonically with load', (() => {
    let last = -1;
    for (let u = 0.05; u < 1; u += 0.05) {
      const w = at(u).waitTime;
      if (!(w > last)) return false;
      last = w;
    }
    return true;
  })());

  // Pooling: two half-loaded workers beat one fully-loaded one.
  const pooled = Q.analyse({ arrivalRate: 1.6, serviceTime: 1, servers: 2 });
  const single = Q.analyse({ arrivalRate: 0.8, serviceTime: 1, servers: 1 });
  check('two pooled workers wait less than one at the same utilisation',
    pooled.waitTime < single.waitTime,
    `${pooled.waitTime.toFixed(3)} vs ${single.waitTime.toFixed(3)}`);
  check('even though utilisation is identical',
    near(pooled.utilisation, single.utilisation, 1e-12));
}

/* ---- Instability is reported, not papered over ----------------------------------- */

console.log('\nWhen it never catches up');
{
  const over = Q.analyse({ arrivalRate: 2, serviceTime: 1, servers: 1 });
  check('an overloaded system is flagged unstable', over.stable === false);
  check('and its wait is infinite rather than a plausible number',
    over.waitTime === Infinity, String(over.waitTime));
  check('the queue is infinite too', over.queueLength === Infinity);
  check('and it says how many servers it would need', over.minServers === 3, String(over.minServers));

  const exactly = Q.analyse({ arrivalRate: 1, serviceTime: 1, servers: 1 });
  check('exactly saturated is also unstable', exactly.stable === false);
  check('because the floor is strictly above the load',
    Q.minServersFor(1, 1) === 2, String(Q.minServersFor(1, 1)));
  check('a fractional load rounds up', Q.minServersFor(0.5, 1) === 1);
  check('and 2.3 workers of load needs 3', Q.minServersFor(2.3, 1) === 3);

  const notes = Q.notes(over);
  check('the instability is the first thing said', notes[0].kind === 'alarm');
  check('and it names the shortfall', /at least 3/.test(notes[0].text), notes[0].text);
}

/* ---- Sizing ---------------------------------------------------------------------- */

console.log('\nSizing for a target');
{
  const c = Q.serversForWait({ arrivalRate: 10, serviceTime: 1, targetWait: 0.1 });
  check('it finds a server count that meets the target', c !== null && c >= 11, String(c));
  const got = Q.analyse({ arrivalRate: 10, serviceTime: 1, servers: c });
  check('and that count really does meet it', got.waitTime <= 0.1, got.waitTime.toFixed(4));
  const oneFewer = Q.analyse({ arrivalRate: 10, serviceTime: 1, servers: c - 1 });
  check('while one fewer does not', !oneFewer.stable || oneFewer.waitTime > 0.1,
    oneFewer.waitTime.toFixed(4));

  check('a target of zero is unreachable', Q.serversForWait({
    arrivalRate: 10, serviceTime: 1, targetWait: 0, max: 50 }) === null);
  check('a generous target needs only the stability floor',
    Q.serversForWait({ arrivalRate: 1, serviceTime: 1, targetWait: 1000 }) === 2);
}

/* ---- The curve ------------------------------------------------------------------- */

console.log('\nThe curve');
{
  const pts = Q.curve({ serviceTime: 1, servers: 4, points: 40 });
  check('it returns the requested number of points', pts.length === 40);
  check('utilisation rises across it', pts[0].utilisation < pts[39].utilisation);
  check('every point is stable and finite',
    pts.every((p) => Number.isFinite(p.waitTime) && p.waitTime >= 0));
  check('waiting rises monotonically', pts.every((p, i) => i === 0 || p.waitTime >= pts[i - 1].waitTime));
  check('and the last point is far above the first',
    pts[39].waitTime > 50 * pts[0].waitTime,
    `${pts[0].waitTime.toExponential(2)} → ${pts[39].waitTime.toExponential(2)}`);
}

/* ---- Robustness -------------------------------------------------------------------- */

console.log('\nRobustness');
{
  check('nothing throws on odd input', (() => {
    const cases = [
      { arrivalRate: 0, serviceTime: 1, servers: 1 },
      { arrivalRate: 1, serviceTime: 0, servers: 1 },
      { arrivalRate: 1, serviceTime: 1, servers: 0 },
      { arrivalRate: -1, serviceTime: 1, servers: 1 },
      { arrivalRate: 1, serviceTime: 1, servers: 1e6 },
      { arrivalRate: NaN, serviceTime: 1, servers: 1 },
    ];
    for (const c of cases) {
      try { const r = Q.analyse(c); Q.notes(r); } catch (e) { console.log('    threw:', JSON.stringify(c), e.message); return false; }
    }
    return true;
  })());

  const idle = Q.analyse({ arrivalRate: 0, serviceTime: 1, servers: 1 });
  check('no arrivals means no waiting', idle.waitTime === 0, String(idle.waitTime));
  check('and it is stable', idle.stable === true);

  check('zero servers is unstable rather than a divide by zero',
    Q.analyse({ arrivalRate: 1, serviceTime: 1, servers: 0 }).stable === false);
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
