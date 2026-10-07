# Veris: Code Tasks (branch `main`)

## Rules for every task

1. **The existing stack is the fallback.** Every new integration (0G, Arc, Arkiv) sits behind an env flag and falls back automatically to what already works today. A capture must never fail because a sponsor service is down.
2. **Never block the shutter.** Capture, sign and queue always succeed locally. Everything else is retried later.
3. **Never guess a verdict.** If no AI check could run, the status is `pending`, not `real` and not `fake`.
4. Build in order. Sponsor features start only after the core loop passes on the device.

| Concern                     | Today (stays as fallback)                                                                                           | New (primary when its flag is on)                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Liveness / same-scene check | GPT vision in `public-server/openaiService.js` + `ai-model` (6 signals incl. OpenAI vision) + `companionCapture.js` | 0G Router vision call from the device                  |
| File storage                | Lighthouse (IPFS/Filecoin) in `filecoinService.js`                                                                  | 0G Storage                                             |
| Chain                       | Sepolia / Base Sepolia (`CandidERC1155`, `DeviceRegistry`)                                                          | Arc testnet, **in addition to** ETH, not instead of it |
| Claim lookup                | `public-server` Postgres                                                                                            | Arkiv (mirrors Postgres, reads fall back to Postgres)  |
| Device key                  | Software key derived from CPU serial + MAC + machine-id + salt (`hardware_identity.py`)                             | No change for now (no TPM chip)                        |

Note: `CLAUDE.md` mentions `VerisERC1155` and `VerisVerifier`, but `contracts/src` only has `CandidERC1155.sol` and `DeviceRegistry.sol`. There is no on-chain verifier contract today.

---

## What is already built (do not rebuild)

- **Pending queue on the Pi** (`capture_pipeline.py`): JSON files in `pending/`, retried by `retry_pending_uploads`. Task 3 extends this, it does not replace it.
- **Server-side retry sweep** (`AUTO_RETRY_INTERVAL_MS`, `/api/retry-pending`) and duplicate-upload handling in `/api/images/upload`.
- **Companion capture** (`public-server/companionCapture.js`, `imageHash.js`, `pixelDiff.js`): hash and SSIM comparison of the phone photo against the device photo.
- **GPT vision** in two places: `public-server/openaiService.js` (describe, compare, embed) and `ai-model/main.py` (`OpenAIVisionSignal`).

---

## Security and data integrity

"Unhackable" is not achievable without a hardware root of trust, so the goal is: close the cheap attacks and document what is left. These are the real gaps found in the code:

| #   | Gap                                                                                                                                                                                   | Where                                          | Fix                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1  | Device key is derived from values anyone with the SD card can read (CPU serial, MAC, machine-id, and the salt in `/boot/.device_salt`). Copy the card and you can sign as the device. | `hardware_identity.py`                         | Not fixed now (no TPM chip). Known gap, written in the README.                                                                                                                                                     |
| S2  | Private key is written to a plaintext `.device_key_export` file and read by the Node service.                                                                                         | `export_key.py`, `getHardwareKey.js`           | chmod 600 on the file. Known gap otherwise.                                                                                                                                                                        |
| S3  | Signature covers only the image hash. No timestamp, no nonce, no companion hash, so a signed hash can be replayed.                                                                    | `capture_pipeline.sign_image`                  | Sign one packet: `image_hash + companion_hash + timestamp + nonce + device_address`. Backend rejects stale or reused nonces.                                                                                       |
| S4  | Signature is not checked at upload. It is only checked later in `/api/verify/:claimId`.                                                                                               | `hardware-web3-service/server.js` upload route | Recover the signer at ingest, require it equals `deviceAddress` and that the device is registered and active. Reject otherwise. The signature format must change first: the Pi signs with plain `ecdsa` (64-byte r |
| S5  | `/api/images/upload`, `/create-claim` and others have no auth, and `cors()` is wide open on the device service.                                                                       | both servers                                   | Require a device-signed request (S4 covers upload). Lock CORS to the portal and app origins.                                                                                                                       |
| S6  | `DeviceRegistry.registerDevice` is callable by anyone.                                                                                                                                | `contracts/src/DeviceRegistry.sol`             | Make registration owner-only (or require a signature from the device). Redeploy with the dual-chain task.                                                                                                          |
| S7  | Images are only as trustworthy as the sensor feed. A screen or a printed photo held up to the lens passes the signature.                                                              | n/a                                            | This is what the liveness check (task 1) is for. No LiDAR, so the two-image same-scene check is the defence. Say so honestly in the README.                                                                        |
| S8  | Secrets: 0G, Circle, Arkiv, OpenAI keys.                                                                                                                                              | `.env`, `keys.md`                              | Keep all in gitignored `.env`. The 0G key on the device is a known trade-off: use a low-credit key and rotate it.                                                                                                  |

---

## Core loop

### 1. Liveness check with 0G vision (replaces the idea of a 3D / LiDAR sensor)

The device captures two images (device camera and companion from the phone on the Clip). Send both to the 0G Router and ask: do they show the same real scene at the same moment, and does this look like a real scene rather than a screen, print or generated image?

- Return JSON: `consistent`, `live`, `confidence`, `reasons`, plus the 0G `request_id`.
- Files: `hardware-camera-app/` (new `liveness.py`), `mobile-app/` for the Clip path.
- **Fallback:** if 0G is off, times out, or errors, use the existing server-side GPT check (`ai-model` `/api/verify` and `companionCapture.js`). If that also fails, status is `pending` (task 3).
- Done when: the device logs a 0G `request_id`, and turning `ZEROG_ENABLED=false` still produces a verdict through GPT.

### 2. Hardware-signed packet

Implement S3 and S4 so the verdict and both image hashes are bound to the device signature.

- Done when: a replayed upload and an upload with a wrong signer are both rejected.

### 3. Safe stop

Extend the existing `pending/` queue so it also covers AI-check failure (timeout, 5xx, 402), not just backend offline. Retry every 30 s. Queue entries store which step they stopped at so retry resumes there.

- Done when: WiFi off shows "pending" and never a guessed verdict. WiFi on, it finishes. Reboot in between loses nothing.

### 4. Decision log

Write a JSON log per capture: both hashes, which engine answered (0G or GPT), request_id, verdict, timestamps. Upload to 0G Storage.

- **Fallback:** if 0G Storage fails, keep the log in the DB and retry.

### 5. Storage: 0G with Lighthouse fallback

Add `zerogStorageService.js` next to `filecoinService.js` with the same interface (`uploadImage`, `uploadMetadata`). Upload photo, companion image and metadata, three root hashes per capture. A `STORAGE_PROVIDER` flag picks the primary. If the primary fails, try the other, and record which provider each CID came from.

- Keep Lighthouse as the fallback. Do **not** delete `filecoinService.js`.
- Metadata `image` field: `0g://<root>` when stored on 0G, `ipfs://<cid>` otherwise. Anything reading metadata (`mobile-app`, `owner-portal`, `public-server` `/api/image/:cid`) must handle both.
- Run the three uploads in parallel.

### 6. Chain: Arc and ETH together

Every capture mints on both chains. Deploy `CandidERC1155` and `DeviceRegistry` to Arc testnet as well as the existing Sepolia / Base Sepolia deployment. `deployment.json` becomes a per-chain map. `web3Service.js` initializes both providers and mints on every configured chain. Gas on Arc is paid in USDC.

- `mintOriginal` requires `msg.sender` to be an active registered device, and `web3Service.js` sends it from the device wallet. So the **device wallet** (not a backend wallet) must be registered and funded on each chain: test ETH on Sepolia, USDC on Arc. Changing this to a relayer would mean a contract change, so keep the device-sends model.
- `foundry.toml` has no Arc RPC or explorer entry yet. Add them once the Arc testnet RPC and chain id are confirmed. Those are not in the repo and I have not verified them.
- If Arc is down, the mint on ETH still completes, and the Arc mint goes to a retry queue.
- Apply S6 (owner-only registration) in the new deployment.
- Done when: one capture produces a token on Arc and on ETH, both visible on their explorers.

### 7. Proof verification

There is no on-chain verifier contract today. Do the lightweight version: the backend verifies the device signature (S4) and the AI verdict, then stores the packet hash on-chain with the mint. Document the trade-off in the README. Revisit an on-chain RISC Zero verifier only if time remains.

### 8. Arkiv claim record

Write one entity per claim: owner wallet, device_id, image_hash, token ids per chain, storage roots, tx hashes. Postgres in `public-server` stays the source the app reads first.

- **Fallback:** Arkiv write failure goes to a retry queue and never blocks the claim.

### 9. Claim page and app

`owner-portal` and `mobile-app` show: verdict, engine used (0G or GPT), request_id, storage links, chain tx links. Read from Arkiv first, fall back to Postgres.

### 10. Real hardware run

5 captures in a row, each verified and minted in under 60 s. Also run the test with 0G switched off, then Arc switched off, then WiFi off. All three must degrade to the fallback with no crash.

---

## Sponsor features (after the core loop works)

1. **0G TEE.** Private trust mode and `verify_tee` on every 0G call. Store `tee_verified` in the decision log.
2. **"0G decision" block** on the claim page: verdict, request_id, TEE badge, StorageScan link. Hidden when the verdict came from the GPT fallback.
3. **License for 5 USDC.** An editor pays the photographer in USDC on Arc. Contract function plus a button in `owner-portal`.
4. **Arkiv expiring records.** Pending captures expire in 24 h, licenses at end of term.
5. **Verify-page search via Arkiv.** Query by image hash or device id. Fallback to the existing `/api/search` and `/check-claim`.

---

## Config flags

| Flag               | Default      | Effect                                                         |
| ------------------ | ------------ | -------------------------------------------------------------- |
| `ZEROG_ENABLED`    | false        | AI check goes to 0G first, else straight to existing GPT       |
| `STORAGE_PROVIDER` | `lighthouse` | `0g` makes 0G Storage primary, Lighthouse becomes the fallback |
| `CHAINS`           | `sepolia`    | Comma list, e.g. `sepolia,arc`. Each chain mints independently |
| `ARKIV_ENABLED`    | false        | Mirror claims to Arkiv, reads try Arkiv first                  |

Flags default to today's behaviour, so merging any task changes nothing until its flag is turned on.

---

## Not doing

- New hardware work (including LiDAR or any 3D sensor)
- Encrypted photos on 0G Storage
- Any other sponsor integration
- Deleting the existing stack (Lighthouse, GPT verifier, Sepolia)

---

## Decisions made

1. **0G key on the device:** accepted. The Pi calls the 0G Router directly with a low-credit key, rotated after the event. Noted as a known trade-off in the README.
2. **Chains:** every capture mints on both Arc and ETH.
3. **TPM:** left as it is. The software key stays in use. No `tpm` backend is built now, and S1/S2 stay as documented known gaps.

hardware-web3-service@omega.service this has been stoped
