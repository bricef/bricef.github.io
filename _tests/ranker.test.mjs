/* Ranker — the paths above the comparison engine: settling a tie, manual
   reorder, export, adding items, refining, resume, and degenerate input. */

import { readFileSync } from 'node:fs';
import { launch, suite, urlFor, answerAll } from './lib/harness.mjs';

const ITEMS = ['Dune', 'Neuromancer', 'The Dispossessed', 'Hyperion', 'Snow Crash', 'Anathem'];

export default async function run() {
  const s = suite('ranker');
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = s.watch(await ctx.newPage());

  try {
    await page.goto(urlFor('ranker'));
    await page.waitForTimeout(1200);
    await page.fill('#in-title', 'Books');
    await page.fill('#in-items', ITEMS.join('\n'));
    await page.click('#btn-start');

    // Answer alphabetically, calling the second question a tie.
    const alphabetical = (a, b, i) => (i === 1 ? 'tie' : (a < b ? 'a' : 'b'));

    s.section('Settle a tie');
    await answerAll(page, alphabetical);
    s.check('reaches the results', await page.isVisible('#screen-results'));
    s.check('the tie is flagged as soft', (await page.textContent('#joints-lead')).includes('soft'));

    const jointLabel = await page.textContent('.jointbtn');
    s.check('the joint names both items', /and/.test(jointLabel), jointLabel);

    await page.click('.jointbtn');
    await page.waitForTimeout(300);
    s.check('settling returns to comparing', await page.isVisible('#screen-compare'));

    const shown = [await page.textContent('#card-a-text'), await page.textContent('#card-b-text')].sort();
    const named = jointLabel.replace(' — settle it', '').replace(' were too close to call', '').split(' and ').sort();
    s.check('it asks exactly the pair you clicked',
      JSON.stringify(shown) === JSON.stringify(named), `${JSON.stringify(shown)} vs ${JSON.stringify(named)}`);

    await answerAll(page, (a, b) => (a < b ? 'a' : 'b'));
    s.check('back to results with the tie resolved', await page.isVisible('#screen-results'));
    s.check('no soft joints remain', await page.isHidden('#res-joints'));
    s.check('stats no longer mention a tie', !(await page.textContent('#res-stats')).includes('tie'));

    const ranks = await page.evaluate(() =>
      [...document.querySelectorAll('#res-list .row__rank')].map((e) => e.textContent));
    s.check('ranks run 1..n with no gaps when nothing is tied',
      JSON.stringify(ranks) === JSON.stringify(['1', '2', '3', '4', '5', '6']), JSON.stringify(ranks));

    s.section('Manual reorder');
    const topBefore = await page.textContent('#res-list .row .row__name');
    await page.click('#res-list .row:nth-child(2) .movebtn:first-child');
    await page.waitForTimeout(150);
    s.check('moving a row up changes the top item',
      topBefore !== await page.textContent('#res-list .row .row__name'));
    s.check('the top row cannot move up',
      await page.isDisabled('#res-list .row:first-child .movebtn:first-child'));
    s.check('the last row cannot move down',
      await page.isDisabled('#res-list .row:last-child .movebtn:last-child'));

    s.section('Export');
    const download = page.waitForEvent('download');
    await page.click('#btn-csv');
    const file = await download;
    s.check('the CSV is named sensibly', /\.csv$/.test(file.suggestedFilename()), file.suggestedFilename());
    const csv = readFileSync(await file.path(), 'utf8');
    s.check('one row per item plus a header',
      csv.split(/\r\n/).filter(Boolean).length === ITEMS.length + 1);
    s.check('fields are quoted', csv.includes('"rank","item"'));

    await page.click('#btn-copy');
    await page.waitForTimeout(300);
    s.check('copy confirms', !(await page.isHidden('#toast')));

    s.section('Adding items');
    await page.click('#btn-add');
    await page.waitForTimeout(200);
    s.check('setup is prefilled with the existing list',
      (await page.inputValue('#in-items')).includes('Anathem'));
    await page.fill('#in-items', ITEMS.join('\n') + '\nBlindsight\nSolaris');
    await page.click('#btn-start');
    await page.waitForTimeout(300);
    s.check('the existing answers are kept',
      (await page.textContent('#cmp-count')).match(/^(\d+)/)[1] !== '0',
      await page.textContent('#cmp-count'));

    s.section('Refining a slice');
    await page.keyboard.press('s');
    await page.waitForTimeout(300);
    await page.click('#btn-stophere');
    await page.waitForTimeout(300);
    s.check('refine is offered after stopping early', await page.isVisible('#btn-refine'));
    await page.click('#btn-refine');
    await page.waitForTimeout(300);
    s.check('refine returns to comparing', await page.isVisible('#screen-compare'));

    s.section('Resume after reload');
    await page.reload();
    await page.waitForTimeout(900);
    s.check('a resume button is offered', await page.isVisible('#btn-resume'));
    s.check('it names the saved list', (await page.textContent('#btn-resume')).includes('Books'));
    await page.click('#btn-resume');
    await page.waitForTimeout(300);
    s.check('resuming lands back in the loop', await page.isVisible('#screen-compare'));
    s.check('with the answers intact',
      (await page.textContent('#cmp-count')).match(/^(\d+)/)[1] !== '0');

    s.section('Degenerate input');
    await page.click('#btn-standings');
    await page.waitForTimeout(200);
    await page.click('#btn-stophere');
    await page.waitForTimeout(200);
    await page.click('#btn-restart');
    await page.waitForTimeout(200);
    s.check('start is disabled with nothing entered', await page.isDisabled('#btn-start'));
    await page.fill('#in-items', 'just one');
    await page.waitForTimeout(150);
    s.check('start is disabled with one item', await page.isDisabled('#btn-start'));
    s.check('and it says why', (await page.textContent('#setup-tally')).includes('at least two'));
    await page.fill('#in-items', 'a\nb\n\n  a  \nc');
    await page.waitForTimeout(150);
    s.check('duplicates and blanks are cleaned', (await page.textContent('#setup-tally')).includes('3 items'));
    s.check('and the cleanup is reported', (await page.textContent('#setup-tally')).includes('duplicate'));
  } finally {
    await browser.close();
  }

  return s.finish();
}
