/* The matrix's sensitivity warning only fires when a conclusion is fragile, so
   it needs a case constructed to be fragile — otherwise the code is never
   exercised and a regression would look exactly like "nothing to report".

   With three criteria the rank-order centroid weights are .611 / .278 / .111.

     Spiky    5, 2, 2  ->  3.83 weighted  but  3.00 with equal weights
     Balanced 3, 5, 5  ->  3.78 weighted  but  4.33 with equal weights

   So Spiky wins on the weighted score and must lose under equal weights, and
   the results screen is obliged to say so. */

import { launch, suite, urlFor, answerAll } from './lib/harness.mjs';

const CRITERIA = ['Top thing', 'Middle thing', 'Last thing'];
const SCORES = {
  Spiky:    { 'Top thing': 5, 'Middle thing': 2, 'Last thing': 2 },
  Balanced: { 'Top thing': 3, 'Middle thing': 5, 'Last thing': 5 },
};

export default async function run() {
  const s = suite('sensitivity');
  const browser = await launch();
  const page = s.watch(await browser.newPage({ viewport: { width: 1280, height: 950 } }));

  try {
    await page.goto(urlFor('matrix'));
    await page.waitForTimeout(1200);

    await page.fill('#in-title', 'Sensitivity');
    await page.fill('#in-options', Object.keys(SCORES).join('\n'));
    await page.fill('#in-criteria', CRITERIA.join('\n'));
    await page.click('#btn-start');
    await page.waitForTimeout(300);

    await answerAll(page, (a, b) => (CRITERIA.indexOf(a) < CRITERIA.indexOf(b) ? 'a' : 'b'),
      { screen: '#screen-weigh', cap: 20 });

    await page.evaluate((t) => {
      for (const sec of document.querySelectorAll('.crit')) {
        const crit = sec.querySelector('.crit__name').textContent;
        for (const row of sec.querySelectorAll('.rate__row')) {
          const opt = row.querySelector('.rate__name').textContent;
          row.querySelectorAll('.dot')[t[opt][crit] - 1].click();
        }
      }
    }, SCORES);
    await page.waitForTimeout(300);

    await page.click('#btn-results');
    await page.waitForTimeout(400);

    s.section('A fragile result');
    const verdict = await page.textContent('#verdict');
    s.check('the spiky option wins on weighted score', verdict.startsWith('Spiky'), verdict);
    s.check('the sensitivity block is shown', !(await page.isHidden('#sensitivity')));

    const note = await page.textContent('#sensitivity');
    s.check('it warns that equal weights would flip the winner',
      /equally/.test(note) && /Balanced/.test(note), note);
  } finally {
    await browser.close();
  }

  return s.finish();
}
