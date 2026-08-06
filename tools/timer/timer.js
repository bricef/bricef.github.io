/* ==========================================================================
   Talk timer — the model.

   Time is passed in rather than read, so the whole thing is testable without
   waiting for real seconds to elapse and without faking the clock.

   TWO DECISIONS THAT SHAPE IT

   Overtime counts up, and says so. A timer that stops at 00:00 has thrown away
   the number you most need: standing at a podium, "you are three minutes over"
   is far more actionable than "you are out of time". So zero is not the end of
   the count, it is a change of direction.

   Nothing makes a sound. A talk timer that beeps interrupts the talk it is
   supposed to be helping. Every signal here is visual, and carries a word as
   well as a colour so it survives being glanced at by someone who does not see
   the colour.
   ========================================================================== */

'use strict';

var Timer = (function () {

  /* When to start worrying. Proportional for short talks, absolute for long
     ones: five minutes of warning is right for a conference slot and absurd
     for a five-minute lightning talk. */
  const warnAt = (total) => Math.min(5 * 60000, total * 0.2);
  const finalAt = (total) => Math.min(60000, total * 0.1);

  function create(durationMs) {
    let duration = Math.max(0, Math.round(durationMs) || 0);
    let startedAt = null;      // when the current run began
    let banked = 0;            // milliseconds accumulated in earlier runs

    const elapsed = (now) => banked + (startedAt === null ? 0 : Math.max(0, now - startedAt));

    return {
      get duration() { return duration; },
      get running() { return startedAt !== null; },
      get started() { return startedAt !== null || banked > 0; },

      setDuration(ms) {
        duration = Math.max(0, Math.round(ms) || 0);
      },

      start(now) {
        if (startedAt === null) startedAt = now;
      },

      pause(now) {
        if (startedAt === null) return;
        banked += Math.max(0, now - startedAt);
        startedAt = null;
      },

      toggle(now) {
        if (startedAt === null) this.start(now); else this.pause(now);
      },

      reset() {
        startedAt = null;
        banked = 0;
      },

      elapsed,
      remaining: (now) => duration - elapsed(now),

      /* Positive once past the end. Zero before that, never negative, so the
         caller never has to think about the sign. */
      over: (now) => Math.max(0, elapsed(now) - duration),

      state(now) {
        const left = duration - elapsed(now);
        if (left <= 0) return 'over';
        if (left <= finalAt(duration)) return 'final';
        if (left <= warnAt(duration)) return 'warning';
        return 'normal';
      },

      /* How far through, clamped, for a progress bar. */
      fraction: (now) => (duration === 0 ? 1 : Math.min(1, Math.max(0, elapsed(now) / duration))),
    };
  }

  /* ---- Display ------------------------------------------------------------
     Rounds up rather than down while counting down, so the last second is
     shown as 0:01 for its whole duration and the clock reaches 0:00 exactly
     when the time is actually gone. A timer that shows 0:00 for a second
     before it is finished is lying at the only moment anyone is watching. */

  function clock(ms, { roundUp = true } = {}) {
    const t = Math.max(0, ms);
    const secs = roundUp ? Math.ceil(t / 1000) : Math.floor(t / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  /* A word alongside the colour, so the state does not depend on seeing it. */
  const LABELS = {
    normal: '',
    warning: 'getting on',
    final: 'last minute',
    over: 'over time',
  };

  return { create, clock, warnAt, finalAt, LABELS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Timer;
