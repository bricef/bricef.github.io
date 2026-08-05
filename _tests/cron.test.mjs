/* Cron explainer — live parsing as you type, the field map, warnings, the
   next-run list, and time zone handling. */

import { launch, suite, urlFor } from './lib/harness.mjs';

export default async function run() {
  const s = suite('cron');
  const browser = await launch();
  // Fixed zone so "your time" rows are predictable regardless of the machine.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 },
                                         timezoneId: 'Europe/London' });
  const page = s.watch(await ctx.newPage());

  const setExpr = async (v) => {
    await page.fill('#in-expr', v);
    await page.waitForTimeout(120);
  };

  try {
    await page.goto(urlFor('cron'));
    await page.waitForTimeout(1200);

    s.section('Reading an expression');
    await setExpr('0 3 * * *');
    s.check('it explains a daily job', (await page.textContent('#reading-text')) === 'At 03:00.',
      await page.textContent('#reading-text'));
    s.check('five field labels are shown',
      await page.evaluate(() => document.querySelectorAll('.fm').length) === 5);
    s.check('the set field is marked and the wildcards are not',
      await page.evaluate(() => document.querySelectorAll('.fm--set').length) === 2);
    s.check('ten runs are listed',
      await page.evaluate(() => document.querySelectorAll('.run').length) === 10);
    s.check('each run says how far away it is',
      /in /.test(await page.textContent('.run__in')));

    await setExpr('*/15 * * * *');
    s.check('it explains a step', /every 15 minutes/.test(await page.textContent('#reading-text')),
      await page.textContent('#reading-text'));

    await setExpr('0 9 * * 1-5');
    s.check('it names weekdays', /Monday to Friday/.test(await page.textContent('#reading-text')),
      await page.textContent('#reading-text'));
    const days = await page.evaluate(() =>
      [...document.querySelectorAll('.run__day')].map((e) => e.textContent));
    s.check('and never lists a weekend run', !days.some((d) => d === 'Sat' || d === 'Sun'),
      days.join(' '));

    s.section('The trap');
    await setExpr('0 0 13 * 5');
    s.check('the either-match rule is flagged prominently',
      await page.isVisible('.note--gotcha'));
    s.check('and explains it is not the intersection',
      /EITHER matches/.test(await page.textContent('.note--gotcha')));
    const trapDays = await page.evaluate(() =>
      [...document.querySelectorAll('.run__when')].map((e) => e.textContent.trim()));
    s.check('the listing shows more than just Fridays',
      trapDays.some((d) => !/Fri$/.test(d)), trapDays.slice(0, 4).join(' | '));

    s.section('Warnings');
    await setExpr('* * * * *');
    s.check('running every minute is called out',
      /1,440/.test(await page.textContent('#notes')), await page.textContent('#notes'));
    await setExpr('0 0 31 * *');
    s.check('a day some months lack is called out',
      /does not exist/.test(await page.textContent('#notes')));
    await setExpr('0 3 * * *');
    s.check('an ordinary schedule gets no warnings',
      (await page.textContent('#notes')).trim() === '');

    s.section('Bad input');
    await setExpr('0 3 * *');
    s.check('too few fields is refused', !(await page.isHidden('#error')));
    s.check('with a count in the message', /found 4/.test(await page.textContent('#error')));
    s.check('the box is marked', await page.evaluate(() =>
      document.getElementById('in-expr').classList.contains('expr--bad')));
    s.check('and no runs are listed for something unparseable',
      await page.evaluate(() => document.querySelectorAll('.run').length) === 0);

    await setExpr('0 99 * * *');
    s.check('an out-of-range value is refused', /out of range/.test(await page.textContent('#error')));
    s.check('the offending field is highlighted',
      await page.evaluate(() => document.querySelectorAll('.fm--bad').length) === 1);

    await setExpr('@sometimes');
    s.check('an unknown shortcut is refused', !(await page.isHidden('#error')));
    s.check('and suggests the real ones', /@daily/.test(await page.textContent('#error')));

    s.section('Time zones');
    await setExpr('0 3 * * *');
    await page.selectOption('#in-zone', 'UTC');
    await page.waitForTimeout(150);
    s.check('the zone defaults to UTC rather than the reader\'s own',
      await page.evaluate(() => document.getElementById('in-zone').value) === 'UTC');
    s.check('and a differing local time is shown alongside',
      await page.evaluate(() => document.querySelectorAll('.run__local').length) === 10);
    s.check('with an explanation of whose clock cron follows',
      /wall-clock/.test(await page.textContent('#zone-note')));

    // The same expression in a different zone is a different instant, which
    // shows up as a different London time on the "your time" line.
    const utcLocal = await page.textContent('.run .run__local');
    await page.selectOption('#in-zone', 'Asia/Tokyo');
    await page.waitForTimeout(150);
    const tokyoLocal = await page.textContent('.run .run__local');
    const tokyoFirst = await page.textContent('.run .run__when');
    s.check('the same expression in another zone is a different instant',
      utcLocal.slice(11, 16) !== tokyoLocal.slice(11, 16), `${utcLocal} vs ${tokyoLocal}`);
    s.check('while still reading 03:00 in whichever zone is chosen',
      /03:00/.test(tokyoFirst), tokyoFirst);

    await page.selectOption('#in-zone', 'Europe/London');
    await page.waitForTimeout(150);
    s.check('choosing your own zone drops the duplicate local line',
      await page.evaluate(() => document.querySelectorAll('.run__local').length) === 0);

    s.section('@reboot');
    await setExpr('@reboot');
    s.check('it is accepted', await page.isHidden('#error'));
    s.check('described as having no schedule', /boots/.test(await page.textContent('#reading-text')));
    s.check('and lists nothing rather than inventing times',
      await page.evaluate(() => document.querySelectorAll('.run').length) === 0);
    s.check('with a note saying why', /no next time/.test(await page.textContent('#notes')));

    s.section('Examples and memory');
    await page.click('.ex');
    await page.waitForTimeout(150);
    s.check('an example fills the box',
      (await page.inputValue('#in-expr')) === '0 3 * * *', await page.inputValue('#in-expr'));

    await setExpr('30 2 * * 0');
    await page.selectOption('#in-zone', 'Asia/Tokyo');
    await page.waitForTimeout(150);
    await page.reload();
    await page.waitForTimeout(900);
    s.check('the expression is remembered', (await page.inputValue('#in-expr')) === '30 2 * * 0');
    s.check('and so is the zone',
      await page.evaluate(() => document.getElementById('in-zone').value) === 'Asia/Tokyo');
  } finally {
    await browser.close();
  }

  return s.finish();
}
