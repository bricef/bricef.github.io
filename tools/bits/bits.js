/* ==========================================================================
   Bit twiddling: one number in every base at once, with the bits themselves
   as the interface.

   EVERYTHING IS A BigInt
   JavaScript's bitwise operators coerce to 32-bit signed, so `1 << 31` is
   negative and `1 << 32` is 1. Both are wrong for a tool whose entire job is
   showing what the bits are, and the failures are quiet. So values are BigInt
   throughout and masked to the chosen width, which makes 64-bit work properly
   and removes the sign surprises rather than documenting them.

   SIGNEDNESS IS A READING, NOT A STATE
   A bit pattern is not signed or unsigned; the interpretation is. 0xFF is 255
   and -1 at the same time, so both are always shown rather than hidden behind
   a toggle. The same goes for the float view: a 32-bit pattern is an integer
   and a float simultaneously, and being able to see both at once is most of
   the point.

   Runs in the browser as a global and under Node for the tests.
   ========================================================================== */

'use strict';

var Bits = (function () {

  const WIDTHS = [8, 16, 32, 64];

  const mask = (w) => (1n << BigInt(w)) - 1n;
  const clamp = (v, w) => ((v % (1n << BigInt(w))) + (1n << BigInt(w))) % (1n << BigInt(w));

  /* ---- Reading what was typed --------------------------------------------
     Separators are accepted because people write 0b1010_1010 and 1_000_000
     when they are trying to be readable, and refusing that is just rude. */

  function parse(text, width) {
    if (typeof text !== 'string') return { error: 'Nothing to read.' };
    let s = text.trim().replace(/[_,\s]/g, '');
    if (!s) return { error: 'Nothing to read.' };

    let negative = false;
    if (s[0] === '-') { negative = true; s = s.slice(1); }
    else if (s[0] === '+') s = s.slice(1);

    let base = 10, digits = s;
    const prefix = s.slice(0, 2).toLowerCase();
    if (prefix === '0x') { base = 16; digits = s.slice(2); }
    else if (prefix === '0b') { base = 2; digits = s.slice(2); }
    else if (prefix === '0o') { base = 8; digits = s.slice(2); }

    if (!digits) return { error: 'That prefix has no digits after it.' };

    const allowed = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^[0-9]+$/, 16: /^[0-9a-fA-F]+$/ }[base];
    if (!allowed.test(digits)) {
      const names = { 2: 'binary', 8: 'octal', 10: 'decimal', 16: 'hex' };
      return { error: `"${digits}" is not a ${names[base]} number.` };
    }

    let value;
    try { value = BigInt(base === 10 ? digits : prefixed(base, digits)); }
    catch (e) { return { error: 'That number could not be read.' }; }

    if (negative) value = -value;

    const fits = value >= -(1n << BigInt(width - 1)) && value <= mask(width);
    return { value: clamp(value, width), base, truncated: !fits };
  }

  const prefixed = (base, digits) =>
    base === 16 ? `0x${digits}` : base === 2 ? `0b${digits}` : base === 8 ? `0o${digits}` : digits;

  /* ---- Writing it out ------------------------------------------------------ */

  function format(value, base, width, { group = true } = {}) {
    const v = clamp(value, width);
    if (base === 10) return v.toString(10);

    const perDigit = { 2: 1, 8: 3, 16: 4 }[base];
    const len = Math.ceil(width / perDigit);
    const s = v.toString(base).padStart(len, '0');
    if (!group) return s;

    // Group binary into nibbles and hex into bytes — the boundaries people
    // actually read by.
    const size = base === 2 ? 4 : base === 16 ? 2 : 3;
    const out = [];
    for (let i = s.length; i > 0; i -= size) out.unshift(s.slice(Math.max(0, i - size), i));
    return out.join(' ');
  }

  /* ---- The two readings ---------------------------------------------------- */

  const unsigned = (v, w) => clamp(v, w);
  const signed = (v, w) => {
    const u = clamp(v, w);
    return u >= (1n << BigInt(w - 1)) ? u - (1n << BigInt(w)) : u;
  };

  /* ---- Bits ---------------------------------------------------------------- */

  /* Index 0 is the least significant bit, which is how everyone talks about
     them, even though they are drawn left-to-right the other way round. */
  function bitArray(value, width) {
    const v = clamp(value, width);
    const out = new Array(width);
    for (let i = 0; i < width; i++) out[i] = Number((v >> BigInt(i)) & 1n);
    return out;
  }

  const getBit = (v, i, w) => Number((clamp(v, w) >> BigInt(i)) & 1n);
  const setBit = (v, i, w) => clamp(clamp(v, w) | (1n << BigInt(i)), w);
  const clearBit = (v, i, w) => clamp(clamp(v, w) & ~(1n << BigInt(i)), w);
  const toggleBit = (v, i, w) => clamp(clamp(v, w) ^ (1n << BigInt(i)), w);

  /* ---- Operations ----------------------------------------------------------
     Each says what its second argument is. A shift takes a count and AND takes
     an operand, and giving both the same shape invites passing one where the
     other belongs — which type-checks fine and produces nonsense. `takes` also
     tells the interface whether to show a number box, a value box, or neither.

     Both right shifts are offered because the difference between them is one
     of the two or three things people actually come to a tool like this for. */

  const OPS = [
    { id: 'shl', symbol: '<<', name: 'Shift left', takes: 'count',
      apply: (v, n, w) => clamp(clamp(v, w) << BigInt(n), w) },
    { id: 'shr', symbol: '>>>', name: 'Shift right (logical, zero-fill)', takes: 'count',
      apply: (v, n, w) => clamp(v, w) >> BigInt(n) },
    { id: 'sar', symbol: '>>', name: 'Shift right (arithmetic, sign-fill)', takes: 'count',
      apply: (v, n, w) => clamp(signed(v, w) >> BigInt(n), w) },
    { id: 'rotl', symbol: '<<<', name: 'Rotate left', takes: 'count',
      apply: (v, n, w) => {
        const k = BigInt(((n % w) + w) % w);
        const u = clamp(v, w);
        return k === 0n ? u : clamp((u << k) | (u >> (BigInt(w) - k)), w);
      } },
    { id: 'rotr', symbol: '>>>>', name: 'Rotate right', takes: 'count',
      apply: (v, n, w) => {
        const k = BigInt(((n % w) + w) % w);
        const u = clamp(v, w);
        return k === 0n ? u : clamp((u >> k) | (u << (BigInt(w) - k)), w);
      } },
    { id: 'and', symbol: '&', name: 'AND with', takes: 'operand',
      apply: (v, o, w) => clamp(clamp(v, w) & clamp(o, w), w) },
    { id: 'or', symbol: '|', name: 'OR with', takes: 'operand',
      apply: (v, o, w) => clamp(clamp(v, w) | clamp(o, w), w) },
    { id: 'xor', symbol: '^', name: 'XOR with', takes: 'operand',
      apply: (v, o, w) => clamp(clamp(v, w) ^ clamp(o, w), w) },
    { id: 'not', symbol: '~', name: 'NOT', takes: 'nothing',
      apply: (v, _o, w) => clamp(~clamp(v, w), w) },
    { id: 'reverse', symbol: '⇄', name: 'Reverse bits', takes: 'nothing',
      apply: (v, _o, w) => {
        let u = clamp(v, w), out = 0n;
        for (let i = 0; i < w; i++) { out = (out << 1n) | (u & 1n); u >>= 1n; }
        return out;
      } },
    { id: 'swapBytes', symbol: '⇅', name: 'Swap byte order', takes: 'nothing',
      apply: (v, _o, w) => {
        let u = clamp(v, w), out = 0n;
        for (let i = 0; i < w / 8; i++) { out = (out << 8n) | (u & 0xffn); u >>= 8n; }
        return out;
      } },
  ];

  const OP_BY_ID = new Map(OPS.map((o) => [o.id, o]));

  /* Coerces the argument to whatever the operation actually wants, so callers
     cannot pass a count where an operand belongs. */
  function apply(id, value, arg, width) {
    const op = OP_BY_ID.get(id);
    if (!op) return clamp(value, width);
    if (op.takes === 'count') return op.apply(value, Math.trunc(Number(arg)) || 0, width);
    if (op.takes === 'operand') return op.apply(value, clamp(BigInt(arg ?? 0), width), width);
    return op.apply(value, 0n, width);
  }

  /* ---- Facts about the number ----------------------------------------------- */

  function popcount(v, w) {
    let u = clamp(v, w), n = 0;
    while (u) { n += Number(u & 1n); u >>= 1n; }
    return n;
  }

  function highestBit(v, w) {
    const u = clamp(v, w);
    if (u === 0n) return -1;
    return u.toString(2).length - 1;
  }

  function trailingZeros(v, w) {
    const u = clamp(v, w);
    if (u === 0n) return w;
    let n = 0, x = u;
    while ((x & 1n) === 0n) { n++; x >>= 1n; }
    return n;
  }

  const leadingZeros = (v, w) => (clamp(v, w) === 0n ? w : w - 1 - highestBit(v, w));
  const isPowerOfTwo = (v, w) => { const u = clamp(v, w); return u > 0n && (u & (u - 1n)) === 0n; };

  /* ---- Bytes ----------------------------------------------------------------
     Byte order is where a lot of confusion lives, so both are shown rather
     than picking one and hoping. */
  function bytes(value, width) {
    const v = clamp(value, width);
    const n = width / 8;
    const big = [];
    for (let i = n - 1; i >= 0; i--) big.push(Number((v >> BigInt(i * 8)) & 0xffn));
    return { big, little: [...big].reverse() };
  }

  /* Printable ASCII only. Rendering arbitrary bytes as characters produces
     control codes and mojibake that look like information and are not. */
  function asAscii(value, width) {
    const { big } = bytes(value, width);
    if (!big.every((b) => b >= 0x20 && b <= 0x7e)) return null;
    return big.map((b) => String.fromCharCode(b)).join('');
  }

  /* ---- IEEE-754 --------------------------------------------------------------
     A 32- or 64-bit pattern is an integer and a float at the same time. Being
     able to see both without writing a program is most of why this exists. */

  function toFloat(value, width) {
    if (width !== 32 && width !== 64) return null;
    const buf = new ArrayBuffer(8);
    const dv = new DataView(buf);
    if (width === 32) { dv.setUint32(0, Number(clamp(value, 32))); return dv.getFloat32(0); }
    dv.setBigUint64(0, clamp(value, 64));
    return dv.getFloat64(0);
  }

  function fromFloat(number, width) {
    if (width !== 32 && width !== 64) return null;
    const buf = new ArrayBuffer(8);
    const dv = new DataView(buf);
    if (width === 32) { dv.setFloat32(0, number); return BigInt(dv.getUint32(0)); }
    dv.setFloat64(0, number);
    return dv.getBigUint64(0);
  }

  /* Sign, exponent and mantissa as separate fields — the split that makes a
     float pattern readable rather than a wall of bits. */
  function floatParts(value, width) {
    if (width !== 32 && width !== 64) return null;
    const v = clamp(value, width);
    const expBits = width === 32 ? 8 : 11;
    const mantBits = width === 32 ? 23 : 52;
    const bias = width === 32 ? 127 : 1023;

    const sign = Number((v >> BigInt(width - 1)) & 1n);
    const rawExp = Number((v >> BigInt(mantBits)) & ((1n << BigInt(expBits)) - 1n));
    const mantissa = v & ((1n << BigInt(mantBits)) - 1n);

    let kind = 'normal';
    if (rawExp === 0) kind = mantissa === 0n ? 'zero' : 'subnormal';
    else if (rawExp === (1 << expBits) - 1) kind = mantissa === 0n ? 'infinity' : 'NaN';

    return { sign, rawExp, exponent: rawExp === 0 ? 1 - bias : rawExp - bias,
             mantissa, mantBits, expBits, kind };
  }

  return { WIDTHS, parse, format, unsigned, signed, bitArray, getBit, setBit,
           clearBit, toggleBit, OPS, apply, popcount, highestBit, trailingZeros,
           leadingZeros, isPowerOfTwo, bytes, asAscii, toFloat, fromFloat,
           floatParts, mask, clamp };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Bits;
