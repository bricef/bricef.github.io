/* ==========================================================================
   Talk timer — the interface.

   The model is in timer.js. This file ticks it, paints it, and keeps the
   screen awake.

   Two guards worth knowing about. Reset only works while paused, because the
   catastrophic mistake here is wiping the clock mid-talk with a stray
   keystroke, and requiring a pause first makes that take two deliberate
   actions instead of one. And a wake lock is taken while running, because a
   screen that sleeps behind you is the other way this fails on stage.
   ========================================================================== */

'use strict';

const STORE_KEY = 'timer:v1';
const PRESETS = [5, 10, 15, 20, 30, 45, 60];

let timer = Timer.create(30 * 60000);
let raf = 0;
let wakeLock = null;

const el = {};
for (const id of ['stage', 'status', 'clock', 'fill', 'controls', 'lengths',
                  'in-mins', 'btn-go', 'btn-reset', 'btn-full', 'note', 'foot']) {
  el[id] = document.getElementById(id);
}

/* ---------- Persistence ------------------------------------------------
   Only the chosen length. Not the running state — resuming a timer that has
   been counting since yesterday would be worse than starting over. */

function save() {
  try { localStorage.setItem(STORE_KEY, String(Math.round(timer.duration / 60000))); }
  catch (e) { /* private mode */ }
}

function load() {
  try {
    const mins = Number(localStorage.getItem(STORE_KEY));
    if (Number.isFinite(mins) && mins >= 1 && mins <= 600) timer.setDuration(mins * 60000);
  } catch (e) { /* ignore */ }
}

/* ---------- The screen staying on --------------------------------------- */

async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) {
    // Not supported, or refused because the tab is hidden. Nothing to do but
    // carry on — the timer is still correct, the screen just might dim.
    wakeLock = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && timer.running) keepAwake(true);
});

/* ---------- Painting ----------------------------------------------------- */

function paint() {
  const now = Date.now();
  const state = timer.started ? timer.state(now) : 'idle';
  const over = timer.over(now);

  if (over > 0) {
    el.clock.textContent = '+' + Timer.clock(over, { roundUp: false });
  } else {
    el.clock.textContent = Timer.clock(timer.remaining(now));
  }

  const paused = timer.started && !timer.running;
  el.stage.dataset.state = paused ? 'paused' : state;
  el.stage.dataset.running = String(timer.running);

  el.status.textContent = paused ? 'paused'
    : state === 'idle' ? ''
    : Timer.LABELS[state] || '';

  el.fill.style.width = (timer.fraction(now) * 100) + '%';

  el['btn-go'].textContent = timer.running ? 'Pause' : timer.started ? 'Resume' : 'Start';
  el['btn-reset'].disabled = !timer.started || timer.running;

  for (const b of el.lengths.children) {
    b.setAttribute('aria-pressed', String(Number(b.dataset.mins) * 60000 === timer.duration));
    b.disabled = timer.started;
  }
  el['in-mins'].disabled = timer.started;
}

function tick() {
  paint();
  raf = requestAnimationFrame(tick);
}

function loop(on) {
  cancelAnimationFrame(raf);
  raf = 0;
  if (on) raf = requestAnimationFrame(tick);
}

/* ---------- Actions ------------------------------------------------------ */

function setMinutes(mins) {
  if (timer.started) return;            // changing length mid-talk is not a thing
  const m = Math.min(600, Math.max(1, Math.round(mins) || 1));
  timer.setDuration(m * 60000);
  el['in-mins'].value = String(m);
  save();
  paint();
}

function toggle() {
  timer.toggle(Date.now());
  loop(timer.running);
  keepAwake(timer.running);
  el.note.textContent = timer.running ? '' : 'Paused — R resets.';
  paint();
}

function reset() {
  if (timer.running) { el.note.textContent = 'Pause first, then reset.'; return; }
  timer.reset();
  loop(false);
  keepAwake(false);
  el.note.textContent = '';
  paint();
}

async function fullScreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (e) {
    el.note.textContent = 'Full screen was refused by the browser.';
  }
}

/* ---------- Setup --------------------------------------------------------- */

function buildLengths() {
  for (const mins of PRESETS) {
    const b = document.createElement('button');
    b.className = 'length';
    b.type = 'button';
    b.dataset.mins = String(mins);
    b.textContent = `${mins} min`;
    b.addEventListener('click', () => setMinutes(mins));
    el.lengths.append(b);
  }
}

el['btn-go'].addEventListener('click', toggle);
el['btn-reset'].addEventListener('click', reset);
el['btn-full'].addEventListener('click', fullScreen);
el['in-mins'].addEventListener('change', () => setMinutes(Number(el['in-mins'].value)));

document.addEventListener('keydown', (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (e.key === ' ') { e.preventDefault(); toggle(); }
  else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); reset(); }
  else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); fullScreen(); }
});

/* ---------- Boot ----------------------------------------------------------- */

(function init() {
  load();
  buildLengths();
  el['in-mins'].value = String(Math.round(timer.duration / 60000));
  paint();
})();
