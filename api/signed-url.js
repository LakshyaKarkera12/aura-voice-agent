// api/signed-url.js — GET /api/signed-url
//
// Gives a logged-in user a short-lived link to start a call with Aria.
// Why: with a public agent ID, anyone could run the agent on my ElevenLabs
// credits. With the agent set to private, a call needs a signed URL, and only
// this function (holding the API key) can create one (DECISIONS D-12).
//   Request:  Authorization: Bearer <supabase access token>
//   Response: { signedUrl }   (valid 15 minutes to START a call)

import '../server/loadLocalEnv.js'; // first: local keys for `vercel dev` (no-op on Vercel)
import { verifyUser } from '../server/verifyUser.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Use GET.' });
  }

  // Rule 4: verify the user before doing anything.
  const user = await verifyUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: 'Please log in again.' });
  }

  try {
    const url = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(process.env.ELEVENLABS_AGENT_ID)}`;
    const response = await fetch(url, {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.error('[signed-url] ElevenLabs HTTP', response.status, (await response.text()).slice(0, 200));
      return res.status(502).json({ error: 'Could not start the call.' });
    }

    const { signed_url: signedUrl } = await response.json();
    // Never cache: each call should get a fresh link.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ signedUrl });
  } catch (error) {
    console.error('[signed-url] request failed:', error.message);
    return res.status(502).json({ error: 'Could not start the call.' });
  }
}
