# Privy

- Prize: Privy.
- Ask: > TODO: paste the official prize ask here
- Back to the [root README](../README.md).

## What we built

- Privy login in the owner portal: wallet, email or sms.
- An embedded wallet is created for users who have none.
- Privy login in the mobile app: email OTP and MetaMask via SIWE.
- A server Privy service with session signer and gas sponsorship (not wired to any app).

## Before vs added

Before the event:
- `c943963` server Privy service and portal provider (2026-10-28).
- `939ba51` mobile app with Privy (2026-10-28).
- `0e12df1`, `35d8264` portal provider fixes (2026-10-29).

Added 2026-11-06:
- `26902e6` only touched `App.jsx` for the Arc license button. No new Privy feature. > TODO: confirm with the team.

## Where in the code

| What | File:lines | Note |
|---|---|---|
| Portal provider | `owner-portal/src/App.jsx:25-53` | Login by wallet, email, sms |
| Embedded wallet | `owner-portal/src/App.jsx:33-35` | `createOnLogin: "users-without-wallets"` |
| Dashboard login | `owner-portal/src/components/OwnerDashboard.jsx:42` | `usePrivy` login, logout, user |
| Claim page login | `owner-portal/src/components/ClaimPage.jsx:405` | `usePrivy` ready, authenticated |
| Mobile provider | `mobile-app/src/app/_layout.tsx:54-71` | App id and client id |
| Mobile email OTP | `mobile-app/src/hooks/use-connection.tsx:57-58,116` | `useLoginWithEmail` |
| Mobile embedded wallet | `mobile-app/src/hooks/use-connection.tsx:59,70-75` | Creates wallet if none |
| Server Privy service | `hardware-web3-service/privyService.js:3-124` | Session signer and gas sponsorship |

## One snippet

`owner-portal/src/App.jsx:28-35`

```jsx
config={{
  loginMethods: ["wallet", "email", "sms"],
  ...
  embeddedWallets: {
    createOnLogin: "users-without-wallets",
  },
}}
```

## Verify in 3 steps

1. Open the portal at `/dashboard`, click login, sign in with email.
2. Check an embedded wallet address shows after login.
3. Open the mobile wallet screen; "SECURED BY PRIVY" is at `mobile-app/src/app/wallet.tsx:191`.

## Honest gaps

- The `/api/privy/*` routes (`server.js:1423-1538`) are unused by the portal and mobile app, and have no auth check on the caller.
- `@privy-io/server-auth` is in `hardware-web3-service/package.json:28` but never imported; `privyService.js` calls session-signer URLs by hand. > TODO: confirm these endpoints exist in the real Privy API.
- > TODO: confirm Privy gas sponsorship (`sponsor-all`) is enabled in the dashboard.
- > 📸 TODO: Privy login modal in the portal.
- > 📸 TODO: mobile wallet screen after email OTP login.
