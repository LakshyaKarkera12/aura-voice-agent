# UI_DESIGN.md — Look & Feel

Goal: rich, luxury skincare feel — **"apothecary at night"** (redesign, D-33). Deep bottle-green ground, champagne-gold hairlines and accents, ivory type, frosted-glass cards over slowly drifting glows and fine grain. Clean and functional first; evaluators care about clarity. Plain CSS only.

> Sections further down describe layout and states; where they mention old colours (sage buttons, cream background), the tokens below win.

## Design tokens (`base.css` `:root`) — all text ≥ 7:1 on cards
| Token | Value | Use |
|---|---|---|
| `--ink` | `#0D1C17` | page background |
| `--ink-raised` / `--glass` | `#14261F` / `rgba(20,38,31,.72)` | cards (frosted glass, `backdrop-filter`) |
| `--glass-border` | `rgba(201,169,110,.18)` | gold hairline borders |
| `--ivory` | `#F2ECE1` | main text (13:1) |
| `--muted` | `#A7B3A9` | secondary text (7:1) |
| `--gold` / `--gold-bright` | `#C9A96E` / `#E2C892` | accents, eyebrows, primary buttons (ink text on gold 7.9:1) |
| `--gold-soft` | `#D8BF8C` | user chat bubbles |
| `--sage` | `#8FB596` | orb: ready / listening |
| `--peach` | `#E8B4A0` | orb: speaking |
| `--amber` | `#E6B655` | orb: thinking |
| `--stone` | `#6F7A73` | orb: call ended |
| `--danger` | `#E89A8E` | errors, End call (7:1) |
| `--border-strong` | `#6B7C71` | form field borders (≥ 3:1) |
| `--status-*-fg/bg` | see base.css | order pills: light text on dark tint (≥ 8:1) |
| `--radius` | `20px` | cards; `999px` pills |

Fonts (Google Fonts): **Fraunces** (SOFT axis, weights 400–600, with *italic* for gold accent words like "Just ask *Aria*"), **Inter** for body. Small letter-spaced gold uppercase **eyebrow** labels above headings.

## Motion (all disabled under `prefers-reduced-motion`)
- Page load: cards and headings rise + fade in, staggered (`.reveal` + `--delay`).
- Ambient: two background glows drift over ~28 s.
- Orb: liquid inside slowly rotates; **voice-reactive** — `--level` (0–1) from the live volume scales the core and halo; while speaking, three ripple rings flow out with strength following Aria's voice.
- Transcript bubbles glide in; summary rows fade in one after another; gold sheen sweeps across primary buttons on hover; state label fades in on each change.

## Page 1: `index.html` (Sign up / Log in)
- Split layout on desktop: left panel with brand ("Aura Skincare", tagline, a soft gradient blob), right panel with the form card. Single column on mobile.
- Form card with two tabs: **Sign up** (default) | **Log in**.
- Sign up: Full name, Email, Password (show/hide toggle), button "Create account".
- Log in: Email, Password, button "Log in".
- Inline validation messages under fields; a top error banner for server errors.
- Button shows a spinner and disables while waiting.
- Small note: "Your call summary will be emailed to this address."

## Page 2: `app.html` (Call page)
**Header:** brand on the left; "Hi, {first name}" + Log out on the right.

**Desktop layout (3 areas):**
```
┌───────────────────────────────┬────────────────────┐
│        CALL CARD              │  TEST ORDERS       │
│   ( animated orb )            │  ORD-101 card      │
│   State label: Listening      │  ORD-102 card      │
│   [ Start Call ] [ End Call ] │  ORD-103 card      │
│                               │  Try saying… tips  │
├───────────────────────────────┴────────────────────┤
│  LIVE TRANSCRIPT (chat bubbles; user right, Aria left)│
├─────────────────────────────────────────────────────┤
│  CALL SUMMARY (after the call): readable fields +   │
│  collapsible raw JSON + copy button + email status  │
└─────────────────────────────────────────────────────┘
```
Mobile: stack everything; Test Orders becomes a collapsible section.

## The orb (state indicator)
A ~160px circle with a soft radial gradient. Colour and animation by state, plus a text label underneath (never colour alone):
| State | Look |
|---|---|
| Idle | sage, still, label "Ready" |
| Connecting | sage, slow rotating ring |
| Listening | sage, gentle breathing pulse |
| Thinking | amber, shimmer / three dots |
| Speaking | peach, faster pulse (optionally scaled by output volume) |
| Ended | grey, still, label "Call ended" |
Respect `prefers-reduced-motion`: disable animations, keep colours and labels.

## Test Orders cards
Each card: order ID (bold, monospace), customer, product, value, a coloured status pill (Out for Delivery = blue-ish, Delivered = green, Processing = amber), and a one-line "Try: 'Can I cancel ORD-101?'". Click to copy the ID.

## Summary card
Show human-readable rows first (Intent, Order, Resolution as a coloured badge, Sentiment, Summary, Action items), then a "View JSON" toggle with a copy button. Under it, the email status line.

## States to design (don't forget these)
- Mic permission denied: friendly message with how to allow it
- Connecting failed / network lost: message + "Try again"
- Summary loading: skeleton shimmer
- Summary failed: transcript still visible + "Couldn't generate summary"
- Email failed: summary still visible + "Couldn't send email"
- Empty transcript before first call: "Your conversation will appear here"

## Accessibility basics
Real `<button>` and `<label>` elements, visible focus outlines, colour contrast at least 4.5:1 for text, `aria-live="polite"` on the state label and transcript.

## Email design (`emailTemplate.js`)
Simple single-column HTML with inline styles (email clients ignore stylesheets): Aura header, "Hi {name}, here's a summary of your call with Aria", summary rows, resolution badge, date/time, footer "This is an automated message from a demo project."
