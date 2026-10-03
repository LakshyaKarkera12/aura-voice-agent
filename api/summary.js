// api/summary.js — POST /api/summary
//
// Called by the browser when a call ends.
//   Request:  Authorization: Bearer <supabase access token>
//             body { messages: [{ role, text }], durationSeconds, toolEvents? }
//   Response: { summary, email: { sent, to } }
//
// Steps: verify token → Gemini summary (validated) → Gmail email → respond.
// The email step can fail without failing the request (CLAUDE.md rule 9).

import '../server/loadLocalEnv.js'; // first: local keys for `vercel dev` (no-op on Vercel)
import { verifyUser } from '../server/verifyUser.js';
import { generateSummary } from '../server/gemini.js';
import { sendEmail } from '../server/gmail.js';
import { buildSummaryEmail } from '../server/emailTemplate.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }

  // 1. Who is calling? (rule 4) Email + name come ONLY from the verified token.
  const user = await verifyUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: 'Please log in again.' });
  }

  // 2. Summarise. Name comes from the token, duration from the browser's timer
  //    (validateSummary clamps it to a sensible range).
  //    toolEvents = what the order tools really returned (cleaned server-side).
  const { messages, durationSeconds, toolEvents } = req.body ?? {};
  let summary;
  try {
    ({ summary } = await generateSummary(messages, { customerName: user.name, durationSeconds }, toolEvents));
  } catch (error) {
    if (error.message === 'INVALID_TRANSCRIPT') {
      return res.status(400).json({ error: 'The transcript was empty or malformed.' });
    }
    console.error('[summary] unexpected error:', error);
    return res.status(500).json({ error: 'Could not generate a summary.' });
  }

  // 3. Email it to the VERIFIED address. A failure here is reported, not thrown.
  let sent = false;
  try {
    await sendEmail({ to: user.email, ...buildSummaryEmail({ name: user.name, summary }) });
    sent = true;
  } catch (error) {
    console.error('[summary] email failed:', error.message);
  }

  return res.status(200).json({ summary, email: { sent, to: user.email } });
}
