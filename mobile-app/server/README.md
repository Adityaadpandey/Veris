# veris-hotshoe-server

Backend for the DigiLocker identity check on the "Verify you're the human
behind the lens" screen (`src/app/digilocker.tsx`). It is a separate Node
service — not Expo Router API routes — on purpose: the app's `app.json` has
`web.output: "static"`, and switching that to `"server"` to host API routes
in the same project would change how the whole app builds/deploys. Keeping
this as its own tiny service means the Expo app never has to change that.

## Why Setu, not DigiLocker directly

DigiLocker's own partner OAuth2 integration requires registering as an
approved partner with NIC (a manual, multi-week approval process) before a
`client_id` even exists. [Setu](https://setu.co) is a self-serve aggregator
that sits in front of the same government DigiLocker flow and gives you a
sandbox `client_id`/`client_secret` same-day from
[bridge.setu.co](https://bridge.setu.co). Docs:
https://docs.setu.co/data/digilocker.

If the product later gets approved as a direct DigiLocker partner, only
`server/src/digilocker.js` needs to change — the three functions it exports
(`createSession`, `buildAppRedirectUrl`, `completeSession`) are the entire
contract the app depends on.

## What you need to give me

1. **A Setu account** — sign up at https://bridge.setu.co, create a
   "DigiLocker" product, and grab:
   - `SETU_CLIENT_ID`
   - `SETU_CLIENT_SECRET`
   - `SETU_PRODUCT_INSTANCE_ID`
   - confirm sandbox vs. production base URL (sandbox:
     `https://dg-sandbox.setu.co`)
2. **Where this server will run** — even a free Render/Railway/Fly.io
   instance is fine for testing. DigiLocker/Setu needs a real `https://`
   URL to redirect back to (see `PUBLIC_SERVER_URL` below); it will not
   accept the app's custom URL scheme directly, which is why this server
   exists as the bridge.
3. Once you have a URL for #2, **register it with Setu** as an allowed
   redirect origin (their dashboard has a redirect-URL allowlist — an
   unregistered one fails with their `invalid_redirect_url` error).

Until you provide these, the app's DigiLocker screen keeps working exactly
as it does today: a timed mock verification, so it stays demoable with zero
setup.

## Setup

```bash
cd server
npm install
cp .env.example .env   # fill in the Setu credentials above
npm run dev
```

Then point the app at it — in the Expo app's `.env` (or `app.json` `extra`),
set:

```
EXPO_PUBLIC_API_BASE_URL=http://localhost:8787
```

With that unset, `use-digilocker.tsx` falls back to its built-in mock.

## Endpoints

- `POST /api/digilocker/session` → `{ authUrl, state }` — start a
  DigiLocker consent request; `authUrl` is what the app opens in an
  in-app browser tab.
- `GET /api/digilocker/redirect` — DigiLocker/Setu's own redirect target;
  immediately 302s the browser into the app's `verishotshoeapp://` deep
  link so `expo-web-browser`'s `openAuthSessionAsync` on the client
  resolves.
- `POST /api/digilocker/callback` body `{ state }` → `{ verified, name,
  docType }` or `{ verified: false, reason }`. Calls Setu's Aadhaar eKYC
  endpoint server-side; the raw eKYC payload (masked Aadhaar number,
  photo, DOB, address) is never forwarded to the app — only a display
  name and doc-type label are.

## Known gap

Setu's docs (as fetched while building this) didn't show the exact JSON
shape of a successful `GET /api/digilocker/:id/aadhaar` response — only
its error codes were documented. `completeSession()` in `digilocker.js`
guesses at `data.name` / `data.fullName`; **the first real sandbox run
should confirm the actual field name** and that line may need a one-word
fix.
