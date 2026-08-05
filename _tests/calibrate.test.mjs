/* Calibration trainer — asking, grading, the honesty of the verdict, and
   whether the interface gives the magnitude away. */

import { launch, suite, urlFor } from './lib/harness.mjs';

/* Answer every remaining question with an interval a chosen number of decades
   either side of the truth, so the hit rate is controllable from here. */
async function playRound(page, { decades = 1, cap = 60 } = {}) {
  let asked = 0;
  for (;;) {
    if (await page.isHidden('#screen-ask')) break;
    const truth = await page.evaluate(() => round[index].answer);
    await page.fill('#in-low', String(truth / 10 ** decades));
    await page.fill('#in-high', String(truth * 10 ** decades));
    await page.click('#btn-submit');
    await page.waitForTimeout(80);
    if (await page.isVisible('#btn-next')) await page.click('#btn-next');
    await page.waitForTimeout(80);
    if (++asked > cap) break;
  }
  return asked;
}

export default async function run() {
  const s = suite('calibrate');
  const browser = await launch();
  const page = s.watch(await browser.newPage({ viewport: { width: 1280, height: 950 } }));

  try {
    await page.goto(urlFor('calibrate'));
    await page.waitForTimeout(1400);

    s.section('Start');
    s.check('the start screen shows', await page.isVisible('#screen-start'));
    s.check('no record is claimed before any answers', await page.isHidden('#lifetime'));

    s.section('Asking');
    await page.selectOption('#in-length', '10');
    await page.click('#btn-start');
    await page.waitForTimeout(400);
    s.check('a question appears', (await page.textContent('#ask-question')).length > 10);
    s.check('progress starts at 1 of 10', (await page.textContent('#ask-count')) === '1 of 10');
    s.check('the equivalent-bet prompt is offered', /wheel/.test(await page.textContent('#bet')));

    // Both of these protect the same thing: the tool must not hand you the
    // magnitude, because magnitude reasoning is most of what it trains.
    const units = await page.evaluate(() => {
      const q = round[index];
      if (q.quantity === 'count') return { skip: true };
      return { selected: document.getElementById('in-unit').value, base: Units.baseUnit(q.quantity) };
    });
    if (!units.skip) {
      s.check('the unit selector defaults to the base unit, not one that suits the answer',
        units.selected === units.base, JSON.stringify(units));
    }
    s.check('the question itself names no unit',
      !/\b(in|,)\s*(grams|kg|metres|km|seconds|minutes|hours|days|years|ohms)\b/i
        .test(await page.textContent('#ask-question')));

    s.section('Validation');
    await page.fill('#in-low', '100');
    await page.fill('#in-high', '10');
    await page.click('#btn-submit');
    await page.waitForTimeout(120);
    s.check('an inverted interval is refused', !(await page.isHidden('#answer-error')));
    s.check('and it says why', /below the high/.test(await page.textContent('#answer-error')));
    await page.fill('#in-low', 'nonsense');
    await page.click('#btn-submit');
    await page.waitForTimeout(120);
    s.check('unreadable input is refused', !(await page.isHidden('#answer-error')));

    s.section('Grading');
    const truth = await page.evaluate(() => round[index].answer);
    await page.fill('#in-low', String(truth / 2));
    await page.fill('#in-high', String(truth * 2));
    await page.click('#btn-submit');
    await page.waitForTimeout(200);
    s.check('an interval containing the answer is a hit', await page.isVisible('.verdict--hit'));
    s.check('the true answer is shown', /answer is/.test(await page.textContent('#feedback-truth')));
    s.check('the interval is drawn against the answer',
      await page.evaluate(() => document.querySelectorAll('#numberline > *').length) === 4);

    await page.click('#btn-next');
    await page.waitForTimeout(150);
    const t2 = await page.evaluate(() => round[index].answer);
    await page.fill('#in-low', String(t2 * 10));
    await page.fill('#in-high', String(t2 * 100));
    await page.click('#btn-submit');
    await page.waitForTimeout(200);
    s.check('an interval missing the answer is a miss', await page.isVisible('.verdict--miss'));
    s.check('and it says how far out, as a factor',
      /factor of/.test(await page.textContent('#feedback-truth')));
    s.check('the running tally counts hits and misses', /1 in/.test(await page.textContent('#ask-tally')));

    s.section('Results');
    await page.click('#btn-next');
    await page.waitForTimeout(150);
    await playRound(page, { decades: 1 });
    s.check('the round ends at the results', await page.isVisible('#screen-results'));
    s.check('the headline reports the round', /of 10/.test(await page.textContent('#res-hero')));
    s.check('every answer is listed',
      await page.evaluate(() => document.querySelectorAll('.rev').length) === 10);

    /* The property this tool exists to have. Ten answers cannot support a
       verdict, and a tool that delivers one anyway is committing the error it
       is meant to cure. */
    const sub = await page.textContent('#say-sub');
    s.check('ten answers draw no conclusion', /more answers/.test(sub), sub);
    s.check('and the uncertainty band is drawn wide to show why',
      await page.evaluate(() => parseFloat(document.getElementById('gauge-band').style.width) > 20));
    s.check('the 90% target is marked',
      await page.evaluate(() => document.getElementById('gauge-target').style.left === '90%'));

    s.section('Memory');
    await page.click('#btn-home');
    await page.waitForTimeout(150);
    s.check('the record now shows', !(await page.isHidden('#lifetime')));
    await page.reload();
    await page.waitForTimeout(1000);
    s.check('and survives a reload', !(await page.isHidden('#lifetime')));

    s.section('Accumulating evidence');
    // Four rounds of deliberately enormous intervals: every answer inside, so
    // the tool should eventually stop congratulating and start objecting.
    for (let r = 0; r < 3; r++) {
      await page.click('#btn-start');
      await page.waitForTimeout(200);
      await playRound(page, { decades: 6 });
      await page.waitForTimeout(150);
      if (r < 2) { await page.click('#btn-home'); await page.waitForTimeout(120); }
    }
    const say = await page.textContent('#say');
    s.check('forty answers all inside is called out, not praised',
      /wider than they need|above the 90%/.test(say), say);
    const width = await page.evaluate(() =>
      [...document.querySelectorAll('.stat')].find((x) => /width/.test(x.textContent))?.textContent);
    s.check('and the typical interval width shows how it was managed', /×/.test(width || ''), width);

    s.section('Clearing');
    await page.click('#btn-reset');
    await page.waitForTimeout(200);
    s.check('history can be cleared', await page.isHidden('#lifetime'));
  } finally {
    await browser.close();
  }

  return s.finish();
}
