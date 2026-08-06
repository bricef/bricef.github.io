/* Queueing calculator — utilisation, the knee, instability, the curve and the
   sizing answer. */

import { launch, suite, urlFor } from './lib/harness.mjs';

export default async function run() {
  const s = suite('queue');
  const browser = await launch();
  const page = s.watch(await browser.newPage({ viewport: { width: 1280, height: 1100 } }));

  /* rate per hour, service seconds, workers */
  const set = async (rate, service, servers) => {
    await page.selectOption('#in-rate-unit', '3600');
    await page.selectOption('#in-service-unit', '1');
    await page.fill('#in-rate', String(rate));
    await page.fill('#in-service', String(service));
    await page.fill('#in-servers', String(servers));
    await page.waitForTimeout(160);
  };
  const util = () => page.textContent('#util');
  const notes = () => page.textContent('#notes');

  try {
    await page.goto(urlFor('queue'));
    await page.waitForTimeout(1300);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(900);

    s.section('Utilisation');
    // 40/hour at 90s each is exactly one worker's worth of work.
    await set(40, 90, 2);
    s.check('two workers on one worker of load is 50%', (await util()) === '50%', await util());
    s.check('and it says so in workers', /1.00 workers/.test(await page.textContent('#util-sub')),
      await page.textContent('#util-sub'));

    await set(40, 90, 1);
    s.check('one worker on that load never catches up', (await util()) === '> 100%', await util());
    s.check('and is marked as bad', await page.isVisible('.answer--bad'));
    s.check('with the shortfall spelled out',
      /never catches up/.test(await notes()) && /at least 2/.test(await notes()), await notes());
    s.check('waiting is shown as infinite, not a plausible number',
      /∞/.test(await page.textContent('#stats')));

    s.section('The knee');
    await set(32, 90, 1);       // 0.8 of a worker
    s.check('80% is flagged as approaching the knee',
      /approaching the knee/.test(await notes()), await notes());
    s.check('and marked as a warning', await page.isVisible('.answer--warn'));
    s.check('waiting is already 4x the work',
      /4\.0×/.test(await page.textContent('#stats')), await page.textContent('#stats'));

    await set(36, 90, 1);       // 0.9
    s.check('90% is past the knee', /past the knee/.test(await notes()), await notes());
    s.check('and waiting is 9x the work',
      /9\.0×/.test(await page.textContent('#stats')), await page.textContent('#stats'));
    s.check('marked as bad rather than merely warned', await page.isVisible('.answer--bad'));

    await set(20, 90, 1);       // 0.5
    s.check('50% is neither warned nor alarmed',
      !(await page.isVisible('.answer--warn')) && !(await page.isVisible('.answer--bad')));

    s.section('Pooling');
    await set(20, 90, 1);
    const oneWorker = await page.textContent('#stats');
    s.check('one worker is told about pooling',
      /no pooling/.test(await notes()), await notes());
    await set(40, 90, 2);       // same utilisation, two workers
    s.check('two workers at the same utilisation wait less',
      (await page.textContent('#stats')) !== oneWorker);
    s.check('and the pooling note is gone', !/no pooling/.test(await notes()));

    s.section('The model is caveated');
    s.check('M/M/c assumptions are stated', /M\/M\/c/.test(await notes()), '');
    s.check('and described as optimistic', /optimistic/.test(await notes()));

    s.section('The curve');
    await set(40, 90, 2);
    s.check('a curve is drawn',
      await page.evaluate(() => document.querySelectorAll('.curve-path').length) === 1);
    s.check('with the current point marked',
      await page.evaluate(() => document.querySelectorAll('.here-dot').length) === 1);
    s.check('the path has real geometry', await page.evaluate(() => {
      const d = document.querySelector('.curve-path').getAttribute('d');
      return d.length > 200 && !/NaN|Infinity/.test(d);
    }));
    // The shape claim: flat for most of the range, then vertical.
    // The shape claim, checked rather than asserted in prose: at half load you
    // wait a fraction of the work; near saturation you wait tens of times it.
    s.check('the curve is flat early and steep late', await page.evaluate(() => {
      const pts = Queue.curve({ serviceTime: 90, servers: 2, points: 100 });
      const at = (u) => pts.find((p) => p.utilisation >= u).waitRatio;
      return at(0.5) < 1 && at(0.99) > 20;
    }));

    await set(40, 90, 1);
    s.check('an unstable configuration draws no you-are-here dot',
      await page.evaluate(() => document.querySelectorAll('.here-dot').length) === 0);

    s.section('Sizing for a target');
    await set(40, 90, 2);
    await page.fill('#in-target', '30');
    await page.selectOption('#in-target-unit', '1');
    await page.waitForTimeout(200);
    const answer = await page.textContent('#target-answer');
    s.check('it names a worker count', /\d+ workers?/.test(answer), answer);
    s.check('and compares it to what you have',
      /more than you have|fewer than you have|exactly what you have/.test(answer), answer);
    s.check('and says what utilisation that lands at', /utilisation/.test(answer), answer);

    await page.fill('#in-target', '0');
    await page.waitForTimeout(200);
    s.check('a target of zero is impossible and says so',
      /No number of workers/.test(await page.textContent('#target-answer')));

    s.section('Units and bad input');
    await page.fill('#in-target', '30');
    await page.selectOption('#in-rate-unit', '1');
    await page.fill('#in-rate', '1');
    await page.fill('#in-service', '1');
    await page.fill('#in-servers', '2');
    await page.waitForTimeout(200);
    s.check('per-second rates work too', (await util()) === '50%', await util());

    await page.fill('#in-servers', '0');
    await page.waitForTimeout(180);
    s.check('zero workers is refused', !(await page.isHidden('#error')));
    await page.fill('#in-servers', '2');
    await page.fill('#in-service', 'lots');
    await page.waitForTimeout(180);
    s.check('rubbish is refused', !(await page.isHidden('#error')));
    s.check('and the field is marked', await page.evaluate(() =>
      document.getElementById('in-service').classList.contains('input--bad')));

    s.section('Memory');
    await page.fill('#in-service', '45');
    await page.fill('#in-servers', '3');
    await page.waitForTimeout(200);
    const before = await util();
    await page.reload();
    await page.waitForTimeout(900);
    s.check('the inputs are remembered', (await page.inputValue('#in-service')) === '45');
    s.check('and the answer is unchanged', (await util()) === before, `${before} -> ${await util()}`);
  } finally {
    await browser.close();
  }

  return s.finish();
}
