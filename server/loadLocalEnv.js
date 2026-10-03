// server/loadLocalEnv.js — local development only.
//
// Why: `vercel dev` (CLI v62) only reads a file named `.env`, not `.env.local`,
// so the /api functions saw no keys locally (DECISIONS D-31). This loads
// `.env.local` ourselves when it exists.
//
// Safe in production: on Vercel `.env.local` doesn't exist (it's git- and
// vercel-ignored), so this does nothing and the real Vercel env vars are used.
// It also never overrides a variable that's already set.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const candidates = [
  fileURLToPath(new URL('../.env.local', import.meta.url)), // next to the project root
  '.env.local',                                              // current working directory
];

const file = candidates.find((path) => existsSync(path));
if (file) {
  try {
    process.loadEnvFile(file); // built into Node 20.12+; keeps existing values
  } catch (error) {
    console.error('[env] could not read .env.local:', error.message);
  }
}
