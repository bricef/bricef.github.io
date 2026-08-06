/* ==========================================================================
   Test harness for the browser tools.

   Every suite drives a real browser against real files. By default that is the
   working copy over file:// — the tools are plain scripts with no module
   loading, so they run straight off disk. Point BASE at a server to test what
   is actually deployed:

     BASE=https://fractallambda.com/tools npm test
   ========================================================================== */

import { chromium } from 'playwright';

const TOOLS_DIR = new URL('../../tools/', import.meta.url);

/* Where to find a given tool. */
export function urlFor(tool) {
  const base = process.env.BASE;
  const path = tool ? `${tool}/` : '';           // '' is the /tools/ index itself
  if (base) return `${base.replace(/\/$/, '')}/${path}`;
  return new URL(`${path}index.html`, TOOLS_DIR).href;
}

export const isLive = () => Boolean(process.env.BASE);

/* Playwright resolves its own browser after `npm run setup`. CHROMIUM_PATH is
   an escape hatch for machines with a usable Chromium already on disk. */
export async function launch(options = {}) {
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  try {
    return await chromium.launch({ executablePath, args: ['--no-sandbox'], ...options });
  } catch (err) {
    console.error(
      '\nCould not start Chromium. Run `npm run setup` in _tests/, or set\n' +
      'CHROMIUM_PATH to an existing browser binary.\n'
    );
    throw err;
  }
}

/* A suite collects checks and page errors, and decides the exit code. */
export function suite(name) {
  let failures = 0;
  const pageErrors = [];

  return {
    name,

    section(title) { console.log(`\n  ${title}`); },

    check(label, ok, detail) {
      console.log(`    ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
      if (!ok) failures++;
    },

    /* Any uncaught error or console error counts as a failure. The favicon is
       expected to 404 under file://, where absolute paths do not resolve. */
    watch(page) {
      page.on('pageerror', (e) => pageErrors.push(`uncaught: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        if (/favicon|ERR_FILE_NOT_FOUND/.test(m.text())) return;
        pageErrors.push(`console: ${m.text()}`);
      });
      return page;
    },

    finish() {
      if (pageErrors.length) {
        console.log('\n    page errors:');
        for (const e of pageErrors) console.log(`      ${e}`);
        failures += pageErrors.length;
      }
      console.log(failures === 0 ? `\n  ${name}: all checks passed.` : `\n  ${name}: ${failures} failed.`);
      return failures;
    },
  };
}

/* Click through a comparison screen until it ends, answering with `decide`,
   which receives the two card labels and returns 'a', 'b' or 'tie'. */
export async function answerAll(page, decide, { screen = '#screen-compare', cap = 80 } = {}) {
  let asked = 0;
  for (;;) {
    if (await page.isHidden(screen)) break;
    const a = await page.textContent('#card-a-text');
    const b = await page.textContent('#card-b-text');
    const key = { a: 'ArrowLeft', b: 'ArrowRight', tie: ' ' }[decide(a, b, asked)];
    await page.keyboard.press(key);
    await page.waitForTimeout(230);
    if (++asked > cap) break;
  }
  return asked;
}
