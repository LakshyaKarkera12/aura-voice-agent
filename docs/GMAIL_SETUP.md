# GMAIL_SETUP.md — Sending Email with the Gmail API (free, Google-managed)

Google Cloud has no separate "send email" service. The Google way to send email from code is the **Gmail API**, which sends from your Gmail account. It's free. Consumer Gmail accounts have a daily sending limit (a few hundred messages), which is far more than this project needs.

How it works: your server holds a **refresh token** that proves you gave the app permission to send mail as you. Each time it sends, the `googleapis` library swaps the refresh token for a short-lived access token automatically.

> **Menu names:** Google moved the OAuth consent screen into **Google Auth Platform**, split into **Branding** (app name, emails), **Audience** (External, test users, *Publish app*), **Data Access** (scopes) and **Clients** (OAuth client ID). The steps below still apply; look for those page names.
>
> **Check your work:** after filling `.env.local`, run `npm run check:env`. It confirms the refresh token works and has the `gmail.send` scope (no email is sent).

## Steps
1. **Create a project:** https://console.cloud.google.com → project selector → New Project → name it `aura-voice-agent`.
2. **Enable the Gmail API:** APIs & Services → Library → search "Gmail API" → Enable.
3. **OAuth consent screen** (APIs & Services → OAuth consent screen / Google Auth Platform):
   - User type: **External**
   - App name: "Aura Skincare Voice Agent", support email: your Gmail, developer email: your Gmail
   - Scopes: add `https://www.googleapis.com/auth/gmail.send` (send only; it can't read your mail)
   - Test users: add your own Gmail
4. **Create an OAuth client:** Credentials → Create Credentials → OAuth client ID → **Web application** → Authorized redirect URI: `https://developers.google.com/oauthplayground` → copy **Client ID** and **Client Secret**.
5. **We stay in Testing mode** (decision D-29). Publishing to Production now requires a homepage URL and a privacy policy URL on a domain you own, so we skip it.
   - Make sure your own Gmail is listed under **Audience → Test users** (only test users can authorise the app; anyone can still *receive* the emails).
   - ⚠️ In Testing mode the **refresh token expires 7 days after you create it.** Redo step 6 every ~6 days while evaluators are testing, then update `GOOGLE_REFRESH_TOKEN` in `.env.local` **and** in Vercel → Settings → Environment Variables, and redeploy.
   - If it does expire, the app still shows the summary on screen with "Couldn't send the email" (CLAUDE.md rule 9).
   - You'll see an "unverified app" warning when you authorise; click Advanced → continue.
6. **Get the refresh token** with the OAuth Playground: https://developers.google.com/oauthplayground
   - Gear icon ⚙ → tick "Use your own OAuth credentials" → paste Client ID + Secret
   - Step 1: enter scope `https://www.googleapis.com/auth/gmail.send` → Authorize APIs → sign in with your Gmail → allow
   - Step 2: **Exchange authorization code for tokens** → copy the **Refresh token**
7. Put these in `.env.local` (and later in Vercel env vars):
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REFRESH_TOKEN=...
   GMAIL_SENDER=yourname@gmail.com
   ```
8. Test with a tiny script or the `/api/summary` route by sending to your own email first.

## Troubleshooting
| Error | Likely cause |
|---|---|
| `invalid_grant` | Refresh token expired (Testing mode: 7 days), revoked, or created with different client credentials. Redo step 6 and update the env var in `.env.local` and Vercel. |
| `insufficient permissions` | Token created without the `gmail.send` scope. |
| Email lands in spam | Normal for automated mail from Gmail; tell evaluators in the README and UI to check spam. A clear subject and plain, non-salesy content help. |
| `redirect_uri_mismatch` | Redirect URI in step 4 doesn't exactly match the Playground URL. |

## Safety
- The refresh token can send email as you. Server-side only; never commit it; never prefix with `VITE_`.
- `/api/summary` sends only to the email in the **verified Supabase token**, so it can't be abused as a spam relay.
- If the token ever leaks: Google Account → Security → Third-party access → remove the app, then create a new token.
