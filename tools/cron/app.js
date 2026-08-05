/* ==========================================================================
   Cron explainer — the interface.

   Parsing, explaining and scheduling all live in cron.js. This file reads the
   box, renders the answer, and remembers your time zone.

   Everything updates as you type. There is no parse button because there is
   nothing to commit to: you are reading an expression, not running one, and
   the fastest way to understand a field is to change it and watch what moves.
   ========================================================================== */

'use strict';

const STORE_KEY = 'cron:v1';
const RUNS = 10;

const LOCAL_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/* Servers are usually UTC; the rest are here so a schedule can be read in
   whichever zone the daemon actually runs in. */
const COMMON_ZONES = [
  'UTC', 'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Lisbon', 'Europe/Madrid', 'Europe/Amsterdam', 'Europe/Stockholm',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo',
  'Asia/Shanghai', 'Asia/Dubai', 'Australia/Sydney', 'Pacific/Auckland',
];

const EXAMPLES = [
  ['0 3 * * *', 'nightly at 03:00'],
  ['*/15 * * * *', 'every quarter hour'],
  ['0 9 * * 1-5', 'weekday mornings'],
  ['0 0 1 * *', 'first of the month'],
  ['0 0 13 * 5', 'the classic trap'],
  ['30 2 * * 0', 'Sunday small hours'],
  ['@weekly', 'a shortcut'],
  ['@reboot', 'no schedule at all'],
];

/* ---------- DOM -------------------------------------------------------- */

const el = {};
for (const id of ['in-expr', 'fieldmap', 'error', 'reading-text', 'notes',
                  'in-zone', 'zone-note', 'runs', 'skipped', 'examples', 'toast']) {
  el[id] = document.getElementById(id);
}

let toastTimer = 0;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 1900);
}

/* ---------- Persistence ------------------------------------------------ */

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      expr: el['in-expr'].value, zone: el['in-zone'].value,
    }));
  } catch (e) { /* private mode */ }
}

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); }
  catch (e) { return null; }
}

/* ---------- Formatting -------------------------------------------------- */

const pad = (n) => String(n).padStart(2, '0');

const stamp = (ts, zone) => {
  const p = Cron.localParts(ts, zone);
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
    day: Cron.DAY_NAMES[p.dow].slice(0, 3),
  };
};

/* "in 3 hours", "in 6 days" — enough to sanity-check a schedule at a glance
   without doing the arithmetic yourself. */
function relative(ts, from) {
  const secs = Math.round((ts - from) / 1000);
  if (secs < 60) return 'in under a minute';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `in ${mins} min`;
  const hours = secs / 3600;
  if (hours < 48) return `in ${hours < 10 ? hours.toFixed(1) : Math.round(hours)} hours`;
  const days = secs / 86400;
  if (days < 60) return `in ${Math.round(days)} days`;
  const months = days / 30.44;
  if (months < 24) return `in ${Math.round(months)} months`;
  return `in ${(days / 365.25).toFixed(1)} years`;
}

/* ---------- Rendering --------------------------------------------------- */

const FIELD_LABELS = ['minute', 'hour', 'day of month', 'month', 'day of week'];
const FIELD_LABELS_6 = ['second', ...FIELD_LABELS];

function renderFieldMap(raw, spec) {
  el.fieldmap.replaceChildren();
  const parts = raw.trim().split(/\s+/);
  if (!parts[0]) return;

  if (raw.trim().startsWith('@')) {
    const box = document.createElement('div');
    box.className = 'fm ' + (spec.ok ? 'fm--set' : 'fm--bad');
    box.innerHTML = `<span class="fm__v">${parts[0]}</span>shortcut`;
    el.fieldmap.append(box);
    return;
  }

  const labels = parts.length === 6 ? FIELD_LABELS_6 : FIELD_LABELS;
  parts.forEach((text, i) => {
    const box = document.createElement('div');
    const bad = !spec.ok && spec.field === i;
    const set = spec.ok && text !== '*';
    box.className = 'fm' + (bad ? ' fm--bad' : set ? ' fm--set' : '');
    const v = document.createElement('span');
    v.className = 'fm__v';
    v.textContent = text;
    box.append(v, document.createTextNode(labels[i] || '?'));
    el.fieldmap.append(box);
  });
}

function renderNotes(spec) {
  el.notes.replaceChildren();
  if (!spec.ok) return;
  const titles = { gotcha: 'Careful', warn: 'Worth checking', note: 'Note' };
  for (const w of Cron.warnings(spec)) {
    const box = document.createElement('div');
    box.className = 'note note--' + w.kind;
    const k = document.createElement('span');
    k.className = 'note__k';
    k.textContent = titles[w.kind] || 'Note';
    box.append(k, document.createTextNode(w.text));
    el.notes.append(box);
  }
}

function renderRuns(spec, zone) {
  el.runs.replaceChildren();
  el.skipped.hidden = true;

  if (!spec.ok) { el['zone-note'].textContent = ''; return; }

  if (spec.reboot) {
    el['zone-note'].textContent = '';
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'Nothing to list — @reboot has no schedule.';
    el.runs.append(p);
    return;
  }

  const now = Date.now();
  const fires = Cron.next(spec, { from: now, zone, count: RUNS });

  const differs = zone !== LOCAL_ZONE;
  el['zone-note'].textContent = differs
    ? `Cron matches wall-clock time in the daemon's zone. Shown in ${zone}, with your own time (${LOCAL_ZONE}) underneath.`
    : `Cron matches wall-clock time in the daemon's zone — here, ${zone}.`;

  if (!fires.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'This never fires. Check the day and month fields — 30 February and similar.';
    el.runs.append(p);
    return;
  }

  fires.forEach((f, i) => {
    const s = stamp(f.ts, zone);
    const li = document.createElement('li');
    li.className = 'run' + (i === 0 ? ' run--first' : '');

    const n = document.createElement('span');
    n.className = 'run__n';
    n.textContent = String(i + 1);

    const when = document.createElement('span');
    when.className = 'run__when';
    when.append(document.createTextNode(`${s.date} ${s.time} `));
    const day = document.createElement('span');
    day.className = 'run__day';
    day.textContent = s.day;
    when.append(day);

    const rel = document.createElement('span');
    rel.className = 'run__in';
    rel.textContent = relative(f.ts, now);

    li.append(n, when, rel);

    if (differs) {
      const mine = stamp(f.ts, LOCAL_ZONE);
      const local = document.createElement('span');
      local.className = 'run__local';
      local.textContent = `${mine.date} ${mine.time} ${mine.day} your time`;
      li.append(local);
    }

    el.runs.append(li);
  });

  if (fires.skipped && fires.skipped.length) {
    const s = fires.skipped[0];
    el.skipped.textContent =
      `On ${s.year}-${pad(s.month)}-${pad(s.day)} the clocks go forward in ${zone}, so ` +
      `${pad(s.hour)}:${pad(s.minute)} does not happen and this job does not run that day. ` +
      `Cron does not make it up afterwards.`;
    el.skipped.hidden = false;
  }
}

function update() {
  const raw = el['in-expr'].value;
  const zone = el['in-zone'].value;
  const spec = Cron.parse(raw);

  el['in-expr'].classList.toggle('expr--bad', !spec.ok && raw.trim() !== '');
  renderFieldMap(raw, spec);

  if (!spec.ok) {
    el.error.replaceChildren();
    const b = document.createElement('b');
    b.textContent = spec.error;
    el.error.append(b);
    if (spec.hint) {
      const s = document.createElement('span');
      s.textContent = spec.hint;
      el.error.append(s);
    }
    el.error.hidden = false;
    el['reading-text'].textContent = '';
    el.notes.replaceChildren();
    el.runs.replaceChildren();
    el.skipped.hidden = true;
    el['zone-note'].textContent = '';
    return;
  }

  el.error.hidden = true;
  el['reading-text'].textContent = Cron.describe(spec);
  renderNotes(spec);
  renderRuns(spec, zone);
  save();
}

/* ---------- Setup -------------------------------------------------------- */

function buildZones() {
  const zones = [...new Set([LOCAL_ZONE, ...COMMON_ZONES])].sort((a, b) =>
    a === 'UTC' ? -1 : b === 'UTC' ? 1 : a.localeCompare(b));

  for (const z of zones) {
    const opt = document.createElement('option');
    opt.value = z;
    opt.textContent = z === LOCAL_ZONE ? `${z} (yours)` : z;
    el['in-zone'].append(opt);
  }
  // UTC by default: that is what a server almost always runs, and assuming the
  // reader's own zone is how a schedule gets misread by an hour.
  el['in-zone'].value = 'UTC';
}

function buildExamples() {
  for (const [expr, what] of EXAMPLES) {
    const b = document.createElement('button');
    b.className = 'ex';
    b.type = 'button';
    b.innerHTML = `${expr} <b>${what}</b>`;
    b.addEventListener('click', () => {
      el['in-expr'].value = expr;
      update();
      el['in-expr'].focus();
    });
    el.examples.append(b);
  }
}

el['in-expr'].addEventListener('input', update);
el['in-zone'].addEventListener('change', update);

el['in-expr'].addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    navigator.clipboard?.writeText(el['in-expr'].value).then(
      () => toast('Expression copied'), () => {});
  }
});

(function init() {
  buildZones();
  buildExamples();
  const saved = loadSaved();
  if (saved && typeof saved.expr === 'string') el['in-expr'].value = saved.expr;
  if (saved && typeof saved.zone === 'string') {
    if ([...el['in-zone'].options].some((o) => o.value === saved.zone)) el['in-zone'].value = saved.zone;
  }
  update();
})();
