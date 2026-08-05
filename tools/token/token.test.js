/* ==========================================================================
   Tests for the token inspector.  node token.test.js

   Tokens here are built in the test rather than pasted in from anywhere real.
   A test fixture that is somebody's actual token is a leaked credential
   committed to a public repository, however expired it looks.
   ========================================================================== */

'use strict';

const T = require('./token.js');

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const b64u = (obj) => Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj))
  .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const jwt = (header, payload, sig = 'c2lnbmF0dXJl') =>
  `${b64u(header)}.${b64u(payload)}.${sig}`;

const NOW = Date.parse('2026-08-05T12:00:00Z');
const secs = (iso) => Math.floor(Date.parse(iso) / 1000);

/* ---- Recognising what was pasted ---------------------------------------- */

console.log('\nRecognition');
{
  const t = T.inspect(jwt({ alg: 'HS256', typ: 'JWT' }, { sub: 'u1' }));
  check('a three-part JWT is recognised', t.kind === 'jwt', t.kind);
  check('the header decodes', t.header.alg === 'HS256');
  check('the payload decodes', t.payload.sub === 'u1');
  check('the signature is kept as-is', t.raw.signature === 'c2lnbmF0dXJl');

  check('a Bearer prefix is stripped',
    T.inspect('Bearer ' + jwt({ alg: 'HS256' }, { sub: 'u1' })).kind === 'jwt');
  check('wrapped whitespace is tolerated',
    T.inspect(jwt({ alg: 'HS256' }, { sub: 'u1' }).replace('.', '.\n  ')).kind === 'jwt');

  const unsigned = T.inspect(`${b64u({ alg: 'none' })}.${b64u({ sub: 'u1' })}.`);
  check('an unsigned token is still read', unsigned.kind === 'jwt' && unsigned.unsigned === true);

  const plain = T.inspect(Buffer.from('hello there').toString('base64'));
  check('plain base64 falls through to a blob', plain.kind === 'base64', plain.kind);
  check('and its text is decoded', plain.text === 'hello there');

  const asJson = T.inspect(Buffer.from('{"a":1}').toString('base64'));
  check('base64 holding JSON is parsed too', asJson.json && asJson.json.a === 1);

  const binary = T.inspect(Buffer.from([0xff, 0xfe, 0x00, 0x01]).toString('base64'));
  check('base64 holding bytes is reported as binary', binary.kind === 'base64' && binary.binary === true);

  check('nothing pasted is not an error', T.inspect('').kind === 'empty');
  check('rubbish is reported as unknown', T.inspect('!!! not base64 !!!').kind === 'unknown');
  check('dots with junk between them is not called a JWT',
    T.inspect('abc.!!!.def').kind === 'unknown');
  check('three parts that are not JSON is not a JWT',
    T.inspect(`${b64u('hello')}.${b64u('there')}.sig`).kind !== 'jwt');
  check('a JSON array payload is not a JWT',
    T.inspect(`${b64u({ alg: 'HS256' })}.${b64u([1, 2, 3])}.sig`).kind !== 'jwt');
}

/* ---- Claims ------------------------------------------------------------- */

console.log('\nClaims');
{
  const t = T.inspect(jwt({ alg: 'RS256', kid: 'k1' }, {
    iss: 'https://example.test', sub: 'u1', aud: 'api',
    iat: secs('2026-08-05T11:00:00Z'), exp: secs('2026-08-05T13:00:00Z'),
    scope: 'read write', custom_thing: 'kept',
  }));

  const claims = T.claimRows(t);
  const by = (k) => claims.find((c) => c.key === k);
  check('registered claims are named', by('iss').label === 'Issuer');
  check('and explained', /minted/.test(by('iss').note));
  check('time claims are converted to milliseconds',
    by('exp').time === Date.parse('2026-08-05T13:00:00Z'), String(by('exp').time));
  check('non-time claims have no time', by('sub').time === null);
  check('unknown claims are kept rather than dropped', by('custom_thing').value === 'kept');
  check('and flagged as unrecognised', by('custom_thing').known === false);

  const head = T.headerRows(t);
  check('header keys are named too', head.find((h) => h.key === 'kid').label === 'Key id');

  // A number that is not a plausible unix time should not be read as one.
  const odd = T.inspect(jwt({ alg: 'HS256' }, { exp: 5 }));
  check('a small number is not treated as a timestamp',
    T.claimRows(odd).find((c) => c.key === 'exp').time === null);
}

/* ---- Lifetime ------------------------------------------------------------ */

console.log('\nLifetime');
{
  const live = T.inspect(jwt({ alg: 'HS256' }, {
    iat: secs('2026-08-05T11:00:00Z'), exp: secs('2026-08-05T13:00:00Z') }));
  const l = T.lifetime(live, NOW);
  check('a current token is live', l.live === true && l.expired === false);
  check('remaining time is right', l.remaining === 3600000, String(l.remaining));
  check('the full span is right', l.span === 7200000, String(l.span));

  const gone = T.inspect(jwt({ alg: 'HS256' }, { exp: secs('2026-08-01T00:00:00Z') }));
  check('an expired token is expired', T.lifetime(gone, NOW).expired === true);
  check('and not live', T.lifetime(gone, NOW).live === false);

  const early = T.inspect(jwt({ alg: 'HS256' }, {
    nbf: secs('2026-08-06T00:00:00Z'), exp: secs('2026-08-07T00:00:00Z') }));
  check('a not-yet-valid token is flagged', T.lifetime(early, NOW).notYet === true);
  check('and is not live either', T.lifetime(early, NOW).live === false);

  const forever = T.inspect(jwt({ alg: 'HS256' }, { sub: 'u1' }));
  check('a token with no expiry has none', T.lifetime(forever, NOW).exp === null);
}

/* ---- Warnings ------------------------------------------------------------ */

console.log('\nWarnings');
{
  const w = (token) => T.warnings(T.inspect(token), NOW).map((x) => x.text).join(' ');

  check('alg none is called out as forgeable',
    /Anyone can change the payload/.test(w(`${b64u({ alg: 'none' })}.${b64u({ sub: 'u' })}.`)));
  check('and marked as an alarm',
    T.warnings(T.inspect(`${b64u({ alg: 'none' })}.${b64u({ sub: 'u' })}.`), NOW)
      .some((x) => x.kind === 'alarm'));

  check('a missing expiry is called out',
    /valid forever/.test(w(jwt({ alg: 'HS256' }, { sub: 'u' }))));

  check('an expired token says how long ago',
    /expired 4 days ago/.test(w(jwt({ alg: 'HS256' }, { exp: secs('2026-08-01T12:00:00Z') }))),
    w(jwt({ alg: 'HS256' }, { exp: secs('2026-08-01T12:00:00Z') })));

  check('a multi-year token is called out',
    /password with a worse story/.test(w(jwt({ alg: 'HS256' }, {
      iat: secs('2026-01-01T00:00:00Z'), exp: secs('2029-01-01T00:00:00Z') }))));

  check('a live token is flagged as a working credential',
    /working credential/.test(w(jwt({ alg: 'HS256' }, {
      iat: secs('2026-08-05T11:00:00Z'), exp: secs('2026-08-05T13:00:00Z') }))));

  check('an expired token is NOT flagged as a working credential',
    !/working credential/.test(w(jwt({ alg: 'HS256' }, { exp: secs('2026-08-01T00:00:00Z') }))));

  check('a missing audience is noted',
    /audience claim/.test(w(jwt({ alg: 'HS256' }, { exp: secs('2026-08-05T13:00:00Z') }))));
  check('a present audience is not',
    !/audience claim/.test(w(jwt({ alg: 'HS256' }, {
      aud: 'api', exp: secs('2026-08-05T13:00:00Z') }))));

  check('an issued-in-the-future token is flagged',
    /clock is wrong/.test(w(jwt({ alg: 'HS256' }, {
      iat: secs('2026-08-06T00:00:00Z'), exp: secs('2026-08-07T00:00:00Z') }))));

  check('a short-lived, well-formed token gets no structural warnings', (() => {
    const ws = T.warnings(T.inspect(jwt({ alg: 'RS256' }, {
      aud: 'api', iat: secs('2026-08-05T11:55:00Z'), exp: secs('2026-08-05T12:05:00Z') })), NOW);
    // Only the "this is live, treat it as a password" alarm should remain.
    return ws.length === 1 && /working credential/.test(ws[0].text);
  })());

  check('base64 blobs raise no JWT warnings',
    T.warnings(T.inspect(Buffer.from('hello').toString('base64')), NOW).length === 0);
}

/* ---- base64 decoding ------------------------------------------------------ */

console.log('\nbase64');
{
  check('url-safe characters decode', T.decodeBase64('aGVsbG8_').text === 'hello?');
  check('missing padding is handled', T.decodeBase64('aGVsbG8').text === 'hello');
  check('UTF-8 survives', T.decodeBase64(Buffer.from('café ☕').toString('base64')).text === 'café ☕');
  check('an impossible length is refused', T.decodeBase64('aGVsbG8Xy').error !== undefined);
  check('illegal characters are refused', T.decodeBase64('not base64!!').error !== undefined);
  check('empty input decodes to empty', T.decodeBase64('').text === '');
}

/* ---- Time in words --------------------------------------------------------- */

console.log('\nTime in words');
{
  const g = T.describeGap;
  check('seconds', g(45000) === '45 seconds', g(45000));
  check('minutes', g(45 * 60000) === '45 minutes', g(45 * 60000));
  check('hours', g(5 * 3600000) === '5.0 hours', g(5 * 3600000));
  check('days', g(5 * 86400000) === '5 days', g(5 * 86400000));
  check('months', g(90 * 86400000) === '3 months', g(90 * 86400000));
  check('years', g(730 * 86400000) === '2.0 years', g(730 * 86400000));
  check('direction does not matter', g(-45000) === g(45000));
}

/* ---- Robustness ------------------------------------------------------------ */

console.log('\nRobustness');
{
  check('nothing throws on hostile input', (() => {
    const nasty = ['', '.', '..', '...', 'a.b', 'a.b.c.d', ' ', '💥',
      'e30.e30.', 'null.null.x', b64u('null') + '.' + b64u('null') + '.x',
      b64u(0) + '.' + b64u(0) + '.x', 'a'.repeat(100000), null, undefined, 42, {}];
    for (const n of nasty) {
      try {
        const r = T.inspect(n);
        T.warnings(r, NOW);
        if (r.kind === 'jwt') { T.claimRows(r); T.headerRows(r); T.lifetime(r, NOW); }
      } catch (err) { console.log('      threw on', JSON.stringify(n).slice(0, 40), err.message); return false; }
    }
    return true;
  })());

  check('a null payload is not mistaken for an object',
    T.inspect(`${b64u('null')}.${b64u('null')}.x`).kind !== 'jwt');
  check('a very long input still returns',
    T.inspect('a'.repeat(50000)).kind !== undefined);
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
