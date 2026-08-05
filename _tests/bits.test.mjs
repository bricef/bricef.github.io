/* Bit twiddler — the grid, keeping every base in step, operations, and the
   widths where JavaScript's own bitwise operators would have lied. */

import { launch, suite, urlFor } from './lib/harness.mjs';

export default async function run() {
  const s = suite('bits');
  const browser = await launch();
  const page = s.watch(await browser.newPage({ viewport: { width: 1280, height: 1100 } }));

  const setHex = async (v) => {
    await page.fill('#in-hex', v);
    await page.waitForTimeout(120);
    await page.click('h1');            // blur, so fields reformat
    await page.waitForTimeout(120);
  };
  const hex = () => page.inputValue('#in-hex');
  const width = (w) => page.click(`.width >> text=${w}-bit`);

  try {
    await page.goto(urlFor('bits'));
    await page.waitForTimeout(1300);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(1000);

    s.section('The grid');
    s.check('32 bits are drawn by default',
      await page.evaluate(() => document.querySelectorAll('.bit').length) === 32);
    s.check('bit 0 is the rightmost', await page.evaluate(() =>
      [...document.querySelectorAll('.bit')].pop().textContent.startsWith('0')));

    await setHex('0');
    const first = await page.evaluate(() =>
      [...document.querySelectorAll('.bit')].findIndex((b) => b.getAttribute('aria-pressed') === 'true'));
    s.check('zero has no bits set', first === -1);

    // Clicking the last cell sets bit 0.
    await page.click('.bit >> nth=-1');
    await page.waitForTimeout(150);
    s.check('clicking a bit sets it', (await hex()) === '0x00000001', await hex());
    await page.click('.bit >> nth=-1');
    await page.waitForTimeout(150);
    s.check('clicking again clears it', (await hex()) === '0x00000000');

    await page.click('.byte__label >> nth=0');
    await page.waitForTimeout(150);
    s.check('a row label flips every bit in the row', (await hex()) === '0xffffffff', await hex());

    s.section('Bases stay in step');
    await setHex('ff');
    s.check('hex sets decimal', (await page.inputValue('#in-dec')) === '255');
    s.check('and octal', (await page.inputValue('#in-oct')) === '0o00000000377',
      await page.inputValue('#in-oct'));
    s.check('and binary is grouped',
      (await page.inputValue('#in-bin')).endsWith('1111 1111'), await page.inputValue('#in-bin'));
    s.check('and signed decimal agrees when positive',
      (await page.inputValue('#in-sdec')) === '255');

    await page.fill('#in-dec', '1024');
    await page.waitForTimeout(150);
    await page.click('h1');
    await page.waitForTimeout(120);
    s.check('typing decimal updates hex', (await hex()) === '0x00000400', await hex());

    await page.fill('#in-bin', '1010');
    await page.waitForTimeout(150);
    await page.click('h1');
    await page.waitForTimeout(120);
    s.check('typing binary updates hex', (await hex()) === '0x0000000a', await hex());

    s.section('Signed and unsigned at once');
    await width(8);
    await page.waitForTimeout(200);
    await setHex('ff');
    s.check('8-bit 0xFF reads 255 unsigned', (await page.inputValue('#in-dec')) === '255');
    s.check('and -1 signed at the same time', (await page.inputValue('#in-sdec')) === '-1');
    s.check('the grid shrinks to 8 bits',
      await page.evaluate(() => document.querySelectorAll('.bit').length) === 8);

    await page.fill('#in-sdec', '-128');
    await page.waitForTimeout(150);
    await page.click('h1');
    await page.waitForTimeout(120);
    s.check('typing a negative gives its two\'s complement', (await hex()) === '0x80', await hex());

    s.section('Where JavaScript would have lied');
    await width(32);
    await page.waitForTimeout(200);
    await setHex('0');
    // 1 << 31 is negative in plain JS; here it must be a positive 2147483648.
    await page.click('.bit >> nth=0');
    await page.waitForTimeout(150);
    s.check('setting bit 31 gives a positive unsigned value',
      (await page.inputValue('#in-dec')) === '2147483648', await page.inputValue('#in-dec'));
    s.check('and a negative signed one',
      (await page.inputValue('#in-sdec')) === '-2147483648');

    await width(64);
    await page.waitForTimeout(250);
    s.check('64 bits are drawn',
      await page.evaluate(() => document.querySelectorAll('.bit').length) === 64);
    await page.click('#btn-ones');
    await page.waitForTimeout(200);
    s.check('all 64 bits set is the full unsigned range',
      (await page.inputValue('#in-dec')) === '18446744073709551615',
      await page.inputValue('#in-dec'));
    s.check('and -1 read signed', (await page.inputValue('#in-sdec')) === '-1');

    s.section('Operations');
    await width(32);
    await page.waitForTimeout(200);
    await setHex('1');
    await page.fill('#in-arg', '4');
    await page.click('.op[aria-label="Shift left"]');
    await page.waitForTimeout(150);
    s.check('shift left', (await hex()) === '0x00000010', await hex());

    await setHex('80000000');
    await page.fill('#in-arg', '4');
    await page.click('.op[aria-label^="Shift right (logical"]');
    await page.waitForTimeout(150);
    s.check('logical right shift zero-fills', (await hex()) === '0x08000000', await hex());

    await setHex('80000000');
    await page.click('.op[aria-label^="Shift right (arithmetic"]');
    await page.waitForTimeout(150);
    s.check('arithmetic right shift sign-fills', (await hex()) === '0xf8000000', await hex());

    await setHex('11223344');
    await page.click('.op[aria-label="Swap byte order"]');
    await page.waitForTimeout(150);
    s.check('byte swap', (await hex()) === '0x44332211', await hex());

    await setHex('0f0f0f0f');
    await page.click('.op[aria-label="NOT"]');
    await page.waitForTimeout(150);
    s.check('NOT inverts within the width', (await hex()) === '0xf0f0f0f0', await hex());

    // An operand op reads the same box, but as a value rather than a count.
    await setHex('ff00ff00');
    await page.fill('#in-arg', '0x0f0f0f0f');
    await page.click('.op[aria-label="AND with"]');
    await page.waitForTimeout(150);
    s.check('AND uses the box as an operand, not a count',
      (await hex()) === '0x0f000f00', await hex());

    s.section('Undo');
    const before = await hex();
    await page.click('#btn-zero');
    await page.waitForTimeout(150);
    s.check('zero clears it', (await hex()) === '0x00000000');
    await page.click('#btn-undo');
    await page.waitForTimeout(150);
    s.check('undo puts it back', (await hex()) === before, await hex());

    s.section('Facts and bytes');
    await setHex('0000000f');
    s.check('bits set is counted', /4/.test(await page.textContent('.facts__grid')));
    s.check('power of two is answered', /power of two/.test(await page.textContent('.facts__grid')));
    await setHex('41424344');
    s.check('printable bytes are shown as text',
      /ABCD/.test(await page.textContent('#ascii')), await page.textContent('#ascii'));
    s.check('big-endian and little-endian both appear',
      /little-endian/.test(await page.textContent('#bytes')));
    await setHex('00010203');
    s.check('unprintable bytes show no ASCII line', await page.isHidden('#ascii'));

    s.section('Floats');
    await setHex('3f800000');
    s.check('the float panel is shown at 32 bits', await page.isVisible('#panel-float'));
    s.check('0x3f800000 is 1', (await page.textContent('#float-value')) === '1',
      await page.textContent('#float-value'));
    s.check('the sign, exponent and mantissa are split',
      await page.evaluate(() => document.querySelectorAll('.fseg').length) === 3);
    await setHex('7f800000');
    s.check('infinity is named', /infinity/.test(await page.textContent('#float-fields')));

    await width(8);
    await page.waitForTimeout(200);
    s.check('no float panel at 8 bits', await page.isHidden('#panel-float'));

    s.section('Bad input and memory');
    await page.fill('#in-hex', 'zz');
    await page.waitForTimeout(150);
    s.check('rubbish is refused', !(await page.isHidden('#error')));
    s.check('and the field is marked', await page.evaluate(() =>
      document.getElementById('in-hex').classList.contains('val--bad')));

    await width(16);
    await page.waitForTimeout(200);
    await setHex('beef');
    await page.reload();
    await page.waitForTimeout(1000);
    s.check('the value is remembered', (await hex()) === '0xbeef', await hex());
    s.check('and so is the width',
      await page.evaluate(() => document.querySelectorAll('.bit').length) === 16);
  } finally {
    await browser.close();
  }

  return s.finish();
}
