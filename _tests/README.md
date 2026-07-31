# Browser tests

End-to-end tests for the tools under [`/tools/`](../tools/) — the paths that
sit above the comparison engine and can only be checked by driving a real
browser: undo, resume from storage, export, the scoring sheet, and whether the
chart's geometry agrees with the numbers it prints.

## Why this directory starts with an underscore

Jekyll ignores files and directories whose names begin with `_`, apart from the
handful it defines itself. So everything in here is version-controlled and
runnable, and none of it is copied into the built site — no `package.json`, no
test source, and no 115 MB of Chromium at `fractallambda.com/_tests/`.

This is also why the tools themselves keep only dependency-free tests
(`tools/lib/compare.test.js`, which runs under plain `node`). Those live beside
the code they test because they ship with it. Anything needing `npm install`
lives here instead, so the published tools stay a directory of static files with
no build step and nothing to install.

## Running them

```sh
cd _tests
npm run setup     # once — installs Playwright and its Chromium
npm test
```

`npm test` runs the engine tests first (fast, no browser), then each browser
suite. The exit code is the number of failures.

```sh
npm test ranker              # one suite: engine | ranker | matrix | sensitivity
npm run bench                # engine benchmarks quoted in the tool READMEs
npm run test:live            # run everything against the deployed site
BASE=http://localhost:8080/tools npm test    # or against `make serve`
```

With no `BASE`, tests run against the working copy over `file://` — the tools
are plain scripts with no module loading, so they run straight off disk with
nothing to serve. `npm run test:live` is worth running after a deploy: it is the
only check that catches a path that resolves locally but not once published.

If Playwright cannot find a browser, either run `npm run setup` or point
`CHROMIUM_PATH` at one you already have.

## What is here

| | |
| --- | --- |
| `run.mjs` | Runner — engine tests, then the browser suites |
| `lib/harness.mjs` | Browser launch, URL resolution, check/report helpers |
| `ranker.test.mjs` | Settling a tie, reorder, export, adding items, refine, resume, bad input |
| `matrix.test.mjs` | Weighing, scoring sheet, chart arithmetic, reorder, export, resume, equal weights |
| `sensitivity.test.mjs` | A deliberately fragile decision, so the "this might flip" warning is exercised |

Every suite fails on an uncaught exception or a console error, not just on a
failed assertion — a tool that renders correctly while throwing is not passing.
The one exception is a missing favicon under `file://`, where absolute paths
have nothing to resolve against.

## Adding a tool

Copy `sensitivity.test.mjs` — it is the smallest one. Export a default async
function that takes no arguments and returns the failure count, then add it to
`SUITES` in `run.mjs`. `urlFor('yourtool')` resolves to the right place in
whichever mode the run is in.
