/* ==========================================================================
   Tests for the talk timer model.  node timer.test.js

   Time is injected, so none of these wait for real seconds. The pause and
   overtime cases are the ones worth having: a timer that loses time across a
   pause, or that stops counting at zero, fails at exactly the moment someone
   is relying on it.
   ========================================================================== */

'use strict';

const T = require('./timer.js');

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const MIN = 60000;

/* ---- Counting down --------------------------------------------------------- */

console.log('\nCounting down');
{
  const t = T.create(30 * MIN);
  check('nothing has elapsed before it starts', t.elapsed(1000) === 0);
  check('and it is not running', t.running === false);
  check('and it knows it has not been started', t.started === false);

  t.start(1000);
  check('it is running once started', t.running === true);
  check('after a minute, a minute has elapsed', t.elapsed(1000 + MIN) === MIN);
  check('and 29 remain', t.remaining(1000 + MIN) === 29 * MIN);
  check('the fraction is right', Math.abs(t.fraction(1000 + MIN) - 1 / 30) < 1e-9);
}

/* ---- Pausing --------------------------------------------------------------- */

console.log('\nPausing');
{
  const t = T.create(10 * MIN);
  t.start(0);
  t.pause(2 * MIN);
  check('two minutes are banked', t.elapsed(2 * MIN) === 2 * MIN);
  check('and it stops counting while paused', t.elapsed(9 * MIN) === 2 * MIN);
  check('so a long pause costs nothing', t.remaining(9 * MIN) === 8 * MIN);

  t.start(9 * MIN);
  check('restarting resumes from where it stopped', t.elapsed(9 * MIN) === 2 * MIN);
  check('and carries on', t.elapsed(10 * MIN) === 3 * MIN);

  t.pause(10 * MIN);
  t.start(20 * MIN);
  t.pause(21 * MIN);
  check('several pauses accumulate correctly', t.elapsed(21 * MIN) === 4 * MIN);

  check('toggling starts it', (() => { const x = T.create(MIN); x.toggle(0); return x.running; })());
  check('and toggling again stops it',
    (() => { const x = T.create(MIN); x.toggle(0); x.toggle(1000); return !x.running; })());

  check('starting twice does not double-count', (() => {
    const x = T.create(10 * MIN);
    x.start(0); x.start(MIN);
    return x.elapsed(2 * MIN) === 2 * MIN;
  })());
  check('pausing twice does not double-count', (() => {
    const x = T.create(10 * MIN);
    x.start(0); x.pause(MIN); x.pause(5 * MIN);
    return x.elapsed(5 * MIN) === MIN;
  })());
}

/* ---- Overtime -------------------------------------------------------------- */

console.log('\nOvertime');
{
  const t = T.create(5 * MIN);
  t.start(0);
  check('nothing is over before the end', t.over(4 * MIN) === 0);
  check('exactly at the end, nothing is over yet', t.over(5 * MIN) === 0);
  check('a minute past, one minute is over', t.over(6 * MIN) === MIN);
  check('remaining goes negative rather than sticking at zero',
    t.remaining(6 * MIN) === -MIN);
  check('and over is never negative', t.over(1 * MIN) === 0);
  check('overtime keeps counting', t.over(35 * MIN) === 30 * MIN);
}

/* ---- States ----------------------------------------------------------------- */

console.log('\nStates');
{
  const t = T.create(30 * MIN);
  t.start(0);
  check('early on it is normal', t.state(MIN) === 'normal');
  check('with five minutes left it warns', t.state(25 * MIN + 1) === 'warning',
    t.state(25 * MIN + 1));
  check('with one minute left it is the final minute', t.state(29 * MIN + 1) === 'final');
  check('past the end it is over', t.state(31 * MIN) === 'over');

  // A five-minute talk should not spend its whole length warning.
  const s = T.create(5 * MIN);
  s.start(0);
  check('a short talk warns proportionally, not at five minutes',
    s.state(MIN) === 'normal', s.state(MIN));
  check('and warns with a fifth left', s.state(4 * MIN + 1) === 'warning', s.state(4 * MIN + 1));
  check('the warning threshold for 30 minutes is 5 minutes', T.warnAt(30 * MIN) === 5 * MIN);
  check('and for 5 minutes is 1 minute', T.warnAt(5 * MIN) === MIN);
  check('the final threshold for 30 minutes is a minute', T.finalAt(30 * MIN) === MIN);
  check('and for 5 minutes is 30 seconds', T.finalAt(5 * MIN) === 30000);

  check('every state has a label or is deliberately blank',
    Object.keys(T.LABELS).length === 4 && T.LABELS.over === 'over time');
}

/* ---- Reset ------------------------------------------------------------------ */

console.log('\nReset');
{
  const t = T.create(10 * MIN);
  t.start(0);
  t.pause(3 * MIN);
  t.reset();
  check('reset clears the elapsed time', t.elapsed(5 * MIN) === 0);
  check('and stops it running', t.running === false);
  check('and forgets it was ever started', t.started === false);
  check('the duration survives a reset', t.duration === 10 * MIN);

  t.setDuration(20 * MIN);
  check('the duration can be changed', t.duration === 20 * MIN);
}

/* ---- The clock face ---------------------------------------------------------- */

console.log('\nClock face');
{
  const c = T.clock;
  check('a round minute', c(60000) === '1:00', c(60000));
  check('under a minute', c(9000) === '0:09', c(9000));
  check('over an hour switches to hours', c(3661000) === '1:01:01', c(3661000));
  check('exactly zero', c(0) === '0:00', c(0));
  check('negative shows as zero', c(-5000) === '0:00', c(-5000));

  // Rounding up is why the last second is visible for a whole second rather
  // than the clock sitting on 0:00 while time remains.
  check('900ms left still shows a second', c(900) === '0:01', c(900));
  check('1ms left still shows a second', c(1) === '0:01', c(1));
  check('overtime rounds down instead', c(900, { roundUp: false }) === '0:00', c(900, { roundUp: false }));
  check('a minute of overtime', c(60000, { roundUp: false }) === '1:00');
}

/* ---- Robustness --------------------------------------------------------------- */

console.log('\nRobustness');
{
  check('a zero duration is immediately over', (() => {
    const t = T.create(0);
    t.start(0);
    return t.state(0) === 'over';
  })());
  check('a nonsense duration becomes zero', T.create(NaN).duration === 0);
  check('a negative duration becomes zero', T.create(-5).duration === 0);
  check('time going backwards does not rewind the clock', (() => {
    const t = T.create(10 * MIN);
    t.start(1000);
    return t.elapsed(0) === 0;      // clamped, not negative
  })());
  check('pausing before starting is harmless', (() => {
    const t = T.create(MIN);
    t.pause(1000);
    return t.elapsed(2000) === 0 && !t.running;
  })());
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
