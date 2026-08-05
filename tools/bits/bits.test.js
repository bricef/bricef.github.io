/* ==========================================================================
   Tests for the bit arithmetic.  node bits.test.js

   Most of these exist because JavaScript gets them wrong natively: `1 << 31`
   is negative, `1 << 32` is 1, and `-1 >>> 0` is 4294967295. A tool whose job
   is showing what the bits are cannot inherit any of that, so the cases below
   are largely the ones where the language would have lied.
   ========================================================================== */

'use strict';

const B = require('./bits.js');

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const eq = (a, b) => a === b;

/* ---- Reading input -------------------------------------------------------- */

console.log('\nParsing');
{
  check('decimal', B.parse('255', 8).value === 255n);
  check('hex', B.parse('0xFF', 8).value === 255n);
  check('binary', B.parse('0b1010', 8).value === 10n);
  check('octal', B.parse('0o17', 8).value === 15n);
  check('case does not matter', B.parse('0XfF', 8).value === 255n);
  check('separators are accepted', B.parse('0b1010_1010', 8).value === 170n);
  check('so are spaces and commas', B.parse('1, 000', 16).value === 1000n);

  check('a negative becomes its two\'s complement', B.parse('-1', 8).value === 255n);
  check('and works at 32 bits', B.parse('-1', 32).value === 0xffffffffn);
  check('-128 at 8 bits is 0x80', B.parse('-128', 8).value === 0x80n);

  check('too big for the width wraps', B.parse('256', 8).value === 0n);
  check('and says it was truncated', B.parse('256', 8).truncated === true);
  check('something that fits is not flagged', B.parse('255', 8).truncated === false);

  check('a bad digit for the base is refused', B.parse('0b1012', 8).error !== undefined);
  check('with a message naming the base', /binary/.test(B.parse('0b1012', 8).error));
  check('hex digits in a decimal number are refused', B.parse('12ff', 8).error !== undefined);
  check('a bare prefix is refused', B.parse('0x', 8).error !== undefined);
  check('empty input is refused', B.parse('', 8).error !== undefined);
  check('rubbish is refused', B.parse('hello', 8).error !== undefined);
}

/* ---- Formatting ----------------------------------------------------------- */

console.log('\nFormatting');
{
  check('binary is padded to the width', B.format(5n, 2, 8, { group: false }) === '00000101');
  check('and grouped into nibbles', B.format(5n, 2, 8) === '0000 0101');
  check('hex is padded and grouped into bytes', B.format(255n, 16, 16) === '00 ff');
  check('decimal is plain', B.format(255n, 10, 8) === '255');
  check('64-bit binary is the right length',
    B.format(1n, 2, 64, { group: false }).length === 64);
  check('zero formats as zeros', B.format(0n, 16, 32, { group: false }) === '00000000');
}

/* ---- The two readings ----------------------------------------------------- */

console.log('\nSigned and unsigned');
{
  check('0xFF at 8 bits is 255 unsigned', B.unsigned(0xffn, 8) === 255n);
  check('and -1 signed', B.signed(0xffn, 8) === -1n);
  check('0x80 at 8 bits is -128', B.signed(0x80n, 8) === -128n);
  check('0x7F at 8 bits is 127', B.signed(0x7fn, 8) === 127n);
  check('0x80000000 at 32 bits is -2147483648',
    B.signed(0x80000000n, 32) === -2147483648n);
  // The one JavaScript gets wrong natively: 1 << 31 is negative there.
  check('bit 31 set is a positive 2147483648 unsigned',
    B.unsigned(B.setBit(0n, 31, 32), 32) === 2147483648n);
  check('the full 64-bit pattern is 18446744073709551615',
    B.unsigned(B.mask(64), 64) === 18446744073709551615n);
  check('and -1 when read signed', B.signed(B.mask(64), 64) === -1n);
}

/* ---- Individual bits ------------------------------------------------------ */

console.log('\nBits');
{
  check('bit 0 is the least significant', B.getBit(1n, 0, 8) === 1);
  check('bit 7 is the most significant of a byte', B.getBit(0x80n, 7, 8) === 1);
  check('setting a bit', B.setBit(0n, 3, 8) === 8n);
  check('clearing a bit', B.clearBit(0xffn, 0, 8) === 0xfen);
  check('toggling twice returns the original',
    B.toggleBit(B.toggleBit(0x5an, 4, 8), 4, 8) === 0x5an);
  // Where 32-bit coercion would bite.
  check('setting bit 63 works', B.getBit(B.setBit(0n, 63, 64), 63, 64) === 1);
  check('and gives the right value', B.setBit(0n, 63, 64) === 9223372036854775808n);

  const arr = B.bitArray(0b1010n, 8);
  check('the bit array is least-significant first', arr[1] === 1 && arr[0] === 0);
  check('and is as long as the width', arr.length === 8);
}

/* ---- Operations ------------------------------------------------------------ */

console.log('\nOperations');
{
  const o = (id) => (v, n, w) => B.apply(id, v, n, w);
  check('shift left', o('shl')(1n, 3, 8) === 8n);
  check('shifting off the end drops bits', o('shl')(0xffn, 4, 8) === 0xf0n);
  check('shifting past the width gives zero', o('shl')(1n, 8, 8) === 0n);
  check('shift left by 31 at 32 bits stays positive',
    o('shl')(1n, 31, 32) === 2147483648n);

  check('logical right shift fills with zeros', o('shr')(0x80n, 7, 8) === 1n);
  check('logical right shift of a negative pattern zero-fills',
    o('shr')(0xffn, 4, 8) === 0x0fn);
  check('arithmetic right shift fills with the sign bit',
    o('sar')(0xffn, 4, 8) === 0xffn);
  check('arithmetic shift of a positive is the same as logical',
    o('sar')(0x40n, 2, 8) === o('shr')(0x40n, 2, 8));
  check('arithmetic shift at 32 bits sign-extends',
    o('sar')(0x80000000n, 4, 32) === 0xf8000000n);

  check('rotate left wraps round', o('rotl')(0x80n, 1, 8) === 1n);
  check('rotate right wraps round', o('rotr')(1n, 1, 8) === 0x80n);
  check('rotating by the width is a no-op', o('rotl')(0x5an, 8, 8) === 0x5an);
  check('rotate left then right returns the original',
    o('rotr')(o('rotl')(0x5an, 3, 8), 3, 8) === 0x5an);

  check('not inverts within the width', o('not')(0x0fn, 0, 8) === 0xf0n);
  check('not at 64 bits stays in range', o('not')(0n, 0, 64) === B.mask(64));
  check('and', o('and')(0xf0n, 0x3cn, 8) === 0x30n);
  check('or', o('or')(0xf0n, 0x0fn, 8) === 0xffn);
  check('xor', o('xor')(0xffn, 0x0fn, 8) === 0xf0n);
  check('xor with itself is zero', o('xor')(0x5an, 0x5an, 8) === 0n);

  check('reverse flips bit order', o('reverse')(0b10000000n, 0, 8) === 0b1n);
  check('reversing twice returns the original', o('reverse')(o('reverse')(0x5an, 0, 8), 0, 8) === 0x5an);
  check('byte swap at 32 bits', o('swapBytes')(0x11223344n, 0, 32) === 0x44332211n);
  check('byte swap at 16 bits', o('swapBytes')(0x1234n, 0, 16) === 0x3412n);
  check('swapping twice returns the original',
    o('swapBytes')(o('swapBytes')(0x11223344n, 0, 32), 0, 32) === 0x11223344n);
}

/* ---- Facts ----------------------------------------------------------------- */

console.log('\nFacts about a number');
{
  check('popcount of zero', B.popcount(0n, 8) === 0);
  check('popcount of all ones', B.popcount(0xffn, 8) === 8);
  check('popcount of 0x5A', B.popcount(0x5an, 8) === 4);
  check('popcount at 64 bits', B.popcount(B.mask(64), 64) === 64);

  check('highest bit of 1 is 0', B.highestBit(1n, 8) === 0);
  check('highest bit of 0x80 is 7', B.highestBit(0x80n, 8) === 7);
  check('highest bit of zero is -1', B.highestBit(0n, 8) === -1);

  check('trailing zeros of 8 is 3', B.trailingZeros(8n, 8) === 3);
  check('trailing zeros of 1 is 0', B.trailingZeros(1n, 8) === 0);
  check('trailing zeros of zero is the width', B.trailingZeros(0n, 8) === 8);

  check('leading zeros of zero is the width', B.leadingZeros(0n, 8) === 8);
  check('leading zeros of 1 at 8 bits is 7', B.leadingZeros(1n, 8) === 7);
  check('leading zeros of 0x80 is 0', B.leadingZeros(0x80n, 8) === 0);
  check('leading zeros at 64 bits', B.leadingZeros(1n, 64) === 63);

  check('powers of two are recognised', B.isPowerOfTwo(64n, 8));
  check('and non-powers are not', !B.isPowerOfTwo(65n, 8));
  check('zero is not a power of two', !B.isPowerOfTwo(0n, 8));
  check('one is', B.isPowerOfTwo(1n, 8));
}

/* ---- Bytes ----------------------------------------------------------------- */

console.log('\nBytes');
{
  const b = B.bytes(0x11223344n, 32);
  check('big-endian order', b.big.join(' ') === '17 34 51 68', b.big.join(' '));
  check('little-endian is the reverse', b.little.join(' ') === '68 51 34 17', b.little.join(' '));
  check('the right number of bytes', B.bytes(0n, 64).big.length === 8);

  check('printable bytes render as ASCII', B.asAscii(0x41424344n, 32) === 'ABCD');
  check('unprintable bytes render as nothing', B.asAscii(0x00010203n, 32) === null);
  check('a space counts as printable', B.asAscii(0x41204142n, 32) === 'A AB');
}

/* ---- IEEE-754 --------------------------------------------------------------- */

console.log('\nFloats');
{
  check('1.0 as a 32-bit pattern is 0x3f800000', B.fromFloat(1.0, 32) === 0x3f800000n);
  check('and reads back as 1', B.toFloat(0x3f800000n, 32) === 1);
  check('1.0 as a 64-bit pattern is 0x3ff0000000000000',
    B.fromFloat(1.0, 64) === 0x3ff0000000000000n);
  check('-2.0 at 32 bits', B.fromFloat(-2.0, 32) === 0xc0000000n);
  check('0.1 round-trips at 64 bits', B.toFloat(B.fromFloat(0.1, 64), 64) === 0.1);
  check('there is no float view at 8 bits', B.toFloat(1n, 8) === null);

  const one = B.floatParts(0x3f800000n, 32);
  check('1.0 has sign 0', one.sign === 0);
  check('exponent 0', one.exponent === 0, String(one.exponent));
  check('mantissa 0', one.mantissa === 0n);
  check('and is normal', one.kind === 'normal');

  check('zero is recognised', B.floatParts(0n, 32).kind === 'zero');
  check('infinity is recognised', B.floatParts(0x7f800000n, 32).kind === 'infinity');
  check('NaN is recognised', B.floatParts(0x7fc00000n, 32).kind === 'NaN');
  check('a subnormal is recognised', B.floatParts(1n, 32).kind === 'subnormal');
  check('the sign bit is read', B.floatParts(0xbf800000n, 32).sign === 1);
  check('64-bit parts have 52 mantissa bits', B.floatParts(0n, 64).mantBits === 52);
}

/* ---- Robustness -------------------------------------------------------------- */

console.log('\nRobustness');
{
  check('nothing throws on odd input', (() => {
    const inputs = ['', ' ', '-', '+', '0x', '0b', '0o', '-0', '0', 'z', '💥',
      '0xffffffffffffffffffffffff', '-99999999999999999999999', null, undefined, 42];
    for (const w of B.WIDTHS) {
      for (const i of inputs) {
        try { B.parse(i, w); } catch (e) { console.log('     threw on', JSON.stringify(i), e.message); return false; }
      }
    }
    return true;
  })());

  check('every operation stays inside its width', (() => {
    const values = [0n, 1n, 0x5an, 0xffn, 0x8000n, 0xffffffffn, B.mask(64)];
    for (const w of B.WIDTHS) {
      for (const v of values) {
        for (const op of B.OPS) {
          // Each op gets the kind of argument it actually declares it wants.
          const args = op.takes === 'operand' ? [0n, 1n, B.mask(w)] : [0, 1, 7, 31, 63, 100];
          for (const a of args) {
            const r = B.apply(op.id, B.clamp(v, w), a, w);
            if (r < 0n || r > B.mask(w)) {
              console.log(`     ${op.id}(${v}, ${a}, ${w}) = ${r}`);
              return false;
            }
          }
        }
      }
    }
    return true;
  })());

  check('a huge input is truncated rather than crashing',
    B.parse('0xffffffffffffffffffffffff', 8).value === 0xffn);
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
