/* Decision matrix — weighing, the scoring sheet, the chart's arithmetic,
   reordering criteria, export, resume, and the equal-weights path. */

import { readFileSync } from 'node:fs';
import { launch, suite, urlFor, answerAll } from './lib/harness.mjs';

const OPTIONS = ['Postgres', 'SQLite', 'CockroachDB', 'DynamoDB'];
const CRITERIA = ['Operational cost', 'Query flexibility', 'How well I know it', 'Horizontal scale'];

/* Rate every cell from a lookup of option -> criterion -> score. */
async function rateAll(page, table) {
  await page.evaluate((t) => {
    for (const sec of document.querySelectorAll('.crit')) {
      const crit = sec.querySelector('.crit__name').textContent;
      for (const row of sec.querySelectorAll('.rate__row')) {
        const opt = row.querySelector('.rate__name').textContent;
        row.querySelectorAll('.dot')[t[opt][crit] - 1].click();
      }
    }
  }, table);
  await page.waitForTimeout(300);
}

export default async function run() {
  const s = suite('matrix');
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 }, acceptDownloads: true });
  const page = s.watch(await ctx.newPage());

  try {
    await page.goto(urlFor('matrix'));
    await page.waitForTimeout(1200);

    s.section('Setup');
    await page.fill('#in-title', 'Database for the new service');
    await page.fill('#in-options', OPTIONS.join('\n'));
    await page.fill('#in-criteria', CRITERIA.join('\n'));
    await page.waitForTimeout(200);
    s.check('the tally describes the work ahead',
      (await page.textContent('#setup-tally')).includes('comparisons'));

    await page.fill('#in-criteria', Array.from({ length: 9 }, (_, i) => `c${i}`).join('\n'));
    await page.waitForTimeout(150);
    s.check('nine criteria is refused', await page.isDisabled('#btn-start'));
    s.check('and it explains the limit', (await page.textContent('#setup-tally')).includes('limit'));
    await page.fill('#in-criteria', CRITERIA.join('\n'));
    await page.waitForTimeout(150);

    s.section('Weighing');
    await page.click('#btn-start');
    await page.waitForTimeout(400);
    s.check('the weighing screen appears', await page.isVisible('#screen-weigh'));
    s.check('it asks about importance, not preference',
      (await page.textContent('.prompt')).toLowerCase().includes('matters more'));

    // Earlier in CRITERIA means more important.
    const byImportance = (a, b) => (CRITERIA.indexOf(a) < CRITERIA.indexOf(b) ? 'a' : 'b');
    const asked = await answerAll(page, byImportance, { screen: '#screen-weigh', cap: 30 });
    s.check(`weighing completes (${asked} questions)`, await page.isVisible('#screen-score'));

    s.section('Scoring');
    const cells = await page.evaluate(() => document.querySelectorAll('.rate__row').length);
    s.check('one row per option per criterion', cells === OPTIONS.length * CRITERIA.length, String(cells));
    s.check('the results button starts disabled', await page.isDisabled('#btn-results'));

    const shownWeights = await page.evaluate(() =>
      [...document.querySelectorAll('.crit__weight')].map((e) => parseInt(e.textContent, 10)));
    s.check('every criterion shows a weight', shownWeights.every(Number.isFinite), JSON.stringify(shownWeights));
    s.check('weights descend with importance',
      shownWeights.every((v, i) => i === 0 || shownWeights[i - 1] >= v), JSON.stringify(shownWeights));
    s.check('weights sum to about 100%',
      Math.abs(shownWeights.reduce((a, b) => a + b, 0) - 100) <= 2, String(shownWeights.reduce((a, b) => a + b, 0)));

    await rateAll(page, {
      Postgres:    { 'Operational cost': 5, 'Query flexibility': 5, 'How well I know it': 5, 'Horizontal scale': 2 },
      SQLite:      { 'Operational cost': 5, 'Query flexibility': 2, 'How well I know it': 2, 'Horizontal scale': 2 },
      CockroachDB: { 'Operational cost': 3, 'Query flexibility': 3, 'How well I know it': 3, 'Horizontal scale': 5 },
      DynamoDB:    { 'Operational cost': 4, 'Query flexibility': 1, 'How well I know it': 4, 'Horizontal scale': 4 },
    });
    s.check('all cells rated', (await page.textContent('#score-count')).startsWith('16 of 16'));
    s.check('the results button unlocks', !(await page.isDisabled('#btn-results')));

    s.section('Results');
    await page.click('#btn-results');
    await page.waitForTimeout(400);
    s.check('the results screen appears', await page.isVisible('#screen-results'));
    s.check('the verdict gives a score out of 5', /out of 5/.test(await page.textContent('#verdict')));

    s.check('one segment per option per criterion',
      await page.evaluate(() => document.querySelectorAll('.seg').length) === OPTIONS.length * CRITERIA.length);
    s.check('the legend lists every criterion',
      await page.evaluate(() => document.querySelectorAll('.legend__item').length) === CRITERIA.length);

    const totals = await page.evaluate(() =>
      [...document.querySelectorAll('.barrow__total')].map((e) => parseFloat(e.textContent)));
    s.check('bars are ranked descending',
      totals.every((v, i) => i === 0 || totals[i - 1] >= v), JSON.stringify(totals));

    // The picture must agree with the number: segment widths are the
    // contributions, so they have to sum to total/5 of the track.
    const geometryAgrees = await page.evaluate(() =>
      [...document.querySelectorAll('.barrow')].every((row) => {
        const total = parseFloat(row.querySelector('.barrow__total').textContent);
        const sum = [...row.querySelectorAll('.seg')]
          .reduce((acc, el) => acc + parseFloat(el.style.width), 0);
        return Math.abs(sum - (total / 5) * 100) < 0.5;
      }));
    s.check('every bar’s segments sum to its stated total', geometryAgrees);

    await page.hover('.seg');
    await page.waitForTimeout(250);
    s.check('hovering a segment shows the arithmetic',
      !(await page.isHidden('#tip')) && /weight/.test(await page.textContent('#tip')));

    s.section('Table and reordering');
    await page.click('#btn-table');
    await page.waitForTimeout(200);
    s.check('the table opens', !(await page.isHidden('#table')));
    s.check('with one row per option',
      await page.evaluate(() => document.querySelectorAll('#table tbody tr').length) === OPTIONS.length);

    const topWeight = await page.evaluate(() => document.querySelector('.wrow__pct').textContent);
    await page.click('.wrow:nth-child(2) .movebtn:first-child');
    await page.waitForTimeout(300);
    s.check('the weight curve is unchanged by reordering',
      topWeight === await page.evaluate(() => document.querySelector('.wrow__pct').textContent));
    const names = await page.evaluate(() =>
      [...document.querySelectorAll('.wrow__name')].map((e) => e.textContent));
    s.check('but the criteria actually swap', names[0] === CRITERIA[1], JSON.stringify(names));

    s.section('Export');
    const download = page.waitForEvent('download');
    await page.click('#btn-csv');
    const csv = readFileSync(await (await download).path(), 'utf8');
    s.check('the CSV records the weights', csv.includes('"weight"'));
    s.check('and has a row per option',
      csv.split(/\r\n/).filter(Boolean).length === OPTIONS.length + 2);

    s.section('Resume');
    await page.reload();
    await page.waitForTimeout(1400);
    s.check('resume is offered', await page.isVisible('#btn-resume'));
    await page.click('#btn-resume');
    await page.waitForTimeout(400);
    s.check('and goes straight to the finished result', await page.isVisible('#screen-results'));

    s.section('Equal weights');
    await page.click('#btn-edit');
    await page.waitForTimeout(200);
    await page.click('#btn-reweigh');
    await page.waitForTimeout(300);
    s.check('re-weigh restarts the comparison', await page.isVisible('#screen-weigh'));
    await page.click('#btn-equal');
    await page.waitForTimeout(300);
    s.check('equal weights skips to scoring', await page.isVisible('#screen-score'));
    const equal = await page.evaluate(() =>
      [...document.querySelectorAll('.crit__weight')].map((e) => parseInt(e.textContent, 10)));
    s.check('every criterion weighs the same', new Set(equal).size === 1, JSON.stringify(equal));
  } finally {
    await browser.close();
  }

  return s.finish();
}
