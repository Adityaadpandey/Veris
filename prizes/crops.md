# CROPS

- Prize: Best CROPS Upgrade to an Existing Project ($1,500, Ethereum Foundation). Continuity participants only.
- New property we add: **censorship resistance and privacy of verification**. Checking a photo no longer needs our server.
- Full write-up with the C, O, P, S lines: the [CROPS section of the root README](../README.md#crops).
- Back to the [root README](../README.md).

## Before vs after

Before: the verify page sent the photo hash and the uploaded photo to `api.veris.live`. It also loaded Google Fonts and drew QR codes through `api.qrserver.com`, so two third parties saw every visitor.

After (commits `49e4c10`, `0acaa00`):
- The browser hashes the photo on the device and asks Arkiv directly, no key and no upload (`owner-portal/src/lib/arkivDirect.js`).
- A byte-identical photo is settled there. Block `api.veris.live` and it still verifies.
- Fonts are bundled and QR codes are drawn in the browser. No analytics or trackers.

## Judging criteria

| Criterion | Where we stand |
|---|---|
| Works end to end in the demo | Drop a real Veris photo on Search: one request to Arkiv, none to our server |
| Depth of the new property | Structural: exact-match check works with our server gone |
| Other three still hold | README states the trade-offs (below) |
| UX | Same Search page, nothing to configure |
| Could ship after | Already live in the portal, Postgres fallback kept |

## Requirements checklist

| Requirement | Status |
|---|---|
| Public repo, free license, README says how to run | MIT, `cd owner-portal && npm install --legacy-peer-deps && npm run dev` |
| README section titled CROPS, one or two lines per letter | Yes |
| README says what it was before and what is new | Yes |
| Demo video, 3 minutes max, before and after | > TODO: video link |
| No third-party trackers or analytics | Yes |
| Keys and personal data stay on the device | Verifying needs no wallet or key |

## Honest gaps

- Altered copies still need our server, and our server forwards the photo to OpenAI for the description.
- Arkiv's public RPC still sees the user's IP. Anon-RPC is not integrated.
- Entities expire after about 180 days, so older photos fall back to our server.
- Login uses Privy and photos load from Lighthouse or 0G gateways, third parties that see those requests.

> 📸 TODO: network tab showing one request to Arkiv and none to `api.veris.live`.
> 📸 TODO: Search result with `api.veris.live` blocked.
