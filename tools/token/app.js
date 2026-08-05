/* ==========================================================================
   Token inspector — the interface.

   Decoding lives in token.js. This file reads the box and renders.

   Two deliberate absences. Nothing is written to localStorage: every other
   tool here remembers what you were doing, but a live token left in browser
   storage is a credential sitting on disk for anything with access to the
   origin to read, and the convenience is not worth it. And there is no
   network code at all — no fetch, no beacon, no analytics — because the whole
   point of the tool is that the token stays in this tab.
   ========================================================================== */

'use strict';

/* Built here rather than pasted from anywhere real, and long expired. A
   sample token in a public repository must not be one that ever worked. */
const SAMPLE = (() => {
  const b64 = (o) => btoa(JSON.stringify(o))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const header = { alg: 'RS256', typ: 'JWT', kid: 'demo-key-1' };
  const payload = {
    iss: 'https://issuer.example',
    sub: 'user-4821',
    aud: 'api.example',
    iat: 1735689600,          // 2025-01-01
    exp: 1735693200,          // an hour later, long past
    scope: 'read:things write:things',
    email: 'someone@example.test',
    roles: ['editor'],
  };
  return `${b64(header)}.${b64(payload)}.bm90LWEtcmVhbC1zaWduYXR1cmU`;
})();

const el = {};
for (const id of ['in-token', 'hint', 'error', 'btn-sample', 'btn-clear',
                  'split', 'split-raw', 'notes',
                  'panel-life', 'life', 'timeline',
                  'panel-header', 'rows-header', 'panel-payload', 'rows-payload',
                  'panel-sig', 'sig', 'panel-blob', 'blob', 'panel-json', 'json',
                  'toast']) {
  el[id] = document.getElementById(id);
}

let toastTimer = 0;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 1900);
}

/* ---------- Formatting -------------------------------------------------- */

const pad = (n) => String(n).padStart(2, '0');

function absolute(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function relative(ms, now) {
  const gap = Token.describeGap(Math.abs(ms - now));
  return ms > now ? `in ${gap}` : `${gap} ago`;
}

const showValue = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));

/* ---------- Panels ------------------------------------------------------- */

function hideAll() {
  for (const id of ['split', 'panel-life', 'panel-header', 'panel-payload',
                    'panel-sig', 'panel-blob', 'panel-json']) el[id].hidden = true;
  el.notes.replaceChildren();
  el.error.hidden = true;
}

function renderSplit(t) {
  el['split-raw'].replaceChildren();
  const bits = [['sr--h', t.raw.header], ['sr--dot', '.'], ['sr--p', t.raw.payload]];
  if (t.raw.signature) bits.push(['sr--dot', '.'], ['sr--s', t.raw.signature]);
  else bits.push(['sr--dot', '.']);
  for (const [cls, text] of bits) {
    const b = document.createElement('b');
    b.className = cls;
    b.textContent = text;
    el['split-raw'].append(b);
  }
  el.split.hidden = false;
}

function renderNotes(t, now) {
  el.notes.replaceChildren();
  const titles = { alarm: 'Careful', warn: 'Worth knowing', note: 'Note' };
  for (const w of Token.warnings(t, now)) {
    const box = document.createElement('div');
    box.className = 'note note--' + w.kind;
    const k = document.createElement('span');
    k.className = 'note__k';
    k.textContent = titles[w.kind];
    box.append(k, document.createTextNode(w.text));
    el.notes.append(box);
  }
}

function renderLife(t, now) {
  const life = Token.lifetime(t, now);
  if (!life || (life.exp === null && life.iat === null && life.nbf === null)) return;

  el.life.className = 'life' + (life.expired ? ' life--expired' : '');
  el.life.replaceChildren();

  const say = (html) => { el.life.innerHTML = html; };
  if (life.expired) {
    say(`<strong>Expired</strong> ${relative(life.exp, now)}, at ${absolute(life.exp)}.`);
  } else if (life.notYet) {
    say(`<strong>Not valid yet</strong> — it starts ${relative(life.nbf, now)}.`);
  } else if (life.exp !== null) {
    say(`<strong>Valid for another ${Token.describeGap(life.remaining)}</strong>, until ${absolute(life.exp)}.`);
  } else {
    say('<strong>No expiry.</strong> Nothing in the token stops it being accepted.');
  }

  renderTimeline(life, now);
  el['panel-life'].hidden = false;
}

/* Issued, now and expiry on one axis. Only drawn when there is a real span to
   draw — a single point on a line says nothing. */
function renderTimeline(life, now) {
  el.timeline.replaceChildren();
  const start = life.iat ?? life.nbf;
  if (start === null || life.exp === null || life.exp <= start) return;

  const span = life.exp - start;
  const at = (t) => Math.max(0, Math.min(100, ((t - start) / span) * 100));

  const track = document.createElement('div');
  track.className = 'timeline__track';
  el.timeline.append(track);

  if (now > start) {
    const used = document.createElement('div');
    used.className = 'timeline__used';
    used.style.left = '0%';
    used.style.width = at(now) + '%';
    el.timeline.append(used);
  }

  const marks = [[start, life.iat !== null ? 'issued' : 'valid from'], [life.exp, 'expires']];
  if (now >= start && now <= life.exp) marks.push([now, 'now']);

  for (const [t, label] of marks) {
    const m = document.createElement('div');
    m.className = 'timeline__mark' + (label === 'now' ? ' timeline__mark--now' : '');
    m.style.left = at(t) + '%';
    const l = document.createElement('div');
    l.className = 'timeline__label';
    l.style.left = Math.min(94, Math.max(6, at(t))) + '%';
    l.textContent = label;
    el.timeline.append(m, l);
  }
}

function renderRows(target, rows, now) {
  target.replaceChildren();
  for (const r of rows) {
    const wrap = document.createElement('div');
    wrap.className = 'row' + (r.known ? '' : ' row--unknown');

    const dt = document.createElement('dt');
    dt.className = 'row__k';
    const key = document.createElement('span');
    key.className = 'row__key';
    key.textContent = r.key;
    dt.append(key);
    if (r.label) {
      const lab = document.createElement('span');
      lab.className = 'row__label';
      lab.textContent = r.label;
      dt.append(lab);
    }

    const dd = document.createElement('dd');
    dd.className = 'row__v';
    const val = document.createElement('span');
    val.className = 'row__val';
    val.textContent = showValue(r.value);
    dd.append(val);

    if (r.time !== null) {
      const when = document.createElement('span');
      when.className = 'row__time';
      when.append(document.createTextNode(absolute(r.time) + ' '));
      const rel = document.createElement('span');
      rel.textContent = `(${relative(r.time, now)}, your time)`;
      when.append(rel);
      dd.append(when);
    }
    if (r.note) {
      const note = document.createElement('span');
      note.className = 'row__note';
      note.textContent = r.note;
      dd.append(note);
    }

    wrap.append(dt, dd);
    target.append(wrap);
  }
}

/* ---------- Main --------------------------------------------------------- */

function update() {
  const raw = el['in-token'].value;
  hideAll();
  el['in-token'].classList.remove('token--bad');

  const t = Token.inspect(raw);
  const now = Date.now();

  if (t.kind === 'empty') { el.hint.textContent = ''; return; }

  if (t.kind === 'unknown') {
    el['in-token'].classList.add('token--bad');
    el.error.textContent = t.error;
    el.error.hidden = false;
    el.hint.textContent = 'not recognised';
    return;
  }

  if (t.kind === 'base64') {
    el.hint.textContent = t.binary ? 'base64, binary' : 'base64';
    if (t.binary) {
      el.blob.textContent = [...t.bytes].slice(0, 2048)
        .map((b) => b.toString(16).padStart(2, '0')).join(' ') +
        (t.bytes.length > 2048 ? `\n… ${t.bytes.length - 2048} more bytes` : '');
    } else {
      el.blob.textContent = t.json ? JSON.stringify(t.json, null, 2) : t.text;
    }
    el['panel-blob'].hidden = false;
    return;
  }

  el.hint.textContent = t.unsigned ? 'JWT, unsigned' : 'JWT';

  renderSplit(t);
  renderNotes(t, now);
  renderLife(t, now);

  renderRows(el['rows-header'], Token.headerRows(t), now);
  el['panel-header'].hidden = false;

  renderRows(el['rows-payload'], Token.claimRows(t), now);
  el['panel-payload'].hidden = false;

  el.sig.textContent = t.raw.signature || '(none — this token is unsigned)';
  el['panel-sig'].hidden = false;

  el.json.textContent = JSON.stringify({ header: t.header, payload: t.payload }, null, 2);
  el['panel-json'].hidden = false;
}

/* ---------- Wiring ------------------------------------------------------- */

el['in-token'].addEventListener('input', update);

el['btn-sample'].addEventListener('click', () => {
  el['in-token'].value = SAMPLE;
  update();
  toast('An expired sample — it never worked anywhere');
});

el['btn-clear'].addEventListener('click', () => {
  el['in-token'].value = '';
  update();
  el['in-token'].focus();
});

update();
