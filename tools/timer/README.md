# Talk timer

A countdown you can read from a podium, that counts up once you are over.

Live at **<https://fractallambda.com/tools/timer/>**. No build step, no
dependencies, no backend.

---

## What it is for

You are mid-sentence, three metres from a laptop, in a dark room, and you have
half a second to look. That is the whole design brief, and everything follows
from it: the clock takes as much of the viewport as it can get, the controls
fade back once it is running, and the state is legible before you have read a
digit.

## Two decisions worth stating

**Overtime counts up.** A timer that stops at 00:00 has thrown away the number
you most need. Standing at a lectern, *"you are two minutes over"* is far more
actionable than *"you are out of time"*, so zero is not the end of the count —
it is a change of direction, and the display flips to `+2:15`.

**Nothing makes a sound.** A talk timer that beeps interrupts the talk it is
meant to be helping. Every signal is visual, and every state carries a word as
well as a colour, so it still works for someone who does not see the colour and
for a room where a chime would be mortifying.

## Guards

- **Reset only works while paused.** The catastrophic mistake here is wiping
  the clock mid-talk with a stray keystroke. Requiring a pause first makes it
  two deliberate actions rather than one, and pressing <kbd>R</kbd> while
  running says so instead of doing nothing silently.
- **The length cannot change once started.** There is no honest meaning for
  "make this talk longer" halfway through.
- **A wake lock is held while running**, because a screen that sleeps behind
  you is the other way this fails on stage. If the browser refuses, the timer
  is still correct — the screen might just dim.
- **The running state is not saved.** Resuming a timer that has been counting
  since yesterday would be worse than starting over. Only the chosen length is
  remembered.

## Thresholds

Proportional for short talks, absolute for long ones — five minutes of warning
is right for a conference slot and absurd for a lightning talk.

| | Warning | Last stretch |
| --- | --- | --- |
| 60 min | 5 min left | 1 min left |
| 30 min | 5 min left | 1 min left |
| 5 min | 1 min left | 30 s left |

## Keys

<kbd>space</kbd> start and pause · <kbd>R</kbd> reset, once paused ·
<kbd>F</kbd> full screen

## Deliberately not in this version

Per-segment breakdowns — "10 minutes on the problem, 15 on the approach, 5 for
questions" — which is the obvious second version. Also no multiple saved talks
and no sound. A first version that does one thing you can trust beats one with
four things you have to check.

## Files

| | |
| --- | --- |
| `index.html` | Markup — one screen, no setup step |
| `style.css` | The face, the states, the receding controls |
| `app.js` | Ticking, painting, wake lock, full screen |
| `timer.js` | The model — no DOM, time passed in rather than read |
| `timer.test.js` | Dependency-free tests, none of which wait for real seconds |

## Working on it

```sh
make serve            # from the repo root — localhost:8080/tools/timer/
node timer.test.js    # pausing, overtime, thresholds, the clock face
```

The model takes `now` as an argument rather than calling `Date.now()`, so every
pause and overtime case is tested instantly and deterministically. End-to-end
tests are in [`../../_tests/`](../../_tests/) (`npm test timer`).

## Deploying

Push to `master`.

> [!IMPORTANT]
> **No YAML front matter in these files.** Jekyll only runs Liquid on files
> that have it; everything else is copied through byte for byte.
