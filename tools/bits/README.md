# Bit twiddler

One number in every base at once, with the bits themselves as the interface.

Live at **<https://fractallambda.com/tools/bits/>**. No build step, no
dependencies, no backend.

---

## Everything is a BigInt

JavaScript's bitwise operators coerce to 32-bit signed. So `1 << 31` is
negative, `1 << 32` is `1`, and anything above 32 bits is quietly wrong. For a
tool whose entire job is showing what the bits are, inheriting that would be
fatal — and the failures are silent, which is worse.

So values are `BigInt` throughout, masked to the chosen width. 64-bit works
properly, `1 << 31` is a positive 2,147,483,648, and the sign surprises are
removed rather than documented. Most of the test suite is exactly the cases
where the language would have lied.

## Signedness is a reading, not a state

A bit pattern is not signed or unsigned — the interpretation is. `0xFF` is 255
and −1 at the same time, so both are shown at once rather than hidden behind a
toggle you have to remember the position of.

The same goes for the float view. A 32- or 64-bit pattern is an integer *and*
an IEEE-754 float simultaneously, and being able to see both without writing a
program is most of the point. The sign, exponent and mantissa are drawn in
proportion to the bits they occupy, and zero, subnormals, infinity and NaN are
named rather than left for you to work out.

## The grid

Bit 0 is on the right, because that is how everyone talks about bit positions
even though they are drawn the other way round. Click one to flip it; click a
row label to flip the whole row.

Nibble and byte boundaries get slightly more space than the gaps within them.
That grouping does the work that stripes or alternating colours would, and more
quietly — it is the boundary you read hex by.

## Operations

Shifts, rotates, bitwise AND/OR/XOR/NOT, bit reversal and byte swap.

Both right shifts are offered separately, because the difference between
zero-fill and sign-fill is one of the two or three things anyone actually comes
to a tool like this for.

Each operation declares what its second argument *is* — a shift takes a count,
AND takes an operand. Giving them the same shape invites passing one where the
other belongs, which type-checks perfectly and produces nonsense; the interface
uses the same declaration to label the argument box.

## Also shown

- Bits set, leading and trailing zeros, highest set bit, whether it is a power
  of two.
- The bytes, big-endian and little-endian, because byte order is where a lot of
  confusion lives and picking one and hoping does not help.
- The bytes as text, but **only when every one is printable ASCII**. Rendering
  arbitrary bytes as characters produces control codes and mojibake that look
  like information and are not.

## Files

| | |
| --- | --- |
| `index.html` | Markup |
| `style.css` | The grid, the float split, layout |
| `app.js` | Drawing, keeping the bases in step, applying operations |
| `bits.js` | All the arithmetic — no DOM |
| `bits.test.js` | Dependency-free tests |

## Working on it

```sh
make serve            # from the repo root — localhost:8080/tools/bits/
node bits.test.js     # parsing, widths, operations, floats, hostile input
```

One interface rule worth knowing before changing `app.js`: the field you are
typing in is never rewritten under your cursor. Everything else re-renders on
every change so the representations cannot drift apart, but reformatting the
box someone is mid-way through typing into makes it impossible to type at all.

End-to-end tests are in [`../../_tests/`](../../_tests/) (`npm test bits`).

## Deploying

Push to `master`.

> [!IMPORTANT]
> **No YAML front matter in these files.** Jekyll only runs Liquid on files
> that have it; everything else is copied through byte for byte.
