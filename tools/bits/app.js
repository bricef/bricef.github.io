/* ==========================================================================
   Bit twiddler — the interface.

   All the arithmetic is in bits.js. This file draws the grid, keeps the base
   fields in step, and applies operations.

   The one rule that shapes it: whichever field you are typing in does not get
   rewritten under your cursor. Everything else re-renders on every change, so
   the representations can never drift apart, but reformatting the box someone
   is mid-way through typing into makes it impossible to type at all.
   ========================================================================== */

'use strict';

const STORE_KEY = 'bits:v1';

let width = 32;
let value = 0n;
let history = [];        // for undo
let editing = null;      // which field the caret is in, if any

const el = {};
for (const id of ['widths', 'grid', 'in-hex', 'in-dec', 'in-sdec', 'in-oct', 'in-bin',
                  'error', 'in-arg', 'arg-label', 'arg-wrap', 'ops', 'btn-undo',
                  'btn-zero', 'btn-ones', 'facts', 'bytes', 'ascii',
                  'panel-float', 'float-value', 'float-split', 'float-fields',
                  'toast']) {
  el[id] = document.getElementById(id);
}

let toastTimer = 0;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 1700);
}

/* ---------- Persistence ------------------------------------------------ */

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ width, value: value.toString(16) })); }
  catch (e) { /* private mode */ }
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!d) return;
    if (Bits.WIDTHS.includes(d.width)) width = d.width;
    if (typeof d.value === 'string' && /^[0-9a-f]+$/.test(d.value)) {
      value = Bits.clamp(BigInt(`0x${d.value}`), width);
    }
  } catch (e) { /* ignore */ }
}

/* ---------- Changing the value ----------------------------------------- */

function setValue(next, { remember = true } = {}) {
  const clamped = Bits.clamp(next, width);
  if (remember && clamped !== value) {
    history.push(value);
    if (history.length > 100) history.shift();
  }
  value = clamped;
  save();
  render();
}

function setWidth(w) {
  // Narrowing keeps the low bits, which is what a cast does and what anyone
  // watching the grid would expect to see happen.
  history.push(value);
  width = w;
  value = Bits.clamp(value, w);
  save();
  render();
}

/* ---------- Rendering --------------------------------------------------- */

function renderWidths() {
  el.widths.replaceChildren();
  for (const w of Bits.WIDTHS) {
    const b = document.createElement('button');
    b.className = 'width';
    b.type = 'button';
    b.textContent = `${w}-bit`;
    b.setAttribute('aria-pressed', String(w === width));
    b.addEventListener('click', () => setWidth(w));
    el.widths.append(b);
  }
}

function renderGrid() {
  el.grid.replaceChildren();
  const bits = Bits.bitArray(value, width);
  const byteCount = width / 8;

  // Drawn most-significant first, in rows of at most four bytes so 64 bits
  // stays readable without scrolling sideways.
  const perRow = width > 32 ? 4 : byteCount;

  for (let rowStart = byteCount; rowStart > 0; rowStart -= perRow) {
    const row = document.createElement('div');
    row.className = 'byte';

    const inner = document.createElement('div');
    inner.className = 'byte__row';

    for (let b = rowStart - 1; b >= Math.max(0, rowStart - perRow); b--) {
      for (const half of [1, 0]) {
        const nib = document.createElement('div');
        nib.className = 'nibble';
        for (let k = 3; k >= 0; k--) {
          const i = b * 8 + half * 4 + k;
          const btn = document.createElement('button');
          btn.className = 'bit';
          btn.type = 'button';
          btn.setAttribute('aria-pressed', String(bits[i] === 1));
          btn.setAttribute('aria-label', `Bit ${i}, currently ${bits[i]}`);
          btn.append(document.createTextNode(String(bits[i])));
          const idx = document.createElement('span');
          idx.className = 'bit__i';
          idx.textContent = String(i);
          btn.append(idx);
          btn.addEventListener('click', () => setValue(Bits.toggleBit(value, i, width)));
          nib.append(btn);
        }
        inner.append(nib);
      }
    }

    const label = document.createElement('button');
    label.className = 'byte__label';
    label.type = 'button';
    const hi = rowStart - 1, lo = Math.max(0, rowStart - perRow);
    label.textContent = perRow === 1 ? `byte ${hi}` : `bytes ${hi}–${lo}`;
    label.title = 'Flip every bit in this row';
    label.addEventListener('click', () => {
      let v = value;
      for (let b = lo; b <= hi; b++) {
        for (let k = 0; k < 8; k++) v = Bits.toggleBit(v, b * 8 + k, width);
      }
      setValue(v);
    });

    row.append(label, inner);
    el.grid.append(row);
  }
}

function renderBases() {
  const fields = [
    ['in-hex', () => '0x' + Bits.format(value, 16, width, { group: false })],
    ['in-dec', () => Bits.unsigned(value, width).toString(10)],
    ['in-sdec', () => Bits.signed(value, width).toString(10)],
    ['in-oct', () => '0o' + Bits.format(value, 8, width, { group: false })],
    ['in-bin', () => Bits.format(value, 2, width)],
  ];
  for (const [id, text] of fields) {
    if (editing === id) continue;      // never rewrite the box being typed in
    el[id].value = text();
    el[id].classList.remove('val--bad');
  }
}

function renderOps() {
  el.ops.replaceChildren();
  for (const op of Bits.OPS) {
    const b = document.createElement('button');
    b.className = 'op';
    b.type = 'button';
    b.textContent = op.symbol;
    b.title = op.name;
    b.setAttribute('aria-label', op.name);
    b.dataset.takes = op.takes;
    b.addEventListener('click', () => runOp(op));
    el.ops.append(b);
  }
}

function runOp(op) {
  let arg = 0;
  if (op.takes === 'count') {
    arg = Math.trunc(Number(el['in-arg'].value)) || 0;
  } else if (op.takes === 'operand') {
    const parsed = Bits.parse(el['in-arg'].value, width);
    if (parsed.error) { toast(`Operand: ${parsed.error}`); return; }
    arg = parsed.value;
  }
  setValue(Bits.apply(op.id, value, arg, width));
}

function renderFacts() {
  const u = Bits.unsigned(value, width);
  const s = Bits.signed(value, width);
  const cells = [
    [String(Bits.popcount(value, width)), 'bits set'],
    [String(Bits.leadingZeros(value, width)), 'leading zeros'],
    [String(Bits.trailingZeros(value, width)), 'trailing zeros'],
    [Bits.highestBit(value, width) < 0 ? '—' : String(Bits.highestBit(value, width)), 'highest set bit'],
    [Bits.isPowerOfTwo(value, width) ? 'yes' : 'no', 'power of two'],
    [u === s ? 'same' : 'differ', 'signed vs unsigned'],
  ];
  el.facts.replaceChildren();
  for (const [v, k] of cells) {
    const box = document.createElement('div');
    box.className = 'fact';
    const val = document.createElement('div');
    val.className = 'fact__v';
    val.textContent = v;
    const key = document.createElement('div');
    key.className = 'fact__k';
    key.textContent = k;
    box.append(val, key);
    el.facts.append(box);
  }
}

function renderBytes() {
  const { big, little } = Bits.bytes(value, width);
  const hex = (arr) => arr.map((b) => b.toString(16).padStart(2, '0')).join(' ');

  el.bytes.replaceChildren();
  for (const [k, v] of [['big-endian', hex(big)], ['little-endian', hex(little)],
                        ['decimal', big.join(' ')]]) {
    const row = document.createElement('div');
    row.className = 'byterow';
    const key = document.createElement('span');
    key.className = 'byterow__k';
    key.textContent = k;
    const val = document.createElement('span');
    val.className = 'byterow__v';
    val.textContent = v;
    row.append(key, val);
    el.bytes.append(row);
  }

  const ascii = Bits.asAscii(value, width);
  if (ascii) {
    el.ascii.replaceChildren(document.createTextNode('Every byte is printable ASCII: '));
    const code = document.createElement('code');
    code.textContent = ascii;
    el.ascii.append(code);
    el.ascii.hidden = false;
  } else {
    el.ascii.hidden = true;
  }
}

function renderFloat() {
  if (width !== 32 && width !== 64) { el['panel-float'].hidden = true; return; }

  const f = Bits.toFloat(value, width);
  const parts = Bits.floatParts(value, width);

  el['float-value'].textContent = Object.is(f, -0) ? '-0'
    : Number.isFinite(f) ? String(f) : String(f);

  const total = width;
  const segs = [
    ['sign', 1, parts.sign ? '1 (negative)' : '0 (positive)'],
    ['exp', parts.expBits, `exponent ${parts.exponent}`],
    ['mant', parts.mantBits, 'mantissa'],
  ];
  el['float-split'].replaceChildren();
  for (const [cls, bits, label] of segs) {
    const d = document.createElement('div');
    d.className = `fseg fseg--${cls}`;
    d.style.flex = `${bits} 0 0`;
    d.textContent = bits > 4 ? label : '';
    d.title = `${label} — ${bits} bit${bits > 1 ? 's' : ''}`;
    el['float-split'].append(d);
  }

  const fields = [
    ['Kind', parts.kind],
    ['Sign', parts.sign ? 'negative' : 'positive'],
    ['Exponent', `${parts.exponent} (raw ${parts.rawExp})`],
    ['Mantissa', `0x${parts.mantissa.toString(16)}`],
  ];
  el['float-fields'].replaceChildren();
  for (const [k, v] of fields) {
    const d = document.createElement('div');
    d.className = 'ffield';
    d.append(document.createTextNode(k + ' '));
    const b = document.createElement('b');
    b.textContent = v;
    d.append(b);
    el['float-fields'].append(d);
  }

  el['panel-float'].hidden = false;
}

function render() {
  renderWidths();
  renderGrid();
  renderBases();
  renderFacts();
  renderBytes();
  renderFloat();
  el['btn-undo'].disabled = history.length === 0;
}

/* ---------- Typing into a base field ------------------------------------ */

const FIELD_BASE = {
  'in-hex': (t) => (/^0[xX]/.test(t.trim()) ? t : `0x${t.trim()}`),
  'in-dec': (t) => t,
  'in-sdec': (t) => t,
  'in-oct': (t) => (/^0[oO]/.test(t.trim()) ? t : `0o${t.trim()}`),
  'in-bin': (t) => (/^0[bB]/.test(t.trim()) ? t : `0b${t.trim()}`),
};

function readField(id) {
  const raw = el[id].value;
  if (!raw.trim()) return;

  const parsed = Bits.parse(FIELD_BASE[id](raw), width);
  if (parsed.error) {
    el[id].classList.add('val--bad');
    el.error.textContent = parsed.error;
    el.error.hidden = false;
    return;
  }
  el[id].classList.remove('val--bad');
  el.error.hidden = true;
  if (parsed.truncated) toast(`Too wide for ${width} bits — kept the low bits`);
  setValue(parsed.value);
}

for (const id of ['in-hex', 'in-dec', 'in-sdec', 'in-oct', 'in-bin']) {
  el[id].addEventListener('focus', () => { editing = id; });
  el[id].addEventListener('blur', () => { editing = null; renderBases(); });
  el[id].addEventListener('input', () => readField(id));
}

/* ---------- Wiring ------------------------------------------------------- */

el['btn-undo'].addEventListener('click', () => {
  if (!history.length) return;
  value = Bits.clamp(history.pop(), width);
  save();
  render();
});
el['btn-zero'].addEventListener('click', () => setValue(0n));
el['btn-ones'].addEventListener('click', () => setValue(Bits.mask(width)));

/* The argument box means different things to different operations, so its
   label follows whichever kind you last hovered. */
el.ops.addEventListener('mouseover', (e) => {
  const takes = e.target?.dataset?.takes;
  if (!takes) return;
  el['arg-label'].textContent = takes === 'count' ? 'Amount' : takes === 'operand' ? 'Operand' : '—';
  el['arg-wrap'].style.opacity = takes === 'nothing' ? '0.4' : '1';
});
el.ops.addEventListener('mouseout', () => { el['arg-wrap'].style.opacity = '1'; });

/* ---------- Boot --------------------------------------------------------- */

load();
renderOps();
render();
