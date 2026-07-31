# Decision matrix

Score options against the things you care about — having weighed those by
comparison rather than guessing the percentages.

Live at **<https://fractallambda.com/tools/matrix/>**. No build step, no
dependencies, no backend.

---

## The idea

The part people get wrong about decision matrices is the weights. Asked to put
a number on "how much does operational cost matter", everyone invents one, and
the invented numbers decide the outcome. A matrix built that way is a way of
laundering a gut feeling into a spreadsheet.

So the weights are not typed in. They come out of the same pairwise comparison
engine [Ranker](../ranker/) uses: you answer *"which matters more?"* a handful
of times, and the ranking that falls out becomes the weights. Four criteria
takes about five questions.

Scores stay direct — a 1–5 rating per option per criterion. People are good at
"how does this option do on this one axis" and bad at trading axes off against
each other, so the comparison engine is spent only where it earns its keep.

## Using it

1. **Setup** — name the decision, list the options, list what matters.
2. **Weigh** — answer "which matters more?" until the criteria are ordered.
   <kbd>←</kbd> <kbd>→</kbd> to choose, <kbd>space</kbd> for equally important,
   <kbd>U</kbd> to undo. **Equal** skips the whole step and weighs everything
   the same.
3. **Score** — rate each option on each criterion, 1 to 5.
4. **Result** — options ranked by weighted score, with each criterion's
   contribution shown, plus how fragile the answer is.

Everything is saved to `localStorage` as you go, so you can close the tab and
come back.

## Rank to weights

Turning "cost beats latency beats familiarity" into numbers uses **rank-order
centroid** weights — the centroid of every weight vector consistent with that
ordering:

$$w_i = \frac{1}{n}\sum_{k=i}^{n}\frac{1}{k}$$

It is the honest answer to *"I know cost beats latency, but not by how much"*:
no magnitude is invented beyond the ordering you actually gave. For four
criteria it produces 52% / 27% / 15% / 6%.

That is steeper than most people expect, and it is meant to be — with only an
ordering to go on, the top criterion really does deserve most of the weight.
If it feels wrong, that is a signal worth listening to: either the ordering is
not what you meant (reorder it on the results screen and the weights recompute)
or the criteria genuinely matter about the same, which is what the **Equal**
button is for. Criteria you called equally important share the average of the
positions they occupy.

## How solid is this?

A single ranked list invites more confidence than it has earned, so the results
screen tries to undermine its own answer:

- **The margin.** If first and second are within 3% of the scale, it says so —
  that is a coin flip, not a result.
- **Equal weights.** Re-runs the ranking with every criterion weighed the same.
  If the winner changes, the outcome is a product of the weighting rather than
  the scores.
- **Drop-one.** Re-runs it once per criterion with that criterion removed and
  the rest renormalised. "Drop *horizontal scale* and CockroachDB wins" is
  exactly the kind of thing you want to know before committing.

All three are exact re-computations, not estimates. When nothing flips, the
block stays hidden — silence means the result survived.

## The chart

Each option is a horizontal bar out of 5, split into one segment per criterion,
sized by that criterion's contribution (`score × weight`). The empty remainder
is the headroom to a perfect 5.

Colour is assigned per criterion in fixed order and never cycled or reassigned,
so a criterion keeps its colour when you reorder. The eight hues are validated
against this surface: all sit inside the dark lightness band, clear the chroma
floor, hold ≥ 3:1 contrast, and the worst adjacent pair separates by ΔE 8.4
under protanopia. Colour is never the only channel — every criterion is in the
legend with its weight, wide segments are labelled directly, hovering a segment
shows the arithmetic, and **Show table** gives the same numbers as text.

Eight criteria is a hard limit. Past that the colours stop being tellable apart
and, more to the point, criteria that numerous almost always contain two that
measure the same thing.

## Files

| | |
| --- | --- |
| `index.html` | Markup for all four screens |
| `style.css` | Scoring sheet, chart, series palette |
| `app.js` | Weights, scoring, chart, sensitivity, export |

The comparison engine, the shared palette and the "which do you prefer?" screen
are in [`../lib/`](../lib/) and shared with Ranker.

## Working on it

```sh
make serve                     # from the repo root — localhost:8080/tools/matrix/
node ../lib/compare.test.js    # the engine both tools sit on
```

## Deploying

Push to `master`.

> [!IMPORTANT]
> **No YAML front matter in these files.** Jekyll only runs Liquid on files
> that have it; everything else is copied through byte for byte. Front matter
> here would wrap a full-screen app in the site layout *and* let Liquid try to
> interpret any `{{` in the JavaScript.
