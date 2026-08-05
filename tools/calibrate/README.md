# Calibration trainer

Find out whether your "90% sure" is actually 90%.

Live at **<https://fractallambda.com/tools/calibrate/>**. No build step, no
dependencies, no backend.

---

## The idea

You are calibrated if, when you say you are 90% sure, you are right 90% of the
time. Not more, not less. It is a property of your *confidence*, entirely
separate from how much you know — someone who knows very little can be
perfectly calibrated by saying "60%" and being right 60% of the time.

Almost nobody is. People give 90% intervals that contain the truth well under
half the time, and experts are often worse than novices because expertise
arrives faster than accuracy does. Unlike most judgement skills this one
responds quickly to training, and the mechanism is simply a lot of questions
with immediate feedback.

So: you are asked for a range, not a number. The instruction that makes it work
is that **you should be wrong about twice in twenty**. Getting them all right
means your ranges are too wide to be worth anything.

## Where the questions come from

They are computed, not looked up. See [`questions.js`](questions.js) — fourteen
generators across physics, astronomy, geography, chemistry and maths, each
producing a question from randomised parameters and solving it exactly.

That matters for three reasons: a fixed bank gets memorised (and then the tool
measures recall, not calibration), a fixed bank rots, and looked-up facts are
ambiguous — "how tall is Everest?" has several published values, and an
ambiguous answer scored as a miss teaches you to widen intervals for the wrong
reason.

A generator only earns its place if its answers span a wide range. If every
free-fall answer landed between 1 and 30 seconds, "about 1 to 30 seconds" would
score ~100% while knowing nothing. There is a test that measures this per
generator; they currently span 1.85 to 10 orders of magnitude.

## The unit trap

The question never names a unit. Asking "…in grams?" rules out six orders of
magnitude before you have thought about anything, and magnitude reasoning is
most of what this trains. So a question asks for a *quantity* and you answer
with a number plus a unit you choose — "10.6 g", "0.0106 kg" and "1.06e-2 kg"
are all the same answer, normalised before grading. See
[`units.js`](units.js).

For the same reason the unit selector defaults to the quantity's **base** unit
rather than whichever unit happens to suit the answer — a helpful default would
leak the magnitude just as effectively as the question naming one.

## Refusing to draw conclusions

This is the part that took the most care. Given k hits out of n intervals, is
the user actually miscalibrated, or is this a small sample?

Seven hits out of ten looks alarming — 70% against a 90% target — but
`P(X ≤ 7 | n=10, p=0.9)` is 0.070, so it is ordinary luck and **the tool says
nothing**. Six out of ten gives 0.013, which is real, and then it speaks. The
verdict comes from an exact one-sided binomial test, not from eyeballing the
rate; exact rather than a normal approximation because n is small and p is near
1, which is where the approximation is worst.

"Calibrated" is a claim too. Saying it means *"if you were meaningfully off, I
would have noticed"*, so it waits until the test has the power to have noticed.
At 20 answers that power is only 0.59 — someone whose real coverage is 75%
slips through four times in ten — so a good-looking 18 of 20 confirms nothing
and the screen says how many more answers would settle it. It takes about 40.

The band on the results screen is the point: a hit rate without its uncertainty
invites a conclusion the sample cannot support, so the band is the primary mark
and the point estimate is secondary.

A tool that tells a well-calibrated user they are overconfident, on noise, is
committing the exact error it exists to cure. Simulated over 2,000 rounds, a
genuinely 90%-calibrated user is wrongly accused in ~4% of rounds — matching
the test's exact size — while a badly overconfident one is caught 99% of the
time in a single round.

## The cheat, and the check on it

Any interval can be made to contain the truth by making it absurd. So the
results screen reports the **typical interval width** — the median ratio of
high to low. A 90% hit rate achieved with intervals spanning a factor of a
million is not calibration, and the number makes that visible. If you keep
getting everything right, the tool says your ranges are wider than they need to
be rather than congratulating you.

## Two techniques it teaches

- **The equivalent bet**, shown on every question. Would you rather win £1,000
  if the truth is in your range, or spin a wheel with a 90% chance of paying
  out? If you would take the wheel, your range is too narrow. This is the
  single most effective trick for turning a vague feeling into a number, which
  is why it is in the interface rather than buried in help text.
- **Bounds first.** Pick an absurdly low value, then an absurdly high one, then
  squeeze inward. Starting from a point estimate and adding error bars anchors
  you far too narrow.

## What this does not claim

The evidence that calibration training transfers to real estimation comes
largely from general-knowledge trivia. Whether calibration acquired on computed
physics questions transfers to "how long will this migration take" is, as far
as I know, untested. It is plausible — the skill being trained is honesty about
interval width rather than any subject matter — but it is not established.

## Files

| | |
| --- | --- |
| `index.html` | Markup for the three screens |
| `style.css` | Layout, the gauge, the number line |
| `app.js` | Asking, grading, history |
| `questions.js` | The generators and their reference data |
| `units.js` | Quantities, display units, answer parsing |
| `stats.js` | Binomial test, Wilson band, power, interval width |
| `*.test.js` | Dependency-free tests for the three modules above |

## Working on it

```sh
make serve                      # from the repo root — localhost:8080/tools/calibrate/
node questions.test.js          # generators — answers checked against published values
node questions.test.js --sample # print a round to eyeball
node stats.test.js              # the statistics, including a 2,000-round simulation
```

End-to-end tests are in [`../../_tests/`](../../_tests/) (`npm test calibrate`),
outside the published site because they need Playwright.

## Deploying

Push to `master`.

> [!IMPORTANT]
> **No YAML front matter in these files.** Jekyll only runs Liquid on files
> that have it; everything else is copied through byte for byte.
