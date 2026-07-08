# Veris Solana Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Ethereum stack with a single Anchor program (`veris`) plus rewritten Node/React/Python consumers, with on-chain ed25519 hardware-signature verification and image-hash dedupe.

**Architecture:** One Anchor program owns device registry + photo provenance + editions as PDAs. `hardware-web3-service` signs with the device ed25519 keypair (derived from Pi hardware) and mints; `owner-portal` uses wallet-adapter and mints editions client-side; `public-server` stays chain-light (base58 validation + explorer links). Spec: `docs/superpowers/specs/2026-07-09-solana-migration-design.md` — **the spec's account/instruction tables are binding**.

**Tech Stack:** Rust + Anchor 0.32.1 (solana-cli 3.0.15, rustc 1.93), `@solana/web3.js@^1.98`, `@coral-xyz/anchor@^0.32`, `@solana/wallet-adapter-*`, PyNaCl + base58 (Python), tweetnacl + bs58 (Node).

## Global Constraints

- Cluster: **devnet** for runtime, local validator (`anchor test`) for tests. Devnet RPC: `https://api.devnet.solana.com`.
- Program name `veris`; workspace at `solana-program/`; IDL checked in at `solana-program/idl/veris.json`; deployment info at `solana-program/deployment.json` (`{ "programId", "cluster", "rpcUrl" }`).
- Use `@solana/web3.js` **1.x** everywhere (NOT 2.x/@solana/kit — different API, no `Ed25519Program`).
- All Node code stays ES modules. No `require`.
- After the migration no source file may import `ethers`, `wagmi`, `viem`, or `@privy-io/*`; no `0x[a-fA-F0-9]{40}` address validation may remain.
- Explorer links: `https://explorer.solana.com/address/<addr>?cluster=devnet` and `/tx/<sig>?cluster=devnet`. User-facing copy: "Solana Devnet" (never "Sepolia"/"Ethereum").
- API compatibility: JSON field names between services (`token_id`, `tx_hash`, `wallet_address`, `device_address`, etc.) are unchanged; values become base58 addresses / tx signatures. `token_id` now stores the **PhotoRecord PDA address** (base58 string).
- Commit frequently; every commit message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task A: Anchor program `veris` + tests (Wave 1)

**Files:**
- Create: `solana-program/` (via `anchor init veris` then restructure — `Anchor.toml`, `Cargo.toml`, `programs/veris/src/lib.rs`, optionally split into `programs/veris/src/{state.rs,errors.rs,ed25519.rs,instructions/*.rs}`)
- Create: `solana-program/tests/veris.ts`
- Create: `solana-program/idl/veris.json` (copied from `target/idl/veris.json` after build)
- Create: `solana-program/deployment.json`
- Create: `solana-program/scripts/smoke-devnet.ts` (register → mint_photo → mint_edition against configured cluster)

**Interfaces:**
- Consumes: nothing (foundation).
- Produces: the deployed IDL — instruction names `initialize`, `registerDevice`, `updateDevice`, `deactivateDevice`, `mintPhoto`, `mintEdition`, `transferPhoto`, `transferEdition`; accounts `Config`, `Device`, `DeviceIdIndex`, `PhotoRecord`, `Edition` with exact fields/seeds from the spec table. Wave-2 agents code against `solana-program/idl/veris.json`.

**Steps:**

- [ ] **A1: Scaffold.** `cd /Users/aditya/Devlopment/Veris && anchor init solana-program --no-git` (then rename program dir/name so the program crate is `veris`; set `[programs.localnet] veris = ...` and `[programs.devnet]` in `Anchor.toml`, `cluster = "localnet"` default, `wallet = "~/.config/solana/id.json"`; create the wallet with `solana-keygen new --no-bip39-passphrase -s -o ~/.config/solana/id.json` if missing). Verify `anchor build` succeeds on the empty scaffold before writing program code.
- [ ] **A2: Write failing tests first** (`tests/veris.ts`, mocha via `anchor test`). Cover every case in the spec's Tests section: initialize; register_device happy + duplicate-pubkey fail + duplicate-device_id fail (different keypair, same id); update/deactivate auth positive and wrong-signer negative; mint_photo happy path; mint_photo negatives (no ed25519 ix → `MissingEd25519Verification`; ed25519 ix signed by wrong keypair → `SignatureMismatch`; message ≠ image_hash → `SignatureMismatch`; inactive device → `DeviceNotActive`); duplicate image_hash mint fails (account already in use); mint_edition sequence 1,2,3 + `MaxEditionsReached` at cap; transfer_photo/transfer_edition positive + wrong-signer negative. Ed25519 ix built with:

```ts
import { Ed25519Program } from "@solana/web3.js";
import nacl from "tweetnacl";
const sig = nacl.sign.detached(imageHash, deviceKeypair.secretKey); // imageHash: Uint8Array(32)
const edIx = Ed25519Program.createInstructionWithPublicKey({
  publicKey: deviceKeypair.publicKey.toBytes(), message: imageHash, signature: sig,
});
await program.methods.mintPhoto([...imageHash] as any, cid, [...sig] as any, capturedAt, maxEditions, owner)
  .accounts({ device: devicePda, deviceSigner: deviceKeypair.publicKey, payer: provider.wallet.publicKey,
              photoRecord: photoPda, config: configPda,
              instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY })
  .preInstructions([edIx]).signers([deviceKeypair]).rpc();
```

- [ ] **A3: Implement the program.** Account structs, seeds, events, errors exactly per spec (use `#[derive(InitSpace)]` + `#[max_len(...)]` on strings). The ed25519 introspection helper (the load-bearing piece — use this logic verbatim):

```rust
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked,
};
use anchor_lang::solana_program::ed25519_program::ID as ED25519_ID;

/// Scan instructions before the current one for a native ed25519 verify of
/// `sig` over `msg` (32-byte image hash) by `pubkey`.
pub fn require_ed25519_verify(
    ix_sysvar: &AccountInfo, pubkey: &Pubkey, msg: &[u8; 32], sig: &[u8; 64],
) -> Result<()> {
    let current = load_current_index_checked(ix_sysvar)? as usize;
    for i in 0..current {
        let ix = load_instruction_at_checked(i, ix_sysvar)?;
        if ix.program_id != ED25519_ID || !ix.accounts.is_empty() { continue; }
        let d = &ix.data;
        if d.len() < 16 || d[0] != 1 { continue; } // one signature expected
        let u16le = |o: usize| u16::from_le_bytes([d[o], d[o + 1]]);
        let (sig_off, sig_idx) = (u16le(2) as usize, u16le(4));
        let (pk_off, pk_idx) = (u16le(6) as usize, u16le(8));
        let (msg_off, msg_len, msg_idx) = (u16le(10) as usize, u16le(12) as usize, u16le(14));
        // offsets must point into this same instruction
        let self_ref = |idx: u16| idx == u16::MAX || idx as usize == i;
        if !(self_ref(sig_idx) && self_ref(pk_idx) && self_ref(msg_idx)) { continue; }
        if d.len() < pk_off + 32 || d.len() < sig_off + 64 || d.len() < msg_off + msg_len { continue; }
        if d[pk_off..pk_off + 32] != pubkey.to_bytes() { continue; }
        require!(msg_len == 32 && d[msg_off..msg_off + 32] == msg[..]
                 && d[sig_off..sig_off + 64] == sig[..], VerisError::SignatureMismatch);
        return Ok(());
    }
    err!(VerisError::MissingEd25519Verification)
}
```

  `mint_photo` context: `instructions_sysvar` as `/// CHECK:` `UncheckedAccount` with `#[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]`. Note the wrong-signer test hits `SignatureMismatch` only if pubkey mismatch also falls through to `MissingEd25519Verification` — acceptable: assert *either* of those two errors in the wrong-key/wrong-message negatives, but a *tampered sig arg with valid ed25519 ix* must be `SignatureMismatch`.
- [ ] **A4: `anchor test`** until fully green. Then `anchor build`, copy `target/idl/veris.json` → `idl/veris.json`, write `deployment.json` with the program id from `declare_id!` and cluster `devnet`.
- [ ] **A5: Commit** (`solana-program/` incl. tests, IDL, deployment.json; exclude `target/` via `.gitignore`).

---

### Task D: public-server + hardware-camera-app (Wave 1)

**Files:**
- Modify: `public-server/server.js` (all `0x` regexes ~6 sites incl. inline HTML/JS claim page, explorer links, copy), `public-server/package.json` (+`bs58`)
- Create: `public-server/solanaAddress.js`
- Modify: `hardware-camera-app/hardware_identity.py`, `hardware-camera-app/export_key.py`, `hardware-camera-app/requirements.txt` (or equivalent — add `pynacl`, `base58`; drop `ecdsa`, `pysha3`)
- Modify: `hardware-camera-app/raspberry_pi_camera_app.py` (only ETH-address/`0x` display references)

**Interfaces:**
- Consumes: nothing on-chain.
- Produces: `isValidSolanaAddress(str): boolean` from `public-server/solanaAddress.js`; Python `HardwareIdentity` keeps its public method names (`sign_data`, `sign_hash`, `verify_signature`, address/pubkey properties) but returns ed25519 values; `.device_key_export` file now contains `seed_hex` (32-byte ed25519 seed) and `address` (base58).

**Steps:**

- [ ] **D1: Address validator + tests.** `public-server/solanaAddress.js`:

```js
import bs58 from 'bs58';
export function isValidSolanaAddress(addr) {
  if (typeof addr !== 'string' || addr.length < 32 || addr.length > 44) return false;
  try { return bs58.decode(addr).length === 32; } catch { return false; }
}
```

  Add `node --test` test file (valid pubkey passes; `0x`-address, short, non-base58 fail). Run it.
- [ ] **D2: Sweep `public-server/server.js`.** Replace every `^0x[a-fA-F0-9]{40}$` check with `isValidSolanaAddress`; update the claim-page inline JS validation + placeholder (`Solana address (base58)`), error strings, Etherscan URLs → Solana Explorer devnet, "Ethereum"/"Sepolia" copy. `grep -nE '0x\[a-fA-F0-9\]|etherscan|Ethereum|Sepolia' public-server/` must return nothing afterward. Boot the server (`PORT=5099 node server.js`) to verify clean start.
- [ ] **D3: Python ed25519 identity.** In `hardware_identity.py` keep the hardware-ID+salt seed derivation (sha256-based, produces 32 bytes) but replace key material:

```python
from nacl.signing import SigningKey, VerifyKey
import base58
self.signing_key = SigningKey(seed)              # seed: 32 bytes from existing derivation
self.verify_key = self.signing_key.verify_key
self.address = base58.b58encode(bytes(self.verify_key)).decode()

def sign_data(self, data):                        # -> 64-byte bytes
    return self.signing_key.sign(data).signature
```

  `sign_hash` returns `{'signature': sig.hex(), ...}` as before; `verify_signature` uses `VerifyKey.verify(data, sig)` with `BadSignatureError` handling. Remove ecdsa/keccak imports and the ETH-address code path. Update the module self-test at the bottom and run `python3 hardware-camera-app/hardware_identity.py` (mock the hardware-ID read if the module requires Pi paths — it already has fallbacks; verify before assuming).
- [ ] **D4: `export_key.py`** exports `seed_hex` + base58 `address` into `.device_key_export`; update `raspberry_pi_camera_app.py` display strings. Run `python3 export_key.py` if runnable off-Pi; otherwise verify by import.
- [ ] **D5: Commit** per logical unit (validator sweep; python identity).

---

### Task B: hardware-web3-service rewrite (Wave 2 — needs `solana-program/idl/veris.json`)

**Files:**
- Create: `hardware-web3-service/solanaService.js` (replaces `web3Service.js`; keep default-export singleton + method names)
- Modify: `hardware-web3-service/server.js` (import swap, `/api/verify` sig check via tweetnacl, remove `/api/privy/*`, ETH-isms), `deploymentService.js` (read `../solana-program/{deployment.json,idl/veris.json}`), `getHardwareKey.js` (read seed export; derivation fallback mirrors Python), `filecoinService.js` (only if it takes the ethers wallet — inspect and adapt init signature), `.env.example`, `package.json`
- Delete: `hardware-web3-service/web3Service.js`, `hardware-web3-service/privyService.js`
- Create: `hardware-web3-service/test/solanaService.test.js` (`node --test`, pure-unit: PDA derivation, seed→Keypair, sig verify — no network)

**Interfaces:**
- Consumes: IDL at `solana-program/idl/veris.json`; program id from `solana-program/deployment.json`; `.device_key_export` `seed_hex`.
- Produces (used by `server.js`, signatures preserved from `web3Service.js`): `initialize()`, `registerDevice(deviceInfo)`, `updateDevice(addr, fw, active)`, `isDeviceActive(addr)`, `getDeviceInfo(addr)`, `mintOriginal({recipient, ipfsHash, imageHash, signature, maxEditions})` → `{success, txHash, tokenId}` where `txHash` = tx signature and `tokenId` = PhotoRecord PDA base58, `mintEdition(recipient, originalTokenId)`, `getTokenMetadata(tokenId)`, `getDeviceBalance()` → `{address, balance /* SOL string */, balanceLamports}`, plus `requestAirdropIfLow()`.

**Key code (use as written):**

```js
import { Connection, Keypair, PublicKey, Ed25519Program, SYSVAR_INSTRUCTIONS_PUBKEY } from '@solana/web3.js';
import anchorPkg from '@coral-xyz/anchor';
const { AnchorProvider, Program, Wallet } = anchorPkg;
import nacl from 'tweetnacl';

const deviceKeypair = Keypair.fromSeed(Buffer.from(seedHex, 'hex')); // 32-byte seed
const [devicePda] = PublicKey.findProgramAddressSync(
  [Buffer.from('device'), deviceKeypair.publicKey.toBuffer()], programId);
const imageHashBytes = Buffer.from(imageHash.replace(/^0x/, ''), 'hex'); // must be 32 bytes — reject otherwise
const [photoPda] = PublicKey.findProgramAddressSync([Buffer.from('photo'), imageHashBytes], programId);
const sigBytes = Buffer.from(signature.replace(/^0x/, ''), 'hex');       // 64 bytes
const edIx = Ed25519Program.createInstructionWithPublicKey({
  publicKey: deviceKeypair.publicKey.toBytes(), message: imageHashBytes, signature: sigBytes });
// anchor program.methods.mintPhoto(Array.from(imageHashBytes), cid, Array.from(sigBytes),
//   new BN(capturedAt), new BN(maxEditions), new PublicKey(recipient))
//   .accounts({...}).preInstructions([edIx]).signers([deviceKeypair]).rpc();
```

  Off-chain verify in `/api/verify/:claimId`: `nacl.sign.detached.verify(imageHashBytes, sigBytes, new PublicKey(image.device_address).toBytes())`.

**Steps:**

- [ ] **B1:** Read `server.js` fully; list every `web3Service`/`privyService`/`ethers` touchpoint before editing.
- [ ] **B2:** Write `node --test` unit tests for `solanaService` helpers (PDA derivation matches seeds, hex→bytes validation rejects wrong lengths, seed→Keypair address is stable) — run, watch fail.
- [ ] **B3:** Implement `solanaService.js` + `deploymentService.js` + `getHardwareKey.js`; make tests pass.
- [ ] **B4:** Sweep `server.js`; update `.env.example` (`SOLANA_RPC_URL`, `SOLANA_CLUSTER=devnet`, `VERIS_PROGRAM_ID`; remove ETH/Privy vars); `npm uninstall ethers @privy-io/server-auth` (check exact privy pkg name in package.json), `npm i @solana/web3.js@^1.98 @coral-xyz/anchor@^0.32 tweetnacl bs58`.
- [ ] **B5:** Boot check: `node server.js` starts, logs Solana init (RPC unreachable is fine — must not crash). `grep -rn "ethers\|privy" --include='*.js' hardware-web3-service/` → nothing. Commit per unit.

---

### Task C: owner-portal rewrite (Wave 2 — needs `solana-program/idl/veris.json`)

**Files:**
- Modify: `owner-portal/src/App.jsx`, `src/components/{ClaimPage,OwnerDashboard,SearchPage,LandingPage}.jsx`, `package.json`, `vite.config.js` (node polyfills for Buffer if needed — `vite-plugin-node-polyfills`)
- Create: `owner-portal/src/lib/veris.js`, `owner-portal/src/lib/idl/veris.json` (copy)

**Interfaces:**
- Consumes: IDL + program id from `solana-program/`.
- Produces: `src/lib/veris.js` exporting `PROGRAM_ID`, `getProgram(connection, wallet)`, `photoPda(imageHashBytes)`, `editionPda(photoKey, number)`, `fetchPhotoRecord(connection, address)`, `fetchOwnedRecords(connection, owner)` (getProgramAccounts with discriminator + owner memcmp), `explorerUrl(addrOrSig, type)`, `isValidSolanaAddress(str)`.

**Steps:**

- [ ] **C1:** `npm uninstall @privy-io/react-auth wagmi viem && npm i @solana/web3.js@^1.98 @coral-xyz/anchor@^0.32 @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/wallet-adapter-base @solana/wallet-adapter-wallets`.
- [ ] **C2:** `App.jsx`: `ConnectionProvider endpoint={devnet RPC}` → `WalletProvider wallets={[PhantomWalletAdapter, SolflareWalletAdapter]} autoConnect` → `WalletModalProvider` → existing QueryClient/Router. Import `@solana/wallet-adapter-react-ui/styles.css`.
- [ ] **C3:** `src/lib/veris.js` per Produces above.
- [ ] **C4:** `ClaimPage.jsx`: `useWallet()`/`useConnection()` replace usePrivy/wagmi hooks; on-chain proof card = `fetchPhotoRecord(claim.token_id)`; self-mint = build `mintEdition` tx via anchor `program.methods.mintEdition(new PublicKey(wallet.publicKey)).accounts({ photoRecord, edition: editionPda(photo, count+1), payer })` + `wallet.sendTransaction`; recipient form validates base58; explorer links/copy per Global Constraints.
- [ ] **C5:** `OwnerDashboard.jsx`: replace Privy auth + wagmi reads with wallet-adapter connect + `fetchOwnedRecords`; contracts card → program id + explorer link. `SearchPage`/`LandingPage`: copy/links only.
- [ ] **C6:** `npm run build` green; `grep -rn "wagmi\|viem\|privy\|etherscan\|Sepolia" owner-portal/src/` → nothing. Commit per page.

---

### Task E: Integration, devnet deploy, e2e smoke, cleanup (main session)

- [ ] **E1:** `anchor test` green from clean checkout; portal build green; both servers boot.
- [ ] **E2:** Devnet: `solana airdrop` to deploy wallet, `anchor deploy --provider.cluster devnet` (or `anchor keys sync` first); update `deployment.json`, portal `veris.js` PROGRAM_ID, `.env.example`.
- [ ] **E3:** Run `solana-program/scripts/smoke-devnet.ts`: register test device → mint photo (with real ed25519 ix) → mint edition → fetch record; verify on explorer.
- [ ] **E4:** `git rm -r contracts/`; update `CLAUDE.md` (commands, architecture diagram, dir table — also fix stale `lensmint-public-server` → `public-server`) and root README if present.
- [ ] **E5:** Full-repo greps from Global Constraints; final commit.
