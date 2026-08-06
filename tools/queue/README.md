# Queueing calculator

How many workers you need, and what happens to waiting as you load them up.

Live at **<https://fractallambda.com/tools/queue/>**. No build step, no
dependencies, no backend.

---

## The half everyone gets right, and the half nobody does

Working out the worker count is easy. Forty tasks an hour at ninety seconds
each is one worker's worth of work, so you need at least one. Little's Law,
done.

The half that changes decisions is what happens *near* that number:

| Utilisation | Time spent waiting, vs the work itself |
| ---: | ---: |
| 50% | 1× |
| 80% | 4× |
| 90% | 9× |
| 95% | 19× |
| 99% | 99× |

That is not a ramp. It is a hyperbola, and the knee arrives much earlier than a
spreadsheet suggests. **Sizing a fleet to "about full" is sizing it to fall
over** — at 90% one worker going away does not cost you 10% of your capacity,
it multiplies your latency.

The chart makes this the headline, with your current configuration marked on
the curve.

## Why the chart uses a linear axis

A log y-axis would turn the hyperbola into a gentle slope. That would be
accurate and useless — the entire point is that the rise is *not* gentle, and a
linear axis is what shows a flat stretch turning vertical. It is capped at 20×
so the shape is visible; past 95% the curve keeps going off the top, which is
the honest picture.

## What it tells you

- **Utilisation**, coloured as it crosses the thresholds — and never on colour
  alone, since every band has a sentence saying the same thing.
- **Waiting, total time, queue length**, and how often an arrival finds a queue.
- **The bare minimum worker count** for the queue to drain at all.
- **Sizing for a target**: how many workers keep waiting under a given figure,
  what that costs relative to what you have, and what utilisation it lands at.

It also points out **pooling**, which is unintuitive in the useful direction:
two workers each at half load wait far less than one worker at the same total
utilisation, because a free worker can take whatever arrives.

## Instability is reported, not estimated

If more work arrives than can be finished, the queue grows without limit and
every average is meaningless. The tool says so and reports infinity rather than
a plausible-looking number, along with how many workers it would actually take.

## What the model assumes

M/M/c: Poisson arrivals, exponential service times, identical workers, one
queue. That is wrong in the details of any real system, and wrong in a
consistent direction — real traffic is burstier and real work more variable,
and **both make waiting worse**. So read the output as an optimistic bound
rather than a forecast. It is still far better than dividing throughput by rate
and hoping.

## A note on the arithmetic

Erlang C is computed through the Erlang B recursion rather than from the
textbook formula. Written directly it needs `a^c/c!`, and that term peaks
around `e^a` — which overflows a double somewhere past a few hundred servers
and then quietly returns `NaN`. B stays inside [0, 1] at every step by
construction, so it cannot overflow at any size.

## Files

| | |
| --- | --- |
| `index.html` | Markup |
| `style.css` | Layout, the utilisation bands, the chart |
| `app.js` | Reading the boxes, rendering, drawing the curve |
| `queue.js` | Erlang C, Little's Law, sizing, the notes — no DOM |
| `queue.test.js` | Dependency-free tests |

## Working on it

```sh
make serve            # from the repo root — localhost:8080/tools/queue/
node queue.test.js    # Erlang C against published values, the knee, instability
```

The tests check Erlang C against published figures *and* against the M/M/1
closed form, which it must reduce to exactly at one server — an implementation
error shows up there immediately. The knee figures in the table above are
asserted rather than described.

End-to-end tests are in [`../../_tests/`](../../_tests/) (`npm test queue`).

## Deploying

Push to `master`.

> [!IMPORTANT]
> **No YAML front matter in these files.** Jekyll only runs Liquid on files
> that have it; everything else is copied through byte for byte.
