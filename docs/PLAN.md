# PLAN.md — Build Plan & Checklist

Deadline: 4 days from receiving the assignment. Tick boxes as you go (`[x]`).
Golden rule: **get each layer working before starting the next.** Graded features first, extras after.

---

## The assignment in plain words
**Required by Datastraw:** a web page where an evaluator clicks Start Call, talks to "Aria" from Aura Skincare and hears her reply. Aria must answer brand/policy questions, look up orders with a tool, say no politely when policy says no, stay on topic, handle mumbling/missing/fake IDs without inventing anything, and produce a transcript + JSON summary. Also: live state indicator, Test Orders panel, public deployment, README with Section 9 answers, 3–5 min demo video, approach note, LinkedIn link.

**Our additions (our own product decisions):**
- Compulsory **sign up** (name, email, password); returning users **log in**. No demo/guest account.
- Aria **greets the user by name** and uses it naturally.
- Summary shown in the UI **and emailed** to the signup address via the Gmail API.
- A **polished UI** in plain HTML/CSS/JS (see `UI_DESIGN.md`).

### The three built-in traps in the mock data
| Order | Status | Evaluators will try | Correct behaviour |
|---|---|---|---|
| ORD-101 Priya, ₹699 | Out for Delivery (BlueDart BD-982103, by 6 PM today) | "Cancel my order" | Can't cancel once shipped; can refuse delivery at doorstep |
| ORD-102 Rahul, ₹499 | Delivered 14 days ago (Delhivery DL-441029) | "I want to return it" | Outside 7-day window → decline; 48-hour damage window also passed |
| ORD-103 Ananya, ₹850 | Processing, ordered 3 hours ago | "Cancel my order" | Eligible → confirm, then cancel (mock) |

---

## Day 1 — Accounts, setup, agent with zero code
**Accounts & keys**
- [ ] GitHub, Vercel (sign in with GitHub), ElevenLabs, Google AI Studio (Gemini key), Supabase
- [ ] **Supabase:** new project → Authentication → Providers → Email: enabled, **"Confirm email" OFF**. Copy Project URL + anon/publishable key.
- [ ] **Google Cloud for Gmail** (follow `docs/GMAIL_SETUP.md` step by step): project, enable Gmail API, consent screen, OAuth client, refresh token, **publish app to Production**

**Project**
- [ ] Empty folder `aura-voice-agent` → open in VS Code → `npm create vite@latest .` → Framework: **Vanilla**, Variant: **JavaScript**
- [ ] `npm install` → `npm run dev` → see the Vite starter page
- [ ] Copy in `CLAUDE.md`, `README.md`, `.env.example`, `docs/`
- [x] Create `.env.local` from `.env.example`; confirm `.gitignore` covers `.env*.local`
- [ ] `npm i -g vercel` → `vercel login` → `vercel link`
- [ ] `git init`, first commit, push to GitHub

**ElevenLabs agent (dashboard only)**
- [ ] Create agent "Aria – Aura Skincare", pick an Indian English voice (try 3–4)
- [ ] Paste system prompt + first message from `docs/SYSTEM_PROMPT.md` (they use `{{user_name}}`)
- [ ] Add dynamic variable `user_name` with a test/default value like "there" so the dashboard test works
- [ ] Add client tool `get_order_details` (param `order_id`, wait for response: on)
- [ ] Add client tool `cancel_order` (param `order_id`, wait for response: on) — see `docs/SYSTEM_PROMPT.md`
- [ ] Enable the built-in "end call" system tool; choose a fast LLM
- [ ] Talk to Aria in the dashboard widget: persona, brevity, policies, out-of-scope refusal (tool won't work yet; that's expected)

**Done when:** Aria sounds right in the dashboard, and the Vite page runs locally.

## Day 2 — Core voice app (the graded part)
- [x] `vite.config.js` multi-page setup (`index.html`, `app.html`)
- [x] `base.css` with design tokens from `UI_DESIGN.md`
- [x] `orders.js`, `normalizeOrderId.js`, `policies.js`, `tools.js` (+ quick console tests of normalisation and eligibility) — `npm test`
- [x] Install `@elevenlabs/client`; `voice.js` starts/ends a session with the public agent ID (uses the real signup name) — *code done; live test pending saved keys*
- [x] State machine + animated orb: Idle → Connecting → Listening → Thinking → Speaking → Ended (driven by temporary `demoCall.js` until the SDK is wired)
- [x] Live transcript chat bubbles (demo data until the SDK is wired)
- [x] Test Orders panel
- [ ] Full call on localhost: "Where is my order ORD-101?" works end to end

**Done when:** a complete call with an order lookup works (no login yet).

## Day 3 — Auth, summary, email
- [x] Install `@supabase/supabase-js`; `supabaseClient.js`
- [x] `index.html` Sign up / Log in tabs; validation (name required, valid email, password ≥ 6); friendly errors ("Email already registered — log in instead") — *live test pending*
- [x] Redirects: logged out → `index.html`; logged in → `app.html`; Log out button — *live test pending*
- [x] Pass the real `full_name` as `user_name` when starting the call — *live test pending*
- [x] `server/verifyUser.js` + `api/summary.js`: verify token → Gemini JSON (validated) → return to browser — *Gemini tested live; API tested with faked network*
- [x] Summary card renders after End Call (and when Aria ends the call)
- [x] `server/gmail.js` + `emailTemplate.js`: send HTML summary to the **verified** user email — *live email test pending `vercel dev`*
- [x] UI email status: "Sending…" → "📧 Sent to you@…" or "Couldn't send email — summary is shown above"
- [x] `api/signed-url.js`: logged-in users get a signed URL — [x] agent switched to private (`enable_auth: true`, verified signed URLs still issue) — [ ] delete `VITE_ELEVENLABS_AGENT_ID` from `.env.local` (unused)
- [ ] Run all of `docs/TEST_SCENARIOS.md`; fix; re-run

**Done when:** sign up → call → summary on screen → email in inbox works locally with `vercel dev`. ✅ *Confirmed working by the developer.*

## Day 4 — Polish, ship, submit
- [ ] UI polish pass against `UI_DESIGN.md` (spacing, mobile layout, loading/empty/error states)
- [x] `npm run build` passes
- [x] Deploy to Vercel; add **all** env vars in Vercel project settings; redeploy — live at https://aura-voice-agent-sandy.vercel.app (pages 200, `/api` returns 401 without login, no secrets in public JS)
- [ ] Live URL test in Chrome + one other browser: signup, login, mic prompt, full call, summary, email arrives (check spam)
- [ ] Sign up a fresh test email on the live site to confirm the evaluator path
- [x] Finish `README.md` (architecture, setup, Section 9, live URL, "how to test" note that signup is required and instant) — *add demo video + LinkedIn links; personalise Section 9 #2*
- [ ] Record demo video: signup → personalised greeting → order lookup → policy refusal → edge case → summary + email in inbox → architecture walkthrough
- [ ] Approach note; LinkedIn link tested in incognito
- [ ] Email submission — To: ozair.shaikh@datastraw.in, aryan.jaiswal@datastraw.in · CC: talent@datastraw.in · Subject: `AI Voice Agent Assignment - [Full Name]`

## After submitting (keep it alive while they evaluate)
- [ ] Supabase free projects pause after a period of inactivity. Log in to the live site every couple of days until you hear back.
- [ ] Check ElevenLabs credit balance every couple of days; evaluators' calls use your minutes.
- [ ] **Gmail refresh token expires every 7 days (Testing mode, D-28).** Generate a fresh one right before submitting, then every ~6 days: OAuth Playground → update `GOOGLE_REFRESH_TOKEN` in `.env.local` + Vercel → redeploy → `npm run check:env`.

## If you fall behind, cut in this order
1. Signed-URL hardening (document it as a known improvement)
2. Hinglish polish, extra UI animation
3. Email (summary still shows in the UI; explain the design in README)
**Never cut:** voice call, order lookup, policy refusals, edge cases, transcript + JSON summary, state indicator, Test Orders panel, deployment, README Section 9.
