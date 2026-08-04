/* ==========================================================================
   Units for the calibration trainer.

   A generator does not declare a unit — it declares a *quantity*, and answers
   in that quantity's base unit. Everything else follows from there.

   This exists because of a question the generators kept throwing away: "a
   solid oak sphere 3 cm across, what is its mass?" answers 0.0106 kg, which
   looks unusable. It isn't — it's 10.6 g, and estimating it is a perfectly
   good exercise. The answer was never the problem; the fixed unit was.

   WHY THE QUESTION NEVER NAMES A UNIT

   Asking "…in grams?" would give away the magnitude. Knowing an answer is
   quoted in grams rather than tonnes rules out six orders of magnitude before
   you have thought about it at all, and magnitude reasoning is most of what
   this tool is meant to train. So the question asks for a quantity, and the
   answer is entered as a number plus a unit the user picks. Answer in
   whatever unit you think in; it is normalised before it is graded.
   ========================================================================== */

'use strict';

var Units = (function () {

  /* Each quantity lists its units as [name, size in base units], ascending.
     The first entry with size 1 is the base — the unit generators answer in. */
  const QUANTITIES = {
    mass: {
      base: 'g',
      units: [['µg', 1e-6], ['mg', 1e-3], ['g', 1], ['kg', 1e3], ['tonnes', 1e6]],
    },
    length: {
      base: 'm',
      units: [['mm', 1e-3], ['cm', 1e-2], ['m', 1], ['km', 1e3]],
    },
    time: {
      base: 's',
      units: [['µs', 1e-6], ['ms', 1e-3], ['s', 1], ['minutes', 60],
              ['hours', 3600], ['days', 86400], ['years', 31557600]],
    },
    speed: {
      base: 'm/s',
      units: [['m/s', 1], ['km/h', 1 / 3.6], ['km/s', 1000]],
    },
    acceleration: {
      // Deliberately no "g" for Earth gravities: it reads badly next to grams,
      // and every acceleration this tool asks about is legible in m/s².
      base: 'm/s²',
      units: [['m/s²', 1]],
    },
    resistance: {
      base: 'Ω',
      units: [['mΩ', 1e-3], ['Ω', 1], ['kΩ', 1e3], ['MΩ', 1e6]],
    },
    count: {
      base: '',
      units: [['', 1]],
    },
  };

  const unitsFor = (quantity) => (QUANTITIES[quantity] || QUANTITIES.count).units;
  const baseUnit = (quantity) => (QUANTITIES[quantity] || QUANTITIES.count).base;

  /* Pick the unit that shows a value most legibly: the largest one that still
     leaves the number at 1 or above. Only ever used *after* an answer has been
     given — choosing it beforehand would leak the magnitude. */
  function bestUnit(value, quantity) {
    const units = unitsFor(quantity).filter(([, size]) => size > 0);
    const ordered = [...units].sort((a, b) => a[1] - b[1]);
    let chosen = ordered[0];
    for (const u of ordered) if (Math.abs(value) / u[1] >= 1) chosen = u;
    return chosen;
  }

  /* Human-readable rendering of a base-unit value. */
  function format(value, quantity, { sigFigs = 3 } = {}) {
    if (quantity === 'count' || !QUANTITIES[quantity]) {
      if (Number.isInteger(value) && Math.abs(value) < 1e15) return value.toLocaleString('en-GB');
      return value.toExponential(Math.max(0, sigFigs - 1));
    }
    const [name, size] = bestUnit(value, quantity);
    const scaled = value / size;

    // Significant figures, not decimal places. Fixed decimals silently drop
    // precision on small values — 0.0637 m/s² rendered as "0.06" is a 6%
    // error, and a displayed answer must read back as the value it came from.
    let shown;
    if (Math.abs(scaled) >= 1e6 || (Math.abs(scaled) < 1e-3 && scaled !== 0)) {
      shown = scaled.toExponential(Math.max(0, sigFigs - 1));
    } else {
      const decimals = Math.min(20, Math.max(0, sigFigs - 1 - Math.floor(Math.log10(Math.abs(scaled)))));
      shown = scaled.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
    }
    return name ? `${shown} ${name}` : shown;
  }

  /* Convert a value the user entered in `unitName` into base units. */
  function toBase(value, quantity, unitName) {
    const match = unitsFor(quantity).find(([n]) => n === unitName);
    return match ? value * match[1] : null;
  }

  /* Parse free text: "10.6 g", "1.06e-2 kg", "0.0106" (with a fallback unit).
     Returns the value in base units, or null if it cannot be read. */
  function parse(text, quantity, fallbackUnit) {
    if (typeof text !== 'string') return null;
    const s = text.trim().replace(/,/g, '');
    if (!s) return null;

    const m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(.*)$/);
    if (!m) return null;

    const value = Number(m[1]);
    if (!Number.isFinite(value)) return null;

    const suffix = m[2].trim();
    if (!suffix) {
      if (quantity === 'count' || !QUANTITIES[quantity]) return value;
      return fallbackUnit ? toBase(value, quantity, fallbackUnit) : null;
    }
    // Accept a few spellings people actually type.
    const alias = { u: 'µ', micro: 'µ', ohm: 'Ω', ohms: 'Ω', sec: 's', secs: 's',
                    second: 's', seconds: 's', minute: 'minutes', min: 'minutes',
                    mins: 'minutes', hour: 'hours', hr: 'hours', hrs: 'hours',
                    day: 'days', year: 'years', yr: 'years', yrs: 'years',
                    tonne: 'tonnes', t: 'tonnes', gram: 'g', grams: 'g',
                    kilogram: 'kg', kilograms: 'kg', metre: 'm', metres: 'm',
                    meter: 'm', meters: 'm', kilometre: 'km', kilometres: 'km' };
    const normalised = alias[suffix.toLowerCase()] || suffix.replace(/^u(?=[sgm])/, 'µ');

    const hit = unitsFor(quantity).find(([n]) => n === normalised || n.toLowerCase() === normalised.toLowerCase());
    return hit ? value * hit[1] : null;
  }

  return { QUANTITIES, unitsFor, baseUnit, bestUnit, format, toBase, parse };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Units;
