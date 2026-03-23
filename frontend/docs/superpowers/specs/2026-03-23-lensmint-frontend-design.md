# LensMint Frontend Design Spec

**Date:** 2026-03-23
**Status:** Approved (v2 — post-review)

---

## Overview

LensMint is a photo authenticity verification platform. Users capture photos on a device, the backend hashes and scores them, mints an ERC-1155 proof token on Base Sepolia, and users claim their NFT by scanning a QR code on mobile. This document specifies the frontend implementation.

---

## Tech Stack

| Tool | Version | Purpose |
|------|---------|---------|
| Next.js | 16.2.1 (installed) | App Router, server/client components |
| React | 19.2.4 | UI framework |
| TypeScript | 5+ | Type safety |
| Tailwind CSS | v4 | Styling |
| shadcn/ui | latest | UI component library (neutral base, forced dark) |
| RainbowKit | v2 | Wallet connection UI |
| wagmi | v2 | React hooks for Ethereum |
| viem | latest | Low-level Ethereum client |
| framer-motion | latest | Animations |
| qrcode.react | latest | QR code rendering |
| Zod | latest | API response validation |
| canvas-confetti | latest | Confetti effect on claim success |

---

## Environment Variables

```
NEXT_PUBLIC_API_URL                   # Base URL for backend API
NEXT_PUBLIC_CONTRACT_ADDRESS          # Deployed LensMint ERC-1155 contract address
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID  # WalletConnect Cloud project ID
```

A `.env.example` file must be committed to the frontend root with all three keys and placeholder values.

---

## Design System

### Theme: Black & White (forced dark — no light mode)

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#000000` | Page background |
| Surface | `#111111` | Card backgrounds |
| Surface elevated | `#1a1a1a` | Nested cards, inputs |
| Border | `#27272a` (zinc-800) | All borders |
| Text primary | `#ffffff` | Headings, body |
| Text muted | `#a1a1aa` (zinc-400) | Subtitles, metadata |

### Score Badge — Three-tier system (used consistently on all pages)

| Score | Background | Text | Label |
|-------|-----------|------|-------|
| > 80 | white | black | Authentic |
| 60–80 | zinc-700 | zinc-200 | Uncertain |
| < 60 | red-950 | red-400 | Suspicious |

### Typography
- Font: Inter (Google Fonts, variable)
- Headings: `font-bold tracking-tight`
- Body: `text-sm text-zinc-400`

### shadcn/ui Config
- Base color: `neutral`
- Mode: `dark` (forced)
- Components: `Button`, `Card`, `Badge`, `Input`, `Skeleton`, `Separator`, `Avatar`, `Tooltip`, `NavigationMenu`

---

## Architecture

### Rendering Strategy

| Route | Strategy | Reason |
|-------|----------|--------|
| `/` | Server Component | Static content, no interactivity |
| `/gallery` | Server Component + `loading.tsx` | Fast initial render, automatic Suspense via Next.js |
| `/verify` | Client Component | Token ID input + animated result, wagmi reads |
| `/claim/[tokenId]` | Client Component | Wallet connect, transaction signing |

### File Structure

```
frontend/
├── .env.example                        # All required env vars with placeholders
├── proxy.ts                            # Next.js 16 middleware (renamed from middleware.ts)
│                                       # Generates per-request CSP nonce + security headers
├── app/
│   ├── layout.tsx                      # Root layout: Inter font, WalletProvider, global nav
│   ├── page.tsx                        # Landing page (server)
│   ├── gallery/
│   │   ├── page.tsx                   # Gallery grid (server)
│   │   └── loading.tsx                # Auto-Suspense fallback: 6 PhotoCardSkeleton
│   ├── verify/
│   │   └── page.tsx                   # Verify page (client)
│   └── claim/
│       └── [tokenId]/
│           └── page.tsx               # Claim page (client)
├── components/
│   ├── providers/
│   │   └── WalletProvider.tsx         # RainbowKit + wagmi (client, with env guard)
│   ├── layout/
│   │   └── Navbar.tsx                 # Top nav with wallet connect button
│   ├── gallery/
│   │   ├── PhotoCard.tsx              # Individual photo card
│   │   └── PhotoCardSkeleton.tsx      # Loading skeleton
│   ├── verify/
│   │   └── VerifyResult.tsx           # Animated result card
│   └── claim/
│       └── ClaimForm.tsx              # Wallet connect + claim button + states
├── lib/
│   ├── api.ts                         # Typed fetch helpers (Zod-validated, no cache option needed)
│   ├── contracts.ts                   # viem public client + ABI helpers
│   ├── abi/
│   │   └── LensMint.json              # ABI copied from backend/abi/LensMint.json at build time
│   └── utils.ts                       # cn(), scoreColor(), formatters
├── types/
│   └── index.ts                       # Shared TypeScript types (see Types section)
└── next.config.ts                     # remotePatterns for ipfs.io, no CSP here
```

---

## Types (`types/index.ts`)

```typescript
export interface Photo {
  tokenId: string
  ipfsCid: string
  authenticityScore: number   // 0–100
  timestamp: string           // ISO 8601
  deviceId: string
  imageHash?: string          // bytes32 hex, present on verify detail
}

export interface ClaimRequest {
  tokenId: string
  walletAddress: string
}

export interface ClaimResponse {
  success: boolean
  txHash?: string
  message?: string
  errorCode?: 'already_claimed' | 'contract_not_deployed' | 'unknown'
}

// Note: "wallet rejected" is a wagmi/viem error thrown client-side BEFORE
// the POST /claim request is made. It must be caught from the wagmi call
// and handled separately — it never produces a ClaimResponse.

export type ScoreTier = 'authentic' | 'uncertain' | 'suspicious'
```

---

## Pages

### `/` — Landing

**Rendering:** Server Component

**Sections:**
1. **Hero** — Full-width centered: headline "Every photo, provably real", subtitle "Cryptographic proof of authenticity, on-chain forever.", two CTA buttons:
   - "Verify a photo" → `/verify` (white filled, black text)
   - "View gallery" → `/gallery` (outlined, white border)
2. **3-Step Flow** — Horizontal cards (stacked on mobile, row on md+):
   - Step 1: Capture & Sign — camera icon
   - Step 2: AI Verify — shield icon
   - Step 3: Blockchain Proof — link icon
   - Each card: `#111` bg, zinc-800 border, icon + title + 1-line description
3. **Footer** — "LensMint © 2026"

---

### `/gallery` — Photo Gallery

**Rendering:** Server Component. `gallery/loading.tsx` provides automatic Suspense fallback (6 skeletons).

**Data:** `GET ${NEXT_PUBLIC_API_URL}/photos` → `Photo[]`
- In Next.js 16, fetch is uncached by default — no `{ cache: 'no-store' }` option needed.
- Response validated with Zod `PhotoSchema` array before use.

**Layout:** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`

**PhotoCard:**
- Thumbnail: `<Image>` from `https://ipfs.io/ipfs/{cid}`, using `remotePatterns` config
- Score badge (three-tier per design system)
- Timestamp formatted as "Mar 23, 2026"
- Device ID truncated at 12 chars, full value in Tooltip
- Click → `/verify?tokenId={id}`

**Empty state:** Centered "No photos minted yet." message

**Error state:** Centered "Failed to load gallery." message with retry link

---

### `/verify` — Verification

**Rendering:** Client Component (`"use client"`)

**Data source:** On-chain via wagmi `useReadContract` calling `getPhotoData(tokenId)` on the LensMint contract.
- This is the authoritative source; the backend API is not used on this page.
- If `NEXT_PUBLIC_CONTRACT_ADDRESS` is undefined: show "Contract not yet deployed" notice.

**`searchParams` pre-population:**
- Page receives `searchParams: Promise<{ [key: string]: string | string[] | undefined }>` (Next.js 16 — Client Component, must `use()` to unwrap)
- Extract `tokenId` and guard against array: `const id = Array.isArray(raw) ? raw[0] : raw`
- If `tokenId` present in query string (e.g., from gallery click), pre-populate the input and auto-trigger verification

**Flow:**
1. Input field: "Token ID" + "Verify" button
2. On submit: `useReadContract({ functionName: 'getPhotoData', args: [tokenId] })`
3. Animated result card reveals via framer-motion (`y: 20 → 0`, `opacity: 0 → 1`, 400ms ease-out)

**Result card (success):**
- Score badge (three-tier, large)
- Score: large number (e.g., "87") + "Authenticity Score" label
- Device ID
- Timestamp
- IPFS link to `https://ipfs.io/ipfs/{cid}` (opens new tab)
- SHA-256 hash: full `bytes32` hex in monospace + copy-to-clipboard button

**Error states:**
- Token not found: card with red border and "Token #X does not exist" message
- Contract not deployed: muted notice "Contract not yet deployed on Base Sepolia"
- Network error: "Failed to read contract — check your connection"

---

### `/claim/[tokenId]` — Claim (QR entry point)

**Rendering:** Client Component (`"use client"`)

**Params unwrapping:** `params` is `Promise<{ tokenId: string }>` in Next.js 16. Use React `use()` hook to unwrap in a Client Component.

**Data fetch:** `GET ${NEXT_PUBLIC_API_URL}/photos/{tokenId}` → `Photo` on mount for photo info display.

**Layout:** Centered single column, mobile-optimized (max-w-sm, full padding)

**Sections:**
1. LensMint logo + "Claim Your Photo NFT" heading
2. Photo info card: thumbnail, score badge (three-tier), device ID, timestamp
3. Wallet section:
   - If not connected: RainbowKit `<ConnectButton />`
   - If connected: shows truncated wallet address, "Claim NFT" button
4. On claim: `POST ${NEXT_PUBLIC_API_URL}/claim` with `{ tokenId, walletAddress }`
   - Loading state: button disabled + spinner
   - Success state: canvas-confetti burst + "NFT claimed to your wallet!" card
   - Error states:
     - API error: "Claim failed — {message from server}" with retry button
     - Already claimed: "This NFT has already been claimed"
     - Contract not deployed: "Contract not yet deployed — try again later"
     - Wallet rejected: "Transaction cancelled"

**`WalletProvider` guard:** If `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is missing, render a fallback notice instead of crashing.

---

## Components

### `WalletProvider` (`components/providers/WalletProvider.tsx`)

```typescript
// "use client"
// Guard: if NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is undefined, render children
// with a non-functional stub (no crash) and log a warning.
// Uses getDefaultConfig from RainbowKit v2:
//   chains: [baseSepolia] from wagmi/chains
//   projectId: NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
// Wraps: WagmiProvider > QueryClientProvider > RainbowKitProvider
```

### `lib/api.ts`

- Typed fetch helpers; no explicit cache option (Next.js 16 defaults to uncached)
- All responses validated with Zod schemas
- Throws `ApiError` (typed class) on non-2xx

### `lib/contracts.ts`

- ABI imported from `lib/abi/LensMint.json` (local copy inside frontend)
- Exports `LENSMINT_ABI` and `CONTRACT_ADDRESS` (from env)
- Exports `publicClient` (viem, Base Sepolia chainId 84532)

### `proxy.ts` (Next.js 16 middleware)

- Generates a cryptographic nonce (`crypto.randomUUID()`, UUID string — browser-safe as CSP nonce value) per request
- Forwards the nonce to the render tree via a custom request header: `x-nonce: <nonce>`
- Sets `Content-Security-Policy` response header with `'nonce-<nonce>'` for `script-src` and `style-src`
- Sets `X-Frame-Options: DENY`
- Sets `X-Content-Type-Options: nosniff`
- Sets `Referrer-Policy: strict-origin-when-cross-origin`
- Matcher: all routes

**Nonce propagation to `layout.tsx`:**
`layout.tsx` is a Server Component that reads the nonce from the incoming request header via `import { headers } from 'next/headers'`:
```typescript
const nonce = (await headers()).get('x-nonce') ?? ''
```
This nonce is then passed to any `<Script nonce={nonce}>` or inline `<style nonce={nonce}>` tags in the layout, ensuring RainbowKit/wagmi inline scripts satisfy the CSP nonce requirement.

---

## `next.config.ts`

```typescript
images: {
  remotePatterns: [new URL('https://ipfs.io/**')]
}
// No CSP headers here — handled by proxy.ts for nonce support
```

---

## Security

| Concern | Mitigation |
|---------|-----------|
| XSS | No `dangerouslySetInnerHTML`; all content via React |
| API response injection | Zod validates all API responses before state use |
| Secrets in bundle | Only `NEXT_PUBLIC_*` vars in client; no private keys ever |
| IPFS images | `<Image>` with explicit dimensions via `remotePatterns` |
| CSP | Nonce-based CSP in `proxy.ts` (supports RainbowKit inline scripts) |
| Clickjacking | `X-Frame-Options: DENY` in `proxy.ts` |
| Contract addr missing | All contract-reading pages show graceful "not deployed" state |
| WalletConnect missing | WalletProvider renders stub instead of crashing |

---

## Key Constraints

- **Mobile-first:** `/claim/[tokenId]` opened from QR scan — must be perfect on phones
- **No dark mode toggle:** Theme is permanently dark/black
- **No auth:** Wallet connection is the only identity mechanism
- **Backend in progress:** All API calls handle 503/empty responses gracefully
- **Contract address pending:** All contract-read pages handle undefined address gracefully
- **ABI sync:** `lib/abi/LensMint.json` must be kept in sync with `backend/abi/LensMint.json` when contract is redeployed. A `prebuild` npm script (`"prebuild": "cp ../backend/abi/LensMint.json lib/abi/LensMint.json"`) automates this in monorepo environments. For isolated deployments, this is a manual step — document in the project README.
