# Ranker

Rank any list by comparing two things at a time. Paste a list, answer "which of
these do you prefer?" until an order falls out.

Live at **<https://fractallambda.com/tools/ranker/>**. No build step, no dependencies,
no backend — four files that get copied to the server as-is.

---

## Using it

Paste one item per line, hit **Start ranking**, then answer questions.

| Key | Does |
| --- | --- |
| <kbd>←</kbd> <kbd>→</kbd> | Choose the left or right item |
| <kbd>space</kbd> | Too close to call — record a tie |
| <kbd>U</kbd> | Undo the last answer |
| <kbd>S</kbd> | Show standings |

Everything is saved to `localStorage` after each answer, so closing the tab
mid-run and coming back later resumes where you left off. A 50-item list is a
20-minute commitment; losing it to an accidental reload would be the worst bug
this thing could have.

You can stop whenever you like. **Standings → Stop here** takes the current
best-guess order and goes straight to the results.

---

## How it decides what to ask

The answer history is the only durable state. Everything else — the order, the
confidence bands, what to ask next — is derived by replaying it. That is why
undo, resume-after-refresh, and "actually, un-tie those two" are all the same
cheap operation: change the history, rebuild.

**It never asks a question it can already answer.** Preferences form a directed
graph, and the app keeps its full transitive closure. If you have said A beats B
and B beats C, then "A or C?" never appears. On a 20-item list that is the
difference between 190 questions and about 64.

**It asks the question that helps most, whichever way you answer.** Saying
*x beats y* settles every pair made of (something above x, something below y) in
one go, so `|ancestors(x)| × |descendants(y)|` counts what that answer would
resolve. Each candidate pair is scored by its *worse* outcome and the best of
those is chosen — a minimax pick, so no question is a gamble that might tell us
almost nothing. Bitsets make this cheap enough to score every open pair on every
turn.

**Ties merge items rather than ordering them.** A tie unions two items into one
equivalence class, and from then on they are ranked as a unit. This is also why
preference cycles are impossible: a tie is only ever offered between two classes
with no path either way, and merging two unconnected classes cannot close a
loop. You cannot get the app into a state where A > B > C > A.

The price of never re-asking is that a misclick is permanent — nothing later
will contradict it. Hence undo going all the way back to the first answer.

### What "settled" means

It is computed, not guessed. An item cannot rank above everything known to beat
it, nor below everything it beats, which gives an exact range of possible
positions. When that range narrows to one, the position is locked no matter how
the remaining questions go.

The bands in the standings and results lists *are* that range — the track spans
every place in the list, the band covers the places the item could still land.
Watching bands narrow to ticks is the clearest picture of the order forming, and
a finished ranking draws a clean diagonal staircase.

### How many questions it takes

Measured over random inputs with `node test.js --bench`:

| Items | Questions | `log2(n!)` (optimal) | Over optimal |
| ----: | --------: | -------------------: | -----------: |
| 5     | 7.1       | 6.9                  | 3% |
| 12    | 29.1      | 28.8                 | 1% |
| 20    | 64.3      | 61.1                 | 5% |
| 30    | 116.5     | 107.7                | 8% |
| 50    | 242.8     | 214.2                | 13% |

Close enough to the information-theoretic floor that the remaining gains are not
worth the complexity.

### Why the progress estimate is fixed, not live

The obvious live estimate — sum each item's remaining position range — is
badly behaved. Those ranges are highly correlated, so the sum falls more slowly
than the answer count rises, and the predicted total *climbs* through the first
half of every run: measured at +48% on a 50-item list before falling back.

A finish line that moves away from you is worse than one that is slightly wrong,
so the total is predicted once from the item count and only revised if a run
genuinely overruns it, one question at a time. It runs about 15% high on a
10-item list and 2% low on a 50-item one, so most runs finish a little early.
The `~` in "12 of ~34" is doing real work.

---

## Design notes

**The leaderboard is deliberately hidden.** It is one keypress away, never
ambient. If the running order is visible while you answer, you start answering
to defend the order instead of answering honestly.

**No rounds, no breather screens.** Answer a question, the next one is already
there. The compare screen never interrupts itself — no round counter, no
between-round summary, no next button. The only interruptions are ones you reach
for.

**Two co-equal accent colours.** The palette's one hard rule: `--side-a` and
`--side-b` are matched in perceived luminance and sit opposite each other on the
blue/yellow axis. A tool for eliciting an honest preference must never make one
side look more appealing than the other, and must stay legible to red-green
colour blind users. Which item lands on which side is randomised per question
for the same reason.

**Stopping early is a feature.** Most people want the top five right and do not
care about the bottom half. The results screen then flags the weak joints —
neighbours that were never directly compared, and pairs you called a tie — with
a one-click question to settle each. That is the highest-value ten seconds in
the app.

**Manual reorder is allowed.** After all that work, if position six is just
wrong, the ↑/↓ buttons fix it. The tool serves the ranking, not the reverse.

The visual language throughout is the sorting network: rails, nodes, and the
connector joining two things under comparison. On mobile the cards stack and
that connector becomes vertical, which is the most literal comparator view of
the lot.

---

## Files

| | |
| --- | --- |
| `index.html` | Markup for all three screens plus the standings overlay |
| `style.css` | Design tokens and layout |
| `app.js` | Ranking engine, rendering, persistence, export |
| `test.js` | Node test suite for the engine |

## Working on it

```sh
make serve          # from the repo root — http://localhost:8080/tools/ranker/
node test.js        # correctness
node test.js --bench   # plus the measurements quoted above
```

`test.js` loads the real `app.js` behind a stub DOM rather than duplicating any
logic, so whatever ships is what gets tested. It has no dependencies.

## Deploying

Push to `master`. GitHub Pages serves this repo at `fractallambda.com` and the
files land at `/tools/ranker/`.

> [!IMPORTANT]
> **Do not add YAML front matter to `index.html`.** Jekyll only runs Liquid on
> files that have front matter; everything else is copied through byte for byte.
> Adding front matter here would wrap a full-screen app in the site layout *and*
> let Liquid try to interpret any `{{` that appears in the JavaScript. The other
> pages on this site (`calendar/`, `talks/`, …) deliberately do the opposite.

There is no build step and nothing to install. `make serve` in the repo root is
a plain static file server, and it previews `/tools/ranker/` at exactly the path it
deploys to, so there are no path-rewriting surprises.
