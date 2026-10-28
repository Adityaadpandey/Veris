# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Veris is a Web3 camera system that creates verifiable, blockchain-backed photo records on Solana using Raspberry Pi hardware. The core value proposition: hardware-signed images + on-chain ed25519 signature verification = verifiable proof a photo isn't AI-generated. The camera's hardware-derived ed25519 key signs each image hash; the Solana runtime itself verifies that signature at mint time, and photo records are PDAs seeded by the image hash so the same image can never be minted twice.

## Repository Structure

| Directory | Purpose |
|-----------|---------|
| `hardware-camera-app/` | Python/Kivy GUI on Raspberry Pi for camera capture + ed25519 hardware identity |
| `hardware-web3-service/` | Node.js backend for Filecoin upload and Solana minting (device wallet) |
| `public-server/` | Node.js claim server with SQLite, generates QR codes |
| `owner-portal/` | React/Vite dashboard (Solana wallet-adapter) for users to claim/mint |
| `solana-program/` | Anchor workspace with the `veris` Rust program |
| `ai-model/`, `ai-embedding-service/` | Python services for image analysis/embeddings |

## Commands

### Solana Program (Anchor)
```bash
cd solana-program
anchor build      # builds programs/veris (platform-tools v1.52 pinned in Cargo.toml)
anchor test       # full TS test suite on a local validator (23 tests)
npx ts-node scripts/smoke-devnet.ts   # live-cluster smoke: register → mint photo → mint edition
```
Program ID: see `solana-program/deployment.json`. IDL is checked in at `solana-program/idl/veris.json` — re-copy from `target/idl/veris.json` after interface changes, and mirror it to `owner-portal/src/lib/idl/veris.json`.

### Owner Portal (React)
```bash
cd owner-portal
npm install
npm run dev       # Dev server on port 3000
npm run build     # Production build
```

### Hardware Web3 Service (Node.js)
```bash
cd hardware-web3-service
npm install
npm test          # offline unit tests (PDA derivation, key handling)
npm run dev       # nodemon dev server
```

### Public Claim Server (Node.js)
```bash
cd public-server
npm install
npm test          # node --test
npm run dev       # nodemon dev server
```

### Hardware Camera App (Python/Raspberry Pi)
```bash
cd hardware-camera-app
python3 main.py               # Requires Raspberry Pi with Picamera2
python3 hardware_identity.py  # ed25519 identity self-test (runs off-Pi too)
```

## Architecture & Data Flow

```
Raspberry Pi Camera
    → Capture + ed25519 hardware signature over sha256(image)
    → POST to hardware-web3-service
        → Upload image to Filecoin (Lighthouse)
        → mint_photo on the veris program:
            ed25519-verify instruction (native program) + instruction
            introspection proves the device signed the image hash on-chain;
            PhotoRecord PDA seeded by image hash (dedupe)
        → Create claim in public-server (SQLite)
        → Return QR code to camera app

User scans QR code → owner-portal (React)
    → Solana wallet-adapter (Phantom/Solflare)
    → Reads PhotoRecord PDA live; mints Edition PDA (permissionless,
      capped by max_editions) from the user's wallet

veris program accounts (PDAs):
    Config ["config"] · Device ["device", pubkey] ·
    DeviceIdIndex ["device-id", sha256(device_id)] ·
    PhotoRecord ["photo", image_hash] · Edition ["edition", photo, number]
```

## Key Technology Choices

- **Chain**: Solana devnet; Anchor 0.32 program in `solana-program/`
- **Device identity**: ed25519 keypair derived on-device from hardware ID + salt (`seed = sha256(hw_id + salt)`); exported as `seed_hex` in `.device_key_export`, consumed via `Keypair.fromSeed`
- **Web3 clients**: `@solana/web3.js` 1.x + `@coral-xyz/anchor` (portal and service). Do NOT use `@solana/kit` (web3.js 2.x) — the code depends on 1.x APIs like `Ed25519Program`
- **Wallets**: `@solana/wallet-adapter` (Phantom, Solflare) in owner-portal
- **Storage**: Filecoin via Lighthouse (API-key auth)
- **Database**: better-sqlite3 v12 in both Node services (no migrations framework)
- **"Token" semantics**: `token_id` fields across services/DB hold the PhotoRecord PDA address (base58 string); editions are on-chain PDA records owned by the recipient
- **API compat**: `/api/balance` keeps legacy `eth.*` key names (values are SOL) because the Pi app reads them — don't rename

## Environment Setup

Each service requires its own `.env`. See `.env.example` in each directory:

- `hardware-web3-service/.env.example` — `SOLANA_RPC_URL`, `SOLANA_CLUSTER`, `VERIS_PROGRAM_ID`, `MIN_SOL_BALANCE`, Lighthouse key
- `owner-portal` — `VITE_SOLANA_RPC_URL` (defaults to devnet); program ID from `src/lib/veris.js`
- `public-server` — port and database path

## Module System

All Node.js services use ES modules (`"type": "module"` in package.json). Use `import`/`export`, not `require`.
