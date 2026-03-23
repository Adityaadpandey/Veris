# LensMint Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready Next.js 16 frontend for LensMint — a photo authenticity verification platform with 4 pages (landing, gallery, verify, claim), wired to an ERC-1155 contract on Base Sepolia and a backend API.

**Architecture:** Server components for static/data pages (`/`, `/gallery`), client components only where wallet interaction is required (`/verify`, `/claim/[tokenId]`). All API calls go to `NEXT_PUBLIC_API_URL` via Zod-validated helpers. Contract reads use wagmi `useReadContract` on the verify page. Security headers served via `proxy.ts` with nonce-based CSP.

**Tech Stack:** Next.js 16.2.1, React 19, Tailwind v4, shadcn/ui (neutral/dark), RainbowKit v2, wagmi v2, viem, framer-motion, canvas-confetti, qrcode.react, Zod

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `package.json` | Modify | Add all runtime deps |
| `.env.example` | Create | Document all required env vars |
| `proxy.ts` | Create | CSP nonce + security headers (Next.js 16 middleware) |
| `next.config.ts` | Modify | `remotePatterns` for ipfs.io |
| `app/globals.css` | Modify | Black/white theme tokens, Inter font |
| `app/layout.tsx` | Modify | Inter font, nonce from headers, WalletProvider, Navbar |
| `app/page.tsx` | Modify | Landing page — hero, 3-step cards, CTAs |
| `app/gallery/page.tsx` | Create | Gallery grid, server fetch |
| `app/gallery/loading.tsx` | Create | 6-skeleton Suspense fallback |
| `app/verify/page.tsx` | Create | Token ID input + animated result (client) |
| `app/claim/[tokenId]/page.tsx` | Create | QR-entry claim page (client) |
| `types/index.ts` | Create | Photo, ClaimRequest, ClaimResponse, ScoreTier |
| `lib/utils.ts` | Create | `cn()`, `scoreColor()`, `formatTimestamp()`, `truncate()` |
| `lib/api.ts` | Create | Zod schemas + typed fetch helpers |
| `lib/contracts.ts` | Create | viem public client, ABI export, CONTRACT_ADDRESS |
| `lib/abi/LensMint.json` | Create | ABI (copied from `../../backend/abi/LensMint.json`) |
| `components/providers/WalletProvider.tsx` | Create | RainbowKit v2 + wagmi + QueryClient (client, env guard) |
| `components/layout/Navbar.tsx` | Create | Top nav, site name, wallet connect button |
| `components/gallery/PhotoCard.tsx` | Create | Photo thumbnail, score badge, metadata |
| `components/gallery/PhotoCardSkeleton.tsx` | Create | Animated skeleton card |
| `components/verify/VerifyResult.tsx` | Create | Framer-motion result card |
| `components/claim/ClaimForm.tsx` | Create | Wallet connect, claim button, all states |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime dependencies**

```bash
cd /Users/aditya/Devlopment/LensMint/frontend && npm install \
  @rainbow-me/rainbowkit@^2 \
  wagmi@^2 \
  viem@^2 \
  @tanstack/react-query@^5 \
  framer-motion@^11 \
  qrcode.react@^4 \
  canvas-confetti@^1 \
  zod@^3 \
  lucide-react \
  clsx \
  tailwind-merge
```

Note: `qrcode.react` is installed for future use (e.g., generating claim QR codes on the verify page). It is not used in the initial implementation.

Expected: Packages added to `node_modules/`, no peer dependency errors.

- [ ] **Step 2: Install type definitions**

```bash
cd /Users/aditya/Devlopment/LensMint/frontend && npm install -D @types/canvas-confetti
```

- [ ] **Step 3: Verify installs**

```bash
cd /Users/aditya/Devlopment/LensMint/frontend && node -e "require('@rainbow-me/rainbowkit'); require('wagmi'); require('viem'); require('zod'); console.log('OK')"
```

Expected output: `OK`

- [ ] **Step 4: Commit**

```bash
cd /Users/aditya/Devlopment/LensMint/frontend && git add package.json package-lock.json && git commit -m "chore: install web3 and ui dependencies"
```

---

## Task 2: Initialize shadcn/ui

**Files:**
- Modify: `app/globals.css`, `components.json` (auto-generated), `tailwind.config.ts` (may be created)

- [ ] **Step 1: Run shadcn init**

```bash
cd /Users/aditya/Devlopment/LensMint/frontend && npx shadcn@latest init --yes
```

When prompted (if interactive):
- Style: **New York**
- Base color: **Neutral**
- CSS variables: **Yes**

- [ ] **Step 2: Install required components**

```bash
cd /Users/aditya/Devlopment/LensMint/frontend && npx shadcn@latest add button card badge input skeleton separator tooltip avatar navigation-menu
```

- [ ] **Step 3: Verify components exist**

```bash
ls /Users/aditya/Devlopment/LensMint/frontend/components/ui/
```

Expected: `button.tsx card.tsx badge.tsx input.tsx skeleton.tsx separator.tsx tooltip.tsx`

- [ ] **Step 4: Commit**

```bash
cd /Users/aditya/Devlopment/LensMint/frontend && git add -A && git commit -m "chore: initialize shadcn/ui with neutral dark theme"
```

---

## Task 3: Foundation — Globals, Config, Env, Proxy

**Files:**
- Create: `.env.example`
- Modify: `app/globals.css`
- Modify: `next.config.ts`
- Create: `proxy.ts`

- [ ] **Step 1: Create `.env.example`**

```bash
cat > /Users/aditya/Devlopment/LensMint/frontend/.env.example << 'EOF'
# Backend API base URL
NEXT_PUBLIC_API_URL=http://localhost:3001

# Deployed LensMint ERC-1155 contract address on Base Sepolia
NEXT_PUBLIC_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000

# WalletConnect Cloud project ID (get from https://cloud.walletconnect.com)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
EOF
```

- [ ] **Step 2: Rewrite `app/globals.css` with black/white theme**

Replace the entire file with:

```css
@import "tailwindcss";

:root {
  --background: #000000;
  --foreground: #ffffff;
  --surface: #111111;
  --surface-elevated: #1a1a1a;
  --border: #27272a;
  --muted: #a1a1aa;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-surface: var(--surface);
  --color-border: var(--border);
  --color-muted: var(--muted);
}

* {
  border-color: var(--border);
}

body {
  background: var(--background);
  color: var(--foreground);
}

/* Force dark mode on html so shadcn/ui components render in dark */
html {
  color-scheme: dark;
}
```

- [ ] **Step 3: Update `next.config.ts` with remotePatterns**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [new URL("https://ipfs.io/**")],
  },
};

export default nextConfig;
```

- [ ] **Step 4: Create `proxy.ts` (CSP + security headers)**

```typescript
import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID();

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' https://ipfs.io data: blob:`,
    `font-src 'self' https://fonts.gstatic.com`,
    `connect-src 'self' https://*.walletconnect.org wss://*.walletconnect.org https://*.walletconnect.com wss://*.walletconnect.com https://*.alchemy.com https://ipfs.io`,
    `frame-src 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 5: Commit**

```bash
cd /Users/aditya/Devlopment/LensMint/frontend && git add .env.example app/globals.css next.config.ts proxy.ts && git commit -m "feat: add security headers, theme, env config"
```

---

## Task 4: Types and Lib Layer

**Files:**
- Create: `types/index.ts`
- Create: `lib/utils.ts`
- Create: `lib/abi/LensMint.json`
- Create: `lib/api.ts`
- Create: `lib/contracts.ts`

- [ ] **Step 1: Create `types/index.ts`**

```typescript
export interface Photo {
  tokenId: string;
  ipfsCid: string;
  authenticityScore: number; // 0–100
  timestamp: string;         // ISO 8601
  deviceId: string;
  imageHash?: string;        // bytes32 hex, present on verify detail
}

export interface ClaimRequest {
  tokenId: string;
  walletAddress: string;
}

export interface ClaimResponse {
  success: boolean;
  txHash?: string;
  message?: string;
  errorCode?: "already_claimed" | "contract_not_deployed" | "unknown";
}

export type ScoreTier = "authentic" | "uncertain" | "suspicious";
```

- [ ] **Step 2: Write tests for utils, then create `lib/utils.ts`**

First write the test file `lib/__tests__/utils.test.ts`:

```typescript
import { scoreColor, scoreTier, formatTimestamp, truncate } from "../utils";

describe("scoreColor", () => {
  it("returns white bg for score > 80", () => {
    const { bg, text } = scoreColor(85);
    expect(bg).toBe("bg-white");
    expect(text).toBe("text-black");
  });

  it("returns zinc-700 for score 60–80", () => {
    const { bg, text } = scoreColor(70);
    expect(bg).toBe("bg-zinc-700");
    expect(text).toBe("text-zinc-200");
  });

  it("returns red-950 for score < 60", () => {
    const { bg, text } = scoreColor(40);
    expect(bg).toBe("bg-red-950");
    expect(text).toBe("text-red-400");
  });

  it("handles boundary: score exactly 80 → uncertain", () => {
    const tier = scoreTier(80);
    expect(tier).toBe("uncertain");
  });

  it("handles boundary: score exactly 60 → uncertain (spec: < 60 is suspicious)", () => {
    const tier = scoreTier(60);
    expect(tier).toBe("uncertain");
  });

  it("handles boundary: score exactly 59 → suspicious", () => {
    const tier = scoreTier(59);
    expect(tier).toBe("suspicious");
  });
});

describe("formatTimestamp", () => {
  it("formats ISO string to readable date", () => {
    const result = formatTimestamp("2026-03-23T10:00:00.000Z");
    expect(result).toMatch(/Mar 23, 2026/);
  });
});

describe("truncate", () => {
  it("truncates long strings with ellipsis", () => {
    expect(truncate("abcdefghijklmnop", 8)).toBe("abcdefgh…");
  });

  it("does not truncate short strings", () => {
    expect(truncate("abc", 8)).toBe("abc");
  });
});
```

Note: To run this test you would need `npm install -D jest @types/jest ts-jest`. If testing setup is not yet in place, skip running the test and create the implementation directly:

- [ ] **Step 3: Create `lib/utils.ts`**

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ScoreTier } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function scoreTier(score: number): ScoreTier {
  if (score > 80) return "authentic";
  if (score >= 60) return "uncertain";  // spec: < 60 is suspicious; 60 itself is uncertain
  return "suspicious";
}

export function scoreColor(score: number): { bg: string; text: string; label: string } {
  const tier = scoreTier(score);
  if (tier === "authentic") return { bg: "bg-white", text: "text-black", label: "Authentic" };
  if (tier === "uncertain") return { bg: "bg-zinc-700", text: "text-zinc-200", label: "Uncertain" };
  return { bg: "bg-red-950", text: "text-red-400", label: "Suspicious" };
}

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatUnixTimestamp(unix: number | bigint): string {
  const ms = Number(unix) * 1000;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "…";
}
```

Note: Install `clsx` and `tailwind-merge` if shadcn/ui didn't add them:
```bash
cd /Users/aditya/Devlopment/LensMint/frontend && npm install clsx tailwind-merge
```

- [ ] **Step 4: Copy ABI and create `lib/abi/` directory**

```bash
mkdir -p /Users/aditya/Devlopment/LensMint/frontend/lib/abi
cp /Users/aditya/Devlopment/LensMint/backend/abi/LensMint.json /Users/aditya/Devlopment/LensMint/frontend/lib/abi/LensMint.json
```

- [ ] **Step 5: Create `lib/contracts.ts`**

```typescript
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import LensMintABI from "@/lib/abi/LensMint.json";

export const LENSMINT_ABI = LensMintABI as const;

export const CONTRACT_ADDRESS = process.env
  .NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` | undefined;

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});
```

- [ ] **Step 6: Create `lib/api.ts`**

```typescript
import { z } from "zod";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

// --- Zod schemas ---

export const PhotoSchema = z.object({
  tokenId: z.string(),
  ipfsCid: z.string(),
  authenticityScore: z.number().min(0).max(100),
  timestamp: z.string(),
  deviceId: z.string(),
  imageHash: z.string().optional(),
});

export const PhotoArraySchema = z.array(PhotoSchema);

export const ClaimResponseSchema = z.object({
  success: z.boolean(),
  txHash: z.string().optional(),
  message: z.string().optional(),
  errorCode: z
    .enum(["already_claimed", "contract_not_deployed", "unknown"])
    .optional(),
});

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// --- Fetch helpers ---

async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new ApiError(res.status, text);
  }
  const json = await res.json();
  return schema.parse(json);
}

export async function getPhotos() {
  return apiFetch("/photos", PhotoArraySchema);
}

export async function getPhoto(tokenId: string) {
  return apiFetch(`/photos/${tokenId}`, PhotoSchema);
}

export async function claimPhoto(tokenId: string, walletAddress: string) {
  return apiFetch("/claim", ClaimResponseSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokenId, walletAddress }),
  });
}
```

- [ ] **Step 7: Add prebuild script to package.json**

In `package.json`, update the `scripts` section:

```json
"scripts": {
  "prebuild": "cp ../backend/abi/LensMint.json lib/abi/LensMint.json || true",
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint"
}
```

- [ ] **Step 8: Commit**

```bash
cd /Users/aditya/Devlopment/LensMint/frontend && git add types/ lib/ package.json && git commit -m "feat: add types, utils, api helpers, and contract lib"
```

---

## Task 5: WalletProvider and Root Layout

**Files:**
- Create: `components/providers/WalletProvider.tsx`
- Create: `components/layout/Navbar.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create `components/providers/WalletProvider.tsx`**

Export `WALLET_ENABLED` so Navbar can guard `<ConnectButton />` and avoid crashing when no wagmi context exists.

```typescript
"use client";

import "@rainbow-me/rainbowkit/styles.css";
import {
  getDefaultConfig,
  RainbowKitProvider,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

// Exported so Navbar can conditionally render ConnectButton
export const WALLET_ENABLED = !!projectId;

let wagmiConfig: ReturnType<typeof getDefaultConfig> | null = null;

if (projectId) {
  wagmiConfig = getDefaultConfig({
    appName: "LensMint",
    projectId,
    chains: [baseSepolia],
    ssr: true,
  });
}

const queryClient = new QueryClient();

export function WalletProvider({ children }: { children: React.ReactNode }) {
  if (!wagmiConfig || !projectId) {
    console.warn(
      "[WalletProvider] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set — wallet features disabled"
    );
    return <>{children}</>;
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#ffffff",
            accentColorForeground: "#000000",
            borderRadius: "medium",
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

- [ ] **Step 2: Create `components/layout/Navbar.tsx`**

```typescript
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-black/80 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="text-lg font-bold tracking-tight text-white hover:text-zinc-300 transition-colors"
        >
          LensMint
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/gallery"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Gallery
          </Link>
          <Link
            href="/verify"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Verify
          </Link>
          <ConnectButton
            showBalance={false}
            chainStatus="none"
            accountStatus="avatar"
          />
        </div>
      </nav>
    </header>
  );
}
```

Note: `ConnectButton` is a client component. Navbar must be used inside `WalletProvider`. Since layout.tsx wraps children with WalletProvider, and Navbar is inside layout, this works. However, Navbar itself needs to be a client component because it imports from RainbowKit. Add `"use client"` to the top.

The final `components/layout/Navbar.tsx` (replace the version above with this complete version):

```typescript
"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { WALLET_ENABLED } from "@/components/providers/WalletProvider";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-black/80 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="text-lg font-bold tracking-tight text-white hover:text-zinc-300 transition-colors"
        >
          LensMint
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/gallery"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Gallery
          </Link>
          <Link
            href="/verify"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Verify
          </Link>
          {WALLET_ENABLED && (
            <ConnectButton
              showBalance={false}
              chainStatus="none"
              accountStatus="avatar"
            />
          )}
        </div>
      </nav>
    </header>
  );
}
```

- [ ] **Step 3: Modify `app/layout.tsx`**

```typescript
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { WalletProvider } from "@/components/providers/WalletProvider";
import { Navbar } from "@/components/layout/Navbar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "LensMint — Every photo, provably real",
  description:
    "Cryptographic proof of photo authenticity on the blockchain. Verify, claim, and own your authentic moments.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read nonce set by proxy.ts so this layout is dynamic (not statically cached).
  // Nonce is available for future <Script nonce={_nonce}> tags.
  const _nonce = (await headers()).get("x-nonce") ?? "";

  return (
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-black text-white antialiased font-sans">
        <WalletProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-zinc-800 py-6 text-center text-sm text-zinc-500">
            LensMint © 2026
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
```

Note: `nonce` is read but passed implicitly. Next.js automatically propagates nonces to scripts via the `nonce` variable if you add it to `<Script>` tags. For this app we don't use explicit `<Script>` tags, so the nonce is captured for future use. Keep the `headers()` call to ensure the layout is dynamic (not statically cached), which is correct since proxy sets headers per-request.

- [ ] **Step 4: Verify the app compiles**

```bash
cd /Users/aditya/Devlopment/LensMint/frontend && npm run build 2>&1 | tail -20
```

Expected: Build succeeds or shows only expected "missing env var" warnings. Fix any TypeScript errors before continuing.

- [ ] **Step 5: Commit**

```bash
cd /Users/aditya/Devlopment/LensMint/frontend && git add components/providers/ components/layout/ app/layout.tsx && git commit -m "feat: add WalletProvider, Navbar, and root layout"
```

---

## Task 6: Landing Page

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Rewrite `app/page.tsx`**

```typescript
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, ShieldCheck, Link2 } from "lucide-react";

const steps = [
  {
    icon: Camera,
    title: "Capture & Sign",
    description: "Photo is captured on device and cryptographically signed at the moment of creation.",
  },
  {
    icon: ShieldCheck,
    title: "AI Verify",
    description: "Our AI model scores the image for authenticity based on device attestation signals.",
  },
  {
    icon: Link2,
    title: "Blockchain Proof",
    description: "An immutable ERC-1155 token is minted on Base, creating a permanent on-chain record.",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center py-24 text-center gap-6">
        <div className="inline-flex items-center rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">
          Powered by Base Sepolia · ERC-1155
        </div>
        <h1 className="text-5xl font-bold tracking-tight sm:text-7xl">
          Every photo,{" "}
          <span className="text-zinc-400">provably real</span>
        </h1>
        <p className="max-w-xl text-lg text-zinc-400">
          Cryptographic proof of authenticity, on-chain forever. No more questions about what&apos;s real.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button asChild size="lg" className="bg-white text-black hover:bg-zinc-200">
            <Link href="/verify">Verify a photo</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-white text-white hover:bg-white hover:text-black"
          >
            <Link href="/gallery">View gallery</Link>
          </Button>
        </div>
      </section>

      {/* 3-Step Flow */}
      <section className="pb-24">
        <h2 className="mb-10 text-center text-sm font-medium uppercase tracking-widest text-zinc-500">
          How it works
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {steps.map((step, i) => (
            <Card
              key={i}
              className="border-zinc-800 bg-zinc-950 text-white"
            >
              <CardContent className="flex flex-col gap-4 p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900">
                    <step.icon className="h-5 w-5 text-zinc-300" />
                  </div>
                  <span className="text-xs font-medium text-zinc-500">
                    Step {i + 1}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-white">{step.title}</h3>
                  <p className="mt-1 text-sm text-zinc-400">{step.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
```

Note: Install `lucide-react` if not already added by shadcn:
```bash
cd /Users/aditya/Devlopment/LensMint/frontend && npm install lucide-react
```

- [ ] **Step 2: Check dev server renders landing**

```bash
cd /Users/aditya/Devlopment/LensMint/frontend && npm run dev &
sleep 3
curl -s http://localhost:3000 | grep -c "provably real"
```

Expected: output `1` (string found in HTML)

Kill dev server after check: `pkill -f "next dev"`

- [ ] **Step 3: Commit**

```bash
cd /Users/aditya/Devlopment/LensMint/frontend && git add app/page.tsx && git commit -m "feat: add landing page with hero and 3-step flow"
```

---

## Task 7: Gallery Page

**Files:**
- Create: `components/gallery/PhotoCardSkeleton.tsx`
- Create: `components/gallery/PhotoCard.tsx`
- Create: `app/gallery/loading.tsx`
- Create: `app/gallery/page.tsx`

- [ ] **Step 1: Create `components/gallery/PhotoCardSkeleton.tsx`**

```typescript
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export function PhotoCardSkeleton() {
  return (
    <Card className="border-zinc-800 bg-zinc-950 overflow-hidden">
      <Skeleton className="aspect-square w-full bg-zinc-800" />
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-20 bg-zinc-800" />
          <Skeleton className="h-4 w-16 bg-zinc-800" />
        </div>
        <Skeleton className="h-4 w-32 bg-zinc-800" />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create `components/gallery/PhotoCard.tsx`**

```typescript
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { scoreColor, formatTimestamp, truncate } from "@/lib/utils";
import type { Photo } from "@/types";

export function PhotoCard({ photo }: { photo: Photo }) {
  const { bg, text, label } = scoreColor(photo.authenticityScore);

  return (
    <Link href={`/verify?tokenId=${photo.tokenId}`}>
      <Card className="border-zinc-800 bg-zinc-950 overflow-hidden hover:border-zinc-600 transition-colors cursor-pointer">
        <div className="relative aspect-square bg-zinc-900">
          <Image
            src={`https://ipfs.io/ipfs/${photo.ipfsCid}`}
            alt={`Photo #${photo.tokenId}`}
            fill
            className="object-cover"
            unoptimized
          />
          <div className="absolute top-2 right-2">
            <Badge className={`${bg} ${text} font-medium text-xs`}>
              {photo.authenticityScore} · {label}
            </Badge>
          </div>
        </div>
        <CardContent className="p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>#{photo.tokenId}</span>
            <span>{formatTimestamp(photo.timestamp)}</span>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-xs text-zinc-400 font-mono truncate">
                  {truncate(photo.deviceId, 12)}
                </p>
              </TooltipTrigger>
              <TooltipContent className="bg-zinc-900 text-white border-zinc-700">
                <p className="font-mono text-xs">{photo.deviceId}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 3: Create `app/gallery/loading.tsx`**

```typescript
import { PhotoCardSkeleton } from "@/components/gallery/PhotoCardSkeleton";

export default function GalleryLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold">Gallery</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <PhotoCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `app/gallery/page.tsx`**

```typescript
import { getPhotos } from "@/lib/api";
import { PhotoCard } from "@/components/gallery/PhotoCard";
import { ApiError } from "@/lib/api";

export default async function GalleryPage() {
  let photos = [];
  let error: string | null = null;

  try {
    photos = await getPhotos();
  } catch (e) {
    if (e instanceof ApiError) {
      error = e.status === 503 ? "Backend unavailable — try again shortly." : "Failed to load gallery.";
    } else {
      error = "Failed to load gallery.";
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Gallery</h1>
        <span className="text-sm text-zinc-500">
          {photos.length > 0 ? `${photos.length} photos` : ""}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <a href="/gallery" className="underline hover:text-red-300 ml-4 whitespace-nowrap">
            Retry
          </a>
        </div>
      )}

      {!error && photos.length === 0 && (
        <div className="flex items-center justify-center py-24 text-zinc-500">
          No photos minted yet.
        </div>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <PhotoCard key={photo.tokenId} photo={photo} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/aditya/Devlopment/LensMint/frontend && git add components/gallery/ app/gallery/ && git commit -m "feat: add gallery page with photo cards and skeletons"
```

---

## Task 8: Verify Page

**Files:**
- Create: `components/verify/VerifyResult.tsx`
- Create: `app/verify/page.tsx`

- [ ] **Step 1: Create `components/verify/VerifyResult.tsx`**

```typescript
"use client";

import { motion } from "framer-motion";
import { CheckCircle, XCircle, ExternalLink, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { scoreColor, scoreTier, formatUnixTimestamp } from "@/lib/utils";

interface PhotoData {
  imageHash: `0x${string}`;
  authenticityScore: number;
  timestamp: bigint;
  deviceId: string;
  ipfsCid: string;
  minter: `0x${string}`;
}

interface VerifyResultProps {
  tokenId: string;
  data: PhotoData;
}

export function VerifyResult({ tokenId, data }: VerifyResultProps) {
  const [copied, setCopied] = useState(false);
  const { bg, text, label } = scoreColor(data.authenticityScore);
  const tier = scoreTier(data.authenticityScore);
  const isAuthentic = tier === "authentic";

  const copyHash = () => {
    navigator.clipboard.writeText(data.imageHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <Card className="border-zinc-800 bg-zinc-950 text-white">
        <CardContent className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            {isAuthentic ? (
              <CheckCircle className="h-10 w-10 text-green-400 flex-shrink-0" />
            ) : (
              <XCircle className="h-10 w-10 text-red-400 flex-shrink-0" />
            )}
            <div>
              <p className="text-sm text-zinc-400">Photo #{tokenId}</p>
              <h2 className="text-2xl font-bold">
                {isAuthentic ? "Verified Authentic" : "Authenticity Uncertain"}
              </h2>
            </div>
            <div className="ml-auto">
              <Badge className={`${bg} ${text} text-lg px-3 py-1 font-bold`}>
                {data.authenticityScore}
              </Badge>
              <p className="text-center text-xs text-zinc-500 mt-1">{label}</p>
            </div>
          </div>

          <Separator className="bg-zinc-800" />

          {/* Metadata */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
            <div>
              <p className="text-zinc-500 mb-1">Device ID</p>
              <p className="font-mono text-zinc-200 break-all">{data.deviceId}</p>
            </div>
            <div>
              <p className="text-zinc-500 mb-1">Timestamp</p>
              <p className="text-zinc-200">{formatUnixTimestamp(data.timestamp)}</p>
            </div>
          </div>

          <Separator className="bg-zinc-800" />

          {/* IPFS Link */}
          <div className="text-sm">
            <p className="text-zinc-500 mb-2">IPFS Image</p>
            <a
              href={`https://ipfs.io/ipfs/${data.ipfsCid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-zinc-200 hover:text-white transition-colors font-mono break-all"
            >
              {data.ipfsCid}
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
            </a>
          </div>

          {/* SHA-256 Hash */}
          <div className="text-sm">
            <p className="text-zinc-500 mb-2">SHA-256 Hash</p>
            <div className="flex items-start gap-2">
              <code className="flex-1 break-all rounded bg-zinc-900 p-3 text-xs text-zinc-300 font-mono">
                {data.imageHash}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={copyHash}
                className="text-zinc-400 hover:text-white flex-shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
```

- [ ] **Step 2: Create `app/verify/page.tsx`**

```typescript
"use client";

import { use, useState, useEffect } from "react";
import { useReadContract } from "wagmi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VerifyResult } from "@/components/verify/VerifyResult";
import LensMintABI from "@/lib/abi/LensMint.json";

const CONTRACT_ADDRESS = process.env
  .NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` | undefined;

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default function VerifyPage({ searchParams }: PageProps) {
  const params = use(searchParams);
  const rawTokenId = params.tokenId;
  const initialTokenId = Array.isArray(rawTokenId)
    ? rawTokenId[0]
    : rawTokenId;

  const [input, setInput] = useState(initialTokenId ?? "");
  const [tokenId, setTokenId] = useState(initialTokenId ?? "");

  // All hooks must be called unconditionally (Rules of Hooks).
  // CONTRACT_ADDRESS absence is handled via `enabled: false`, not an early return.
  const { data, isLoading, isError, error } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: LensMintABI,
    functionName: "getPhotoData",
    args: tokenId ? [BigInt(tokenId)] : undefined,
    query: {
      enabled: !!tokenId && !!CONTRACT_ADDRESS,
    },
  });

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = input.trim();
    if (clean) setTokenId(clean);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Verify Photo</h1>
        <p className="text-zinc-400 text-sm">
          Enter a token ID to verify its authenticity on-chain.
        </p>
      </div>

      {!CONTRACT_ADDRESS && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-500">
          Contract not yet deployed on Base Sepolia.
        </div>
      )}

      <form onSubmit={handleVerify} className="flex gap-3">
        <Input
          type="number"
          min="1"
          placeholder="Token ID (e.g. 42)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="bg-zinc-950 border-zinc-700 text-white placeholder:text-zinc-600 focus:border-zinc-500"
        />
        <Button
          type="submit"
          disabled={!input.trim() || isLoading || !CONTRACT_ADDRESS}
          className="bg-white text-black hover:bg-zinc-200 font-medium"
        >
          {isLoading ? "Verifying…" : "Verify"}
        </Button>
      </form>

      {isLoading && (
        <div className="text-center text-zinc-500 text-sm animate-pulse">
          Reading from blockchain…
        </div>
      )}

      {isError && tokenId && (
        <div className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-400">
          {error?.message?.includes("TokenDoesNotExist")
            ? `Token #${tokenId} does not exist.`
            : "Failed to read contract — check your connection."}
        </div>
      )}

      {data && tokenId && !isLoading && (
        <VerifyResult
          tokenId={tokenId}
          data={data as {
            imageHash: `0x${string}`;
            authenticityScore: number;
            timestamp: bigint;
            deviceId: string;
            ipfsCid: string;
            minter: `0x${string}`;
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/aditya/Devlopment/LensMint/frontend && git add components/verify/ app/verify/ && git commit -m "feat: add verify page with on-chain lookup and animated result"
```

---

## Task 9: Claim Page

**Files:**
- Create: `components/claim/ClaimForm.tsx`
- Create: `app/claim/[tokenId]/page.tsx`

- [ ] **Step 1: Create `components/claim/ClaimForm.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { claimPhoto, ApiError } from "@/lib/api";
import { scoreColor, formatTimestamp, truncate } from "@/lib/utils";
import type { Photo } from "@/types";
import Image from "next/image";
import confetti from "canvas-confetti";

interface ClaimFormProps {
  tokenId: string;
  photo: Photo | null;
  loadError: string | null;
}

export function ClaimForm({ tokenId, photo, loadError }: ClaimFormProps) {
  const { address, isConnected } = useAccount();
  const [status, setStatus] = useState<
    "idle" | "claiming" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleClaim = async () => {
    if (!address) return;
    setStatus("claiming");
    setErrorMsg("");

    try {
      const result = await claimPhoto(tokenId, address);
      if (result.success) {
        setStatus("success");
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 },
          colors: ["#ffffff", "#a1a1aa", "#71717a"],
        });
      } else {
        setStatus("error");
        if (result.errorCode === "already_claimed") {
          setErrorMsg("This NFT has already been claimed.");
        } else if (result.errorCode === "contract_not_deployed") {
          setErrorMsg("Contract not yet deployed — try again later.");
        } else {
          setErrorMsg(result.message ?? "Claim failed. Please try again.");
        }
      }
    } catch (e) {
      setStatus("error");
      if (e instanceof ApiError) {
        setErrorMsg(e.message ?? "Claim failed. Please try again.");
      } else {
        setErrorMsg("An unexpected error occurred.");
      }
    }
  };

  if (status === "success") {
    return (
      <div className="text-center space-y-4 py-8">
        <div className="text-5xl">✓</div>
        <h2 className="text-2xl font-bold text-white">NFT claimed to your wallet!</h2>
        <p className="text-zinc-400 text-sm">
          Token #{tokenId} has been sent to{" "}
          <span className="font-mono text-zinc-200">
            {address?.slice(0, 6)}…{address?.slice(-4)}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Photo Info */}
      {loadError && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-500">
          Could not load photo details.
        </div>
      )}

      {photo && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden">
          <div className="relative aspect-video bg-zinc-900">
            <Image
              src={`https://ipfs.io/ipfs/${photo.ipfsCid}`}
              alt={`Photo #${tokenId}`}
              fill
              className="object-cover"
              unoptimized
            />
          </div>
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">
                #{tokenId} · {formatTimestamp(photo.timestamp)}
              </span>
              {(() => {
                const { bg, text, label } = scoreColor(photo.authenticityScore);
                return (
                  <Badge className={`${bg} ${text}`}>
                    {photo.authenticityScore} · {label}
                  </Badge>
                );
              })()}
            </div>
            <p className="text-xs text-zinc-500 font-mono">
              {truncate(photo.deviceId, 30)}
            </p>
          </div>
        </div>
      )}

      <Separator className="bg-zinc-800" />

      {/* Wallet Section */}
      {!isConnected ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-zinc-400 text-center">
            Connect your wallet to claim this NFT
          </p>
          <ConnectButton />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">
            Claiming to:{" "}
            <span className="font-mono text-zinc-300">
              {address?.slice(0, 6)}…{address?.slice(-4)}
            </span>
          </p>

          {status === "error" && (
            <div className="rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-400">
              {errorMsg}
            </div>
          )}

          <Button
            onClick={handleClaim}
            disabled={status === "claiming"}
            className="w-full bg-white text-black hover:bg-zinc-200 font-medium"
            size="lg"
          >
            {status === "claiming" ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin inline-block h-4 w-4 border-2 border-black border-t-transparent rounded-full" />
                Claiming…
              </span>
            ) : (
              "Claim NFT"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `app/claim/[tokenId]/page.tsx`**

```typescript
"use client";

import { use } from "react";
import { useEffect, useState } from "react";
import { getPhoto, ApiError } from "@/lib/api";
import { ClaimForm } from "@/components/claim/ClaimForm";
import type { Photo } from "@/types";

interface PageProps {
  params: Promise<{ tokenId: string }>;
}

export default function ClaimPage({ params }: PageProps) {
  const { tokenId } = use(params);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getPhoto(tokenId)
      .then(setPhoto)
      .catch((e) => {
        setLoadError(
          e instanceof ApiError ? e.message : "Failed to load photo."
        );
      });
  }, [tokenId]);

  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      {/* Logo */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-white">LensMint</h1>
        <p className="mt-1 text-sm text-zinc-400">Claim Your Photo NFT</p>
      </div>

      <ClaimForm tokenId={tokenId} photo={photo} loadError={loadError} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/aditya/Devlopment/LensMint/frontend && git add components/claim/ app/claim/ && git commit -m "feat: add claim page with wallet connect and confetti success"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Run TypeScript type check**

```bash
cd /Users/aditya/Devlopment/LensMint/frontend && npx tsc --noEmit 2>&1
```

Expected: No errors. Fix any type errors before proceeding.

- [ ] **Step 2: Run lint**

```bash
cd /Users/aditya/Devlopment/LensMint/frontend && npm run lint 2>&1
```

Expected: No errors or only ignorable warnings.

- [ ] **Step 3: Run production build**

```bash
cd /Users/aditya/Devlopment/LensMint/frontend && npm run build 2>&1
```

Expected: Build completes. Pages listed:
- `/` (static)
- `/gallery` (dynamic)
- `/verify` (dynamic)
- `/claim/[tokenId]` (dynamic)

- [ ] **Step 4: Start and spot-check all routes**

```bash
cd /Users/aditya/Devlopment/LensMint/frontend && npm run start &
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000      # expect 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/gallery   # expect 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/verify    # expect 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/claim/1   # expect 200
pkill -f "next start"
```

Expected: All return `200`.

- [ ] **Step 5: Check security headers are present**

```bash
curl -s -I http://localhost:3000 | grep -E "X-Frame|Content-Security|X-Content-Type"
```

Expected: `X-Frame-Options: DENY`, `Content-Security-Policy: ...`, `X-Content-Type-Options: nosniff`

- [ ] **Step 6: Final commit**

```bash
cd /Users/aditya/Devlopment/LensMint/frontend && git add -A && git commit -m "feat: complete LensMint frontend — all 4 pages, wallet, CSP"
```

---

## Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| `wagmi` peer dep warning | React 19 not yet in wagmi's peerDeps | Safe to ignore; wagmi v2 works with React 19 |
| RainbowKit styles 404 | Missing CSS import | Ensure `import '@rainbow-me/rainbowkit/styles.css'` is in WalletProvider |
| `useReadContract` returns `undefined` | Contract address not set | Check `.env.local` has `NEXT_PUBLIC_CONTRACT_ADDRESS` |
| `params` not unwrapping | Using `await` in client component | Use `use(params)` not `await params` in `"use client"` files |
| Hydration mismatch on wallet | SSR/client state | Add `suppressHydrationWarning` to `<html>` (already in layout) |
| `clsx` not found | shadcn/ui didn't install it | Run `npm install clsx tailwind-merge` |
| IPFS images not loading | remotePatterns mismatch | Verify `next.config.ts` has `new URL("https://ipfs.io/**")` |
