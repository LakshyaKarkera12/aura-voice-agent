// scripts/check-env.mjs — checks that the keys in .env.local are present and work.
// Run with:  npm run check:env
//
// It NEVER prints key values. It only talks to each key's own service:
// Supabase, Google AI (Gemini) and Google OAuth (Gmail). No email is sent.

import { existsSync } from 'node:fs';

if (!existsSync('.env.local')) {
  console.log('✖ .env.local not found. Copy .env.example to .env.local and fill it in.');
  process.exit(1);
}
process.loadEnvFile('.env.local'); // built into Node 20.12+, no package needed

const env = process.env;
let failures = 0;

const ok = (msg) => console.log(`  ✔ ${msg}`);
const fail = (msg) => { console.log(`  ✖ ${msg}`); failures++; };
const warn = (msg) => console.log(`  ! ${msg}`);

function requireVars(names) {
  const missing = names.filter((n) => !env[n]?.trim());
  missing.forEach((n) => fail(`${n} is empty`));
  return missing.length === 0;
}

// ---------- Safety: no secrets with a VITE_ prefix ----------
console.log('\nSafety');
const allowedVite = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_ELEVENLABS_AGENT_ID'];
const extraVite = Object.keys(env).filter((k) => k.startsWith('VITE_') && !allowedVite.includes(k));
if (extraVite.length) fail(`Unexpected VITE_ variables (these reach the browser!): ${extraVite.join(', ')}`);
else ok('Only browser-safe values use the VITE_ prefix');
if (env.VITE_SUPABASE_ANON_KEY?.startsWith('sb_secret_')) {
  fail('VITE_SUPABASE_ANON_KEY is a SECRET key. Use the publishable (or anon) key instead.');
}

// ---------- Supabase ----------
console.log('\nSupabase');
if (requireVars(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'])) {
  if (env.VITE_SUPABASE_URL !== env.SUPABASE_URL || env.VITE_SUPABASE_ANON_KEY !== env.SUPABASE_ANON_KEY) {
    warn('VITE_SUPABASE_* and SUPABASE_* differ. They should be the same values.');
  }
  // Common mistake: copying the REST endpoint (…supabase.co/rest/v1/) instead of the project URL.
  for (const name of ['VITE_SUPABASE_URL', 'SUPABASE_URL']) {
    try {
      if (new URL(env[name]).pathname.replace(/\/$/, '') !== '') {
        fail(`${name} has a path on the end (like /rest/v1/). Use only https://<project>.supabase.co`);
      }
    } catch {
      fail(`${name} is not a valid URL`);
    }
  }
  try {
    // Public settings endpoint of Supabase Auth: confirms URL + key are valid.
    const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/settings`, {
      headers: { apikey: env.SUPABASE_ANON_KEY },
    });
    if (!res.ok) {
      fail(`Supabase answered ${res.status}. Check the Project URL and key.`);
    } else {
      const settings = await res.json();
      ok('URL and key work');
      settings.external?.email ? ok('Email sign-in is enabled') : fail('Email provider is OFF (Authentication → Providers/Sign In → Email)');
      settings.mailer_autoconfirm
        ? ok('"Confirm email" is OFF, so signup is instant')
        : fail('"Confirm email" is still ON. Turn it off so evaluators can sign up instantly.');
    }
  } catch (e) {
    fail(`Could not reach Supabase (${e.cause?.code ?? e.message}). Is the URL right?`);
  }
}

// ---------- ElevenLabs ----------
console.log('\nElevenLabs');
if (requireVars(['ELEVENLABS_API_KEY', 'ELEVENLABS_AGENT_ID'])) {
  if (env.VITE_ELEVENLABS_AGENT_ID && env.VITE_ELEVENLABS_AGENT_ID !== env.ELEVENLABS_AGENT_ID) {
    warn('VITE_ELEVENLABS_AGENT_ID and ELEVENLABS_AGENT_ID differ. They should be the same agent.');
  }
  try {
    // Asking for a signed URL proves the key AND the agent ID work together.
    // It starts no call and costs nothing (the URL just expires after 15 min).
    const url = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(env.ELEVENLABS_AGENT_ID)}`;
    const res = await fetch(url, { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY } });
    const detail = res.ok ? null : (await res.json().catch(() => ({}))).detail;
    if (res.ok) ok('API key and agent ID work');
    else if (detail?.status === 'missing_permissions') {
      fail('API key is missing a permission. Edit the key in ElevenLabs and set "ElevenLabs Agents" to Write.');
    } else if (res.status === 401) fail('ElevenLabs rejected the API key (401). Check you copied the whole key.');
    else if (res.status === 404) fail('Agent not found (404). Check ELEVENLABS_AGENT_ID.');
    else fail(`ElevenLabs answered ${res.status}.`);
  } catch (e) {
    fail(`Could not reach ElevenLabs (${e.message})`);
  }
}
if (env.VITE_ELEVENLABS_AGENT_ID?.trim()) {
  warn('VITE_ELEVENLABS_AGENT_ID is no longer used (calls use /api/signed-url). Delete that line once the agent is private.');
}

// ---------- Gemini ----------
console.log('\nGemini');
if (requireVars(['GEMINI_API_KEY'])) {
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY },
    });
    res.ok ? ok('API key works') : fail(`Gemini answered ${res.status}. Check the key in Google AI Studio.`);
  } catch (e) {
    fail(`Could not reach Gemini (${e.message})`);
  }
}

// ---------- Gmail (Google OAuth) ----------
console.log('\nGmail');
if (requireVars(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GMAIL_SENDER'])) {
  try {
    // Swap the refresh token for a short-lived access token (what sending will do).
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: env.GOOGLE_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      fail(`Google refused the refresh token: ${data.error} (see "Troubleshooting" in docs/GMAIL_SETUP.md)`);
    } else {
      ok('Refresh token works');
      data.scope?.includes('gmail.send')
        ? ok('Token has the gmail.send permission')
        : fail('Token is missing the gmail.send scope. Redo step 6 of docs/GMAIL_SETUP.md.');
    }
  } catch (e) {
    fail(`Could not reach Google (${e.message})`);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.GMAIL_SENDER)) fail('GMAIL_SENDER is not an email address');
  warn('Testing-mode refresh tokens expire 7 days after creation. Regenerate every ~6 days (docs/GMAIL_SETUP.md step 5).');
}

console.log(failures ? `\n${failures} problem(s) found.\n` : '\nAll checks passed.\n');
process.exit(failures ? 1 : 0);
