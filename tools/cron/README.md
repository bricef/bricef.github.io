# Cron explainer

Read a cron expression in plain English, and see exactly when it fires next.

Live at **<https://fractallambda.com/tools/cron/>**. No build step, no
dependencies, no backend.

---

## The two things it exists for

Plenty of tools translate cron to English. These are the parts most of them get
wrong, and the reason this one exists.

### The day-of-month / day-of-week rule

When **both** day fields are restricted, Vixie cron fires when *either*
matches, not both. So `0 0 13 * 5` is not "Friday the 13th" — it is every 13th
of the month **and also** every Friday. That is roughly four times as often as
intended, and it is the single most common way a cron job surprises someone.

The tool states it in the description, flags it as a warning, and — most
usefully — the next-ten-runs list simply shows the non-Fridays sitting there
among the Fridays. You do not have to take its word for it.

Cron cannot express the intersection at all. "The first Monday of the month"
has to be a daily job with the test inside it.

### Time zones and daylight saving

Cron matches wall-clock fields in whatever zone the daemon runs in. That is
usually UTC on a server and almost never the zone of the person reading the
expression, so the zone is a required input rather than an assumption — and it
defaults to **UTC**, not to your own, because assuming the reader's zone is
exactly how a schedule gets misread by an hour. When the two differ, each run
also shows your local time underneath.

Firing times are found by walking wall-clock fields and mapping each match to
an instant, which makes daylight saving fall out correctly rather than needing
correction. A job at 01:30 has **no run at all** on the day the UK clocks go
forward, because 01:30 does not happen that day. Cron does not make it up
later, and the tool says so rather than quietly listing nine runs instead of
ten.

## What it accepts

- Standard five fields, and six with seconds first (Quartz/Spring style, which
  is flagged as not being Vixie cron).
- `*`, lists `1,2,3`, ranges `1-5`, steps `*/15`, range-steps `0-30/10`, and
  the `5/20` form meaning "from 5 onwards, every 20".
- Names: `JAN`–`DEC`, `MON`–`SUN`, case-insensitive. `7` and `0` are both Sunday.
- `@yearly`, `@annually`, `@monthly`, `@weekly`, `@daily`, `@midnight`,
  `@hourly`, and `@reboot` — which is accepted, described as having no
  schedule, and lists nothing rather than inventing times.

Not supported: Quartz's `L`, `W` and `#`. They are not portable and pretending
otherwise would mislead more than it helped.

## Warnings it raises

- Both day fields set — the rule above.
- Every-minute and other very frequent schedules, with the daily count.
- Days past the 28th, which skip whole months. February has no 30th, and cron
  does not clamp — it just does not fire.
- Six fields, which standard cron will reject.

An ordinary daily job raises nothing. A tool that warns about everything is a
tool nobody reads.

## Files

| | |
| --- | --- |
| `index.html` | Markup |
| `style.css` | Layout, the field map, the run list |
| `app.js` | Reading the box, rendering, remembering the zone |
| `cron.js` | Parsing, description, warnings, next firings — no DOM |
| `cron.test.js` | Dependency-free tests |

## Working on it

```sh
make serve            # from the repo root — localhost:8080/tools/cron/
node cron.test.js     # parser, scheduler, DST, descriptions
```

Firing times in the tests are checked against dates worked out by hand, and the
daylight-saving cases against real UK transition dates. A tool that reports the
wrong next-run time is worse than no tool, because you will believe it.

End-to-end tests are in [`../../_tests/`](../../_tests/) (`npm test cron`).

## Deploying

Push to `master`.

> [!IMPORTANT]
> **No YAML front matter in these files.** Jekyll only runs Liquid on files
> that have it; everything else is copied through byte for byte.
