# Companion Capture (Mobile + Veris Device) Design

## Overview

Today, only the Veris hardware device (Pi, or the phone-mounted "Clip" module) captures the photo that becomes a claim. This adds a second, simultaneous photo from the phone's own camera — the phone sits with the Veris device mounted on its Magsafe back, so both cameras are pointed at roughly the same scene at roughly the same moment. The device photo stays the real, minted, source-of-truth image (nothing about that pipeline changes). The phone photo becomes a "companion" image attached to the same claim, stored via Cloudinary (not Filecoin — it doesn't need to be), compared against the device photo, and shown alongside it.

**This is a demo-quality feature, not a security-hardened one.** The comparison scoring is real (it reuses the perceptual-hash and SSIM machinery already built for tamper detection), but the "on-chain pairing" is mocked — there is no second mint, no second transaction. The goal is for the claim to *feel* like a verified two-camera capture, not to cryptographically prove it is one.

Note: this repo already has an earlier, much more ambitious spec along similar lines (`2026-04-04-esp-dual-camera-verification-design.md` — ESP32 hot-shoe module, Siamese network, perspective correction, on-chain verification records). That design was never built and targets different hardware (ESP32 + DSLR cable release) with a much heavier ML pipeline. This spec supersedes it in scope and approach for the phone+Clip case: reuse the hash/SSIM infra that already exists in `public-server` rather than building a trained model, and keep the chain interaction mocked rather than real.

## Current State (confirmed by codebase survey)

- **mobile-app**: Expo/React Native. Already mocks almost everything except DigiLocker identity and reads of real claims. `src/app/(app)/capture.tsx` already takes a local phone photo via `expo-camera` and BLE-triggers the Pi device (`usePiTrigger()`), receiving back a `claimUrl`/`claim_id` when the Pi's real capture-and-mint pipeline finishes. The locally-captured phone photo is never uploaded anywhere today — it only lives in local in-memory state.
- Two parallel claim screens: `src/app/claim/[index].tsx` (fully mocked seed data, for demos without hardware) and `src/app/claim/real/[claimId].tsx` (polls public-server's `GET /check-claim` every 6s via `useClaim()`).
- **public-server**: `claims` table is one-image-per-claim (`cid`, `image_hash`, no secondary image support). `POST /create-claim` is the real device-claim creation route, called from `hardware-web3-service`'s `claimClient.js`. No Cloudinary anywhere in the repo today — all image storage is Filecoin/IPFS.
- **owner-portal**: `ClaimPage.jsx` renders the device image, verdict, and a `SimilarPhotos` component. No dual-image concept.
- **Reusable forensic infra already built in public-server** (from the just-completed Verify & Search hardening work):
  - `imageHash.js` — `computeHashes`, `bestCombinedHashDistance`, `transformForOrientation` (dHash/pHash/aHash perceptual hashing, orientation-tolerant).
  - `pixelDiff.js` — `computeForensicDiff(originalBuffer, uploadBuffer)` → block-wise SSIM diff, classifies `crop` / `global_adjustment` / `localized_edit` / `recompression`, with a `region_bbox` for localized edits.
  - `similarPhotos.js` — blending pattern (`blendedSimilarity`) for combining a visual score and a content score into one headline number.

## Data Model

Add one nullable JSONB column to `claims`: `companion_capture`. Holds everything about the mobile photo in one place rather than six new columns:

```json
{
  "mobile_image_url": "https://res.cloudinary.com/.../companion_abc123.jpg",
  "mobile_public_id": "veris/companion/abc123",
  "mobile_captured_at": "2026-09-15T10:22:31.000Z",
  "mobile_ai_hint": { "likely_ai_generated": false, "note": "..." },
  "consistency": { "score": 0.91, "visual": 0.88, "content": 0.94 },
  "forensic": { "ssim": 0.93, "change_type": "recompression", "region_bbox": null },
  "timestamp_delta_seconds": 1.4,
  "mock_chain_ref": "0x7f3a...c9",
  "paired_at": "2026-09-15T10:22:35.000Z"
}
```

`null` until a companion photo has been submitted and processed. `mock_chain_ref` is a deterministic string derived from the mobile image's hash, formatted to look like an on-chain reference — it is never presented as a real transaction hash, and every place it's rendered is labeled "off-chain" / non-authoritative.

## Backend Flow (public-server)

New modules, following the existing file conventions (CommonJS, same style as `pixelDiff.js`/`similarPhotos.js`):

- **`cloudinaryService.js`** — thin wrapper: `uploadBuffer(buffer, folder) → { url, public_id }`. New env vars for Cloudinary credentials, documented in `public-server/.env.example`.
- **`companionCapture.js`** — `compareDeviceAndMobile(deviceBuffer, mobileBuffer)`. Runs `computeHashes` + `bestCombinedHashDistance` for the visual score and `computeForensicDiff` for the SSIM/change-type read, same machinery as the "altered copy" tamper tiers — just interpreted differently here: we're not asking "is this a forged copy of the same exact framing," we're asking "are these plausibly two cameras pointed at the same scene at the same moment." Returns `{ consistency: {score, visual, content}, forensic: {ssim, change_type, region_bbox} }`.

New route: **`POST /api/claim/:claim_id/companion`**
- Accepts multipart: the mobile photo + a `captured_at` timestamp field.
- Validates the claim exists and has a `cid` (i.e. the device side already completed).
- Acks quickly (mirrors the existing `enrichClaim` fire-and-forget pattern used for the device image's own AI enrichment) and processes in the background:
  - Upload mobile buffer to Cloudinary.
  - Fetch device image bytes via the existing `fetchImageBuffer(cid)` (already used elsewhere for IPFS fetches).
  - Run `companionCapture.compareDeviceAndMobile`.
  - Run `openaiService.processImage` on the mobile buffer for its own AI-generated hint (same call already made for the device image).
  - Compute `timestamp_delta_seconds` as `abs(companion.captured_at - claims.created_at)` — `created_at` is the closest existing field to "when the device captured," since the claim row is created immediately off the Pi's capture in the real flow.
  - Generate `mock_chain_ref` and set `paired_at`.
  - Persist the full `companion_capture` object onto the claim row.
- `GET /check-claim` and `GET /claim/:claim_id` responses include `companion_capture` (null until ready) — no new polling mechanism needed, the mobile app's existing 6s poll loop picks it up.

Async, not synchronous, so a multi-second Cloudinary + OpenAI round trip never blocks the mobile client on a phone connection.

## Mobile App — Real Flow

In `capture.tsx` (or the hook wrapping `usePiTrigger()`), once the Pi's `claim_id` comes back, POST the already-captured local phone photo to `POST /api/claim/:claim_id/companion` with its capture timestamp.

New shared component **`CompanionCaptureCard`**, used by `claim/real/[claimId].tsx`:
- Device photo as the primary hero image (unchanged from today).
- Mobile photo shown as a secondary image (thumbnail, expandable).
- Scoring section: consistency % (with a short plain-language explanation derived from `change_type`), timestamp proximity, per-image AI flags, and a "Paired" badge showing the truncated `mock_chain_ref` labeled as off-chain.
- Renders a pending/loading state while `mobile_image_url` exists but `consistency`/`forensic` are still null (background processing not yet finished).

## Mobile App — Mock/Demo Flow

Same `CompanionCaptureCard` component, fed by a fabricated `companion_capture`-shaped object added to the seed data behind `claim/[index].tsx`. Building the UI as one component consuming one data shape (real or fake) means the demo screens look identical to the real ones without touching the backend, and there's only one component to maintain.

## owner-portal

`ClaimPage.jsx`: when `companion_capture` is present on the fetched claim, render the mobile photo as a small secondary thumbnail next to the device image, plus a lightweight badge: `Paired ✓ 91% match`. No scoring breakdown, no forensic detail, no mock-chain-ref display — that detail lives on mobile only, per the approved design.

## Explicitly Out of Scope

- Any real second mint, transaction, or on-chain write for the mobile photo.
- BLE/hardware changes to actually synchronize shutter timing between the phone and the Pi — the "simultaneous capture" is a single tap in the mobile app that triggers both, not a hardware-level sync.
- Changes to `hardware-web3-service` or the device's own minting/claim-creation pipeline.
- A trained ML matching model (the abandoned ESP32 spec's approach) — this reuses the existing hash/SSIM infra instead.

## Testing

Follows the pattern already established in `public-server/test/` (`node --test`, no new test framework): unit tests for `companionCapture.compareDeviceAndMobile` using synthetic `sharp`-generated image pairs (identical, cropped, recolored, localized-edit cases), mirroring the existing `pixelDiff.test.js` structure. `cloudinaryService` and the route itself are integration-level and get a manual smoke test, same rationale as Task 6 of the Verify & Search hardening plan (no live Postgres/Cloudinary in CI, not worth a mocking framework for a demo feature).
