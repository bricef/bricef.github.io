/* Token inspector — decoding, claim rendering, warnings, and the one property
   the tool exists for: the token never leaves the tab. */

import { launch, suite, urlFor } from './lib/harness.mjs';

/* Built in the test, never a real token. */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (h, p, s = 'c2ln') => `${b64(h)}.${b64(p)}.${s}`;
const secs = (iso) => Math.floor(Date.parse(iso) / 1000);
const soon = () => Math.floor(Date.now() / 1000) + 3600;

export default async function run() {
  const s = suite('token');
  const browser = await launch();
  const page = s.watch(await browser.newPage({ viewport: { width: 1280, height: 1000 } }));

  /* Everything the page asks the network for, from first byte onward. */
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));

  const paste = async (v) => {
    await page.fill('#in-token', v);
    await page.waitForTimeout(140);
  };

  try {
    await page.goto(urlFor('token'));
    await page.waitForTimeout(1400);

    s.section('The promise');
    s.check('the page states where the token goes',
      /never sent/.test(await page.textContent('.promise__body')));
    s.check('and offers a way to check it', /network off/.test(await page.textContent('.promise')));

    const beforeCount = requests.length;
    await paste(jwt({ alg: 'RS256', kid: 'k1' }, { sub: 'u1', aud: 'api', exp: soon() }));
    await page.waitForTimeout(400);
    const after = requests.slice(beforeCount);
    // The property the whole tool rests on.
    s.check('pasting a token makes no network request at all',
      after.length === 0, after.join(', '));
    s.check('and nothing is written to storage either',
      await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0));

    s.section('Decoding a JWT');
    s.check('it is recognised as a JWT', (await page.textContent('#hint')) === 'JWT',
      await page.textContent('#hint'));
    s.check('the three parts are shown separately',
      await page.evaluate(() => document.querySelectorAll('.split__raw b').length) === 5);
    s.check('the header is decoded', /RS256/.test(await page.textContent('#rows-header')));
    s.check('the key id is named', /Key id/.test(await page.textContent('#rows-header')));
    s.check('the payload is decoded', /u1/.test(await page.textContent('#rows-payload')));
    s.check('claims are explained', /Who the token is meant for/.test(await page.textContent('#rows-payload')));
    s.check('the signature is shown', await page.isVisible('#panel-sig'));
    s.check('and labelled as unchecked', /Not checked/.test(await page.textContent('.sig__note')));
    s.check('raw JSON is available', /"alg"/.test(await page.textContent('#json')));

    s.section('Validity');
    s.check('a live token says how long is left',
      /Valid for another/.test(await page.textContent('#life')), await page.textContent('#life'));

    await paste(jwt({ alg: 'HS256' }, { exp: secs('2020-01-01T00:00:00Z') }));
    s.check('an expired token says so', /Expired/.test(await page.textContent('#life')));
    s.check('and is styled as expired', await page.isVisible('.life--expired'));
    s.check('an expired token is not called a working credential',
      !/working credential/.test(await page.textContent('#notes')));

    await paste(jwt({ alg: 'HS256' }, { iat: secs('2026-01-01T00:00:00Z'), exp: soon() }));
    s.check('a timeline is drawn when there is a span',
      await page.evaluate(() => document.querySelectorAll('.timeline__mark').length >= 2));
    s.check('including a marker for now',
      await page.evaluate(() => document.querySelectorAll('.timeline__mark--now').length) === 1);

    s.section('Warnings');
    await paste(`${b64({ alg: 'none' })}.${b64({ sub: 'u' })}.`);
    s.check('an unsigned token is flagged', await page.isVisible('.note--alarm'));
    s.check('and explained as forgeable',
      /Anyone can change the payload/.test(await page.textContent('#notes')));
    s.check('the hint says unsigned', (await page.textContent('#hint')) === 'JWT, unsigned');

    await paste(jwt({ alg: 'HS256' }, { sub: 'u' }));
    s.check('a token with no expiry is flagged',
      /valid forever/.test(await page.textContent('#notes')));

    await paste(jwt({ alg: 'HS256' }, { aud: 'api', exp: soon() }));
    s.check('a live token is called a working credential',
      /working credential/.test(await page.textContent('#notes')));

    s.section('base64');
    await paste(Buffer.from('just some text').toString('base64'));
    s.check('a plain blob decodes', (await page.textContent('#blob')) === 'just some text');
    s.check('and is labelled base64', (await page.textContent('#hint')) === 'base64');
    s.check('no JWT panels are shown for a blob', await page.isHidden('#panel-header'));

    await paste(Buffer.from('{"a":1,"b":[2,3]}').toString('base64'));
    s.check('base64 holding JSON is pretty-printed', /"b": \[/.test(await page.textContent('#blob')));

    await paste(Buffer.from([0xff, 0xfe, 0x01]).toString('base64'));
    s.check('binary is shown as hex', /ff fe 01/.test(await page.textContent('#blob')));
    s.check('and labelled binary', /binary/.test(await page.textContent('#hint')));

    s.section('Bad input');
    await paste('!!! nonsense !!!');
    s.check('rubbish is refused', !(await page.isHidden('#error')));
    s.check('the box is marked', await page.evaluate(() =>
      document.getElementById('in-token').classList.contains('token--bad')));
    s.check('and no panels are left showing', await page.isHidden('#panel-payload'));

    await paste('abc.!!!.def');
    s.check('dotted rubbish explains it is not a JWT',
      /not a JWT/.test(await page.textContent('#error')));

    s.section('Controls');
    await page.click('#btn-sample');
    await page.waitForTimeout(200);
    s.check('the sample loads', (await page.textContent('#hint')) === 'JWT');
    s.check('and the sample is safely expired',
      /Expired/.test(await page.textContent('#life')), await page.textContent('#life'));

    await page.click('#btn-clear');
    await page.waitForTimeout(150);
    s.check('clear empties the box', (await page.inputValue('#in-token')) === '');
    s.check('and hides everything', await page.isHidden('#split'));

    s.section('Nothing leaked, start to finish');
    const external = requests.filter((u) => !/^(file:|data:)/.test(u) && !/fonts\.(googleapis|gstatic)\.com/.test(u));
    s.check('the only external requests in the whole session were for fonts',
      external.length === 0, external.join(', '));
    s.check('and storage is still empty after all that',
      await page.evaluate(() => localStorage.length === 0));
  } finally {
    await browser.close();
  }

  return s.finish();
}
