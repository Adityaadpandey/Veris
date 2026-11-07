# Filecoin / Lighthouse

- Prize: Filecoin / Lighthouse (storage).
- Ask: > TODO: paste the official prize ask here
- Back to the [root README](../README.md).

## What we built

- Every photo is uploaded to IPFS through the Lighthouse SDK (`@lighthouse-web3/sdk`).
- The NFT metadata JSON is uploaded the same way.
- Both CIDs are saved with the claim.
- Uploads retry 3 times, and failed ones can be retried later.
- Portal and mobile load photos from Lighthouse gateways with fallback.

## Before vs added

Before the event:
- `c943963`, `f0d5491` Lighthouse upload service (2026-10-28).
- `c8d147a` portal and mobile read from Lighthouse gateways (2026-10-30).
- `6fc0803` then `bfc1979` Filebase tried and reverted (2026-10-29).

Added 2026-11-06:
- `1ac28e9` `storageService.js` wraps Lighthouse and 0G with fallback; `/api/image/:cid` serves both.
- `8718698` startup keeps Lighthouse working if 0G is broken.

## Where in the code

| What | File:lines | Note |
|---|---|---|
| Init with API key | `hardware-web3-service/filecoinService.js:13-24` | Off if `LIGHTHOUSE_API_KEY` missing |
| Image upload | `hardware-web3-service/filecoinService.js:26-69` | `lighthouse.upload`, 3 retries, returns CID |
| Metadata upload | `hardware-web3-service/filecoinService.js:72-89` | `lighthouse.uploadText` |
| Provider order | `hardware-web3-service/storageService.js:4-38` | Lighthouse first, 0G fallback |
| Upload on capture | `hardware-web3-service/server.js:864-886` | Image then metadata, saves CIDs |
| Retry failed uploads | `hardware-web3-service/server.js:1264-1287` | Re-uploads saved images |
| Gateway proxy | `public-server/server.js:1801-1815` | `/api/image/:cid` from `LIGHTHOUSE_GATEWAY` |
| Gateway fallback | `owner-portal/src/components/dashboard/helpers.js:38-49` | Next gateway on image error |

## One snippet

`hardware-web3-service/filecoinService.js:45-49`

```js
const response = await lighthouse.upload(tmpPath, this.apiKey);
const cid = response?.data?.Hash;
if (!cid) {
  throw new Error('Upload succeeded but no CID returned');
}
```

## Verify in 3 steps

1. Open `hardware-web3-service/filecoinService.js` and see `lighthouse.upload` at line 45.
2. Run the web3 service with `LIGHTHOUSE_API_KEY` set, send a photo, read the log line `Lighthouse upload CID`.
3. Open `https://ipfs.io/ipfs/<cid>` (one of the gateways in `public-server/server.js:813-816`) with that CID.

## Honest gaps

- Synapse is NOT used: `@filoz/synapse-sdk` is in `hardware-web3-service/package.json:24` but never imported.
- No Filecoin deal ID or proof of storage is read or shown; "Filecoin · Lighthouse" in the UI is only a label.
- Landing copy says "Filecoin via Synapse SDK" (`owner-portal/src/components/LandingPage/story/story.html:1461`). Fixed: it now says "IPFS via Lighthouse (Filecoin) or 0G".
- `storageService.initialize` is never called; `server.js:96,105` initialize `filecoinService` and `zerogStorageService` directly, which is equivalent.
- > 📸 TODO: server log showing the Lighthouse CID.
- > 📸 TODO: claim page showing the photo from the gateway.
