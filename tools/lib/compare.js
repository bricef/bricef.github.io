/* ==========================================================================
   Pairwise comparison engine — shared by the tools under /tools/.

   Give it a list. It hands you two items at a time and, from your answers,
   builds an order. Used by Ranker to order a whole list, and by the decision
   matrix to weigh criteria against each other.

   MODEL
   The answer history is the only state; the order, the confidence bounds and
   the next question are all derived from it by replay. That makes undo,
   resume-from-storage and "un-tie those two" the same cheap operation: change
   the history, rebuild.

   Ties merge items into an equivalence class (union-find). Strict preferences
   become edges between classes, and the full transitive closure of that graph
   is kept. Two things fall out:

     · A question whose answer is already implied is never asked. If A beats B
       and B beats C, "A or C?" never appears.
     · A preference cycle cannot form. A tie is only ever offered between two
       classes with no path either way, and merging two unconnected classes
       cannot close a loop.

   The price of never re-asking is that a wrong answer is permanent, so undo
   goes all the way back to the first one.

   Exposed as a global because the tools are plain scripts with no build step.
   ========================================================================== */

'use strict';

var Compare = (function () {

  /* ---- Bitsets: one bit per class ------------------------------------ */

  const bsNew = (m) => new Uint32Array((m + 31) >> 5);
  const bsSet = (s, i) => { s[i >> 5] |= (1 << (i & 31)); };
  const bsGet = (s, i) => (s[i >> 5] >>> (i & 31)) & 1;

  function popcount(x) {
    x = x - ((x >>> 1) & 0x55555555);
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    x = (x + (x >>> 4)) & 0x0f0f0f0f;
    return (Math.imul(x, 0x01010101) >>> 24);
  }

  function bsCount(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) n += popcount(s[i]);
    return n;
  }

  /* ---- How many questions a list of this size will take ---------------

     A live estimate reads better on paper and behaves worse in practice. The
     obvious one — sum each item's remaining position range — overcounts early,
     because those ranges are highly correlated: it falls more slowly than the
     answer count rises, so the predicted total climbs through the first half
     of every run. Measured at up to +48% on a 50-item list before falling
     back. A finish line that moves away from you is worse than one that is
     slightly wrong, so this is fixed at the start and only revised if a run
     actually overruns it. Measured against random inputs it runs about 15%
     high on a 10-item list and 2% low on a 50-item one. Always shown with "~".
  */
  const estimateDiscount = (n) => 1 - 0.85 / Math.log2(Math.max(8, n));
  const predictTotal = (n) => (n < 2 ? 0 : Math.ceil(n * Math.log2(n) * estimateDiscount(n)));

  /* ---- An in-progress comparison -------------------------------------- */

  function create(itemList) {
    const items = itemList.slice();

    let history = [];        // {a, b, r} — item indices, r is 'a'|'b'|'tie'
    let model = null;        // everything derived
    let forcedPair = null;   // [a, b] to ask next, from "settle it"
    let limitTop = 0;        // >0 restricts questions to the top N positions
    let predicted = predictTotal(items.length);

    function rebuild() {
      const n = items.length;

      // 1. Union-find over ties.
      const parent = new Array(n);
      for (let i = 0; i < n; i++) parent[i] = i;
      const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
      const union = (x, y) => { const rx = find(x), ry = find(y); if (rx !== ry) parent[rx] = ry; };
      for (const h of history) if (h.r === 'tie') union(h.a, h.b);

      // 2. Compact class indices, preserving first-appearance order.
      const classOf = new Array(n);
      const classes = [];
      const rootToClass = new Map();
      for (let i = 0; i < n; i++) {
        const r = find(i);
        let c = rootToClass.get(r);
        if (c === undefined) { c = classes.length; rootToClass.set(r, c); classes.push([]); }
        classOf[i] = c;
        classes[c].push(i);
      }
      const m = classes.length;

      // 3. Strict-preference edges between classes.
      const adj = Array.from({ length: m }, () => new Set());
      const radj = Array.from({ length: m }, () => new Set());
      for (const h of history) {
        if (h.r === 'tie') continue;
        const hi = classOf[h.r === 'a' ? h.a : h.b];
        const lo = classOf[h.r === 'a' ? h.b : h.a];
        if (hi === lo) continue;             // absorbed by a later tie
        adj[hi].add(lo);
        radj[lo].add(hi);
      }

      // 4. Transitive closure both ways. down[c] and up[c] include c itself.
      const reach = (graph) => {
        const out = [];
        for (let s = 0; s < m; s++) {
          const bs = bsNew(m);
          bsSet(bs, s);
          const stack = [s];
          while (stack.length) {
            const u = stack.pop();
            for (const v of graph[u]) if (!bsGet(bs, v)) { bsSet(bs, v); stack.push(v); }
          }
          out.push(bs);
        }
        return out;
      };
      const down = reach(adj), up = reach(radj);
      const downN = down.map(bsCount), upN = up.map(bsCount);

      // 5. Position bounds. Nothing can rank above everything known to beat
      //    it, nor below everything it beats. When those meet, it is locked.
      const minPos = [], maxPos = [];
      for (let c = 0; c < m; c++) {
        minPos.push(upN[c]);
        maxPos.push(m - downN[c] + 1);
      }

      model = { m, classes, classOf, down, up, downN, upN, minPos, maxPos };
    }

    const related = (x, y) =>
      x === y || !!bsGet(model.down[x], y) || !!bsGet(model.down[y], x);

    const isUnplaced = (c) =>
      model.upN[c] === 1 && model.downN[c] === 1 && model.m > 1;

    function openPairs() {
      const out = [];
      for (let x = 0; x < model.m; x++) {
        if (limitTop && model.minPos[x] > limitTop) continue;
        for (let y = x + 1; y < model.m; y++) {
          if (limitTop && model.minPos[y] > limitTop) continue;
          if (!related(x, y)) out.push([x, y]);
        }
      }
      return out;
    }

    /* Pick the pair that guarantees the most progress whichever way it is
       answered. Answering x > y settles every (ancestor of x, descendant of y)
       pair at once, so |up[x]| * |down[y]| counts what that answer resolves.
       Score each candidate by its *worse* outcome and take the best of those —
       a minimax choice, so a question is never a gamble that might resolve
       almost nothing. */
    function next() {
      if (forcedPair) {
        const [a, b] = forcedPair;
        forcedPair = null;
        const ca = model.classOf[a], cb = model.classOf[b];
        if (ca !== cb && !related(ca, cb)) return { a, b };
      }

      const cands = openPairs();
      if (!cands.length) return null;

      let best = -1, bestPairs = [];
      for (const [x, y] of cands) {
        const score = Math.min(model.upN[x] * model.downN[y], model.upN[y] * model.downN[x]);
        if (score > best) { best = score; bestPairs = [[x, y]]; }
        else if (score === best) bestPairs.push([x, y]);
      }

      const [cx, cy] = bestPairs[Math.floor(Math.random() * bestPairs.length)];
      // Randomise which side each lands on, so screen position carries no
      // signal about what the engine already believes.
      const [lo, hi] = Math.random() < 0.5 ? [cx, cy] : [cy, cx];
      return { a: model.classes[lo][0], b: model.classes[hi][0] };
    }

    /* Display order: most-constrained first, with never-compared items pushed
       to the end rather than given a position they have not earned. */
    function order() {
      const placed = [], unplaced = [];
      for (let c = 0; c < model.m; c++) (isUnplaced(c) ? unplaced : placed).push(c);
      placed.sort((p, q) =>
        model.minPos[p] - model.minPos[q] ||
        model.maxPos[p] - model.maxPos[q] ||
        model.classes[p][0] - model.classes[q][0]);
      unplaced.sort((p, q) => model.classes[p][0] - model.classes[q][0]);
      return { placed, unplaced };
    }

    function rank(c) {
      const min = model.minPos[c], max = model.maxPos[c];
      const width = max - min + 1;
      let confidence;
      if (isUnplaced(c)) confidence = 'unplaced';
      else if (width === 1) confidence = 'settled';
      else if (width <= Math.max(2, Math.round(model.m * 0.2))) confidence = 'close';
      else confidence = 'loose';
      return { min, max, width, settled: width === 1, confidence };
    }

    function progress() {
      const done = history.length;
      const open = openPairs().length;
      if (open === 0) return { done, total: done, pct: 100 };
      // Refining a slice is a short burst, so count what is actually left.
      const total = limitTop ? done + open : Math.max(predicted, done + 1);
      return { done, total, pct: Math.min(99, Math.round((done / total) * 100)) };
    }

    rebuild();

    return {
      get items() { return items.slice(); },
      get size() { return model.m; },
      get count() { return items.length; },
      get history() { return history.slice(); },
      get done() { return openPairs().length === 0; },

      loadHistory(h) { history = Array.isArray(h) ? h.slice() : []; rebuild(); },
      record(a, b, r) {
        if (r === 'tie') {
          const ca = model.classOf[a], cb = model.classOf[b];
          if (ca === cb || related(ca, cb)) return false;   // would not be legal
        }
        history.push({ a, b, r });
        rebuild();
        return true;
      },
      undo() { const h = history.pop(); rebuild(); return h; },
      dropEntry(entry) {
        const i = history.indexOf(entry);
        if (i < 0) return false;
        history.splice(i, 1);
        rebuild();
        return true;
      },

      next,
      force(a, b) { forcedPair = [a, b]; },
      refineTop(n) { limitTop = n | 0; },

      order,
      rank,
      progress,
      openPairs: () => openPairs().length,
      related,
      classItems: (c) => model.classes[c].slice(),
      classOf: (i) => model.classOf[i],
      label: (c) => model.classes[c].map((i) => items[i]),
    };
  }

  return { create, predictTotal };
})();

/* Node (tests) as well as the browser. */
if (typeof module !== 'undefined' && module.exports) module.exports = Compare;
