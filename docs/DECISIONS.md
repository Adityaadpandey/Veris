# Decisions and mistakes

A short log of what we chose, what went wrong, and what we changed. Every entry points at a real commit.

## Decisions

| Decision | Why | Evidence |
|---|---|---|
| Every sponsor feature sits behind an env flag | A capture must never fail because a sponsor service is down | `ZEROG_ENABLED`, `STORAGE_PROVIDER`, `CHAINS`, `ARKIV_ENABLED` |
| Arkiv mirrors Postgres, it does not replace it | Reads try Arkiv first and fall back to Postgres | `public-server/arkivService.js` |
| Never guess a verdict | If the AI check could not run, the status is `pending`, not real or fake | `07a7027` camera README, `Camera: liveness check with 0G then GPT` |
| Mint on Arc in addition to Sepolia | Arc gives USDC licensing, Sepolia keeps the old path working | `CHAINS` flag |
| ERC-1155 over ERC-721 | One claim can hold more than one token | `69ec1ff` |
| The Pi calls the 0G Router with a low-credit key | No server hop, and the key is rotated after the event. Known trade-off | camera `liveness.py` |

## Mistakes and fixes

- **Filebase gateway first, then reverted.** We tried Filebase ahead of Lighthouse in four places. It did not hold up, so we reverted all four (`bfc1979`, `f3cb2aa`, `9e6424a`, `c83ca92`).
- **Companion capture crashed the instance.** It used too much memory and CPU. We cut the footprint (`0a27b64`).
- **Queueing the companion photo made things worse.** We reverted it (`f977cea`).
- **Dead component crashed the portal.** An unused `AppContent` called `usePrivy` while undefined. We deleted it (`35d8264`).
- **Device wallet came out different on the real Pi.** The web3 service derived its own key and the camera derived another. We made the backend read the key the camera exports (`b92e920`).
- **The exported key could be overwritten.** We stopped writing it when the camera id is unknown (`98c4d31`) and locked the file to the owner (`e941e1a`).
- **Old name left everywhere.** A rename across the camera, server and docs took several commits (`99aab88`, `fd543f7`, `e774e46`, `1276d12`).
- **Contracts redeployed under a new owner key.** Done on Sepolia and Arc (`da4ebce`).

## Docs that went stale

- `CLAUDE.md` still talks about Solana, vlayer and RISC Zero. None of that is in the code.
- `SYSTEM_ARCHITECTURE.md` shows `ai-embedding-service` in the flow. Nothing calls it, because `public-server` runs its own CLIP.
- `npm run submit-proof` in `contracts` is broken because `scripts/submitProof.ts` was deleted.
- `@filoz/synapse-sdk` is a dependency of the web3 service but is never imported.

## Still open

- No ZK proofs yet. The README does not claim any.
- Most services have no automated tests.
- The 0G key lives on the device.
