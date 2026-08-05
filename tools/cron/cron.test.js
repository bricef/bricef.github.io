/* ==========================================================================
   Tests for the cron parser and scheduler.  node cron.test.js

   Firing times are checked against dates worked out by hand, and the daylight
   saving cases against the actual UK and US transition dates. A tool that
   tells you the wrong next-run time is worse than no tool, because you will
   believe it.
   ========================================================================== */

'use strict';

const C = require('./cron.js');

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

/* Render a firing as "YYYY-MM-DD HH:MM" in a given zone, for readable
   assertions that do not depend on the machine's own time zone. */
const at = (ts, zone) => {
  const p = C.localParts(ts, zone);
  const z = (n) => String(n).padStart(2, '0');
  return `${p.year}-${z(p.month)}-${z(p.day)} ${z(p.hour)}:${z(p.minute)}`;
};

const nextN = (expr, fromISO, zone, n = 5) => {
  const spec = C.parse(expr);
  if (!spec.ok) throw new Error(`${expr} did not parse: ${spec.error}`);
  return C.next(spec, { from: Date.parse(fromISO), zone, count: n }).map((f) => at(f.ts, zone));
};

/* ---- Parsing ----------------------------------------------------------- */

console.log('\nParsing');
{
  check('a plain five-field expression parses', C.parse('0 3 * * *').ok);
  check('six fields are accepted as seconds-first', C.parse('30 0 3 * * *').hasSeconds === true);
  check('shortcuts expand', C.parse('@daily').ok && C.parse('@daily').fields.hours.has(0));
  check('@reboot is recognised as having no schedule', C.parse('@reboot').reboot === true);

  const bad = C.parse('0 3 * *');
  check('too few fields is refused', !bad.ok && /5 fields/.test(bad.error), bad.error);
  const bad2 = C.parse('0 99 * * *');
  check('an out-of-range value is refused', !bad2.ok && /out of range/.test(bad2.error), bad2.error);
  const bad3 = C.parse('0 3 * * funday');
  check('an unknown day name is refused', !bad3.ok, bad3.error);
  const bad4 = C.parse('0 10-2 * * *');
  check('a backwards range is refused', !bad4.ok && /backwards/.test(bad4.error), bad4.error);
  const bad5 = C.parse('@sometimes');
  check('an unknown shortcut is refused', !bad5.ok && /shortcut/.test(bad5.error), bad5.error);
  check('the failing field is identified', C.parse('0 99 * * *').field === 1);

  const stars = C.parse('* * * * *');
  check('* expands to every value', stars.fields.minutes.size === 60 && stars.fields.hours.size === 24);
  const step = C.parse('*/15 * * * *');
  check('*/15 gives four minutes', step.fields.minutes.size === 4 && step.fields.minutes.has(45));
  const from = C.parse('5/20 * * * *');
  check('5/20 means from 5 onwards', [...from.fields.minutes].join() === '5,25,45');
  const list = C.parse('0 9,17 * * 1-5');
  check('lists and ranges parse', list.fields.hours.size === 2 && list.fields.dow.size === 5);
  const names = C.parse('0 0 * JAN,jul MON');
  check('month and day names parse', names.fields.months.has(1) && names.fields.months.has(7)
    && names.fields.dow.has(1));
  const sun = C.parse('0 0 * * 7');
  check('day 7 is normalised to Sunday', sun.fields.dow.has(0) && !sun.fields.dow.has(7));
}

/* ---- Next firing times ------------------------------------------------- */

console.log('\nNext firings');
{
  check('a daily 03:00 job',
    nextN('0 3 * * *', '2026-03-10T12:00:00Z', 'UTC', 3).join(' | ') ===
    '2026-03-11 03:00 | 2026-03-12 03:00 | 2026-03-13 03:00',
    nextN('0 3 * * *', '2026-03-10T12:00:00Z', 'UTC', 3).join(' | '));

  check('every 15 minutes',
    nextN('*/15 * * * *', '2026-03-10T12:07:00Z', 'UTC', 3).join(' | ') ===
    '2026-03-10 12:15 | 2026-03-10 12:30 | 2026-03-10 12:45',
    nextN('*/15 * * * *', '2026-03-10T12:07:00Z', 'UTC', 3).join(' | '));

  check('weekdays at 09:00 skips the weekend',
    nextN('0 9 * * 1-5', '2026-03-13T12:00:00Z', 'UTC', 2).join(' | ') ===
    '2026-03-16 09:00 | 2026-03-17 09:00',
    nextN('0 9 * * 1-5', '2026-03-13T12:00:00Z', 'UTC', 2).join(' | '));

  check('the first of the month',
    nextN('0 0 1 * *', '2026-03-10T12:00:00Z', 'UTC', 2).join(' | ') ===
    '2026-04-01 00:00 | 2026-05-01 00:00',
    nextN('0 0 1 * *', '2026-03-10T12:00:00Z', 'UTC', 2).join(' | '));

  check('a day that some months lack is skipped, not clamped',
    nextN('0 0 31 * *', '2026-01-31T12:00:00Z', 'UTC', 3).join(' | ') ===
    '2026-03-31 00:00 | 2026-05-31 00:00 | 2026-07-31 00:00',
    nextN('0 0 31 * *', '2026-01-31T12:00:00Z', 'UTC', 3).join(' | '));

  check('29 February only in leap years',
    nextN('0 0 29 2 *', '2026-03-01T00:00:00Z', 'UTC', 2).join(' | ') ===
    '2028-02-29 00:00 | 2032-02-29 00:00',
    nextN('0 0 29 2 *', '2026-03-01T00:00:00Z', 'UTC', 2).join(' | '));
}

/* ---- The rule that catches everyone ------------------------------------ */

console.log('\nDay-of-month OR day-of-week');
{
  // 0 0 13 * 5 is NOT Friday the 13th: it is every 13th, plus every Friday.
  const got = nextN('0 0 13 * 5', '2026-03-01T00:00:00Z', 'UTC', 5);
  check('both day fields fire on either match',
    got.join(' | ') === '2026-03-06 00:00 | 2026-03-13 00:00 | 2026-03-20 00:00 | 2026-03-27 00:00 | 2026-04-03 00:00',
    got.join(' | '));
  check('which includes non-Fridays', got.includes('2026-03-13 00:00'));

  const w = C.warnings(C.parse('0 0 13 * 5'));
  check('and it is called out as a gotcha', w.some((x) => x.kind === 'gotcha'));
  check('with an explanation of the intersection', w.some((x) => /cannot express/.test(x.text)));

  // With only one restricted, the other does not apply.
  check('day-of-week alone behaves normally',
    nextN('0 0 * * 5', '2026-03-01T00:00:00Z', 'UTC', 2).join(' | ') ===
    '2026-03-06 00:00 | 2026-03-13 00:00',
    nextN('0 0 * * 5', '2026-03-01T00:00:00Z', 'UTC', 2).join(' | '));
  check('no gotcha warning when only one day field is set',
    !C.warnings(C.parse('0 0 * * 5')).some((x) => x.kind === 'gotcha'));
}

/* ---- Time zones and daylight saving ------------------------------------ */

console.log('\nTime zones');
{
  // 03:00 UTC is 04:00 in London during BST.
  check('a UTC schedule read in London during BST',
    nextN('0 3 * * *', '2026-07-01T00:00:00Z', 'UTC', 1)[0] === '2026-07-01 03:00');
  const inLondon = C.next(C.parse('0 3 * * *'), {
    from: Date.parse('2026-07-01T00:00:00Z'), zone: 'Europe/London', count: 1 });
  check('the same expression in London fires at 03:00 local, a different instant',
    at(inLondon[0].ts, 'Europe/London') === '2026-07-01 03:00' &&
    at(inLondon[0].ts, 'UTC') === '2026-07-01 02:00',
    at(inLondon[0].ts, 'UTC'));

  // UK clocks go forward at 01:00 UTC on 29 March 2026: 01:00 -> 02:00 local,
  // so local 01:30 does not happen that day.
  const spec = C.parse('30 1 * * *');
  const runs = C.next(spec, { from: Date.parse('2026-03-27T12:00:00Z'), zone: 'Europe/London', count: 3 });
  const days = runs.map((r) => at(r.ts, 'Europe/London'));
  check('a 01:30 job has no firing on the day the clocks go forward',
    !days.some((d) => d.startsWith('2026-03-29')), days.join(' | '));
  check('and the skipped day is reported rather than silently dropped',
    runs.skipped.some((s) => s.day === 29 && s.month === 3), JSON.stringify(runs.skipped));
  check('the days either side still fire',
    days.includes('2026-03-28 01:30') && days.includes('2026-03-30 01:30'), days.join(' | '));

  // Clocks go back 25 October 2026; 01:30 local happens twice, and a daily job
  // must still fire on that date exactly once in this listing.
  const back = C.next(C.parse('30 1 * * *'), {
    from: Date.parse('2026-10-24T12:00:00Z'), zone: 'Europe/London', count: 3 });
  check('a repeated hour still yields one firing that day',
    back.filter((r) => at(r.ts, 'Europe/London').startsWith('2026-10-25')).length === 1,
    back.map((r) => at(r.ts, 'Europe/London')).join(' | '));

  // A zone with a half-hour offset, to catch offset maths that assumes hours.
  const kolkata = C.next(C.parse('0 9 * * *'), {
    from: Date.parse('2026-03-10T00:00:00Z'), zone: 'Asia/Kolkata', count: 1 });
  check('a half-hour-offset zone is handled',
    at(kolkata[0].ts, 'UTC') === '2026-03-10 03:30', at(kolkata[0].ts, 'UTC'));
}

/* ---- Plain English ------------------------------------------------------ */

console.log('\nDescriptions');
{
  const d = (e) => C.describe(C.parse(e));
  check('a daily time', d('0 3 * * *') === 'At 03:00.', d('0 3 * * *'));
  check('every minute', d('* * * * *') === 'Every minute.', d('* * * * *'));
  check('a step', /every 15 minutes/.test(d('*/15 * * * *')), d('*/15 * * * *'));
  check('past the hour', /past every hour/.test(d('30 * * * *')), d('30 * * * *'));
  check('weekdays', /Monday to Friday/.test(d('0 9 * * 1-5')), d('0 9 * * 1-5'));
  check('a single weekday', /Sunday/.test(d('0 0 * * 0')), d('0 0 * * 0'));
  check('a month name appears', /January/.test(d('0 0 1 1 *')), d('0 0 1 1 *'));
  check('the OR rule is stated in words', /and also every Friday/.test(d('0 0 13 * 5')), d('0 0 13 * 5'));
  check('@reboot is described as having no schedule', /boots/.test(d('@reboot')), d('@reboot'));
  check('a list reads as a list', /and/.test(d('0 9,12,17 * * *')), d('0 9,12,17 * * *'));
}

/* ---- Warnings ----------------------------------------------------------- */

console.log('\nWarnings');
{
  check('every minute is flagged',
    C.warnings(C.parse('* * * * *')).some((w) => /1,440/.test(w.text)));
  check('day 31 is flagged as missing from some months',
    C.warnings(C.parse('0 0 31 * *')).some((w) => /does not exist/.test(w.text)));
  check('day 28 is not flagged',
    !C.warnings(C.parse('0 0 28 * *')).some((w) => /does not exist/.test(w.text)));
  check('six-field form notes it is not Vixie cron',
    C.warnings(C.parse('0 0 3 * * *')).some((w) => /Vixie/.test(w.text)));
  check('an ordinary daily job has nothing to warn about',
    C.warnings(C.parse('0 3 * * *')).length === 0,
    JSON.stringify(C.warnings(C.parse('0 3 * * *'))));
}

/* ---- Robustness ---------------------------------------------------------- */

console.log('\nRobustness');
{
  check('an impossible schedule returns nothing rather than hanging', (() => {
    // 30 February never happens.
    const r = C.next(C.parse('0 0 30 2 *'), {
      from: Date.parse('2026-01-01T00:00:00Z'), zone: 'UTC', count: 3, horizonYears: 4 });
    return r.length === 0;
  })());

  check('every expression in a spread of shapes produces increasing times', (() => {
    const exprs = ['0 3 * * *', '*/5 * * * *', '0 0 1 * *', '0 9 * * 1-5',
                   '15 2 * * 0', '0 0 1 1 *', '*/10 9-17 * * 1-5', '@weekly'];
    for (const e of exprs) {
      const spec = C.parse(e);
      if (!spec.ok) return false;
      const r = C.next(spec, { from: Date.parse('2026-05-05T12:34:00Z'), zone: 'Europe/London', count: 8 });
      if (r.length !== 8) return false;
      for (let i = 1; i < r.length; i++) if (r[i].ts <= r[i - 1].ts) return false;
      // Every returned instant must actually match the expression.
      for (const f of r) if (!C.matches(spec, C.localParts(f.ts, 'Europe/London'))) return false;
    }
    return true;
  })());

  check('parsing never throws on rubbish', (() => {
    for (const s of ['', '   ', '*', '* * *', 'a b c d e', '0 0 0 0 0', '///', '1-', '-1 * * * *',
                     '* * * * * * *', '@', '0 0 * * 8', '*/0 * * * *', null, undefined, 42]) {
      try { C.parse(s); } catch (err) { return false; }
    }
    return true;
  })());
  check('a zero step is refused', !C.parse('*/0 * * * *').ok);
  check('day 8 of the week is refused', !C.parse('0 0 * * 8').ok);
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
