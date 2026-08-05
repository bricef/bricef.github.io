# Tools

Small things that do one job, at <https://fractallambda.com/tools/>. Each runs
entirely in the browser — no accounts, no servers, nothing sent anywhere.

## The shape

Every tool here holds to the same constraints, and they are the reason these
are pleasant to build and to keep:

- **One page, no build step.** Hand-written HTML, CSS and JS, copied to the
  server as-is. The source *is* the deployed artifact. Nothing to install,
  nothing to compile, nothing that rots when a toolchain moves on.
- **No backend.** State lives in `localStorage`. A tool that needs a server is
  a different kind of project and belongs somewhere else.
- **No YAML front matter.** Jekyll only runs Liquid on files that have it;
  everything else is copied byte for byte. Front matter here would wrap a
  full-screen app in the blog layout *and* let Liquid chew on any `{{` in the
  JavaScript.
- **Keyboard first, and it survives a reload.** If a tool is worth twenty
  minutes of someone's attention, losing that to an accidental refresh is the
  worst bug it could have.

## What's here

| | |
| --- | --- |
| [`ranker/`](ranker/) | Rank any list by comparing two things at a time |
| [`matrix/`](matrix/) | Score options against criteria you weighed by comparison |
| [`calibrate/`](calibrate/) | Find out whether your 90% confidence intervals really are 90% |
| [`cron/`](cron/) | Read a cron expression in plain English and see when it next fires |
| [`token/`](token/) | Decode a JWT or base64 blob without sending it anywhere |
| [`bits/`](bits/) | One number in every base at once, with the bits as the interface |
| [`lib/`](lib/) | Shared: the comparison engine, palette, and the two-card screen |

`lib/compare.js` is the pairwise comparison engine — what to ask next, what is
already implied, what is locked. It has no DOM knowledge and is used by both
tools. **Don't copy it into a third tool; extend the lib.**

Browser tests live in [`../_tests/`](../_tests/) — outside the published site,
because they need Playwright and these tools do not.

## Ideas

Not committed to, just thought through. The reasoning matters more than the
list: each of these was picked because it fits the constraints above *and*
earns its place for the way I actually work.

**Talk timer.** Full-screen countdown with a per-segment breakdown, keyboard
driven, works with no network. The usual options are phone timers or fiddly
slide-deck plugins. An afternoon's work, and it earns its place at a podium.

### What doesn't fit

Worth writing down so it doesn't get re-proposed:

- **Anything needing an API key.** There is nowhere to put a secret in a static
  page. If it needs one it needs a backend, and then it is not this.
- **Anything built on live external data.** An LLM cost calculator would be
  useful, but its pricing table rots silently — a tool confidently reporting
  last year's prices is worse than no tool.
- **Anything needing sync across devices.** `localStorage` is per-browser. That
  is a real ceiling, and pretending otherwise means a backend.

## Adding one

1. `tools/<name>/` with `index.html`, `style.css`, `app.js` — no front matter.
2. Link the shared stylesheets first, then your own:
   ```html
   <link rel="stylesheet" href="../lib/tokens.css">
   <link rel="stylesheet" href="style.css">
   ```
   Add `../lib/comparator.css` and `<script src="../lib/compare.js">` if the
   tool asks people to choose between two things.
3. Copy one `<li>` in [`index.html`](index.html) — there is a comment marking it.
4. A `README.md` covering what isn't obvious from the code: the decisions, the
   trade-offs, and anything measured.
5. A suite in [`../_tests/`](../_tests/) — copy `sensitivity.test.mjs`, it's the
   smallest, then add it to `SUITES` in `run.mjs`.

Then `cd _tests && npm test`, push to `master`, and `npm run test:live` once
Pages has built.
