# Aria — AI Voice CX Agent for Aura Skincare

> 🔗 **Live app:** _Vercel URL_ · 🎥 **Demo video:** _link_ · 💼 **LinkedIn:** _link_

A browser-based voice customer support agent for Aura Skincare, a fictional Indian D2C skincare brand. Sign up, click **Start Call**, allow the microphone, and talk to Aria. She knows your name, looks up orders, follows brand policy, and emails you a summary when the call ends.

## Approach
_2–3 sentences, written at the end._

## How to test (evaluators)
1. Open the live URL and **sign up** with your name and email (instant, no confirmation email). Returning users log in.
2. Click **Start Call** and allow the microphone. Aria greets you by name.
3. Use the **Test Orders** panel (ORD-101, ORD-102, ORD-103). Try: "Where is ORD-101?", "Can I return ORD-102?", "Cancel ORD-103", "Book me a flight to Goa".
4. Click **End Call** (or say "that's all"). The transcript and JSON summary appear on the page, and the summary is emailed to your signup address. **Please check spam.**

## Features
_Fill in as built._

## Architecture
_Diagram + short version of docs/ARCHITECTURE.md._

## Tech stack
HTML, CSS, JavaScript (Vite) · Supabase Auth · ElevenLabs Agents (`@elevenlabs/client`) · Google Gemini API · Gmail API (Google Cloud) · Vercel (hosting + serverless functions)

## Run locally
```bash
git clone <repo-url>
cd aura-voice-agent
npm install
cp .env.example .env.local   # fill in real values
npm i -g vercel && vercel link
vercel dev                   # runs the site + /api functions
```
- ElevenLabs agent setup: `docs/SYSTEM_PROMPT.md`
- Gmail API setup: `docs/GMAIL_SETUP.md`
- Supabase: create a project, enable Email provider, turn **Confirm email** off

## Project structure
_Paste final tree._

## How I think (Section 9)
### 1. Why this architecture and stack?
_From DECISIONS.md._

### 2. Hardest part and how I solved it
_Your honest experience._

### 3. One more week: what I'd improve first
_Ideas: identity verification (phone + OTP) before revealing orders, real orders backend, call history page, automated evaluation of recorded test calls, cancel_order tool with persistence, human handoff._

### 4. At 1,000 conversations a day
_Think about: cost per minute and model choice, real orders API, rate limiting and abuse protection, logging/monitoring (latency, tool errors, failed lookups), automated QA on transcripts, single source of truth for policy, human escalation queue, PII handling in transcripts and emails, a proper transactional email provider with a domain (Gmail limits), provider concurrency limits and fallbacks, paid tiers so nothing pauses._

## Known limitations
See `docs/ARCHITECTURE.md` §9.
