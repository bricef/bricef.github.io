# Base rate calculator

A test fired. How likely is it to be right?

Live at **<https://fractallambda.com/tools/baserate/>**. No build step, no
dependencies, no backend.

---

## Why it exists

The arithmetic is four lines. The reason the tool is worth having is that
almost everyone — including people who know Bayes' theorem perfectly well —
gets the answer wrong by an order of magnitude when it is posed as
probabilities, and gets it right effortlessly when the same question is posed
as counts.

> A 99% accurate test for something that affects 1 in 10,000. It fires. Now
> what?

Asked that way, people say 99%. The real answer is **about 1%**.

Asked the other way — *out of 100,000 people, 10 have it and the test finds all
10; of the 99,990 who do not, it wrongly flags 1,000; so 1,010 are flagged and
10 of them are real* — the same people answer correctly without effort. Same
numbers, same arithmetic.

So the counts are not a supporting illustration here. They are the primary
output, laid out directly under the headline percentage rather than three
screens away, and the tool deliberately never states them as percentages.

## What it tells you

- **The number people get wrong** — given a positive, how likely it is real.
  Coloured only when most positives are false alarms, which is the finding
  worth noticing rather than a decoration.
- **The same thing counted out in people**, with a population chosen so the
  rare group is a whole number and a round one — "out of 100,000" is a
  sentence you can hold in your head; "out of 83,910" is not.
- **A split bar** of everyone the test flags: real cases against false alarms.
  The two colours are matched in luminance, because the point is the
  *proportion*, and making one louder would put a thumb on the scale of the
  very intuition this is correcting.
- **A negative result**, which is often the reassuring one and rarely asked
  about.
- **The likelihood ratio** — how much a hit actually moved you. A ratio of 1
  means the test told you nothing at all.

## Guidance, only when it applies

Three notes appear when they are true and stay silent otherwise:

- **The test tells you nothing** — a likelihood ratio of 1 is a coin flip
  wearing a lab coat.
- **Most positives are false alarms** — and, importantly, that this is not a
  broken test. It is what happens to *any* test, however good, when the thing
  it looks for is rare. When that is the case, improving specificity helps far
  more than improving sensitivity.
- **This is better at clearing than confirming** — when a negative result is
  more informative than a positive one.

## Input

A rate can be written however you actually think about it: `0.0001`, `0.01%`,
`1 in 10,000`, or `1/10000`. Thousands separators are fine.

Small answers are never rounded to `0%` — rounding away the difference between
0.98% and zero is precisely the error the tool exists to correct.

## Files

| | |
| --- | --- |
| `index.html` | Markup |
| `style.css` | Layout, the headline, the split bar |
| `app.js` | Reading three boxes and rendering |
| `bayes.js` | The arithmetic, the counts, the worked examples — no DOM |
| `bayes.test.js` | Dependency-free tests |

## Working on it

```sh
make serve            # from the repo root — localhost:8080/tools/baserate/
node bayes.test.js    # arithmetic, counts, rate parsing, degenerate cases
```

The tests check against **published worked examples** rather than a
re-derivation of the same formula — Gigerenzer's mammography figures give 7.8%,
and a 99% test on a 1-in-10,000 condition gives 0.98%. That matters more than
usual here: if the arithmetic were wrong it would still look plausible, because
nobody's intuition is going to catch it.

End-to-end tests are in [`../../_tests/`](../../_tests/) (`npm test baserate`).

## Deploying

Push to `master`.

> [!IMPORTANT]
> **No YAML front matter in these files.** Jekyll only runs Liquid on files
> that have it; everything else is copied through byte for byte.
