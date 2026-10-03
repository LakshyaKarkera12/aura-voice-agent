# ARCHITECTURE.md — How the System Works

Your interview study sheet. You should be able to draw the diagram from memory.

## Big picture
```
                         ┌────────────── Supabase Auth ──────────────┐
                         │ sign up / log in · stores full_name       │
                         └───────▲───────────────────────▲───────────┘
                                 │ session (JWT)         │ verify JWT
┌──────────── Browser (Vite, HTML/CSS/JS) ───────┐       │
│ index.html: Sign up / Log in                    │       │
│ app.html:  orb · transcript · Test Orders ·     │       │
│            summary card · email status          │       │
│                                                 │       │
│ voice.js ◄── audio both ways ──► ElevenLabs cloud (STT → LLM + prompt → TTS)
│   │  startSession({ signedUrl, dynamicVariables:{user_name}, clientTools })
│   │  ◄── tool call get_order_details ──┘
│ tools.js → normalizeOrderId → orders → policies → result back to LLM
│                                                 │       │
│ End call → POST /api/summary (Bearer JWT + transcript)  │
└────────────────────────────┬────────────────────┘       │
                             ▼                            │
            ┌──────── Vercel serverless (Node.js) ────────┴──┐
            │ api/signed-url.js : verify JWT → ElevenLabs     │
            │ api/summary.js    : verify JWT → Gemini → JSON  │
            │                     → Gmail API email → JSON    │
            └────────────────────────────────────────────────┘
```

## 1. User journey
1. User opens the site → `index.html`. If a session already exists → straight to `app.html`.
2. **Sign up:** name + email + password → `supabase.auth.signUp()` with `options.data.full_name`. Email confirmation is off, so they're logged in immediately.
3. **Log in:** email + password → `supabase.auth.signInWithPassword()`.
4. `app.html` checks the session on load; no session → back to `index.html`.
5. Start Call → browser asks `/api/signed-url` (with JWT) → starts the ElevenLabs session with `user_name`.
6. Aria: "Hi Lakshya, this is Aria from Aura Skincare…"
7. End Call → summary appears → email sent → status shown.

## 2. The voice pipeline (one turn)
1. Mic audio streams to ElevenLabs.
2. **Speech-to-text** transcribes as the user speaks.
3. **Turn detection** decides the user has finished.
4. The **LLM** reads system prompt (with name filled in) + history + new message → replies, or calls a tool first.
5. **Text-to-speech** streams audio back, so playback starts before the full reply is generated (low latency).
6. If the user talks over Aria, playback stops (**barge-in**) and a new turn begins.

**Why managed instead of building STT + LLM + TTS myself?** Turn detection, interruption, streaming and echo handling are already solved. My time goes into what makes a support agent good: tools, policy logic, edge cases, personalisation. The trade-off is vendor lock-in and less control per stage.

## 3. Personalisation: how Aria knows your name
- The prompt and first message contain the placeholder `{{user_name}}`.
- At session start the browser passes `dynamicVariables: { user_name: fullName }`, where `fullName` comes from the Supabase session.
- ElevenLabs fills in the placeholder before the LLM sees the prompt. One agent serves every user.
- **Name vs. order owner:** mock orders belong to Priya, Rahul and Ananya. If the account name differs, Aria mentions the name on the order rather than pretending it matches. Real systems would verify identity (phone + OTP) before revealing order details.

## 4. How the agent decides to use a tool
- The tool is registered with a **name**, **description** and **parameter schema** (`order_id: string`).
- When the request needs order data, the LLM outputs a structured tool call instead of text, guided by the description and by prompt rules ("never state order details without calling the tool"; "if there's no ID, ask for it").
- ElevenLabs forwards the call to the browser. The SDK runs the matching function in `clientTools`, and the return value goes back to the LLM, which speaks the result.

### Tool contract: `get_order_details(order_id)`
Found:
```json
{
  "found": true, "order_id": "ORD-103", "customer_name": "Ananya Patel",
  "product": "Green Tea Face Wash + Toner", "value_inr": 850, "status": "Processing",
  "courier": null, "tracking_id": null, "status_note": "Ordered 3 hours ago",
  "can_cancel": true, "cancel_note": "Order is still Processing, so it can be cancelled.",
  "return_eligible": false, "return_note": "Returns apply only after delivery.",
  "damage_claim_eligible": false, "damage_claim_note": "Damage claims apply only after delivery."
}
```
Not found / unclear:
```json
{ "found": false, "reason": "NOT_FOUND", "heard": "ORD-999",
  "message_for_agent": "No order with this ID. Ask the customer to repeat or verify it. Do not invent details." }
```
`reason` is `NOT_FOUND` or `INVALID_FORMAT`.

### Tool contract: `cancel_order(order_id)`
The code **re-checks** `canCancel()` itself; it never trusts the LLM's judgement. A successful cancel is remembered in memory until page refresh, so a later `get_order_details` shows `"Cancelled"`.
```json
{ "success": true, "order_id": "ORD-103", "status": "Cancelled",
  "message_for_agent": "Order cancelled. Any prepaid amount is refunded to the original payment method." }
```
```json
{ "success": false, "reason": "NOT_CANCELLABLE", "order_id": "ORD-101",
  "message_for_agent": "Order is Out for Delivery, so it can't be cancelled. The customer may refuse delivery at the doorstep." }
```
`reason` is `NOT_CANCELLABLE`, `ALREADY_CANCELLED`, `NOT_FOUND` or `INVALID_FORMAT`.

## 5. Guardrails: three layers
1. **Prompt:** persona, scope, policy text, "never promise outside policy", "never invent order data".
2. **Code:** `policies.js` computes eligibility deterministically; the LLM can't miscount 14 vs 7 days.
3. **Data:** order facts come only from the tool. `found: false` leaves nothing to hallucinate from.

## 6. State indicator (the orb)
| State | When |
|---|---|
| Idle | before the call |
| Connecting | Start clicked, session not yet connected |
| Listening | connected, agent not speaking |
| Thinking | final user message received or tool running, agent not yet speaking (**inferred by us**) |
| Speaking | SDK mode = speaking |
| Ended | disconnected |

## 7. Post-call summary + email (`api/summary.js`)
1. Browser sends `Authorization: Bearer <supabase access token>` and `{ messages, durationSeconds, toolEvents }`. `toolEvents` are the real tool results from the call; the server cleans them and they override the model's guess about the outcome (D-36).
2. `verifyUser.js` checks the token with Supabase and gets the **real** email and name. Invalid token → 401.
3. `gemini.js` asks Gemini for JSON only, parses, validates against the schema, and falls back to a safe default on failure.
4. `gmail.js` sends an HTML email (built by `emailTemplate.js`) to the verified email via the Gmail API.
5. Returns `{ summary, email: { sent: true|false, to } }`. The UI always shows the summary; email status is separate.

**Why take the email from the token, not the request?** Otherwise anyone could call the API and make my Gmail send messages to any address: an open relay and a spam risk.

### Summary schema
```json
{
  "customer_name": "Lakshya",
  "customer_intent": "ORDER_TRACKING | CANCELLATION | RETURN_REFUND | DAMAGED_PRODUCT | SHIPPING_INFO | COD_PAYMENT | PRODUCT_INFO | OUT_OF_SCOPE | OTHER",
  "secondary_intents": [],
  "order_id": "ORD-101 or null",
  "resolution_status": "RESOLVED | DECLINED_PER_POLICY | UNRESOLVED | NEEDS_HUMAN_FOLLOWUP",
  "policy_applied": "e.g. Cancellation policy — shipped orders cannot be cancelled",
  "customer_sentiment": "POSITIVE | NEUTRAL | NEGATIVE",
  "action_items": [],
  "call_summary": "1–3 sentence plain-English summary",
  "call_duration_seconds": 0
}
```

## 8. Where each secret lives
| Value | Where | Why |
|---|---|---|
| Supabase URL + anon/publishable key | Browser (`VITE_`) | Designed to be public; protected by Supabase auth rules |
| ElevenLabs API key + agent ID | Server only | Creates signed URLs; would cost money if leaked |
| Gemini API key | Server only | Paid/limited usage |
| Google client ID/secret + refresh token | Server only | Can send email as you; must never leak |

## 9. Known limitations (be honest in the README)
- Mock orders live in the browser bundle; a real system would query an orders API with authorisation.
- No identity verification before revealing order details (no phone/OTP in the mock data).
- Cancellation is simulated and not persisted.
- Email is sent from a personal Gmail account via the Gmail API (daily sending limits apply); production would use a domain and a transactional provider.
- Free tiers (Supabase pausing, ElevenLabs minutes) limit long-running availability.
