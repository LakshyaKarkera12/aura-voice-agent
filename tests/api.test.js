// Checks for the /api functions and Gmail helpers, with the network FAKED
// (no real Supabase/Gemini/Gmail calls, no keys needed). Run with: npm test

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import summaryHandler from '../api/summary.js';
import signedUrlHandler from '../api/signed-url.js';
import { getBearerToken } from '../server/verifyUser.js';
import { buildMimeMessage, toBase64Url } from '../server/gmail.js';

// Fake env values (never real keys).
Object.assign(process.env, {
  SUPABASE_URL: 'https://fake.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_fake',
  GEMINI_API_KEY: 'fake',
  GOOGLE_CLIENT_ID: 'fake', GOOGLE_CLIENT_SECRET: 'fake', GOOGLE_REFRESH_TOKEN: 'fake',
  GMAIL_SENDER: 'sender@example.com',
  ELEVENLABS_API_KEY: 'fake', ELEVENLABS_AGENT_ID: 'agent_fake',
});
console.error = () => {}; // keep expected error logs out of the test output

// ---------- Fake fetch: answers by URL and records what was called ----------
const realFetch = globalThis.fetch;
let calls;
let gmailShouldFail;
let geminiDown;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeFetch(url, options = {}) {
  url = String(url);
  calls.push({ url, options });

  if (url.endsWith('/auth/v1/user')) {
    return options.headers.Authorization === 'Bearer good-token'
      ? json(200, { email: 'real.user@example.com', user_metadata: { full_name: 'Lakshya Karkera' } })
      : json(401, { message: 'invalid JWT' });
  }
  if (url.includes('generativelanguage.googleapis.com')) {
    if (geminiDown) return json(503, { error: { status: 'UNAVAILABLE', message: 'high demand' } });
    const summary = { customer_intent: 'ORDER_TRACKING', order_id: 'ORD-101', resolution_status: 'RESOLVED', customer_sentiment: 'POSITIVE', call_summary: 'Tracked ORD-101.' };
    return json(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(summary) }] } }] });
  }
  if (url.startsWith('https://oauth2.googleapis.com/token')) {
    return gmailShouldFail ? json(400, { error: 'invalid_grant' }) : json(200, { access_token: 'ya29.fake' });
  }
  if (url.startsWith('https://gmail.googleapis.com')) return json(200, { id: 'msg1' });
  if (url.startsWith('https://api.elevenlabs.io')) return json(200, { signed_url: 'wss://fake/signed' });
  throw new Error(`Unexpected fetch: ${url}`);
}

// Minimal stand-in for Vercel's req/res objects.
function fakeRes() {
  return {
    statusCode: 200, body: undefined, headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name] = value; },
  };
}

const messages = [
  { role: 'agent', text: 'Hi, this is Aria.' },
  { role: 'user', text: 'Where is ORD-101?' },
];

beforeEach(() => { calls = []; gmailShouldFail = false; geminiDown = false; globalThis.fetch = fakeFetch; });
afterEach(() => { globalThis.fetch = realFetch; });

const sentEmail = () => calls.find((c) => c.url.startsWith('https://gmail.googleapis.com'));

describe('POST /api/summary', () => {
  it('no token → 401, and nothing is sent (scenario C6)', async () => {
    const res = fakeRes();
    await summaryHandler({ method: 'POST', headers: {}, body: { messages } }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(calls.some((c) => c.url.includes('googleapis')), false);
  });

  it('fake token → 401', async () => {
    const res = fakeRes();
    await summaryHandler({ method: 'POST', headers: { authorization: 'Bearer forged' }, body: { messages } }, res);
    assert.equal(res.statusCode, 401);
  });

  it('GET → 405', async () => {
    const res = fakeRes();
    await summaryHandler({ method: 'GET', headers: {} }, res);
    assert.equal(res.statusCode, 405);
  });

  it('valid request → summary + email sent to the VERIFIED address', async () => {
    const res = fakeRes();
    await summaryHandler({
      method: 'POST',
      headers: { authorization: 'Bearer good-token' },
      // An attacker-supplied address in the body must be ignored.
      body: { messages, durationSeconds: 40, email: 'victim@example.com', to: 'victim@example.com' },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.summary.order_id, 'ORD-101');
    assert.equal(res.body.summary.customer_name, 'Lakshya Karkera'); // from the token
    assert.deepEqual(res.body.email, { sent: true, to: 'real.user@example.com' });

    const raw = JSON.parse(sentEmail().options.body).raw;
    const mime = Buffer.from(raw, 'base64url').toString('utf8');
    assert.match(mime, /To: <real\.user@example\.com>/);
    assert.ok(!mime.includes('victim@example.com'));
  });

  it('Gmail fails → still 200 with the summary, email.sent = false (rule 9, scenario C4)', async () => {
    gmailShouldFail = true;
    const res = fakeRes();
    await summaryHandler({ method: 'POST', headers: { authorization: 'Bearer good-token' }, body: { messages } }, res);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.summary.call_summary);
    assert.equal(res.body.email.sent, false);
  });

  it('every Gemini model down (503) → tries each backup, then a summary built from THIS call', async () => {
    geminiDown = true;
    const res = fakeRes();
    await summaryHandler({
      method: 'POST',
      headers: { authorization: 'Bearer good-token' },
      body: { messages: [
        { role: 'user', text: 'Can I cancel ORD-101?' },
        { role: 'agent', text: "Since it's out for delivery, I can't cancel it, but you can refuse delivery at the doorstep." },
      ] },
    }, res);

    const geminiCalls = calls.filter((c) => c.url.includes('generativelanguage')).length;
    assert.equal(geminiCalls, 3, 'should try all three models');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.summary.order_id, 'ORD-101');
    assert.equal(res.body.summary.customer_intent, 'CANCELLATION');
    assert.equal(res.body.summary.resolution_status, 'DECLINED_PER_POLICY');
    assert.doesNotMatch(res.body.summary.call_summary, /couldn't be generated/);
    assert.equal(res.body.email.sent, true); // a real, call-specific summary is still emailed
  });

  it('toolEvents with a successful cancel → summary says RESOLVED (through the API)', async () => {
    geminiDown = true; // even the rule-based path must respect the verified action
    const res = fakeRes();
    await summaryHandler({
      method: 'POST',
      headers: { authorization: 'Bearer good-token' },
      body: {
        messages: [
          { role: 'user', text: 'Please cancel ORD-103.' },
          { role: 'agent', text: 'Shall I go ahead?' },
          { role: 'user', text: 'Yes.' },
          { role: 'agent', text: 'All done.' }, // vague wording: transcript alone wouldn't prove it
        ],
        toolEvents: [{ tool: 'cancel_order', orderId: 'ORD-103', success: true }],
      },
    }, res);
    assert.equal(res.body.summary.resolution_status, 'RESOLVED');
    assert.equal(res.body.summary.customer_intent, 'CANCELLATION');
    assert.equal(res.body.summary.order_id, 'ORD-103');
  });

  it('malformed transcript → 400', async () => {
    const res = fakeRes();
    await summaryHandler({ method: 'POST', headers: { authorization: 'Bearer good-token' }, body: { messages: 'hello' } }, res);
    assert.equal(res.statusCode, 400);
  });
});

describe('GET /api/signed-url', () => {
  it('no token → 401, ElevenLabs never called', async () => {
    const res = fakeRes();
    await signedUrlHandler({ method: 'GET', headers: {} }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(calls.some((c) => c.url.includes('elevenlabs')), false);
  });

  it('valid token → signed URL, not cached', async () => {
    const res = fakeRes();
    await signedUrlHandler({ method: 'GET', headers: { authorization: 'Bearer good-token' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.signedUrl, 'wss://fake/signed');
    assert.equal(res.headers['Cache-Control'], 'no-store');
  });
});

describe('ALLOWED_EMAILS allow-list', () => {
  afterEach(() => { delete process.env.ALLOWED_EMAILS; });

  it('logged-in user NOT on the list → 403 on signed-url, ElevenLabs never called', async () => {
    process.env.ALLOWED_EMAILS = 'owner@example.com';
    const res = fakeRes();
    await signedUrlHandler({ method: 'GET', headers: { authorization: 'Bearer good-token' } }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(calls.some((c) => c.url.includes('elevenlabs')), false);
  });

  it('logged-in user NOT on the list → 403 on summary, no Gemini, no email', async () => {
    process.env.ALLOWED_EMAILS = 'owner@example.com';
    const res = fakeRes();
    await summaryHandler({ method: 'POST', headers: { authorization: 'Bearer good-token' }, body: { messages } }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(calls.some((c) => c.url.includes('googleapis')), false);
  });

  it('user on the list (any letter case) → allowed', async () => {
    process.env.ALLOWED_EMAILS = 'someone@else.com, Real.User@Example.com';
    const res = fakeRes();
    await signedUrlHandler({ method: 'GET', headers: { authorization: 'Bearer good-token' } }, res);
    assert.equal(res.statusCode, 200);
  });

  it('list not set → open to every logged-in user (local dev default)', async () => {
    const res = fakeRes();
    await signedUrlHandler({ method: 'GET', headers: { authorization: 'Bearer good-token' } }, res);
    assert.equal(res.statusCode, 200);
  });
});

describe('getBearerToken', () => {
  it('reads "Bearer abc"', () => assert.equal(getBearerToken('Bearer abc'), 'abc'));
  for (const bad of [undefined, '', 'abc', 'Basic abc', 'Bearer ']) {
    it(`rejects ${JSON.stringify(bad)}`, () => assert.equal(getBearerToken(bad), null));
  }
});

describe('gmail MIME', () => {
  const base = { from: 'sender@example.com', to: 'user@example.com', subject: 'Hi', text: 'plain', html: '<p>html</p>' };

  it('line breaks in headers cannot inject extra headers (e.g. Bcc)', () => {
    const mime = buildMimeMessage({ ...base, to: 'user@example.com\r\nBcc: evil@example.com' });
    assert.ok(!/^Bcc:/m.test(mime));
  });

  it('subject with non-English characters is encoded', () => {
    const mime = buildMimeMessage({ ...base, subject: 'Order ₹699 · ORD-101' });
    assert.match(mime, /Subject: =\?UTF-8\?B\?/);
  });

  it('has both a text and an HTML part', () => {
    const mime = buildMimeMessage(base);
    assert.match(mime, /text\/plain/);
    assert.match(mime, /text\/html/);
  });

  it('base64url uses no + / = characters', () => {
    assert.match(toBase64Url('>>>???'.repeat(10)), /^[A-Za-z0-9_-]+$/);
  });
});
