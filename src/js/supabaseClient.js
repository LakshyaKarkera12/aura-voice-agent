// supabaseClient.js — creates the ONE Supabase client the browser uses.
//
// Only VITE_-prefixed variables reach the browser. The URL and the
// publishable/anon key are designed to be public: they can only do what
// Supabase Auth allows (sign up, log in), never read other users' data.

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  // Fail loudly in development instead of with a confusing network error later.
  throw new Error('Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, then restart the dev server.');
}

export const supabase = createClient(url, key);

// Returns the current session (or null). Supabase keeps it in localStorage,
// so a refresh or a new tab stays logged in.
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// "Lakshya Karkera" → name from signup metadata, with safe fallbacks.
export function getFullName(session) {
  return session?.user?.user_metadata?.full_name?.trim() || 'there';
}
