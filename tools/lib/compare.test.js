/* ==========================================================================
   Tests for the shared comparison engine.  node compare.test.js [--bench]
   No dependencies.
   ========================================================================== */

'use strict';

const Compare = require('./compare.js');

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

const shuffled = (n) => Array.from({ length: n }, (_, i) => i).sort(() => Math.random() - 0.5).map(String);

/* A cycle would mean x sits both above and below y. */
function acyclic(cmp) {
  for (let x = 0; x < cmp.size; x++)
    for (let y = x + 1; y < cmp.size; y++)
      if (cmp.related(x, y)) {
        // related is symmetric here; check the closure directly via ranks
        // (a genuine cycle collapses the position bounds into nonsense)
        if (cmp.rank(x).min > cmp.rank(x).max || cmp.rank(y).min > cmp.rank(y).max) return false;
      }
  return true;
}

/* Answer according to `value`, which maps an item label to its true rank.
   Equal values mean genuinely tied. */
function play(items, value, cap) {
  const cmp = Compare.create(items);
  let asked = 0, inferrable = 0, broke = false;
  for (;;) {
    const p = cmp.next();
    if (!p) break;
    if (cmp.related(cmp.classOf(p.a), cmp.classOf(p.b))) inferrable++;   // must never happen
    const va = value(items[p.a]), vb = value(items[p.b]);
    cmp.record(p.a, p.b, va === vb ? 'tie' : (va < vb ? 'a' : 'b'));
    asked++;
    if (!acyclic(cmp)) { broke = true; break; }
    if (asked > (cap || items.length * items.length)) { broke = true; break; }
  }
  return { cmp, asked, inferrable, broke };
}

/* ---- Recovering a known total order ---------------------------------- */

console.log('\nStrict total order');
for (const n of [2, 3, 5, 12, 20, 40]) {
  const items = shuffled(n);
  const { cmp, asked, inferrable, broke } = play(items, Number);
  const got = cmp.order().placed.map((c) => +cmp.label(c)[0]);
  const exact = got.length === n && got.every((v, i) => v === i);

  check(`n=${n} recovers the true order in ${asked} questions`, exact && !broke, `got ${got.slice(0, 6)}`);
  check(`n=${n} never asks a question it could infer`, inferrable === 0, `${inferrable} inferrable`);
  check(`n=${n} places every item`, cmp.order().unplaced.length === 0);
}

/* ---- Completion ------------------------------------------------------- */

console.log('\nCompletion');
{
  const { cmp } = play(shuffled(15), Number);
  check('every position is locked', Array.from({ length: cmp.size }, (_, c) => cmp.rank(c).settled).every(Boolean));
  check('nothing left to ask', cmp.done);
  check('next() returns null', cmp.next() === null);
  check('progress reports 100%', cmp.progress().pct === 100);
  check('confidence reads "settled"', cmp.rank(0).confidence === 'settled');
}

/* ---- Ties ------------------------------------------------------------- */

console.log('\nTies');
{
  const vals = [0, 0, 1, 2, 2, 3, 4, 4];
  const items = vals.map((v, i) => `v${v}-${i}`);
  const { cmp, inferrable, broke } = play(items, (s) => vals[items.indexOf(s)], 200);

  check('stays acyclic when items merge', !broke);
  check('never asks a question it could infer', inferrable === 0);

  const groups = cmp.order().placed.map((c) => cmp.classItems(c).map((i) => vals[i]));
  const heads = groups.map((g) => g[0]);
  check('classes come out in true order', heads.every((v, i) => i === 0 || heads[i - 1] < v), JSON.stringify(heads));
  check('tied items land in one class', groups.every((g) => g.every((v) => v === g[0])));
  check('one class per distinct value', groups.length === new Set(vals).size, `${groups.length} vs ${new Set(vals).size}`);
}

/* ---- An illegal tie is refused --------------------------------------- */

console.log('\nIllegal ties');
{
  const cmp = Compare.create(['a', 'b', 'c']);
  cmp.record(0, 1, 'a');                    // a beats b
  check('a tie between related items is refused', cmp.record(0, 1, 'tie') === false);
  check('and nothing was recorded', cmp.history.length === 1);
  check('a tie between unrelated items is accepted', cmp.record(0, 2, 'tie') === true);
}

/* ---- Undo ------------------------------------------------------------- */

console.log('\nUndo');
{
  const cmp = Compare.create(Array.from({ length: 10 }, (_, i) => `x${i}`));
  for (let k = 0; k < 6; k++) { const p = cmp.next(); cmp.record(p.a, p.b, p.a < p.b ? 'a' : 'b'); }
  const before = JSON.stringify(cmp.order());
  const sizeBefore = cmp.size;

  const p = cmp.next();
  cmp.record(p.a, p.b, 'a');
  cmp.undo();

  check('ordering is restored', JSON.stringify(cmp.order()) === before);
  check('class count is restored', cmp.size === sizeBefore);
  check('history length is restored', cmp.history.length === 6);
}

/* ---- Dropping a tie splits the class again --------------------------- */

console.log('\nUndoing a tie');
{
  const cmp = Compare.create(['a', 'b', 'c', 'd']);
  const p = cmp.next();
  cmp.record(p.a, p.b, 'tie');
  check('a tie merges two items', cmp.size === 3, `${cmp.size} classes`);
  const entry = cmp.history[0];
  check('the entry can be dropped', cmp.dropEntry(entry) === true);
  check('which splits them again', cmp.size === 4, `${cmp.size} classes`);
  check('and the pair is askable once more', !cmp.related(cmp.classOf(p.a), cmp.classOf(p.b)));
}

/* ---- force() and refineTop() ------------------------------------------ */

console.log('\nForcing and refining');
{
  const cmp = Compare.create(['a', 'b', 'c', 'd', 'e']);
  cmp.force(0, 4);
  const p = cmp.next();
  check('force() asks exactly that pair', p && ((p.a === 0 && p.b === 4) || (p.a === 4 && p.b === 0)), JSON.stringify(p));

  const c2 = Compare.create(shuffled(10));
  for (;;) { const q = c2.next(); if (!q) break; c2.record(q.a, q.b, 'a'); }
  c2.refineTop(3);
  check('refining a settled order asks nothing', c2.next() === null);
}

/* ---- Restoring from a saved history ---------------------------------- */

console.log('\nReplay');
{
  const items = shuffled(12);
  const { cmp } = play(items, Number);
  const saved = cmp.history;
  const restored = Compare.create(items);
  restored.loadHistory(saved);
  check('a reloaded history reproduces the order',
    JSON.stringify(restored.order()) === JSON.stringify(cmp.order()));
  check('and the same class count', restored.size === cmp.size);
}

/* ---- Degenerate inputs ------------------------------------------------ */

console.log('\nEdge cases');
{
  const one = Compare.create(['only']);
  check('a single item asks nothing', one.next() === null);
  check('a single item predicts no questions', Compare.predictTotal(1) === 0);
  check('an empty list is harmless', Compare.create([]).next() === null);

  const two = Compare.create(['a', 'b']);
  const p = two.next();
  check('two items ask exactly one question', p !== null);
  two.record(p.a, p.b, 'a');
  check('and then finish', two.next() === null);
  check('with both placed', two.order().placed.length === 2);
}

/* ---- Benchmarks (the numbers quoted in the READMEs) ------------------- */

if (process.argv.includes('--bench')) {
  console.log('\nMeasured over random inputs');
  console.log('   n   trials   questions   log2(n!)   over optimal   predicted   target recedes');
  for (const n of [5, 8, 12, 20, 30, 50]) {
    const trials = n <= 20 ? 40 : 20;
    let total = 0, recedes = false, correct = true;
    const predicted = Compare.predictTotal(n);

    for (let t = 0; t < trials; t++) {
      const items = shuffled(n);
      const cmp = Compare.create(items);
      const first = cmp.progress().total;
      let prev = first, asked = 0;
      for (;;) {
        const p = cmp.next();
        if (!p) break;
        cmp.record(p.a, p.b, (+items[p.a]) < (+items[p.b]) ? 'a' : 'b');
        const cur = cmp.progress().total;
        if (cur > prev && cur > first) recedes = true;
        prev = cur;
        asked++;
      }
      const got = cmp.order().placed.map((c) => +cmp.label(c)[0]);
      if (!got.every((v, i) => v === i)) correct = false;
      total += asked;
    }

    let optimal = 0;
    for (let k = 2; k <= n; k++) optimal += Math.log2(k);
    const mean = total / trials;
    console.log(
      `${String(n).padStart(4)} ${String(trials).padStart(8)} ${mean.toFixed(1).padStart(11)} ` +
      `${optimal.toFixed(1).padStart(10)} ${((mean / optimal - 1) * 100).toFixed(1).padStart(13)}% ` +
      `${String(predicted).padStart(11)} ${String(recedes).padStart(16)}`
    );
    if (!correct) { console.log('     FAIL: an ordering came out wrong'); failures++; }
  }
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
