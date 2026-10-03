// server/gmail.js — sends an email through the Gmail API.
//
// Server-only. Uses plain fetch instead of the large `googleapis` package
// (DECISIONS D-30). Two HTTP calls:
//   1. Swap the long-lived refresh token for a short-lived access token.
//   2. POST the email (as a base64url-encoded MIME message) to Gmail.
//
// Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GMAIL_SENDER

const TIMEOUT_MS = 15000;
const SENDER_NAME = 'Aria · Aura Skincare';

// ---------- Building the email (pure, tested) ----------

// Header values must never contain line breaks: an attacker could otherwise
// add extra headers (e.g. a hidden Bcc). This is called "header injection".
function safeHeader(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

// Non-English characters (like ·, ₹ or Hindi) in headers must be encoded:
// "=?UTF-8?B?<base64>?=" is the standard way (RFC 2047).
function encodeHeaderWord(text) {
  return `=?UTF-8?B?${Buffer.from(safeHeader(text), 'utf8').toString('base64')}?=`;
}

// Long base64 must be split into lines of at most 76 characters (MIME rule).
function base64Lines(text) {
  return Buffer.from(text, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n');
}

// Builds a "multipart/alternative" email: a plain-text part and an HTML part.
// Email apps show the best version they support.
export function buildMimeMessage({ from, to, subject, text, html }) {
  const boundary = `aura_${Math.random().toString(36).slice(2)}`;

  return [
    `From: ${encodeHeaderWord(SENDER_NAME)} <${safeHeader(from)}>`,
    `To: <${safeHeader(to)}>`,
    `Subject: ${encodeHeaderWord(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(html),
    `--${boundary}--`,
    '',
  ].join('\r\n'); // email lines end with CRLF
}

// Gmail wants the whole message as base64url (base64 with - and _ instead of + and /).
export function toBase64Url(text) {
  return Buffer.from(text, 'utf8').toString('base64url');
}

// ---------- Talking to Google ----------

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json();
  if (!res.ok) {
    // "invalid_grant" usually means the 7-day Testing-mode token expired (D-28).
    throw new Error(`Google token error: ${data.error}`);
  }
  return data.access_token;
}

// Sends the email. Throws on failure; /api/summary catches it and reports
// { sent: false } so the summary is still shown (CLAUDE.md rule 9).
export async function sendEmail({ to, subject, text, html }) {
  const accessToken = await getAccessToken();
  const raw = toBase64Url(buildMimeMessage({ from: process.env.GMAIL_SENDER, to, subject, text, html }));

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Gmail send error: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}
