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
| [`timer/`](timer/) | A countdown you can read from a podium |
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

Nothing outstanding — the list that started this is built. The obvious next
step is a second version of the talk timer with per-segment breakdowns, which
was deliberately left out of the first.

### What doesn't fit

Worth writing down so it doesn't get re-proposed:

- **Anything needing an API key.** There is nowhere to put a secret in a static
  page. If it needs one it needs a backend, and then it is not this.
- **Anything built on live external data.** An LLM cost calculator would be
  useful, but its pricing table rots silently — a tool confidently reporting
  last year's prices is worse than no tool.
- **Anything needing sync across devices.** `localStorage` is per-browser. That
  is a real ceiling, and pretending otherwise means a backend.

## Check it-tools first

**<https://it-tools.tech>** — 86 browser-only developer tools, open source at
[`CorentinTh/it-tools`](https://github.com/CorentinTh/it-tools). It occupies
almost exactly this niche and does it well. **Do not build something it already
has.**

The definitive list is the directory names under
[`src/tools/`](https://github.com/CorentinTh/it-tools/tree/main/src/tools) —
faster and more complete than browsing the site, which also blocks scripted
fetches:

```sh
gh api repos/CorentinTh/it-tools/contents/src/tools --jq '.[] | select(.type=="dir") | .name'
```

The rule is forward-looking. The existing overlap below is accepted and nothing
needs undoing — it is recorded so the map is accurate, not as a to-do list.

### Where this collection already overlaps

| Ours | Theirs | How much |
| --- | --- | --- |
| Cron explainer | **Crontab generator** — *"validate and generate crontab and get the human-readable description of the cron schedule"* | Straight duplicate of the core job |
| Token inspector | **JWT parser** — *"parse and decode your JSON Web Token and display its content"* | Straight duplicate of the core job |
| Bit twiddler | **Integer base converter** — *"convert a number between different bases"* | Partial. Base conversion overlaps; the bit grid, signed/unsigned side by side, the IEEE-754 view, 64-bit and the operations do not |
| Talk timer | **Chronometer** — *"monitor the duration of a thing"* | Adjacent, not the same. Theirs counts up from zero; a talk timer counts down and then reports overtime |

Ranker, the decision matrix and the calibration trainer have no counterpart
there at all — nothing in the 86 does pairwise comparison, weighted scoring, or
confidence calibration.

Both duplicates have their own reason to exist — the cron explainer leads with
the day-of-month/day-of-week either-match rule, and the token inspector's whole
point is that nothing is sent anywhere. They stay. The point of the check is to
stop the *next* one being built without anyone looking.

## Adding one

0. **Check it-tools** (above). If it is already there, the bar is not "ours
   would be nicer" — it is that the existing one is missing something that
   actually matters, and you can say what.

1. `tools/<name>/` with `index.html`, `style.css`, `app.js` — no front matter.
2. Link the shared stylesheets first, then your own:
   ```html
   <link rel="stylesheet" href="../lib/tokens.css">
   <link rel="stylesheet" href="style.css">
   ```
   Add `../lib/comparator.css` and `<script src="../lib/compare.js">` if the
   tool asks people to choose between two things.
3. Copy one `<li>` in [`index.html`](index.html) into whichever group fits —
   **Deciding** for tools that hand you a judgement you did not have,
   **Decoding** for tools that make something you already had readable,
   **Doing** for tools you use live, while the thing is happening. If a new
   tool fits none of them, add a fourth group rather than forcing it into one.
   The talk timer is why there are three: it was neither of the first two, and
   pretending otherwise would have made both labels meaningless.
4. A `README.md` covering what isn't obvious from the code: the decisions, the
   trade-offs, and anything measured.
5. A suite in [`../_tests/`](../_tests/) — copy `sensitivity.test.mjs`, it's the
   smallest, then add it to `SUITES` in `run.mjs`. Add the dependency-free
   module test to `ENGINE_TESTS` there too.

`index.test.mjs` will fail until step 3 is done: it compares the tool
directories on disk against the cards on the index, because the way this list
goes wrong is building something and forgetting to link it — the tool works,
its own tests pass, and it is simply invisible.

Then `cd _tests && npm test`, push to `master`, and `npm run test:live` once
Pages has built.
