/* ==========================================================================
   Queueing — how many workers, and what happens as you load them up.

   Little's Law is the easy half and everyone gets it right: to finish 40 tasks
   an hour at 90 seconds each you need one worker's worth of work per worker,
   so you need one. The half that changes decisions is what happens *near* that
   number, and almost nobody's intuition has it:

     50% utilisation  waiting is a fraction of the work itself
     80% utilisation  waiting already exceeds the work itself
     90% utilisation  waiting is several times the work
     95% utilisation  waiting is an order of magnitude more
     100%             the queue never drains, whatever the average says

   The curve is not gentle and then steep. It is a hyperbola, and the knee
   arrives far earlier than a spreadsheet suggests. Sizing a fleet to "about
   full" is sizing it to fall over.

   The model is M/M/c: Poisson arrivals, exponential service, c identical
   workers, one queue. It is wrong in the details of any real system — real
   arrivals are burstier and real service times are not exponential, both of
   which make waiting *worse* — so treat it as an optimistic bound rather than
   a forecast. That is still far more useful than dividing throughput by rate.

   Runs in the browser as a global and under Node for the tests.
   ========================================================================== */

'use strict';

var Queue = (function () {

  /* Erlang C: the probability an arrival has to wait at all.

     Computed through the Erlang B recursion rather than from the textbook
     formula. Written directly, Erlang C needs a^c/c!, and that term peaks
     around e^a — which overflows a double somewhere past a few hundred
     servers and quietly returns NaN rather than failing loudly. B stays inside
     [0, 1] at every step by construction, so it cannot overflow at any size:

         B(0, a) = 1
         B(k, a) = a·B(k-1, a) / (k + a·B(k-1, a))
         C(c, a) = B(c, a) / (1 − ρ + ρ·B(c, a)),   ρ = a/c
  */
  function erlangC(servers, offeredLoad) {
    const c = Math.round(servers), a = offeredLoad;
    if (!(c > 0) || !(a >= 0)) return NaN;
    if (a >= c) return 1;                     // saturated: everyone waits

    let b = 1;
    for (let k = 1; k <= c; k++) b = (a * b) / (k + a * b);

    const rho = a / c;
    return b / (1 - rho + rho * b);
  }

  /* Everything else follows from that.

     arrivalRate  tasks per second
     serviceTime  seconds of work per task
     servers      how many run at once
  */
  function analyse({ arrivalRate, serviceTime, servers }) {
    const c = Math.round(servers);
    const mu = serviceTime > 0 ? 1 / serviceTime : Infinity;
    const offered = arrivalRate * serviceTime;        // "erlangs" of work
    const utilisation = c > 0 ? offered / c : Infinity;

    const stable = utilisation < 1 && Number.isFinite(utilisation);

    if (!stable) {
      return {
        servers: c, arrivalRate, serviceTime, mu, offered, utilisation,
        stable: false,
        // Everything below is infinite in the limit; reporting a number would
        // be worse than reporting none.
        probWait: 1, waitTime: Infinity, systemTime: Infinity,
        queueLength: Infinity, inSystem: Infinity,
        minServers: minServersFor(arrivalRate, serviceTime),
      };
    }

    const probWait = erlangC(c, offered);
    const waitTime = probWait / (c * mu - arrivalRate);
    const systemTime = waitTime + serviceTime;

    return {
      servers: c, arrivalRate, serviceTime, mu, offered, utilisation,
      stable: true,
      probWait,
      waitTime,                                  // queueing before starting
      systemTime,                                // total time from arrival to done
      queueLength: arrivalRate * waitTime,       // Little's Law on the queue
      inSystem: arrivalRate * systemTime,        // and on the whole system
      /* The ratio that makes the point: waiting, measured in units of the work
         itself. Above 1, more of the time is spent waiting than working. */
      waitRatio: serviceTime > 0 ? waitTime / serviceTime : Infinity,
      minServers: minServersFor(arrivalRate, serviceTime),
    };
  }

  /* The floor: below this the queue grows without bound no matter how long you
     wait. Strictly greater than the offered load, never equal to it. */
  function minServersFor(arrivalRate, serviceTime) {
    const offered = arrivalRate * serviceTime;
    if (!(offered > 0)) return 1;
    return Math.floor(offered) + 1;
  }

  /* How many workers to keep the wait under a target. Answered by walking up
     from the stability floor, which is a handful of iterations and exact,
     rather than by inverting Erlang C, which is not closed-form. */
  function serversForWait({ arrivalRate, serviceTime, targetWait, max = 10000 }) {
    // No finite number of workers makes the wait exactly zero — something
    // always arrives while something else is in progress. Worth returning
    // early rather than walking ten thousand server counts to find that out.
    if (!(targetWait > 0)) return arrivalRate > 0 ? null : minServersFor(arrivalRate, serviceTime);

    let c = minServersFor(arrivalRate, serviceTime);
    for (; c <= max; c++) {
      const r = analyse({ arrivalRate, serviceTime, servers: c });
      if (r.stable && r.waitTime <= targetWait) return c;
    }
    return null;
  }

  /* The curve. Wait time against utilisation at a fixed server count, which is
     the shape worth seeing — it is a hyperbola, not a ramp. */
  function curve({ serviceTime, servers, points = 60, upTo = 0.99 }) {
    const c = Math.round(servers);
    const out = [];
    for (let i = 1; i <= points; i++) {
      const u = (upTo * i) / points;
      const arrivalRate = (u * c) / serviceTime;
      const r = analyse({ arrivalRate, serviceTime, servers: c });
      out.push({ utilisation: u, arrivalRate, waitTime: r.waitTime, waitRatio: r.waitRatio });
    }
    return out;
  }

  /* ---- Saying something useful ---------------------------------------------- */

  function notes(r) {
    const out = [];
    if (!r.stable) {
      out.push({ kind: 'alarm', text:
        `This never catches up. The work arriving needs ${r.offered.toFixed(2)} workers' ` +
        `worth of capacity and there ${r.servers === 1 ? 'is' : 'are'} ${r.servers}, so the ` +
        `queue grows for as long as the load lasts. You need at least ${r.minServers}.` });
      return out;
    }

    if (r.utilisation >= 0.9) {
      out.push({ kind: 'alarm', text:
        `At ${Math.round(r.utilisation * 100)}% utilisation, waiting is ${fmtRatio(r.waitRatio)} ` +
        'the work itself. This is past the knee: a small increase in load, or one worker ' +
        'going away, moves the wait a long way. Size for the peak, not the average.' });
    } else if (r.utilisation >= 0.8) {
      out.push({ kind: 'warn', text:
        `At ${Math.round(r.utilisation * 100)}% utilisation you are approaching the knee. ` +
        'Waiting already accounts for more of the total time than the work does.' });
    } else if (r.utilisation < 0.3 && r.servers > 1) {
      out.push({ kind: 'note', text:
        `At ${Math.round(r.utilisation * 100)}% utilisation there is plenty of headroom — ` +
        'and plenty of idle capacity, if that costs you anything.' });
    }

    if (r.servers === 1 && r.utilisation < 0.9) {
      out.push({ kind: 'note', text:
        'With a single worker there is no pooling. Two workers at half the load each wait ' +
        'far less than one worker at the same total load, because a free worker can take ' +
        'whatever arrives.' });
    }

    out.push({ kind: 'note', text:
      'M/M/c assumes arrivals are Poisson and service times exponential. Real traffic is ' +
      'burstier and real work is more variable, and both make waiting worse — so read these ' +
      'as an optimistic bound rather than a forecast.' });

    return out;
  }

  const fmtRatio = (x) =>
    x < 0.1 ? 'a small fraction of' :
    x < 1 ? `${x.toFixed(1)}× ` + 'of' :
    `${x < 10 ? x.toFixed(1) : Math.round(x)}×`;

  return { erlangC, analyse, minServersFor, serversForWait, curve, notes };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Queue;
