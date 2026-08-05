/* ==========================================================================
   Cron expressions: parse, explain, and work out when they next fire.

   Everything here is deliberate about two things most cron tools get wrong.

   THE DAY-OF-MONTH / DAY-OF-WEEK RULE
   When both the day-of-month and day-of-week fields are restricted, Vixie cron
   fires when *either* matches, not both. So `0 0 13 * 5` is not "Friday the
   13th" — it is every 13th and also every Friday. This is the single most
   surprising thing about cron and the reason a lot of jobs run far more often
   than intended, so it is called out explicitly rather than left implicit in
   the schedule.

   TIME ZONES AND DAYLIGHT SAVING
   Cron matches wall-clock fields in whatever zone the daemon runs in, which is
   usually UTC on a server and almost never the zone of the person reading the
   expression. So a zone is required, not assumed, and firing times are found
   by walking local wall-clock fields and mapping each match to an instant —
   which means a daily 02:30 job correctly has no firing on the day the clocks
   go forward, and that is reported rather than silently skipped.

   Runs in the browser as a global and under Node for the tests.
   ========================================================================== */

'use strict';

var Cron = (function () {

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                       'August', 'September', 'October', 'November', 'December'];

  const SHORTCUTS = {
    '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *',
    '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *', '@midnight': '0 0 * * *',
    '@hourly': '0 * * * *',
  };

  /* Field order for the 5-field form; a 6-field expression prepends seconds. */
  const FIELDS = [
    { key: 'minutes', label: 'minute', min: 0, max: 59 },
    { key: 'hours', label: 'hour', min: 0, max: 23 },
    { key: 'dom', label: 'day of month', min: 1, max: 31 },
    { key: 'months', label: 'month', min: 1, max: 12, names: MONTHS, nameBase: 1 },
    { key: 'dow', label: 'day of week', min: 0, max: 7, names: DAYS, nameBase: 0 },
  ];
  const SECONDS_FIELD = { key: 'seconds', label: 'second', min: 0, max: 59 };

  /* ---- Parsing ---------------------------------------------------------- */

  const fail = (error, field, hint) => ({ ok: false, error, field, hint });

  function parseField(text, spec) {
    const values = new Set();
    const restricted = text.trim() !== '*';

    for (const rawTerm of text.split(',')) {
      const term = rawTerm.trim();
      if (!term) return { error: `Empty entry in the ${spec.label} field.` };

      const [rangePart, stepPart, ...extra] = term.split('/');
      if (extra.length) return { error: `Too many "/" in "${term}".` };

      let step = 1;
      if (stepPart !== undefined) {
        if (!/^\d+$/.test(stepPart)) return { error: `"${stepPart}" is not a step in "${term}".` };
        step = Number(stepPart);
        if (step < 1) return { error: `A step of ${step} in the ${spec.label} field never fires.` };
      }

      let lo, hi;
      if (rangePart === '*') {
        lo = spec.min; hi = spec.max;
      } else {
        const bounds = rangePart.split('-');
        if (bounds.length > 2) return { error: `"${rangePart}" has too many dashes.` };
        const readOne = (t) => {
          const s = t.trim().toLowerCase();
          if (spec.names) {
            const i = spec.names.indexOf(s.slice(0, 3));
            if (i >= 0) return i + spec.nameBase;
          }
          if (!/^\d+$/.test(s)) return null;
          return Number(s);
        };
        lo = readOne(bounds[0]);
        if (lo === null) return { error: `"${bounds[0]}" is not a valid ${spec.label}.` };
        hi = bounds.length === 2 ? readOne(bounds[1]) : lo;
        if (hi === null) return { error: `"${bounds[1]}" is not a valid ${spec.label}.` };
        // "5/10" means "from 5 onwards, every 10" in Vixie cron.
        if (bounds.length === 1 && stepPart !== undefined) hi = spec.max;
      }

      if (lo < spec.min || lo > spec.max) {
        return { error: `${lo} is out of range for the ${spec.label} field (${spec.min}–${spec.max}).` };
      }
      if (hi < spec.min || hi > spec.max) {
        return { error: `${hi} is out of range for the ${spec.label} field (${spec.min}–${spec.max}).` };
      }
      if (lo > hi) {
        return { error: `The range ${lo}–${hi} in the ${spec.label} field runs backwards.` };
      }

      for (let v = lo; v <= hi; v += step) values.add(v);
    }

    return { values, restricted };
  }

  function parse(input) {
    if (typeof input !== 'string') return fail('Nothing to read.');
    let text = input.trim().replace(/\s+/g, ' ');
    if (!text) return fail('Nothing to read.');

    let shortcut = null;
    if (text.startsWith('@')) {
      const key = text.toLowerCase();
      if (key === '@reboot') {
        return { ok: true, reboot: true, shortcut: '@reboot', source: input.trim() };
      }
      if (!SHORTCUTS[key]) {
        return fail(`"${text}" is not a recognised shortcut.`, -1,
          'Try @yearly, @monthly, @weekly, @daily, @hourly or @reboot.');
      }
      shortcut = key;
      text = SHORTCUTS[key];
    }

    const parts = text.split(' ');
    const hasSeconds = parts.length === 6;
    if (parts.length !== 5 && parts.length !== 6) {
      return fail(
        `Expected 5 fields (or 6 with seconds), found ${parts.length}.`, -1,
        'The order is minute hour day-of-month month day-of-week.');
    }

    const layout = hasSeconds ? [SECONDS_FIELD, ...FIELDS] : FIELDS;
    const spec = { hasSeconds, shortcut, source: input.trim(), fields: {} };

    for (let i = 0; i < layout.length; i++) {
      const got = parseField(parts[i], layout[i]);
      if (got.error) return fail(got.error, i);
      spec.fields[layout[i].key] = got.values;
      spec[layout[i].key + 'Restricted'] = got.restricted;
      spec[layout[i].key + 'Text'] = parts[i];
    }
    if (!hasSeconds) spec.fields.seconds = new Set([0]);

    // Sunday is both 0 and 7; normalise so matching only has to check one.
    if (spec.fields.dow.has(7)) { spec.fields.dow.delete(7); spec.fields.dow.add(0); }

    spec.ok = true;
    spec.layout = layout;
    return spec;
  }

  /* ---- Time zones -------------------------------------------------------
     Enough zone handling to be correct across daylight saving, without a
     library: read a zone's offset at an instant via Intl, then invert. */

  function offsetMs(ts, zone) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(ts));
    const get = (t) => Number(parts.find((p) => p.type === t).value);
    const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'),
                           get('hour') % 24, get('minute'), get('second'));
    return asUTC - ts;
  }

  function localParts(ts, zone) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    }).formatToParts(new Date(ts));
    const get = (t) => parts.find((p) => p.type === t).value;
    return {
      year: +get('year'), month: +get('month'), day: +get('day'),
      hour: +get('hour') % 24, minute: +get('minute'), second: +get('second'),
      dow: DAYS.indexOf(get('weekday').slice(0, 3).toLowerCase()),
    };
  }

  /* Wall-clock fields to an instant. Returns null when that local time does
     not exist — the hour skipped when the clocks go forward. */
  function toInstant(p, zone) {
    const naive = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second || 0);
    let ts = naive - offsetMs(naive, zone);
    const off = offsetMs(ts, zone);
    if (naive - off !== ts) ts = naive - off;

    const back = localParts(ts, zone);
    const same = back.year === p.year && back.month === p.month && back.day === p.day &&
                 back.hour === p.hour && back.minute === p.minute;
    return same ? ts : null;
  }

  /* ---- Matching ---------------------------------------------------------- */

  /* The rule that catches everyone: with both day fields restricted, either
     matching is enough. With only one restricted, only that one applies. */
  function dayMatches(spec, p) {
    const domOk = spec.fields.dom.has(p.day);
    const dowOk = spec.fields.dow.has(p.dow);
    if (spec.domRestricted && spec.dowRestricted) return domOk || dowOk;
    if (spec.domRestricted) return domOk;
    if (spec.dowRestricted) return dowOk;
    return true;
  }

  const matches = (spec, p) =>
    spec.fields.months.has(p.month) && dayMatches(spec, p) &&
    spec.fields.hours.has(p.hour) && spec.fields.minutes.has(p.minute);

  const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

  /* ---- Next firings ------------------------------------------------------
     Walks wall-clock fields rather than instants, so daylight saving is a
     property of the final mapping instead of something to correct for. */

  function next(spec, { from, zone, count = 10, horizonYears = 8 } = {}) {
    if (!spec || !spec.ok || spec.reboot) return [];

    const out = [];
    const skipped = [];
    const start = localParts(from, zone);

    let { year, month, day, hour, minute } = start;
    minute += 1;                       // strictly after `from`
    const limitYear = start.year + horizonYears;

    const bump = (unit) => {
      if (unit === 'minute') { minute++; }
      if (unit === 'hour') { hour++; minute = 0; }
      if (unit === 'day') { day++; hour = 0; minute = 0; }
      if (unit === 'month') { month++; day = 1; hour = 0; minute = 0; }
      while (minute > 59) { minute -= 60; hour++; }
      while (hour > 23) { hour -= 24; day++; }
      while (day > daysInMonth(year, month)) { day -= daysInMonth(year, month); month++; }
      while (month > 12) { month -= 12; year++; }
    };

    let guard = 0;
    while (out.length < count && year <= limitYear && guard++ < 5_000_000) {
      if (!spec.fields.months.has(month)) { bump('month'); continue; }

      const probe = { year, month, day, hour, minute, second: 0 };
      // Day-of-week needs a real date, and the date is zone-independent here.
      probe.dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

      if (!dayMatches(spec, probe)) { bump('day'); continue; }
      if (!spec.fields.hours.has(hour)) { bump('hour'); continue; }
      if (!spec.fields.minutes.has(minute)) { bump('minute'); continue; }

      const ts = toInstant(probe, zone);
      if (ts === null) {
        skipped.push({ ...probe });     // does not exist: clocks went forward
      } else {
        out.push({ ts, local: { ...probe } });
      }
      bump('minute');
    }

    out.skipped = skipped;
    return out;
  }

  /* ---- Plain English ----------------------------------------------------- */

  const pad = (n) => String(n).padStart(2, '0');

  /* Describe one field as a phrase, recognising the shapes people actually
     write rather than listing every value. */
  function phrase(values, spec, { unit, everyWord = 'every' } = {}) {
    const all = spec.max - spec.min + 1;
    const list = [...values].sort((a, b) => a - b);
    if (list.length === all) return `${everyWord} ${unit}`;

    // Month and weekday names describe themselves; "on day Friday" and "in
    // month January" are what happens if you prefix them anyway.
    const named = spec.key === 'dow' || spec.key === 'months';
    const pre = (s) => (named ? s : `${unit}s ${s}`);

    // An even step starting at the minimum reads as "every N" — but never for
    // named fields, where "Mon, Wed, Fri" is an even step of 2 and "every 2
    // days from Monday" is both uglier and wrong, since it does not wrap.
    if (list.length > 2 && !named) {
      const gap = list[1] - list[0];
      const even = list.every((v, i) => i === 0 || v - list[i - 1] === gap);
      if (even && list[0] === spec.min && list[list.length - 1] + gap > spec.max) {
        return `${everyWord} ${gap} ${unit}s`;
      }
      if (even && gap > 1) {
        return `${everyWord} ${gap} ${unit}s from ${label(list[0], spec)}`;
      }
    }

    const contiguous = list.every((v, i) => i === 0 || v - list[i - 1] === 1);
    if (contiguous && list.length > 2) {
      return pre(`${label(list[0], spec)} to ${label(list[list.length - 1], spec)}`);
    }

    const names = list.map((v) => label(v, spec));
    if (names.length === 1) return named ? names[0] : `${unit} ${names[0]}`;
    return pre(`${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
  }

  function label(v, spec) {
    if (spec.key === 'months') return MONTH_NAMES[v - 1];
    if (spec.key === 'dow') return DAY_NAMES[v % 7];
    return String(v);
  }

  function describe(spec) {
    if (!spec || !spec.ok) return '';
    if (spec.reboot) return 'Once, when the machine boots. Nothing else triggers it.';

    const f = spec.fields;
    const minuteSpec = FIELDS[0], hourSpec = FIELDS[1], domSpec = FIELDS[2],
          monthSpec = FIELDS[3], dowSpec = FIELDS[4];

    // Times of day are far more readable as clock times than as two fields.
    let when;
    const everyMinute = f.minutes.size === 60;
    const everyHour = f.hours.size === 24;

    if (everyMinute && everyHour) {
      when = 'Every minute';
    } else if (f.minutes.size === 1 && f.hours.size === 1) {
      when = `At ${pad([...f.hours][0])}:${pad([...f.minutes][0])}`;
    } else if (f.minutes.size === 1 && everyHour) {
      when = `At ${[...f.minutes][0]} minutes past every hour`;
    } else if (f.minutes.size === 1 && f.hours.size <= 4) {
      // A handful of fixed times reads far better as clock times than as
      // "0 minutes past hours 9, 12 and 17".
      const m = [...f.minutes][0];
      const times = [...f.hours].sort((a, b) => a - b).map((h) => `${pad(h)}:${pad(m)}`);
      when = `At ${times.slice(0, -1).join(', ')} and ${times[times.length - 1]}`;
    } else if (f.minutes.size === 1) {
      when = `At ${[...f.minutes][0]} minutes past ${phrase(f.hours, hourSpec, { unit: 'hour' })}`;
    } else if (everyMinute) {
      when = `Every minute of ${phrase(f.hours, hourSpec, { unit: 'hour' })}`;
    } else {
      when = `At ${phrase(f.minutes, minuteSpec, { unit: 'minute' })} of ` +
             `${phrase(f.hours, hourSpec, { unit: 'hour' })}`;
    }

    const bits = [when];

    if (spec.domRestricted && spec.dowRestricted) {
      bits.push(`on ${phrase(f.dom, domSpec, { unit: 'day' })} of the month, ` +
                `and also every ${phrase(f.dow, dowSpec, { unit: 'day' })}`);
    } else if (spec.domRestricted) {
      bits.push(`on ${phrase(f.dom, domSpec, { unit: 'day' })} of the month`);
    } else if (spec.dowRestricted) {
      bits.push(`on ${phrase(f.dow, dowSpec, { unit: 'day' })}`);
    }

    if (spec.monthsRestricted) {
      const m = phrase(f.months, monthSpec, { unit: 'month' });
      bits.push(m.startsWith('every') ? m : `in ${m}`);   // "in every 3 months" reads wrong
    }

    return bits.join(' ') + '.';
  }

  /* ---- Warnings ---------------------------------------------------------- */

  function warnings(spec) {
    const out = [];
    if (!spec || !spec.ok) return out;

    if (spec.reboot) {
      out.push({ kind: 'note', text:
        '@reboot fires when the daemon starts, so it has no schedule and no next time. Not all cron implementations support it, and containers often restart more often than you expect.' });
      return out;
    }

    const f = spec.fields;

    if (spec.domRestricted && spec.dowRestricted) {
      out.push({ kind: 'gotcha', text:
        'Both day fields are set, so this fires when EITHER matches — not both. ' +
        `That means every matching day of the month and, separately, every matching weekday. ` +
        'If you wanted the intersection — "the first Monday", say — cron cannot express it; put the test in the job.' });
    }

    if (f.minutes.size === 60 && f.hours.size === 24) {
      out.push({ kind: 'warn', text: 'This runs every minute — 1,440 times a day.' });
    } else if (f.minutes.size >= 12 && f.hours.size === 24) {
      out.push({ kind: 'warn', text:
        `This runs ${f.minutes.size * 24} times a day. Worth checking that is deliberate.` });
    }

    // Only when the field is actually restricted: an unrestricted "*" expands
    // to 1-31 and would otherwise warn about every schedule ever written.
    if (spec.domRestricted && !spec.dowRestricted) {
      const rare = [...f.dom].filter((x) => x > 28).sort((a, b) => a - b);
      if (rare.length) {
        const list = rare.length === 1 ? `Day ${rare[0]}`
          : `Days ${rare.slice(0, -1).join(', ')} and ${rare[rare.length - 1]}`;
        out.push({ kind: 'warn', text:
          `${list} ${rare.length === 1 ? 'does' : 'do'} not exist in every month, so some months ` +
          'are skipped entirely. For "the last day of the month", run daily and let the job check.' });
      }
    }

    if (spec.hasSeconds) {
      out.push({ kind: 'note', text:
        'Six fields means the first is seconds. Standard Vixie cron does not accept that — this is the Quartz and Spring style, also used by some job runners.' });
    }

    return out;
  }

  return { parse, describe, next, warnings, matches, localParts, toInstant, offsetMs,
           SHORTCUTS, DAY_NAMES, MONTH_NAMES };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Cron;
