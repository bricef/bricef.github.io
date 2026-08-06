/* Talk timer — starting, pausing, the reset guard, overtime, and the state
   changes you are meant to catch out of the corner of your eye.

   Real seconds are used sparingly. Starting, pausing and resuming are driven
   through the interface with short waits, because that is the behaviour worth
   exercising for real. Reaching the warning states that way would mean waiting
   out most of a talk, so those place the model at a point and call the page's
   own paint — which is exactly the mapping under test. The arithmetic itself
   needs no waiting at all: see tools/timer/timer.test.js. */

import { launch, suite, urlFor } from './lib/harness.mjs';

export default async function run() {
  const s = suite('timer');
  const browser = await launch();
  const page = s.watch(await browser.newPage({ viewport: { width: 1280, height: 900 } }));

  const state = () => page.getAttribute('#stage', 'data-state');
  const clock = () => page.textContent('#clock');

  try {
    await page.goto(urlFor('timer'));
    await page.waitForTimeout(1200);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(900);

    s.section('Before it starts');
    s.check('it opens on the default length', (await clock()) === '30:00', await clock());
    s.check('the button offers to start', (await page.textContent('#btn-go')) === 'Start');
    s.check('reset is unavailable', await page.isDisabled('#btn-reset'));
    s.check('presets are offered',
      await page.evaluate(() => document.querySelectorAll('.length').length) === 7);

    s.section('Choosing a length');
    await page.click('.length[data-mins="5"]');
    await page.waitForTimeout(150);
    s.check('a preset sets the clock', (await clock()) === '5:00', await clock());
    s.check('and is shown as chosen', await page.evaluate(() =>
      document.querySelector('.length[data-mins="5"]').getAttribute('aria-pressed') === 'true'));

    await page.fill('#in-mins', '2');
    await page.dispatchEvent('#in-mins', 'change');
    await page.waitForTimeout(150);
    s.check('a custom length works too', (await clock()) === '2:00', await clock());

    await page.fill('#in-mins', '0');
    await page.dispatchEvent('#in-mins', 'change');
    await page.waitForTimeout(150);
    s.check('zero minutes is refused', (await clock()) === '1:00', await clock());

    s.section('Running');
    await page.fill('#in-mins', '1');
    await page.dispatchEvent('#in-mins', 'change');
    await page.waitForTimeout(100);
    await page.click('#btn-go');
    await page.waitForTimeout(1400);

    s.check('the clock has moved', (await clock()) !== '1:00', await clock());
    s.check('the button now offers to pause', (await page.textContent('#btn-go')) === 'Pause');
    s.check('the length cannot be changed mid-talk', await page.isDisabled('.length[data-mins="5"]'));
    s.check('the controls recede while running',
      (await page.getAttribute('#stage', 'data-running')) === 'true');

    s.section('Reset is guarded');
    // The mistake worth preventing: wiping the clock mid-talk with one keystroke.
    await page.keyboard.press('r');
    await page.waitForTimeout(200);
    s.check('R does nothing while running', (await clock()) !== '1:00', await clock());
    s.check('and says why', /Pause first/.test(await page.textContent('#note')),
      await page.textContent('#note'));

    s.section('Pausing');
    const atPause = await clock();
    await page.keyboard.press(' ');
    await page.waitForTimeout(900);
    s.check('space pauses it', (await page.textContent('#btn-go')) === 'Resume');
    s.check('and the clock stops moving', (await clock()) === atPause, `${atPause} -> ${await clock()}`);
    s.check('the paused state is shown', (await state()) === 'paused');
    s.check('and labelled, not just coloured', (await page.textContent('#status')) === 'paused');

    await page.keyboard.press(' ');
    await page.waitForTimeout(1200);
    s.check('space resumes', (await page.textContent('#btn-go')) === 'Pause');
    s.check('and it carries on from where it stopped', (await clock()) !== atPause);

    s.section('Overtime');
    // A one-minute timer, wound down by choosing 1 minute and waiting it out
    // would take a minute; instead check the states a short timer passes.
    await page.keyboard.press(' ');          // pause
    await page.waitForTimeout(150);
    await page.keyboard.press('r');          // reset, now allowed
    await page.waitForTimeout(200);
    s.check('reset works once paused', (await clock()) === '1:00', await clock());
    s.check('and re-enables the presets', !(await page.isDisabled('.length[data-mins="5"]')));

    /* Reaching the warning states honestly would mean waiting out most of a
       talk, so the model is placed at a given point and the page's own paint
       is called — which is the mapping under test here: model state to what
       ends up on screen. */
    const at = async (remainingSeconds) => {
      await page.evaluate((left) => {
        const total = 30 * 60000;
        timer.reset();
        timer.setDuration(total);
        timer.start(Date.now() - (total - left * 1000));
        paint();
      }, remainingSeconds);
      await page.waitForTimeout(120);
    };

    await at(10 * 60);
    s.check('ten minutes out is unremarkable', (await state()) === 'normal', await state());

    await at(2 * 60);
    s.check('two minutes out warns', (await state()) === 'warning', await state());
    s.check('with a word, not just a colour',
      (await page.textContent('#status')) === 'getting on');

    await at(30);
    s.check('the last minute is flagged', (await state()) === 'final', await state());
    s.check('and labelled', (await page.textContent('#status')) === 'last minute');
    s.check('showing the seconds left', (await clock()) === '0:30', await clock());

    await at(-90);
    s.check('past the end it says over time', (await state()) === 'over');
    s.check('and labelled too', (await page.textContent('#status')) === 'over time');
    s.check('counting up rather than stopping at zero',
      (await clock()).startsWith('+'), await clock());
    s.check('by how much', (await clock()) === '+1:30', await clock());

    s.section('Memory');
    await page.evaluate(() => { timer.reset(); paint(); });
    await page.waitForTimeout(150);
    await page.click('.length[data-mins="45"]');
    await page.waitForTimeout(150);
    await page.reload();
    await page.waitForTimeout(900);
    s.check('the chosen length is remembered', (await clock()) === '45:00', await clock());
    s.check('but it does not resume mid-count',
      (await page.textContent('#btn-go')) === 'Start');
  } finally {
    await browser.close();
  }

  return s.finish();
}
