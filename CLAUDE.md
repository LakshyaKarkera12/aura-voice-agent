# CLAUDE.md — Context for Claude Code

Read this file before every task. It describes the project, the rules, and how the developer wants to work.

## Who you are working with
- The developer is a **beginner**. Before each change, explain what you're about to do and why. After it, explain what changed, in plain language.
- Work in **small steps**: one feature at a time. After each step, give the exact command to run and what the developer should see.
- The developer must **explain this code in an interview**. Prefer simple, readable code over clever code. Comment the *why*, not just the *what*.

## Project in one paragraph
A browser-based AI voice customer support agent ("Aria") for a fictional Indian D2C skincare brand, Aura Skincare. Users must **sign up** (name, email, password) or **log in**. On the call page they click Start Call and talk to Aria, who greets them by name in an Indian English voice. Aria answers brand/policy questions, looks up mock orders via a tool, refuses requests outside policy, and handles bad input gracefully. When the call ends, the page shows the transcript and a JSON summary, and the summary is **emailed to the user's signup email** through the Gmail API. This is a hiring assessment for Datastraw; see `docs/PLAN.md`.

## Tech stack (do not change without asking)
- **Plain HTML + CSS + JavaScript** (ES modules). **No TypeScript, no React, no Next.js, no CSS frameworks.**
- **Vite** (vanilla JS template) as dev server and bundler, configured for **two pages**: `index.html` (auth) and `app.html` (call page).
- **Supabase Auth** (`@supabase/supabase-js`): email + password signup/login. Name stored in `user_metadata.full_name`. Email confirmation is **disabled** in the Supabase dashboard so signup is instant.
- **ElevenLabs Agents** via `@elevenlabs/client` (plain JS SDK): voice pipeline, turn-taking, interruptions. The user's name is passed as the dynamic variable `user_name`.
- **Client tools** (functions running in the browser) for order lookup.
- **Vercel serverless functions** in `/api`, written in **plain JavaScript (Node.js)**. All secret keys live only here.
- **Google Gemini API** for the post-call JSON summary.
- **Gmail API** (Google Cloud, OAuth2 refresh token, `googleapis` package) to email the summary.
- **Vercel** for hosting. Use `vercel dev` locally to run Vite and the `/api` functions together.

## Hard rules
1. **Ask before installing any npm package.** Say what it is and why it's needed.
2. **Never put secrets in frontend code or commit them.** Secrets live in `.env.local` (git-ignored) and in Vercel env vars. Only `.env.example` (no real values) is committed.
3. **Only `VITE_`-prefixed variables reach the browser.** That's allowed only for the Supabase URL + anon/publishable key (safe by design) and the temporary public agent ID. Never prefix a secret with `VITE_`.
4. **Every `/api` function must verify the Supabase access token** (sent as `Authorization: Bearer <token>`) before doing anything. Take the user's email and name **from the verified token**, never from the request body. This stops the API being used to email arbitrary addresses.
5. **Policy logic lives in code (`src/js/policies.js`), not only in the prompt.** Tools return pre-computed eligibility. The LLM only phrases it.
6. **The ElevenLabs SDK changes often.** Check current docs before writing SDK code: https://elevenlabs.io/docs/eleven-agents/libraries/javascript. Match the installed version in `package.json`.
7. **Client tool names in code must exactly match** the tool names in the ElevenLabs dashboard. The dynamic variable must be named exactly `user_name`.
8. **`app.html` is protected:** if no Supabase session exists, redirect to `index.html`. If a logged-in user opens `index.html`, redirect to `app.html`.
9. A failure in email sending must **never** hide the summary. Show the summary in the UI, then show the email status separately.
10. Don't add features beyond `docs/PLAN.md` without asking. When a task is done, tick it in `docs/PLAN.md` and log non-obvious choices in `docs/DECISIONS.md`.
11. Follow `docs/UI_DESIGN.md` for all styling: CSS variables, no inline styles, mobile-friendly.

## Folder structure
```
index.html                 # Sign up / Log in page (tabs)
app.html                   # Call page (protected)
vite.config.js             # multi-page config (index + app)
src/
  styles/
    base.css               # CSS variables, fonts, resets
    auth.css               # sign up / log in page
    app.css                # call page
  js/
    supabaseClient.js      # creates the Supabase client from VITE_ env vars
    auth.js                # signup, login, logout, redirects, form wiring
    validation.js          # pure form rules (name, email, password), tested by npm test
    app.js                 # wires the call page together
    voice.js               # ElevenLabs session, events, state machine
    tools.js               # client tools: get_order_details, cancel_order
    orders.js              # mock order database
    normalizeOrderId.js    # "order one zero one" / "ord 101" → "ORD-101"
    policies.js            # canCancel, isReturnEligible, shippingFee, codAllowed
    transcript.js          # collects and renders chat bubbles
    summaryView.js         # renders the summary card + email status
    summarySchema.js       # summary codes + labels, shared by browser AND server
api/
  summary.js               # verify token → Gemini summary → Gmail email → return JSON
  signed-url.js            # verify token → ElevenLabs signed URL (keeps agent private)
server/                    # helpers used only by /api (never imported by the browser)
  verifyUser.js            # Supabase token check → { email, name }
  gemini.js                # transcript → validated summary JSON
  gmail.js                 # sends HTML email via Gmail API
  emailTemplate.js         # builds the HTML email from the summary
docs/
```

## Useful commands
- `vercel dev` — run the site **and** `/api` functions locally (required for calls + summaries)
- `npm test` — offline tests (logic, validation, API with faked network)
- `npm run check:env` — checks every key in `.env.local` works (never prints values)
- `npm run sync:agent` — pushes `docs/SYSTEM_PROMPT.md` to the ElevenLabs agent (keeps tools)
- ⚠️ Never run `vercel env pull` without a backup: it overwrites `.env.local`
- `npm run dev` — Vite only (frontend work; `/api` won't run)
- `npm run build` — production build check before deploying
