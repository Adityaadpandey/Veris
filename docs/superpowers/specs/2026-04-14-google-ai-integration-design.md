# Veris × Google AI Integration — Design Spec

**Date:** 2026-04-14
**Context:** Google hackathon integration onto existing Veris pipeline
**Status:** Design approved, pending implementation plan

## 1. Purpose

Veris already ships an end-to-end verifiable-photo system: Raspberry Pi 4 standalone camera, a separate ESP32 hotshoe accessory for DSLRs, Node backends, Filecoin storage, ZK proofs, and ERC-1155 NFTs. The existing pipeline proves **hardware provenance** (a registered device signed the capture) and does **pixel-level similarity** between the DSLR and ESP companion image using CLIP embeddings + pHash.

This spec adds a **Google AI verification layer** that makes the proof stronger and tells a two-part hackathon story:
1. **Semantic verification** — Gemini as a sixth verification signal that reasons about whether the pixels agree with the signed sensor bundle (GPS, time, IMU, ambient light).
2. **Semantic search** — Gemini multimodal embeddings replace CLIP; the public `/api/search` now accepts both image *and* natural-language queries over the same vector space.

Generative Google products (Imagen, Veo) are deliberately excluded from the user-facing surface; Imagen appears only as an adversarial test-data generator inside the eval harness.

## 2. Success Criteria

- `/verify` endpoint returns a combined verdict (`authentic | suspicious | fake`) with per-signal breakdown visible in Genkit trace UI.
- `/search` accepts image OR text, returns top-K matches in <500 ms P95 on a 10k-image index.
- Every minted NFT has a Gemini verdict hash attested on-chain via a new `AuthenticityOracle` contract.
- Eval harness reports precision/recall/F1 per class on a labeled dataset; demo shows combined-signal F1 > Gemini-alone and > CV-only.
- Three services deployed live on Cloud Run; owner portal live on Firebase Hosting.

## 3. Architecture

```
┌─ owner-portal (React) ──────────── Firebase Hosting
│    SearchPage: image OR text query → /api/search
│    NFT page: verdict + anomalies + attestation tx link
│
├─ hardware-web3-service (Node) ──── Cloud Run
│    /verify  → Genkit flow: 5 CV signals + Gemini (6th) → combined verdict
│                          → signs verdict → calls AuthenticityOracle.attest()
│    /search  → Vertex Vector Search (ANN) over Gemini multimodal embeddings
│    /ingest  → existing mint pipeline, now also upserts embedding + attests verdict
│
├─ public-server (Node) ──────────── Cloud Run (unchanged behavior)
│    /claim, /edition endpoints + App Check on public routes
│
└─ ai-embedding-service (Python) ─── REMOVED
     CLIP + pHash replaced. Gemini multimodal embeddings computed from Node.
     pHash kept inline in Node for fast exact-dup check.
```

Google runtime components: **Gemini API** (embeddings + Vision), **Vertex AI Vector Search** (ANN index), **Firebase Genkit** (flow orchestration + tracing + evals), **Cloud Run**, **Firebase Hosting**.

## 4. The Verification Flow (Genkit)

Single Genkit flow `verifyCapture({ dslrImage, espImage, sensorBundle })`:

| # | Signal | Implementation | Output field |
|---|---|---|---|
| 1 | ORB keypoint matches | existing OpenCV code, ported into Node worker | `orb_score` (0–1) |
| 2 | SSIM | existing | `ssim_score` |
| 3 | Color histogram correlation | existing | `hist_score` |
| 4 | Embedding cosine | **Gemini multimodal embedding** of both images; cosine in Node | `cos_score` |
| 5 | pHash Hamming distance | inline `imagehash` equivalent in Node | `phash_score` |
| 6 | **Semantic consistency (Gemini 2.5 Pro Vision)** | structured JSON call: both images + sensor bundle | `consistency_score`, `ai_generation_score`, `anomalies[]`, `reasoning` |

**Sensor bundle shape** (already produced by ESP32/Pi4):
```json
{
  "device_id": "…",
  "timestamp": "2026-04-14T14:30:00Z",
  "gps": { "lat": 37.77, "lng": -122.42, "alt": 52 },
  "imu": { "pitch": 2.1, "roll": -0.4, "yaw": 180.0 },
  "ambient_light_lux": 8200,
  "temperature_c": 18.5
}
```

**Combined verdict math:**
```
score = 0.15*orb + 0.10*ssim + 0.10*hist + 0.25*cos + 0.05*phash + 0.35*consistency
ai_gen_penalty = max(0, ai_generation_score - 0.5) * 2
final = clamp(score - ai_gen_penalty, 0, 1)

verdict = authentic   if final >= 0.80
        = suspicious  if final >= 0.50
        = fake        otherwise
```

Weights chosen so Gemini consistency + cosine dominate (the signals that catch image swaps); pixel-level signals act as corroboration. Weights are tunable constants in code.

**Gemini Vision prompt (system + strict JSON schema response):**
- Inputs: DSLR image, ESP image, sensor bundle JSON
- Asks: Do the pixels agree with the sensor bundle? Are these two images of the same scene/moment? Any signs of AI generation or digital tampering?
- Response schema: `{ same_scene: bool, consistency_score: 0–1, ai_generation_score: 0–1, anomalies: string[], reasoning: string }`
- `responseSchema` enforced via Gemini structured output mode so the flow never has to parse free text.

## 5. Search Flow

**Ingest:** on every successful mint, compute Gemini multimodal embedding (768d) of the primary image → upsert into Vertex Vector Search index keyed by `token_id` with metadata `{ cid, device_id, minted_at }`. Also cache the embedding as `BLOB` in SQLite (source of truth is Vertex; cache is for local dev and fallback).

**Query:** `/api/search` accepts either an uploaded image or a text string.
- Image → Gemini multimodal embedding (image mode)
- Text → Gemini multimodal embedding (text mode, same vector space)
- Embedding → Vertex ANN query, top-K with threshold ≥ 0.60
- Hydrate results from SQLite `claims` table for display

pHash is still computed on ingest; a secondary Hamming-≤5 check runs alongside ANN to flag exact duplicates.

## 6. On-Chain Verdict Attestation

New contract `contracts/src/AuthenticityOracle.sol`:

```solidity
contract AuthenticityOracle {
    address public oracleSigner;
    mapping(uint256 => Attestation) public verdicts;

    struct Attestation {
        bytes32 verdictHash;      // keccak256(verdict_json)
        uint8   verdict;          // 0 authentic, 1 suspicious, 2 fake
        uint16  consistencyBps;   // 0–10000
        uint16  aiGenBps;
        uint64  timestamp;
        bytes   signature;        // oracleSigner EIP-191 over the above fields
    }

    function attest(uint256 tokenId, Attestation calldata a) external;
    function verify(uint256 tokenId, string calldata verdictJson) external view returns (bool);
    function setOracle(address newSigner) external; // owner only
}
```

**Flow:** backend runs Genkit verification → produces canonical verdict JSON → keccak256 → signs with `ORACLE_PRIVATE_KEY` → calls `attest(tokenId, …)`. Anyone later reads full JSON from IPFS, recomputes the hash, calls `verify(tokenId, json)` — true iff the hash matches the signed attestation.

**Scope:** one new contract, one deploy script, one backend function. Existing `LensMintERC1155` and `DeviceRegistry` are unchanged.

## 7. Eval Harness (Genkit Evals)

**Dataset** (~250 labeled samples, curated once, checked into `ai-model/eval-dataset/`):

| Class | Count | Source |
|---|---|---|
| `authentic` | ~100 | Real DSLR+ESP pairs captured by the team |
| `tampered` | ~50 | Real photos with region-swapped / pasted objects (hand-crafted + CASIA v2 subset) |
| `ai_generated` | ~50 | Generated with Imagen 3 specifically for adversarial eval |
| `swapped_bundle` | ~50 | Real images paired with deliberately wrong sensor bundles (wrong GPS / timestamp / light) |

**Runner:** Genkit `defineEval` loads samples → runs `verifyCapture` flow → scores predicted vs expected verdict. Outputs precision, recall, F1 per class; full confusion matrix; per-sample traces clickable in Genkit UI.

**Ablations reported:**
- CV-only (signals 1–5)
- Gemini-only (signal 6)
- Combined (all 6)

Demo shows combined beats either alone — validates the "Gemini as sixth signal" pitch with numbers.

## 8. Contract / On-Chain Changes

- **New:** `AuthenticityOracle.sol` + deploy script + tests
- **Unchanged:** `LensMintERC1155`, `DeviceRegistry`. Gemini verdict blob lives in the existing `ipfsHash` metadata object alongside the crypto proof bundle; only its hash goes on-chain.

## 9. Data Model Changes

**SQLite `lensmint.db` (hardware-web3-service):**
- Add column `gemini_embedding BLOB` to the images table (nullable)
- Add column `verdict TEXT` (JSON, full Genkit flow output)
- Add column `attestation_tx TEXT` (tx hash of `AuthenticityOracle.attest`)

**SQLite `claims.db` (public-server):** unchanged.

## 10. Error Handling

- **Gemini timeout / 5xx:** flow continues with 5-signal CV verdict; verdict JSON carries `gemini_status: "unavailable"` and `final` is computed with consistency weight redistributed proportionally across signals 1–5. Never blocks a mint.
- **Vertex index unavailable:** search falls back to in-memory cosine over recent N embeddings cached in SQLite.
- **Quota exhaustion:** exponential backoff with jitter; surfaced in Genkit trace; does not block mint.
- **Oracle-sign failure:** mint still succeeds; attestation is queued for retry (background worker). A missing attestation is visible in owner portal as "verdict pending."

## 11. Secrets / Config

Added to `hardware-web3-service/.env.example`:
```
GEMINI_API_KEY=
GOOGLE_APPLICATION_CREDENTIALS=
GOOGLE_CLOUD_PROJECT=
GOOGLE_CLOUD_REGION=us-central1
VERTEX_INDEX_ENDPOINT=
VERTEX_INDEX_ID=
ORACLE_PRIVATE_KEY=
AUTHENTICITY_ORACLE_ADDRESS=
```

## 12. Deployment

- `hardware-web3-service` → Cloud Run container (Dockerfile added)
- `public-server` → Cloud Run container
- `owner-portal` → Firebase Hosting (Vite build output)
- `AuthenticityOracle` deployed to Sepolia via existing Foundry scripts

Firebase App Check enabled on `public-server` public routes (`/claim/*`) to block bot minting.

## 13. Testing

- **Unit:** mock Gemini responses, verify combined-score math and verdict thresholds
- **Integration:** three canned scenarios for demo + automated tests
  1. Matching DSLR+ESP pair of same scene → `authentic`
  2. ESP image matches but DSLR swapped to an unrelated shot → CV cosine drops, Gemini flags anomaly → `suspicious`
  3. AI-generated image → Gemini `ai_generation_score` > 0.8 → `fake`
- **Eval suite:** Genkit eval harness (see §7) runs on every PR via CI
- **Contract:** Foundry tests for `AuthenticityOracle.attest` / `verify` round-trip, signature forgery rejection, only-owner setOracle

## 14. Out of Scope

- ESP32 firmware changes
- Imagen / Veo in any user-facing surface
- Firebase Auth (Privy stays)
- Google Maps, Wallet passes, BigQuery, Firestore, FCM
- New chain deployments beyond Sepolia
- Replacing the existing ZK / Filecoin pipeline

## 15. Open Questions

None blocking. Post-hackathon follow-ups worth tracking:
- Should multiple AI oracles attest independently and the contract record an ensemble?
- Move from Sepolia to a prod chain — which one?
- Expose a public `/verify?image=` reverse-lookup endpoint for third-party use (was considered, deferred).
