/* The /tools/ index.

   The check that earns its keep: every tool directory on disk has a card on
   the index. The way this list goes wrong is building something and forgetting
   to link it, which nothing else would notice — the tool works, its own tests
   pass, and it is simply invisible. */

import { readdirSync, existsSync } from 'node:fs';
import { launch, suite, urlFor, isLive } from './lib/harness.mjs';

const TOOLS_DIR = new URL('../tools/', import.meta.url).pathname;

/* A directory is a tool if it has its own page. `lib` has no index.html and
   is excluded by that alone, without needing to be named. */
const toolDirs = () => readdirSync(TOOLS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(`${TOOLS_DIR}${e.name}/index.html`))
  .map((e) => e.name)
  .sort();

export default async function run() {
  const s = suite('index');
  const browser = await launch();
  const page = s.watch(await browser.newPage({ viewport: { width: 1280, height: 1000 } }));

  try {
    await page.goto(urlFor(''));
    await page.waitForTimeout(1200);

    s.section('Every tool is listed');
    const onDisk = toolDirs();
    const linked = (await page.evaluate(() =>
      [...document.querySelectorAll('.tool__link')].map((a) => a.getAttribute('href'))))
      .map((h) => h.replace(/^\/tools\//, '').replace(/\/$/, ''))
      .sort();

    s.check(`all ${onDisk.length} tool directories have a card`,
      JSON.stringify(onDisk) === JSON.stringify(linked),
      `on disk: ${onDisk.join(', ')} | linked: ${linked.join(', ')}`);

    s.check('every card has a name', await page.evaluate(() =>
      [...document.querySelectorAll('.tool__name')].every((e) => e.textContent.trim().length > 2)));
    s.check('every card has a description', await page.evaluate(() =>
      [...document.querySelectorAll('.tool__desc')].every((e) => e.textContent.trim().length > 20)));
    s.check('descriptions stay to one line each', await page.evaluate(() =>
      [...document.querySelectorAll('.tool__desc')].every((e) => e.textContent.trim().length < 90)));

    s.section('Grouping');
    s.check('the tools are grouped', await page.evaluate(() =>
      document.querySelectorAll('.group').length >= 2));
    s.check('every group is named and glossed', await page.evaluate(() =>
      [...document.querySelectorAll('.group')].every((g) =>
        g.querySelector('.group__name')?.textContent.trim() &&
        g.querySelector('.group__gloss')?.textContent.trim())));
    s.check('no group is left empty', await page.evaluate(() =>
      [...document.querySelectorAll('.group')].every((g) => g.querySelectorAll('.tool').length > 0)));
    s.check('every tool sits inside a group', await page.evaluate(() =>
      document.querySelectorAll('.tool').length ===
      document.querySelectorAll('.group .tool').length));

    s.section('It fits');
    // The reason for grouping in the first place: the list had grown past a
    // screen. If it does again, that is the signal to change the layout.
    const height = await page.evaluate(() => document.querySelector('.page').scrollHeight);
    s.check(`the whole page is ${height}px — under two screens`, height < 2000, `${height}px`);

    s.section('Links');
    if (isLive()) {
      // Only meaningful against a server; file:// has no directory indexes.
      const hrefs = await page.evaluate(() =>
        [...document.querySelectorAll('a[href^="/"]')].map((a) => a.href));
      const bad = [];
      for (const h of hrefs) {
        const res = await page.request.get(h);
        if (!res.ok()) bad.push(`${res.status()} ${h}`);
      }
      s.check('every link on the page resolves', bad.length === 0, bad.join(', '));
    } else {
      s.check('link checking is skipped without a server', true);
    }
  } finally {
    await browser.close();
  }

  return s.finish();
}
