# Token inspector

Decode a JWT or base64 blob and read what the claims mean — without handing a
live credential to someone else's website.

Live at **<https://fractallambda.com/tools/token/>**. No build step, no
dependencies, no backend.

---

## Why it exists

The usual way to read a token is to paste it into a website. That website now
has a working credential. Most of them are honest, but the habit is the
problem: it is a bearer token, so possession *is* authentication, and you have
just given it to a third party over the wire.

Decoding a JWT is string manipulation — base64 and `JSON.parse`. There is no
reason it should ever leave the browser.

## The promise, precisely

The page states this rather than gesturing at it, because a vague claim is
worth nothing:

- Pasting a token makes **no network request at all**. There is no `fetch`, no
  beacon, no analytics anywhere in the page.
- The only requests it makes are for its own stylesheet and fonts, once, at
  load — before anything is pasted.
- **Nothing is written to `localStorage` or `sessionStorage`.** Every other
  tool here remembers what you were doing; this one deliberately does not,
  because a live token left in browser storage is a credential sitting on disk
  for anything with access to the origin to read.

All three are asserted in the test suite, which records every request the page
makes from first byte to last and fails if pasting produces any. If you would
rather not take it on faith, save the page and open it with the network off —
it works exactly the same.

## What it tells you

**The three parts**, coloured the same in the raw string as in the panels
below, so the structure of a JWT is visible rather than something you have to
already know.

**Every claim, named and explained.** The registered claims from RFC 7519 plus
the OIDC ones that turn up constantly. Unrecognised claims are shown as-is
rather than guessed at. Timestamps become readable dates with a relative
distance.

**Validity**, with `iat`, now and `exp` on one axis so "how much is left" is a
proportion rather than arithmetic.

**Warnings that are worth reading:**

- `alg: none` or a missing signature — anyone can change the payload and it
  will look identical, so it proves nothing about who issued it.
- No `exp` — valid forever unless something else revokes it. If it leaks, it
  stays leaked.
- A very long life. A multi-year bearer token is a password with a worse story.
- No `aud` — a service cannot tell the token was meant for it rather than for
  something else sharing the signing key.
- `iat` in the future, which usually means a clock is wrong.
- **The token is still valid.** Then it is a working credential, and the page
  says so plainly: treat it as a password.

An expired, well-formed, short-lived token with an audience raises nothing.

## What it deliberately does not do

**It does not verify signatures.** Checking HS256 needs the shared secret, and
a tool that asks you to paste a signing secret is worse than the problem it
solves. The signature is shown and labelled unchecked so nobody mistakes
"decoded" for "valid" — a JWT payload is readable by anyone holding the token
and proves nothing on its own.

**No Quartz-style extras, no key material, no history.** All three would either
weaken the promise above or invite pasting something that should not be pasted.

## Files

| | |
| --- | --- |
| `index.html` | Markup |
| `style.css` | Layout, the three-part colouring, the timeline |
| `app.js` | Reading the box and rendering — no network, no storage |
| `token.js` | Decoding, claim dictionary, lifetime, warnings — no DOM |
| `token.test.js` | Dependency-free tests |

## Working on it

```sh
make serve             # from the repo root — localhost:8080/tools/token/
node token.test.js     # decoding, claims, warnings, hostile input
```

Every token in the tests and the on-page sample is constructed rather than
copied from anywhere real. A fixture that is somebody's actual token is a
leaked credential committed to a public repository, however expired it looks.

End-to-end tests are in [`../../_tests/`](../../_tests/) (`npm test token`).

## Deploying

Push to `master`.

> [!IMPORTANT]
> **No YAML front matter in these files.** Jekyll only runs Liquid on files
> that have it; everything else is copied through byte for byte.
