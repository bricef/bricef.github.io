/* ==========================================================================
   Tests for the ranking engine.  Run with:  node test.js  [--bench]

   app.js is a browser script with no module system, so this loads the real
   source behind a stub DOM rather than duplicating the logic. Whatever ships
   is what gets tested.
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

const stubEl = () => ({
  hidden: false, textContent: '', innerHTML: '', value: '', className: '',
  disabled: false, title: '', tagName: 'DIV', style: {},
  classList: { add() {}, remove() {}, contains() { return false; } },
  addEventListener() {}, append() {}, replaceChildren() {}, remove() {},
  focus() {}, select() {}, setAttribute() {}, setSelectionRange() {},
});

const engine = new Function('window', 'document', 'localStorage', 'navigator', SRC + `
; return {
    setup(items) {
      state = { title: 'test', items, history: [] };
      refineTop = 0; forcedPair = null;
      predictedTotal = predictTotal(items.length);
      rebuild();
    },
    push(a, b, r) { state.history.push({ a, b, r }); rebuild(); },
    pop() { state.history.pop(); rebuild(); },
    histLen: () => state.history.length,
    nextPair, orderedClasses, related, unknownPairs, confidenceOf, progress,
    predictTotal,
    m: () => model.m,
    classes: () => model.classes,
    classOf: () => model.classOf,
    down: () => model.down,
    minPos: () => model.minPos,
    maxPos: () => model.maxPos,
  };
`)(
  { matchMedia: () => ({ matches: true }), isSecureContext: false, scrollTo() {} },
  { getElementById: stubEl, createElement: stubEl, addEventListener() {}, body: stubEl(), activeElement: null },
  { getItem: () => null, setItem() {}, removeItem() {} },
  {}
);

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

const bit = (s, i) => (s[i >> 5] >>> (i & 31)) & 1;

/* A preference cycle would mean x is both above and below y. */
function acyclic() {
  const m = engine.m(), down = engine.down();
  for (let x = 0; x < m; x++)
    for (let y = x + 1; y < m; y++)
      if (bit(down[x], y) && bit(down[y], x)) return false;
  return true;
}

/* Answer questions according to `rank`, which maps an item to its true
   position (equal values mean the two are genuinely tied). */
function play(items, rank, cap) {
  engine.setup(items);
  let asked = 0, inferrable = 0, broke = false;
  for (;;) {
    const p = engine.nextPair();
    if (!p) break;
    const ca = engine.classOf()[p.a], cb = engine.classOf()[p.b];
    if (engine.related(ca, cb)) inferrable++;      // must never happen
    const va = rank(items[p.a]), vb = rank(items[p.b]);
    engine.push(p.a, p.b, va === vb ? 'tie' : (va < vb ? 'a' : 'b'));
    asked++;
    if (!acyclic()) { broke = true; break; }
    if (asked > (cap || items.length * items.length)) { broke = true; break; }
  }
  return { asked, inferrable, broke };
}

const shuffled = (n) => Array.from({ length: n }, (_, i) => i).sort(() => Math.random() - 0.5).map(String);

/* ---- Recovering a known total order ---------------------------------- */

console.log('\nStrict total order');
for (const n of [2, 3, 5, 12, 20, 40]) {
  const items = shuffled(n);
  const r = play(items, Number);
  const got = engine.orderedClasses().placed.map((c) => +items[engine.classes()[c][0]]);
  const exact = got.every((v, i) => v === i);

  check(`n=${n} recovers the true order in ${r.asked} questions`, exact && !r.broke, `got ${got.slice(0, 6)}`);
  check(`n=${n} never asks a question it could infer`, r.inferrable === 0, `${r.inferrable} inferrable`);
  check(`n=${n} places every item`, engine.orderedClasses().unplaced.length === 0);
}

/* ---- Everything is pinned once the run completes ---------------------- */

console.log('\nCompletion');
{
  const items = shuffled(15);
  play(items, Number);
  const settled = Array.from({ length: engine.m() }, (_, c) => engine.minPos()[c] === engine.maxPos()[c]);
  check('every position is locked', settled.every(Boolean));
  check('no unknown pairs are left', engine.unknownPairs(0).length === 0);
  check('progress reports 100%', engine.progress().pct === 100);
  check('confidence reads "settled"', engine.confidenceOf(0) === 'settled');
}

/* ---- Ties ------------------------------------------------------------- */

console.log('\nTies');
{
  const vals = [0, 0, 1, 2, 2, 3, 4, 4];               // deliberate duplicates
  const items = vals.map((v, i) => `v${v}-${i}`);
  const rank = (s) => vals[items.indexOf(s)];
  const r = play(items, rank, 200);

  check('stays acyclic when items are merged', !r.broke);
  check('never asks a question it could infer', r.inferrable === 0);

  const groups = engine.orderedClasses().placed.map((c) => engine.classes()[c].map((i) => vals[i]));
  const heads = groups.map((g) => g[0]);
  check('classes come out in true order', heads.every((v, i) => i === 0 || heads[i - 1] < v), JSON.stringify(heads));
  check('tied items land in one class', groups.every((g) => g.every((v) => v === g[0])));
  check('one class per distinct value', groups.length === new Set(vals).size,
    `${groups.length} vs ${new Set(vals).size}`);
}

/* ---- Undo is exact --------------------------------------------------- */

console.log('\nUndo');
{
  engine.setup(Array.from({ length: 10 }, (_, i) => `x${i}`));
  for (let k = 0; k < 6; k++) {
    const p = engine.nextPair();
    engine.push(p.a, p.b, p.a < p.b ? 'a' : 'b');
  }
  const before = JSON.stringify(engine.orderedClasses());
  const classesBefore = engine.m();

  const p = engine.nextPair();
  engine.push(p.a, p.b, 'a');
  engine.pop();

  check('ordering is restored', JSON.stringify(engine.orderedClasses()) === before);
  check('class count is restored', engine.m() === classesBefore);
  check('history length is restored', engine.histLen() === 6);
}

/* ---- Undoing a tie splits the class back apart ----------------------- */

console.log('\nUndoing a tie');
{
  engine.setup(['a', 'b', 'c', 'd']);
  const p = engine.nextPair();
  engine.push(p.a, p.b, 'tie');
  check('a tie merges two items', engine.m() === 3, `${engine.m()} classes`);
  engine.pop();
  check('undoing it splits them again', engine.m() === 4, `${engine.m()} classes`);
  check('the pair is askable again', !engine.related(engine.classOf()[p.a], engine.classOf()[p.b]));
}

/* ---- Degenerate inputs ------------------------------------------------ */

console.log('\nEdge cases');
{
  engine.setup(['only-one']);
  check('a single item asks nothing', engine.nextPair() === null);
  check('a single item predicts no questions', engine.predictTotal(1) === 0);

  engine.setup(['a', 'b']);
  const p = engine.nextPair();
  check('two items ask exactly one question', p !== null);
  engine.push(p.a, p.b, 'a');
  check('and then finish', engine.nextPair() === null);
  check('with both placed', engine.orderedClasses().placed.length === 2);
}

/* ---- Benchmarks (opt-in; these are the numbers quoted in the README) -- */

if (process.argv.includes('--bench')) {
  console.log('\nMeasured over random inputs');
  console.log('   n   trials   questions   log2(n!)   over optimal   predicted   target recedes');
  for (const n of [5, 8, 12, 20, 30, 50]) {
    const trials = n <= 20 ? 40 : 20;
    let total = 0, worst = 0, recedes = false, correct = true;
    const predicted = engine.predictTotal(n);

    for (let t = 0; t < trials; t++) {
      const items = shuffled(n);
      engine.setup(items);
      let prev = engine.progress().total;
      const first = prev;
      let asked = 0;
      for (;;) {
        const p = engine.nextPair();
        if (!p) break;
        engine.push(p.a, p.b, (+items[p.a]) < (+items[p.b]) ? 'a' : 'b');
        const cur = engine.progress().total;
        if (cur > prev && cur > first) recedes = true;
        prev = cur;
        asked++;
      }
      const got = engine.orderedClasses().placed.map((c) => +items[engine.classes()[c][0]]);
      if (!got.every((v, i) => v === i)) correct = false;
      total += asked;
      worst = Math.max(worst, asked);
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
