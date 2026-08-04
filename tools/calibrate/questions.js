/* ==========================================================================
   Question generators for the calibration trainer.

   A calibration question needs one property above all others: exactly one
   defensible answer. "How tall is Everest?" has several published values, and
   an ambiguous answer scored as a miss teaches you to widen your intervals for
   the wrong reason. So questions are *computed* rather than looked up — we
   choose the parameters, so we know the answer exactly.

   Generating rather than curating buys three more things:

     · It cannot be memorised. A fixed bank gets exhausted and then learned, at
       which point the tool measures recall instead of calibration. Randomised
       parameters mean session 40 is as honest as session 1 — which matters,
       because tracking calibration over months is the whole point.
     · Nothing rots. Cities do not move and Titan's gravity does not change.
       A bank of populations would silently start marking correct answers wrong.
     · Difficulty and spread are controllable, which a fixed list is not.

   These questions look like they test whether you remember the density of
   steel. They do not, and that is the point: someone who does not know it
   should give a wide interval and still be right. Not knowing is fine.
   Claiming a precision you have not got is the error being trained out.

   ANATOMY OF A GENERATOR

     id        stable identifier, used for per-round variety limits
     topic     grouping for reporting — physics, astronomy, geography, maths
     quantity  what is being asked for — mass, time, length, speed and so on.
               The answer is always in that quantity's base unit (see
               units.js); which unit it is *shown* in is decided afterwards.
               Deliberately not a fixed unit: "a 3 cm oak sphere" answers
               0.0106 kg, which looks unusable but is 10.6 g, and estimating
               that is a perfectly good exercise. The answer was never the
               problem — the fixed unit was.
     band      [min, max] in base units. Now that units scale, this only has
               to exclude genuinely degenerate questions, not awkward
               magnitudes.
     make      (rng) -> { text, answer }

   Runs in the browser as a global and under Node for the tests.
   ========================================================================== */

'use strict';

var Questions = (function () {

  /* ---- Seeded RNG ---------------------------------------------------------
     Seeded so a session can be reproduced and the tests are deterministic. */

  function rngFrom(seed) {
    let a = seed >>> 0;
    return function next() {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  const rint = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const rnd = (rng, lo, hi) => lo + rng() * (hi - lo);

  /* ---- Reference data -----------------------------------------------------
     Small, and every value is stable. City coordinates because cities do not
     move — populations would have been a mistake.

     Sources: body masses and radii from JPL Solar System Dynamics
     (ssd.jpl.nasa.gov, public domain — note the older NSSDC fact sheets now
     just redirect). Constants are CODATA values; the numbers themselves are
     facts, but NIST's Standard Reference Data *compilation* is copyrighted by
     the Secretary of Commerce, not public domain, so it is not reproduced
     here. Densities and resistivities are standard engineering figures. */

  const G = 6.67430e-11;          // CODATA gravitational constant
  const GM_SUN = 1.32712440018e20;
  const AVOGADRO = 6.02214076e23;
  const C_WATER = 4186;           // J/kg/K

  const MATERIALS = [             // kg/m3
    ['steel', 7850], ['aluminium', 2700], ['lead', 11340], ['gold', 19300],
    ['oak', 750], ['concrete', 2400], ['ice', 917], ['copper', 8960],
    ['titanium', 4500], ['glass', 2500],
  ];

  const RESISTIVITY = [           // ohm-metres at 20 C
    ['copper', 1.68e-8], ['aluminium', 2.65e-8], ['iron', 9.71e-8],
    ['tungsten', 5.60e-8], ['nichrome', 1.10e-6],
  ];

  /* Round bodies only, and no gas giants. A gas giant's "surface" gravity
     depends on which radius you pick and whether rotation is folded in, and an
     irregular lump like Phobos has no single surface gravity at all — both are
     the ambiguity this tool exists to avoid. Small moons are included because
     they are what gives this question any range: Mimas to Earth spans a factor
     of 150, and without the small end the answer is always "about 1 to 10". */
  const BODIES = [                // name, mass kg, mean radius m
    ['Mimas', 3.7493e19, 1.982e5],
    ['Enceladus', 1.0802e20, 2.521e5],
    ['Pallas', 2.04e20, 2.56e5],
    ['Vesta', 2.59076e20, 2.627e5],
    ['Tethys', 6.1745e20, 5.311e5],
    ['Ceres', 9.3835e20, 4.696e5],
    ['Dione', 1.0955e21, 5.614e5],
    ['Charon', 1.586e21, 6.06e5],
    ['Iapetus', 1.8056e21, 7.345e5],
    ['Rhea', 2.3065e21, 7.634e5],
    ['Oberon', 3.076e21, 7.614e5],
    ['Titania', 3.400e21, 7.884e5],
    ['Pluto', 1.303e22, 1.1883e6],
    ['Eris', 1.638e22, 1.163e6],
    ['Triton', 2.139e22, 1.3534e6],
    ['Europa', 4.800e22, 1.5608e6],
    ['the Moon', 7.346e22, 1.7374e6],
    ['Io', 8.932e22, 1.8216e6],
    ['Callisto', 1.0759e23, 2.4103e6],
    ['Titan', 1.3452e23, 2.5747e6],
    ['Ganymede', 1.4819e23, 2.6341e6],
    ['Mercury', 3.301e23, 2.4397e6],
    ['Mars', 6.417e23, 3.3895e6],
    ['Venus', 4.867e24, 6.0518e6],
    ['Earth', 5.97217e24, 6.371e6],
  ];

  const CITIES = [                // name, latitude, longitude
    ['Reykjavík', 64.15, -21.94], ['Nairobi', -1.29, 36.82],
    ['Tokyo', 35.68, 139.69], ['Buenos Aires', -34.60, -58.38],
    ['Cambridge', 52.21, 0.12], ['Perth', -31.95, 115.86],
    ['Vancouver', 49.28, -123.12], ['Mumbai', 19.08, 72.88],
    ['Cairo', 30.04, 31.24], ['Quito', -0.18, -78.47],
    ['Ulaanbaatar', 47.89, 106.91], ['Reykjanesbær', 64.00, -22.56],
    ['Honolulu', 21.31, -157.86], ['Cape Town', -33.92, 18.42],
    ['Helsinki', 60.17, 24.94], ['Lima', -12.05, -77.04],
    ['Anchorage', 61.22, -149.90], ['Auckland', -36.85, 174.76],
  ];

  const ELEMENTS = [              // symbol, name, standard atomic weight
    ['H', 'hydrogen', 1.008], ['C', 'carbon', 12.011], ['O', 'oxygen', 15.999],
    ['Al', 'aluminium', 26.982], ['Fe', 'iron', 55.845], ['Cu', 'copper', 63.546],
    ['Ag', 'silver', 107.868], ['Au', 'gold', 196.967], ['Pb', 'lead', 207.2],
    ['U', 'uranium', 238.029],
  ];

  /* ---- Helpers ----------------------------------------------------------- */

  const haversine = (la1, lo1, la2, lo2) => {
    const R = 6371, r = Math.PI / 180;
    const dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
    const h = Math.sin(dLa / 2) ** 2 +
              Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  const countPrimes = (n) => {
    const sieve = new Uint8Array(n).fill(1);
    sieve[0] = 0; if (n > 1) sieve[1] = 0;
    for (let i = 2; i * i < n; i++) if (sieve[i]) for (let j = i * i; j < n; j += i) sieve[j] = 0;
    let c = 0;
    for (let i = 0; i < n; i++) c += sieve[i];
    return c;
  };

  /* ---- The generators ---------------------------------------------------- */

  const GENERATORS = [
    {
      id: 'sphere-mass', topic: 'physics', quantity: 'mass', band: [1, 2e7],
      make(rng) {
        const [name, rho] = pick(rng, MATERIALS);
        const d = rint(rng, 2, 90) / 100;
        const V = (4 / 3) * Math.PI * (d / 2) ** 3;
        return { text: `A solid ${name} sphere ${Math.round(d * 100)} cm across. What is its mass?`,
                 answer: V * rho * 1000 };            // grams
      },
    },
    {
      id: 'free-fall', topic: 'physics', quantity: 'time', band: [0.05, 200],
      make(rng) {
        // Wide range on purpose: a narrow one makes "about 1 to 30 seconds"
        // a winning answer to every question, which trains nothing.
        const h = pick(rng, [rint(rng, 5, 200) / 100, rint(rng, 2, 90), rint(rng, 100, 40000)]);
        return { text: `In a vacuum, how long does an object take to fall ${h} m?`,
                 answer: Math.sqrt(2 * h / 9.81) };
      },
    },
    {
      id: 'water-heating', topic: 'physics', quantity: 'time', band: [0.2, 2e6],
      make(rng) {
        const P = pick(rng, [5, 40, 300, 1500, 2200, 3000, 9000, 30000]);
        const L = pick(rng, [rint(rng, 5, 90) / 100, rint(rng, 1, 40), rint(rng, 50, 1500)]);
        const dT = rint(rng, 10, 90);
        return { text: `A ${P} W heater warming ${L} litres of water by ${dT} °C, with no losses. How long does it take?`,
                 answer: (L * C_WATER * dT) / P };
      },
    },
    {
      id: 'wire-resistance', topic: 'physics', quantity: 'resistance', band: [1e-3, 1e3],
      make(rng) {
        const [metal, rho] = pick(rng, RESISTIVITY);
        const L = rint(rng, 1, 300);
        const csa = pick(rng, [0.5, 1.0, 1.5, 2.5, 4.0, 6.0]);
        return { text: `${L} m of ${metal} wire with a ${csa} mm² cross-section. What is its resistance at 20 °C?`,
                 answer: rho * L / (csa * 1e-6) };
      },
    },
    {
      id: 'pendulum', topic: 'physics', quantity: 'time', band: [0.05, 60],
      make(rng) {
        const L = pick(rng, [rint(rng, 5, 90) / 1000, rint(rng, 10, 900) / 100, rint(rng, 10, 300)]);
        return { text: `A simple pendulum ${L} m long, on Earth. How long is one full swing (its period)?`,
                 answer: 2 * Math.PI * Math.sqrt(L / 9.81) };
      },
    },
    {
      id: 'braking-distance', topic: 'physics', quantity: 'length', band: [1, 1000],
      make(rng) {
        const [surface, mu] = pick(rng, [['dry asphalt', 0.8], ['wet asphalt', 0.5], ['packed snow', 0.25], ['ice', 0.12]]);
        const kph = rint(rng, 20, 130);
        const v = kph / 3.6;
        return { text: `A car braking hard from ${kph} km/h on ${surface} (friction coefficient ${mu}). How far does it travel before stopping?`,
                 answer: v * v / (2 * mu * 9.81) };
      },
    },
    {
      id: 'rc-constant', topic: 'physics', quantity: 'time', band: [1e-7, 1e3],
      make(rng) {
        const R = pick(rng, [100, 470, 1e3, 4.7e3, 10e3, 47e3, 100e3, 1e6]);
        const C = pick(rng, [1e-9, 10e-9, 100e-9, 1e-6, 10e-6, 100e-6, 1000e-6]);
        const rLabel = R >= 1e6 ? `${R / 1e6} MΩ` : R >= 1e3 ? `${R / 1e3} kΩ` : `${R} Ω`;
        const cLabel = C >= 1e-6 ? `${Math.round(C * 1e6)} µF` : `${Math.round(C * 1e9)} nF`;
        return { text: `An RC circuit with a ${rLabel} resistor and a ${cLabel} capacitor. What is its time constant?`,
                 answer: R * C };
      },
    },
    {
      id: 'surface-gravity', topic: 'astronomy', quantity: 'acceleration', band: [0.02, 30],
      make(rng) {
        const [name, M, R] = pick(rng, BODIES);
        return { text: `What is the surface gravity of ${name}?`, answer: G * M / (R * R) };
      },
    },
    {
      id: 'escape-velocity', topic: 'astronomy', quantity: 'speed', band: [50, 1e5],
      make(rng) {
        const [name, M, R] = pick(rng, BODIES);
        return { text: `What is the escape velocity from the surface of ${name}?`,
                 answer: Math.sqrt(2 * G * M / R) };   // m/s
      },
    },
    {
      id: 'orbital-period', topic: 'astronomy', quantity: 'time', band: [1e6, 1e11],
      make(rng) {
        // Round the parameter *before* computing, never after. A question that
        // says 1.01 AU while its answer came from 1.0148 AU marks a correct
        // estimate wrong — the answer must follow from what is printed.
        const au = Math.round(rnd(rng, 0.2, 40) * 100) / 100;
        const a = au * 1.495978707e11;
        const seconds = 2 * Math.PI * Math.sqrt(a ** 3 / GM_SUN);
        return { text: `A body orbiting the Sun at ${au.toFixed(2)} AU. How long is its year?`,
                 answer: seconds };
      },
    },
    {
      id: 'city-distance', topic: 'geography', quantity: 'length', band: [1e4, 2.1e7],
      make(rng) {
        const a = pick(rng, CITIES);
        let b = pick(rng, CITIES);
        while (b[0] === a[0]) b = pick(rng, CITIES);
        return { text: `What is the great-circle distance from ${a[0]} to ${b[0]}?`,
                 answer: haversine(a[1], a[2], b[1], b[2]) * 1000 };   // metres
      },
    },
    {
      id: 'atoms-in-sample', topic: 'chemistry', quantity: 'count', band: [1e21, 1e26],
      make(rng) {
        const [, name, weight] = pick(rng, ELEMENTS);
        const grams = rint(rng, 1, 500);
        return { text: `How many atoms are in ${grams} g of ${name}?`,
                 answer: (grams / weight) * AVOGADRO };
      },
    },
    {
      id: 'primes-below', topic: 'maths', quantity: 'count', band: [50, 100000],
      make(rng) {
        const n = pick(rng, [500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000]);
        return { text: `How many prime numbers are there below ${n.toLocaleString('en-GB')}?`,
                 answer: countPrimes(n) };
      },
    },
    {
      id: 'factorial-digits', topic: 'maths', quantity: 'count', band: [3, 40000],
      make(rng) {
        const n = pick(rng, [rint(rng, 5, 40), rint(rng, 40, 500), rint(rng, 500, 9000)]);
        let d = 0;
        for (let k = 2; k <= n; k++) d += Math.log10(k);
        return { text: `How many digits are there in ${n}! ?`, answer: Math.floor(d) + 1 };
      },
    },
  ];

  const byId = new Map(GENERATORS.map((g) => [g.id, g]));

  /* ---- Drawing a question ------------------------------------------------

     Resample until the answer lands inside the generator's band. The cap stops
     a badly specified band from spinning forever; it returns the last draw
     rather than throwing, and the tests assert it never actually bites. */

  function draw(gen, rng, tries = 40) {
    let last = null;
    for (let i = 0; i < tries; i++) {
      last = gen.make(rng);
      if (last.answer >= gen.band[0] && last.answer <= gen.band[1]) break;
    }
    return { id: gen.id, topic: gen.topic, quantity: gen.quantity, text: last.text, answer: last.answer };
  }

  /* A round wants variety: not the same generator over and over, and not two
     questions whose answers are so close they are effectively the same
     question. Rejecting on log10 distance catches "Europa 1.32" following
     "Titan 1.35", which a naive random draw produces constantly. */

  function round(n, { seed = 1, generators = GENERATORS, maxPerGenerator, minLogGap = 0.15 } = {}) {
    const rng = rngFrom(seed);
    const perCap = maxPerGenerator || Math.max(1, Math.ceil(n / 4));
    const out = [];
    const used = new Map();

    for (let attempt = 0; attempt < n * 200 && out.length < n; attempt++) {
      const gen = pick(rng, generators);
      if ((used.get(gen.id) || 0) >= perCap) continue;

      const q = draw(gen, rng);
      const clash = out.some((p) =>
        p.id === q.id && Math.abs(Math.log10(p.answer) - Math.log10(q.answer)) < minLogGap);
      if (clash) continue;

      out.push(q);
      used.set(gen.id, (used.get(gen.id) || 0) + 1);
    }
    return out;
  }

  return { GENERATORS, byId, draw, round, rngFrom, countPrimes, haversine };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Questions;
