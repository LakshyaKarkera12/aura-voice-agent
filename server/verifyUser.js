// server/verifyUser.js — checks the Supabase login token sent by the browser.
//
// Every /api function calls this FIRST (CLAUDE.md rule 4). The user's email
// and name come from Supabase's answer, never from the request body, so the
// API can't be used to email arbitrary addresses (DECISIONS D-10).
//
// How: we ask Supabase Auth "who owns this token?" (GET /auth/v1/user).
// Supabase checks the signature and expiry. Plain fetch, no package needed.

// Pulls the token out of "Authorization: Bearer <token>". Returns null if missing.
export function getBearerToken(authorizationHeader) {
  const match = /^Bearer\s+(\S+)$/i.exec(String(authorizationHeader ?? '').trim());
  return match ? match[1] : null;
}

// Optional allow-list (DECISIONS D-39). If ALLOWED_EMAILS is set (comma-
// separated), only those accounts may use the API, so nobody else can spend
// the ElevenLabs/Gemini/Gmail keys. Not set → open to every logged-in user.
export function isAllowedUser(email) {
  const list = (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.length === 0 || list.includes(String(email).toLowerCase());
}

// Returns { email, name } for a valid token, or null for a missing,
// expired or fake one (the API then answers 401).
export async function verifyUser(authorizationHeader) {
  const token = getBearerToken(authorizationHeader);
  if (!token) return null;

  try {
    const res = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const user = await res.json();
    if (!user?.email) return null;
    return {
      email: user.email,
      name: user.user_metadata?.full_name?.trim() || 'there',
    };
  } catch (error) {
    console.error('[verifyUser] Supabase check failed:', error.message);
    return null;
  }
}
