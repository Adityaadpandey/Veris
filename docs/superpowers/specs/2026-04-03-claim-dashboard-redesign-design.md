# Claim Page + Owner Dashboard Redesign

**Date:** 2026-04-03  
**Scope:** `owner-portal/src/components/ClaimPage.jsx` and `owner-portal/src/components/OwnerDashboard.jsx`  
**Approach:** Focused Redesign — no new files, no new routes, no new backend endpoints except one new field

---

## Goals

Redesign both pages to clearly convey the Veris value proposition: hardware-signed photos + ZK proofs = verifiable proof a photo isn't AI-generated. The UI should feel like a trust instrument, not a form.

---

## Claim Page

### Layout

Split two-column on desktop, stacked single-column on mobile (photo → stats → proof data).

**Header (full width)**
- Left: Veris logo circle (V in orange) + "Veris Protocol" wordmark
- Right: Animated "Verified Original" pill with pulsing green dot

**Left column — Photo**
- IPFS image fills a 4:3 frame with rounded corners and subtle border
- Bottom-left overlay badge: `✓ Original · Not AI` (dark blur background, green text)
- Top-right overlay badge: `⛓ On-Chain` (dark blur background, orange text)
- Below image: compact meta rows
  - Captured (timestamp)
  - Camera (device ID)
  - Location (link to Google Maps if lat/lng present)
  - SHA-256 Hash (truncated + copy button)

**Right column — Proof Stats + CTA**

1. **AI Score card** — circular progress ring (0–100), gradient orange→green, score number centered. Label: "AI Authenticity". Sub-label: contextual text based on score (e.g. "Extremely unlikely to be AI-generated" for >90).
2. **ECDSA Signed** — green stat pill. Icon, title "ECDSA Signed", sub "Hardware key · TPM 2.0", green checkmark.
3. **ZK Proof Verified** — orange stat pill. Icon, title "ZK Proof Verified", sub "Groth16 · vlayer", orange checkmark.
4. **IPFS Stored** — blue stat pill. Icon, title "IPFS Stored", sub "Filecoin · Lighthouse", blue checkmark.
5. **Claim CTA button** — full width, orange gradient, "Claim Free Edition", star icon. Sub-label: "Connect wallet or enter address · ERC-1155 · Sepolia".

**Proof Accordion (full width, below split)**
- Collapsed by default, toggled with "Cryptographic Proof Data ▾ show all"
- 2-column grid of proof items: Device Address, IPFS CID, Token ID, Mint Tx (link), ECDSA Sig, Network

**Footer**
- "Powered by Veris Protocol · No trust required, just math."

### Claim Flow States

Same logic as current (open / pending / minted / not-found), redesigned to match the new visual language:
- **Open**: Right column shows AI Score + proof stats + CTA
- **Pending**: Right column shows a pulsing "Processing…" state in place of CTA
- **Minted (edition claimed)**: Right column shows green success state with wallet address
- **Not found**: Full-page centered error card, red XCircle icon

### New Backend Field Required

The claim API response (`GET /check-claim?claim_id=...`) must include:
```json
{ "ai_score": 97 }
```
This is an integer 0–100. If absent, the AI Score ring shows a dash/unknown state rather than crashing.

---

## Owner Dashboard

### Layout

Sidebar (200px) + scrollable main content. On mobile: sidebar collapses to a bottom tab bar, content goes full-width.

### Sidebar

- **Logo row**: Veris logo + wordmark, border-bottom
- **Device status card**: Pulsing green dot + "Camera Online" / "Camera Offline" + device ID. Color flips to red/amber when `servicesInitialized` is false.
- **Nav items**: Photos (with amber badge showing pending count) · Device
- **Footer**: Wallet address (truncated mono) + Sign out

### Top Bar

- Page title ("Photos")
- Right: Refresh button + "Retry N pending" primary button (only shown when pending > 0)

### Stats Row (4 columns)

| Card | Color | Value | Label |
|------|-------|-------|-------|
| Total | neutral | `images.length` | Total shots |
| Minted | green | `minted count` | Minted NFTs |
| Uploading | blue | `uploaded count` | Uploading |
| Pending | amber | `saved count` | Pending · "needs retry" sub-label |

### Filter Tabs

Pill tabs: All · Minted · Uploading · Pending. Each shows a count badge colored by status (green for minted, amber for pending). Active tab has white text + subtle background.

### Photo Grid

4-column grid on desktop → 2-column on tablet → 1-column on mobile.

**Featured card (latest shot, spans 2 columns):**
- If the most recent image has status `saved` or `uploaded`: shows pulsing orange "Just captured · uploading to Filecoin…" overlay, no AI score badge, no QR actions yet.
- Once `minted`: transitions to normal card (double-wide still).

**Standard minted card:**
- 4:3 thumbnail (IPFS image or camera icon placeholder)
- Top-left: status badge (`Minted` in green)
- Bottom-right: AI score badge (`AI 97` in green, only if `ai_score` present)
- Below thumbnail: ID, timestamp, truncated CID
- Actions row: `⬛ QR` (primary orange), `⎘ Link` (copy), `↗` (Etherscan)

**Pending card:**
- Amber border tint
- Top-left: `Pending` badge in amber
- Sub-label: "Upload failed · needs retry" in amber
- Actions row: `↺ Retry` button (amber)

### QR Modal

Keep existing Dialog implementation. Style update: larger QR (240×240), cleaner copy/open button row. No structural changes.

### Device Tab

Keep existing card layout. Style update: match new card aesthetic. Add colored dot next to each service status (green/red) instead of just text.

---

## Responsive Behavior

| Breakpoint | Claim Page | Dashboard |
|------------|-----------|-----------|
| Mobile (<640px) | Single column stack | Bottom tab bar, 1-col grid, 2×2 stats |
| Tablet (640–1024px) | Split (narrower cols) | Sidebar stays, 2-col grid |
| Desktop (>1024px) | Split (as designed) | Full sidebar, 4-col grid |

---

## Files Changed

| File | Change |
|------|--------|
| `owner-portal/src/components/ClaimPage.jsx` | Full redesign within existing file |
| `owner-portal/src/components/OwnerDashboard.jsx` | Full redesign within existing file |
| Backend (out of scope) | Add `ai_score` field to `/check-claim` response |

No new files. No new routes. No new npm packages required.

---

## Design Tokens Used

All from existing `index.css` theme:
- `--color-brand` (#E85002) — primary orange
- `--color-status-minted` (#34d399) — green
- `--color-status-uploaded` (#60a5fa) — blue  
- `--color-status-saved` (#fbbf24) — amber
- `--color-status-failed` (#f87171) — red
- `--font-display` (Space Grotesk) — headings
- `--font-mono` — addresses, hashes, CIDs
