/* Runs everything: the dependency-free engine tests first (fast, and if they
   fail the browser suites will only fail in confusing ways), then the browser
   suites. Exit code is the total number of failures. */

import { execFileSync } from 'node:child_process';
import { isLive } from './lib/harness.mjs';

const ENGINE = new URL('../tools/lib/compare.test.js', import.meta.url).pathname;

const SUITES = [
  ['ranker', () => import('./ranker.test.mjs')],
  ['matrix', () => import('./matrix.test.mjs')],
  ['sensitivity', () => import('./sensitivity.test.mjs')],
];

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const bench = process.argv.includes('--bench');

let failures = 0;

console.log(isLive()
  ? `\nTesting the deployed site at ${process.env.BASE}`
  : '\nTesting the working copy over file://');

/* ---- Engine ----------------------------------------------------------- */

if (!only.length || only.includes('engine')) {
  console.log('\n=== engine ===');
  try {
    const out = execFileSync(process.execPath, bench ? [ENGINE, '--bench'] : [ENGINE], { encoding: 'utf8' });
    process.stdout.write(out.replace(/^/gm, '  '));
  } catch (err) {
    if (err.stdout) process.stdout.write(err.stdout.replace(/^/gm, '  '));
    failures++;
  }
}

/* ---- Browser suites ---------------------------------------------------- */

for (const [name, load] of SUITES) {
  if (only.length && !only.includes(name)) continue;
  console.log(`\n=== ${name} ===`);
  try {
    const mod = await load();
    failures += await mod.default();
  } catch (err) {
    console.log(`  FAIL ${name} crashed — ${err.message}`);
    failures++;
  }
}

console.log(failures === 0 ? '\nAll suites passed.\n' : `\n${failures} failure(s).\n`);
process.exit(failures === 0 ? 0 : 1);
