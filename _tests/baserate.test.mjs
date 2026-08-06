/* Base rate calculator — the headline number, the counts underneath it, the
   split bar, and the guidance that only appears when it applies. */

import { launch, suite, urlFor } from './lib/harness.mjs';

export default async function run() {
  const s = suite('baserate');
  const browser = await launch();
  const page = s.watch(await browser.newPage({ viewport: { width: 1280, height: 1000 } }));

  const set = async (prior, sens, spec) => {
    await page.fill('#in-prior', prior);
    await page.fill('#in-sens', sens);
    await page.fill('#in-spec', spec);
    await page.waitForTimeout(140);
  };
  const ppv = () => page.textContent('#ppv');

  try {
    await page.goto(urlFor('baserate'));
    await page.waitForTimeout(1300);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(900);

    s.section('The number nobody guesses');
    await set('1 in 10,000', '99%', '99%');
    s.check('a 99% test on a 1-in-10,000 thing is right about 1% of the time',
      (await ppv()) === '0.98%', await ppv());
    s.check('and it is not rounded away to 0%', (await ppv()) !== '0%');
    s.check('the surprising case is marked', await page.isVisible('.answer--surprising'));
    s.check('and said in words',
      /it is wrong/.test(await page.textContent('#ppv-sub')), await page.textContent('#ppv-sub'));

    // Gigerenzer's published figures.
    await set('1%', '80%', '90.4%');
    s.check('the mammography example gives about 8%', (await ppv()) === '7.8%', await ppv());

    s.section('The counts underneath');
    await set('1 in 10,000', '99%', '99%');
    const words = await page.textContent('#words');
    s.check('the sentence is in people, not percentages', !/%/.test(words), words);
    s.check('it names the population', /100,000 people/.test(words), words);
    // 100,000 people: 10 have it, all 10 found, and 1,000 of the rest wrongly
    // flagged — so 1,010 flagged, of whom 10 are real.
    s.check('it names how many have it and how many are wrongly flagged',
      /10 have it/.test(words) && /wrongly flags 1,000/.test(words), words);
    s.check('and adds them up for you',
      /1,010 people are flagged/.test(words), words);

    const widths = await page.evaluate(() => [
      parseFloat(document.getElementById('seg-true').style.width),
      parseFloat(document.getElementById('seg-false').style.width),
    ]);
    s.check('the split bar adds up to the whole', Math.abs(widths[0] + widths[1] - 100) < 0.01,
      widths.join(' + '));
    s.check('and the false alarms dominate it', widths[1] > 95, String(widths[1]));

    s.section('When the test does work');
    await set('25%', '90%', '90%');
    s.check('a common thing gives a useful answer', (await ppv()) === '75%', await ppv());
    s.check('and is not marked as surprising', !(await page.isVisible('.answer--surprising')));
    s.check('the false-alarm warning is gone or changed',
      !/Most positives here are false alarms/.test(await page.textContent('#note') || ''));

    s.section('Guidance only when it applies');
    await set('10%', '50%', '50%');
    s.check('a coin-flip test is called out',
      /tells you nothing at all/.test(await page.textContent('#note')),
      await page.textContent('#note'));
    s.check('and the answer equals the base rate', (await ppv()) === '10%', await ppv());

    await set('1 in 1,000', '95%', '98%');
    s.check('a rare thing gets the specificity advice',
      /specificity/.test(await page.textContent('#note')), await page.textContent('#note'));

    s.section('Everything else');
    await set('1 in 10,000', '99%', '99%');
    const stats = await page.textContent('#stats');
    s.check('a negative result is reported too', /negative result is right/.test(stats));
    s.check('so are misses and false alarms',
      /missed/.test(stats) && /false alarms/.test(stats));
    s.check('and how much a hit moves you', /moves you/.test(stats));

    s.section('Reading a rate');
    await set('0.0001', '0.99', '0.99');
    s.check('plain fractions work as well as percentages', (await ppv()) === '0.98%', await ppv());
    await set('1/10000', '99%', '99%');
    s.check('so does a slash', (await ppv()) === '0.98%', await ppv());

    await set('nonsense', '99%', '99%');
    s.check('rubbish is refused', !(await page.isHidden('#error')));
    s.check('the offending field is marked', await page.evaluate(() =>
      document.getElementById('in-prior').classList.contains('input--bad')));
    s.check('and the message names the field',
      /How common/.test(await page.textContent('#error')), await page.textContent('#error'));

    await set('200%', '99%', '99%');
    s.check('over 100% is refused', !(await page.isHidden('#error')));

    s.section('Examples');
    await set('1 in 10,000', '99%', '99%');
    s.check('examples are offered',
      await page.evaluate(() => document.querySelectorAll('.ex').length) >= 4);
    await page.click('.ex[data-id="mammography"]');
    await page.waitForTimeout(200);
    s.check('an example fills the fields and recomputes', (await ppv()) === '7.8%', await ppv());
    s.check('and explains why it is there',
      (await page.textContent('#example-note')).length > 20);

    s.section('Memory');
    await set('1 in 500', '90%', '95%');
    const before = await ppv();
    await page.reload();
    await page.waitForTimeout(900);
    s.check('the inputs are remembered', (await page.inputValue('#in-prior')) === '1 in 500');
    s.check('and the answer is the same', (await ppv()) === before, `${before} -> ${await ppv()}`);
  } finally {
    await browser.close();
  }

  return s.finish();
}
