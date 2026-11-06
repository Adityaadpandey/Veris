# Veris Claim Server (`public-server`)

The public face of Veris: it stores every photo claim, serves the claim page and verifies photos.

## What it does

- Takes a new claim from the camera service (`POST /create-claim`) and gives back a claim URL for the QR code.
- Serves the claim page (`GET /claim/:claim_id`) where an owner enters a wallet to claim the NFT.
- Tracks the claim life cycle in Postgres: pending, claimed, completed.
- Verify and search: upload any image and get a tamper verdict using perceptual hashes (optional CLIP and OpenAI help).
- Mirrors each claim record to Arkiv (optional), so it can be searched without our server.
- Pairs the phone photo ("companion capture") with the camera photo, stored on Cloudinary.

## Where it fits

```mermaid
flowchart LR
  Cam[Hardware camera app] --> W[hardware-web3-service]
  W -->|create-claim| S[public-server]
  S --> PG[(Postgres)]
  S -.optional.-> AK[Arkiv]
  S -.optional.-> OAI[OpenAI / CLIP]
  S -.optional.-> CL[Cloudinary]
  P[owner-portal] -->|claim, verify, search| S
  Mob[Phone / QR scan] --> S
  S -->|image proxy| IPFS[Filecoin / Lighthouse gateway]
```

## Main flow

```mermaid
sequenceDiagram
  participant W as hardware-web3-service
  participant S as public-server
  participant DB as Postgres
  participant U as Owner
  W->>S: POST /create-claim (claim_id, cid, image_hash...)
  S->>DB: insert claim (pending)
  S-->>W: claim_url
  S->>S: enrich in background (AI description, hashes)
  U->>S: GET /claim/:claim_id
  U->>S: POST /claim/:claim_id/submit (wallet_address)
  S->>DB: status = claimed
  W->>S: POST /update-claim-status (minted, token_id, tx_hash)
  S->>DB: status = completed
```

## Folder structure

```
public-server/
  server.js              # Express app and all routes
  dbService.js           # Postgres pool, table creation, queries
  arkivService.js        # Optional mirror of claims to Arkiv
  openaiService.js       # Image descriptions and embeddings
  enrichService.js       # Background enrichment after a claim is created
  imageHash.js           # dHash, pHash, aHash and tamper distance
  imageForensics.js      # Extra checks on uploaded images
  pixelDiff.js           # Pixel level diff between two images
  similarPhotos.js       # Ranking of similar photos
  clipService.js         # Optional in-process CLIP model
  companionCapture.js    # Phone photo vs camera photo pairing
  cloudinaryService.js   # Phone photo storage
  waitlist.js            # Waitlist input checks and rate limit
  zerogRead.js           # Reads from 0G storage
  scripts/               # backfill-embeddings, calibrate-tamper-thresholds
  test/                  # node:test unit tests
```

## Tech stack

| Part | Choice |
|------|--------|
| Runtime | Node.js, CommonJS, Express 4 |
| Database | Postgres via `pg` and `DATABASE_URL` |
| Images | `sharp`, `exifr`, `multer` uploads |
| AI (optional) | OpenAI, `@xenova/transformers` (CLIP) |
| Storage reads | Lighthouse IPFS gateway, 0G SDK |
| Records (optional) | Arkiv SDK with `viem` |
| Photo pairing | Cloudinary |
| Hosting | Render |

## Key code snippets

Optional device auth: if `DEVICE_API_SECRET` is set, device routes need the header.

```js
function requireDeviceSecret(req, res, next) {
  const secret = process.env.DEVICE_API_SECRET;
  if (secret && req.get('x-device-secret') !== secret) return res.status(401).json({ success: false, error: 'Unauthorized' });
  next();
}
```

Claim creation answers fast, then enriches in the background.

```js
// Fire-and-forget AI enrichment, never blocks or fails claim creation.
enrichClaim(claim.claim_id, claim.cid).catch(err =>
  console.error(`Unexpected enrichment error for ${claim.claim_id}:`, err.message)
);
```

Arkiv search falls back to Postgres when Arkiv is off or fails.

```js
if (arkivService.enabled()) {
  const results = await arkivService.search({ imageHash, deviceId }).catch(() => []);
  if (results.length) return res.json({ success: true, source: 'arkiv', results });
}
```

Arkiv is only on when both flags are set.

```js
const enabled = () => process.env.ARKIV_ENABLED === 'true' && !!process.env.ARKIV_PRIVATE_KEY;
```

## API endpoints

| Method and path | What it does |
|-----------------|--------------|
| `GET /health` | Liveness check |
| `POST /create-claim` | Create a claim (device secret if set) |
| `GET /claim/:claim_id` | Claim page |
| `POST /claim/:claim_id/submit` | Owner submits wallet address |
| `GET /check-claim` | Check a claim |
| `GET /verify-claim/:claim_id` | Verify a claim |
| `GET /api/metadata/:claim_id` | NFT metadata |
| `POST /update-claim-status` | Set status, token_id, tx_hash (device secret if set) |
| `POST /complete-claim` | Mark a claim complete |
| `GET /claims/by-wallet/:address` | Claims for a wallet |
| `GET /claims/by-camera/:camera_id` | Claims for a camera |
| `POST /create-edition-request` | Ask for an extra edition |
| `GET /get-pending-edition-requests` | List pending edition requests |
| `POST /update-edition-request` | Update an edition request |
| `POST /api/search` | Upload an image, get matches and tamper verdict |
| `GET /api/similar/:claim_id` | Similar photos |
| `POST /api/enrich/:claim_id` | Re-run enrichment for one claim |
| `POST /api/enrich/backfill` | Batch enrich (needs `X-Admin-Token`) |
| `POST /api/companion/upload` | Upload phone photo |
| `POST /api/claim/:claim_id/companion/link` | Link phone photo to a claim |
| `POST /api/liveness` | Camera liveness check (OpenAI fallback) |
| `POST /api/claim/:claim_id/provenance` | Store provenance report (device secret if set) |
| `GET /api/provenance/:claim_id` | Read provenance |
| `GET /api/arkiv/search` | Search by `imageHash` or `deviceId` |
| `POST /api/license/record` | Record a license bought on Arc |
| `GET /api/image/:cid` | Image proxy from the IPFS gateway |
| `POST /api/waitlist`, `GET /api/waitlist` | Landing page waitlist |

> TODO: confirm which of these the owner-portal calls today.

## Tracks and sponsors used

| Sponsor | What we built | Files | Fallback or flag |
|---------|---------------|-------|------------------|
| Arkiv (Continuity track) | Mirrors each claim record and each license to Arkiv, plus search by image hash or device id | `arkivService.js`, `server.js` | `ARKIV_ENABLED`; falls back to Postgres |
| Arc (testnet) | Reads a `Licensed` event from the license contract, then records it in Arkiv | `server.js` (`POST /api/license/record`) | `ARC_RPC_URL`, `LICENSE_CONTRACT_ADDRESS` |
| 0G Storage | Reads photos stored as `0g` + 64 hex refs, proof checked | `zerogRead.js`, `server.js` (`GET /api/image/:cid`) | `ZEROG_INDEXER_RPC`; other refs use IPFS |
| Filecoin / Lighthouse | Serves and fetches images through the IPFS gateway (uploads happen in hardware-web3-service) | `server.js`, `enrichService.js` | `LIGHTHOUSE_GATEWAY` |

- Before the event: Postgres claim server, claim page, Lighthouse gateway reads.
- Added at the event: Arkiv mirror and search, Arc license record (per the root README Arkiv section); 0G read timing is unclear.
- Not used in this service: Solana, vlayer, RISC Zero, Privy (they live in other services).

> TODO: 0G Router vision and TEE are not in this service; confirm where they live.

## Environment variables

Copy `.env.example` to `.env`. Never commit real values.

| Name | Purpose | Example |
|------|---------|---------|
| `PORT` | HTTP port | `5001` |
| `DATABASE_URL` | Postgres connection (required) | `postgresql://user:password@host/db?sslmode=require` |
| `CLAIM_SERVER_URL` | Public URL of this server | `https://api.veris.live` |
| `FRONTEND_URL` | Base for claim links, not localhost | `https://api.veris.live` |
| `CORS_ORIGIN` | Allowed origins | `*` |
| `LIGHTHOUSE_GATEWAY` | IPFS gateway for images | `https://<name>.lighthouseweb3.xyz/ipfs` |
| `DEVICE_API_SECRET` | If set, device routes need `x-device-secret` | `change-me` |
| `ADMIN_TOKEN` | Enables `/api/enrich/backfill` | `change-me` |
| `WAITLIST_ADMIN_TOKEN` | Guards the waitlist read | `change-me` |
| `OPENAI_API_KEY` | Descriptions, embeddings, liveness | `sk-...` |
| `OPENAI_VISION_MODEL` / `OPENAI_EMBED_MODEL` | OpenAI models | `gpt-4.1-mini` / `text-embedding-3-small` |
| `SEARCH_MIN_SCORE` | Min score for the similar list | `0.7` |
| `SEARCH_VISUAL_WEIGHT` | Visual vs content weight | `0.7` |
| `PHASH_MAX_DISTANCE` | Same-source hash distance | `10` |
| `TAMPER_RECOMPRESSED_MAX` / `TAMPER_STRUCTURAL_MAX` / `TAMPER_POSSIBLE_MAX` | Tamper verdict bands | `0.05` / `0.15625` / `0.24` |
| `BACKFILL_DELAY_MS` | Pause between backfill images | `1500` |
| `ENABLE_CLIP` | Turn on in-process CLIP (needs memory) | `1` |
| `CLIP_MODEL_ID` / `CLIP_MATCH_MIN_SCORE` | CLIP model and cutoff | `Xenova/clip-vit-base-patch32` / `0.9` |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Phone photo storage | `your-cloud` |
| `ARKIV_ENABLED` | Mirror claims to Arkiv | `true` |
| `ARKIV_PRIVATE_KEY` / `ARKIV_ACCESS_KEY` | Arkiv wallet and access key | `0x...` |
| `ARKIV_CLAIM_DAYS` | Life of a minted record | `180` |
| `ZEROG_INDEXER_RPC` | 0G indexer for reads | `https://indexer-storage-testnet-turbo.0g.ai` |
| `ARC_RPC_URL` / `LICENSE_CONTRACT_ADDRESS` | Arc license check | `https://rpc.testnet.arc.network` / `0x...` |

## Setup and run

```bash
cd public-server
npm install
cp .env.example .env     # then set DATABASE_URL at minimum
npm run dev              # nodemon
npm start                # production
```

- Tables are created on boot (`CREATE TABLE IF NOT EXISTS`), so no migration step.
- Health check: `curl http://localhost:5001/health`
- Optional scripts: `npm run backfill`, `npm run calibrate`.

## Testing

```bash
npm test
```

- Uses the built-in `node --test` runner.
- Covers hashing, pixel diff, forensics, similar photos, companion capture and waitlist.

## Troubleshooting

- `DATABASE_URL is required` on boot: set it in `.env` (Neon style, with `sslmode=require`).
- Claim links point to localhost: set `FRONTEND_URL` to the public URL.
- `401 Unauthorized` from the camera service: `DEVICE_API_SECRET` must match on both sides.
- Backfill route does nothing: `ADMIN_TOKEN` is unset, so it stays disabled.
- Out of memory on a small Render box: leave `ENABLE_CLIP` unset.

## Screenshots

<!-- TODO: screenshot of the claim page (save to docs/img/public-server-claim-page.png) -->
> 📸 TODO: add screenshot of the claim page

<!-- TODO: screenshot of the verify and search result (save to docs/img/public-server-verify.png) -->
> 📸 TODO: add screenshot of the verify and search result

## Related services

- [hardware-web3-service](../hardware-web3-service) creates claims here after minting.
- [owner-portal](../owner-portal) is the dashboard that claims, verifies and searches.
- [hardware-camera-app](../hardware-camera-app) shows the QR code on the Pi.
- [contracts](../contracts) holds the on-chain side.
