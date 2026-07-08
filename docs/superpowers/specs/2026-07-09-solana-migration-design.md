# Veris Solana Migration — Design Spec

Date: 2026-07-09
Status: Approved by owner (custom Anchor PDAs, wallet-adapter, devnet)

## Goal

Replace the Ethereum/Solidity stack (DeviceRegistry + LensMintERC1155 on Sepolia) with a
single Solana Anchor program in Rust, and update every consumer: `hardware-web3-service`,
`owner-portal`, `public-server`, and `hardware-camera-app`. Harden provenance:

1. **On-chain hardware-signature verification** — `mint_photo` requires an ed25519
   signature-verify instruction in the same transaction, checked via instruction
   introspection. The Solana runtime itself proves the camera signed the image hash.
2. **On-chain dedupe** — `PhotoRecord` PDA is seeded by the 32-byte image hash, so the
   same image can never be recorded twice.

Toolchain (already installed): solana-cli 3.0.15 (Agave), anchor-cli 0.32.1, rustc 1.93.
Target cluster: **devnet** (localnet for tests). Legacy `contracts/` dir is deleted at
integration time (history stays in git).

## Program: `veris` (new top-level dir `solana-program/`, Anchor workspace)

Anchor 0.32.x, one program named `veris`. IDL is checked in at
`solana-program/idl/veris.json` after every build (consumers read it from there).
Deployment info in `solana-program/deployment.json`:
`{ "programId": "...", "cluster": "devnet", "rpcUrl": "https://api.devnet.solana.com" }`.

### Accounts (PDAs)

| Account | Seeds | Fields |
|---|---|---|
| `Config` | `["config"]` | `authority: Pubkey`, `total_photos: u64`, `total_devices: u64`, `bump: u8` |
| `Device` | `["device", device_pubkey]` | `device_pubkey: Pubkey`, `device_id: String(≤64)`, `camera_id: String(≤64)`, `model: String(≤64)`, `firmware_version: String(≤32)`, `registered_at: i64`, `is_active: bool`, `registered_by: Pubkey`, `bump: u8` |
| `DeviceIdIndex` | `["device-id", sha256(device_id)]` | `device_pubkey: Pubkey`, `bump: u8` |
| `PhotoRecord` | `["photo", image_hash]` | `index: u64`, `device_pubkey: Pubkey`, `device_id: String(≤64)`, `cid: String(≤96)`, `image_hash: [u8;32]`, `signature: [u8;64]`, `captured_at: i64`, `minted_at: i64`, `max_editions: u64` (0 = unlimited), `edition_count: u64`, `owner: Pubkey`, `bump: u8` |
| `Edition` | `["edition", photo_record_key, edition_number.to_le_bytes()]` | `photo: Pubkey`, `number: u64` (1-based), `owner: Pubkey`, `minted_at: i64`, `bump: u8` |

All accounts use `#[derive(InitSpace)]` + `8 + Account::INIT_SPACE` sizing.

### Instructions

- `initialize()` — creates `Config`; `authority = payer`.
- `register_device(device_pubkey: Pubkey, device_id: String, camera_id: String, model: String, firmware_version: String)`
  — inits `Device` + `DeviceIdIndex` (init constraint enforces uniqueness of both device
  pubkey and device_id); `registered_by = signer`; `is_active = true`; increments
  `config.total_devices`. Validates non-empty strings and length caps.
- `update_device(firmware_version: Option<String>, is_active: bool)` — signer must be
  `device.registered_by` **or** `device.device_pubkey`.
- `deactivate_device()` — same authorization; sets `is_active = false`.
- `mint_photo(image_hash: [u8;32], cid: String, signature: [u8;64], captured_at: i64, max_editions: u64, owner: Pubkey)`
  — accounts: `device` (must be `is_active`), `device_signer: Signer` (must equal
  `device.device_pubkey`), `payer: Signer`, `photo_record` (init, seeds
  `["photo", image_hash]`), `config` (mut), `instructions_sysvar`, system program.
  **Introspection check**: an earlier instruction in the tx must be for the native
  ed25519 program (`Ed25519SigVerify111111111111111111111111111`) whose parsed offsets
  yield exactly: pubkey == `device_signer.key()`, message == `image_hash` (32 bytes),
  signature == `signature` arg, and all `*_instruction_index` fields referring to that
  same instruction (`u16::MAX` or self-index). Parse layout: `num_signatures: u8`,
  `padding: u8`, then per-sig 14-byte `Ed25519SignatureOffsets`
  (`signature_offset, signature_instruction_index, public_key_offset,
  public_key_instruction_index, message_data_offset, message_data_size,
  message_instruction_index`, all `u16` LE). Sets `edition_count = 0`,
  `index = ++config.total_photos`, `minted_at = clock`.
- `mint_edition(recipient: Pubkey)` — accounts: `photo_record` (mut), `edition` (init,
  seeds use `edition_count + 1`), `payer: Signer`. Fails with `MaxEditionsReached` when
  `max_editions != 0 && edition_count >= max_editions`. Permissionless (same trust model
  as the ETH contract). Increments `edition_count`; `edition.owner = recipient`.
- `transfer_photo(new_owner: Pubkey)` — signer must be `photo_record.owner`.
- `transfer_edition(new_owner: Pubkey)` — signer must be `edition.owner`.

### Events (anchor `emit!`)

`DeviceRegistered { device_pubkey, device_id, registered_by }`,
`DeviceUpdated { device_pubkey, is_active }`,
`PhotoMinted { photo, index, device_pubkey, image_hash, cid, owner }`,
`EditionMinted { edition, photo, number, owner }`,
`PhotoTransferred / EditionTransferred { ..., new_owner }`.

### Errors

`DeviceNotActive`, `Unauthorized`, `MaxEditionsReached`,
`MissingEd25519Verification`, `SignatureMismatch`, `InvalidInput`.

### Tests (anchor test, local validator, TypeScript)

Cover: initialize; register (duplicate pubkey and duplicate device_id both fail);
update/deactivate auth (positive + wrong-signer negative); mint_photo happy path with
`Ed25519Program.createInstructionWithPublicKey`; mint_photo negatives — missing ed25519
ix, signature by wrong key, message ≠ image_hash, inactive device; image-hash dedupe
(second mint of same hash fails); mint_edition sequence + max_editions cap; transfers
(positive + wrong-signer negative).

## hardware-camera-app (Python)

- `hardware_identity.py`: replace secp256k1/keccak with **ed25519 via PyNaCl**
  (`nacl.signing.SigningKey`). Same hardware-ID + salt HKDF/sha256 seed derivation →
  32-byte ed25519 seed. Address = base58 pubkey (`base58` pkg). `sign_data`/`sign_hash`
  → ed25519 signatures (64 bytes, hex-encoded for transport). Update its self-test.
- `export_key.py` + `.device_key_export`: export the 32-byte seed hex (keep file format
  keys, values become seed hex + base58 address).
- `raspberry_pi_camera_app.py`: only touch what references ETH addresses/`0x` display.

## hardware-web3-service (Node)

- `web3Service.js` → rewrite as `solanaService.js` (keep the default-export singleton
  shape and method names so `server.js` changes stay mechanical):
  `initialize`, `registerDevice`, `updateDevice`, `isDeviceActive`, `getDeviceInfo`,
  `mintOriginal` (prepends `Ed25519Program.createInstructionWithPublicKey` then
  `mint_photo` via `@coral-xyz/anchor` Program), `mintEdition`, `getTokenMetadata`
  (reads `PhotoRecord`; photos are addressed by PDA base58 — `tokenId` in API responses
  becomes the PhotoRecord address string; keep `index` for display), `getDeviceBalance`
  (SOL), plus `requestAirdrop` helper used when devnet balance < 0.05 SOL.
- Device keypair: `Keypair.fromSeed(seedBytes)` from `getHardwareKey.js`
  (which now reads the seed export; also update its derivation fallback to match Python).
- `deploymentService.js`: read `solana-program/deployment.json` + `solana-program/idl/veris.json`.
- Off-chain sig check in `/api/verify/:claimId`: `tweetnacl` `nacl.sign.detached.verify`.
- Delete `privyService.js` and the `/api/privy/*` endpoint; drop ethers/privy deps.
- Address validation: `new PublicKey(x)` try/catch instead of `0x` regexes.
- `.env.example`: `SOLANA_RPC_URL`, `SOLANA_CLUSTER=devnet`, `VERIS_PROGRAM_ID`; remove
  ETH vars.

## owner-portal (React)

- Remove `@privy-io/react-auth`, `wagmi`, `viem`. Add `@solana/web3.js`,
  `@solana/wallet-adapter-react`, `-react-ui`, `-wallets`, `@coral-xyz/anchor`.
- `App.jsx`: `ConnectionProvider` (devnet RPC) + `WalletProvider` (Phantom, Solflare,
  Backpack) + `WalletModalProvider`; keep router + QueryClient.
- New `src/lib/veris.js`: program ID + IDL import (copy `veris.json` into
  `src/lib/idl/`), PDA helpers, account fetch/decode helpers, explorer URL helper
  (`https://explorer.solana.com/{address|tx}/…?cluster=devnet`).
- `ClaimPage.jsx`: wallet connect via wallet-adapter; on-chain proof card reads the
  `PhotoRecord` PDA; "mint to my wallet" sends `mint_edition` signed by the connected
  wallet; recipient-address form validates base58; Etherscan links/labels → Solana
  Explorer, "Sepolia" copy → "Solana Devnet".
- `OwnerDashboard.jsx`: replace totalTokens/getTokenMetadata reads with
  `getProgramAccounts` (PhotoRecord + Edition discriminators, `memcmp` on owner) to list
  what the connected wallet owns; contract-links card → program + explorer links.
- `SearchPage.jsx` / `LandingPage.jsx`: copy/link updates only.

## public-server (Node)

- Replace all `^0x[a-fA-F0-9]{40}$` validations (~6 sites incl. inline claim-page JS)
  with base58 validation (`bs58` decode → 32 bytes, or `@solana/web3.js` PublicKey).
- Explorer links + copy: Sepolia/Etherscan → Solana Explorer devnet; "Ethereum address"
  → "Solana address". `token_id` stays a string column (now stores PhotoRecord address).
- No schema migration needed.

## Integration & verification (main session, after agents)

1. `anchor build && anchor test` green; IDL + deployment.json checked in.
2. Deploy to devnet (airdrop as needed); write real program ID into
   `deployment.json`, `Anchor.toml`, portal `veris.js`, service `.env.example`.
3. Smoke: register device + mint photo + mint edition on devnet via a script in
   `solana-program/scripts/`; portal `npm run build`; both Node servers boot clean.
4. Delete `contracts/`; update `CLAUDE.md` + READMEs (note: repo dir is `public-server`,
   CLAUDE.md's `lensmint-public-server` name is stale — fix it).

## Execution plan (agents)

- **Wave 1 (parallel):** Agent A — Anchor program + tests (the interface above is
  binding; deviations require updating this spec). Agent D — public-server + camera-app
  Python (no IDL dependency).
- **Wave 2 (parallel, after A lands IDL):** Agent B — hardware-web3-service. Agent C —
  owner-portal.
- Main session: integration, devnet deploy, end-to-end smoke, cleanup.
