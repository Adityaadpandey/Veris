# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Veris is a Web3 camera system that turns a Raspberry Pi shot into a hardware-signed, on-chain photo NFT. The core value proposition: a device-key signature plus an on-chain record is verifiable proof a photo came from a real camera, not an AI generator. Editors can license photos for USDC on Arc.

## Repository Structure

| Directory | Purpose |
|-----------|---------|
| `hardware-camera-app/` | Python/Kivy GUI on Raspberry Pi for camera capture |
| `hardware-web3-service/` | Node.js backend for storage upload, embeddings, multi-chain NFT minting |
| `public-server/` | Node.js claim server (Postgres), QR codes, same-scene check, search, Arkiv mirror |
| `owner-portal/` | React/Vite dashboard for users to claim/mint NFTs |
| `contracts/` | Solidity (Foundry): DeviceRegistry, VerisERC1155, VerisLicense |
| `mobile-app/` | Expo/React Native app: Bluetooth capture trigger, browse and verify photos |
| `ai-embedding-service/` | FastAPI CLIP + pHash embeddings used by hardware-web3-service |
| `ai-model/` | Standalone image-verification research code, not wired into the pipeline |
| `arkiv/` | Design notes for the Arkiv mirror of provenance records |

## Commands

### Owner Portal (React)
```bash
cd owner-portal
npm install
npm run dev       # Dev server on port 3000
npm run build     # Production build
npm run preview   # Preview production build
```

### Hardware Web3 Service (Node.js)
```bash
cd hardware-web3-service
npm install
npm run dev       # nodemon dev server
npm run start     # Production
```

### Public Claim Server (Node.js)
```bash
cd public-server
npm install
npm run dev       # nodemon dev server
npm run start     # Production
```

### Smart Contracts (Foundry)
```bash
cd contracts
forge build
forge test
forge test --match-test <testName>  # Run single test
```

### Hardware Camera App (Python/Raspberry Pi)
```bash
cd hardware-camera-app
python3 raspberry_pi_camera_app.py   # Kivy GUI; headless_camera_app.py for the headless/Bluetooth mode. Needs Picamera2
```

## Architecture & Data Flow

Full diagrams: `docs/ARCHITECTURE.md`.

```
Raspberry Pi Camera (hardware-camera-app)
    → Capture + sign sha256(image) with the device key
    → POST /api/images/upload to hardware-web3-service
        → Store image: 0G or Lighthouse (STORAGE_PROVIDER, falls back to the other)
        → Embed with ai-embedding-service (CLIP + pHash) for search
        → Mint ERC-1155 original on every chain in CHAINS (Sepolia primary, Arc secondary)
        → Create claim in public-server, which mirrors the record to Arkiv
        → Return QR code to the camera

Phone (mobile-app) can trigger capture over Bluetooth and attach a companion photo
    → public-server hashes it so search matches either photo

User scans QR → owner-portal (React) / mobile-app
    → Privy wallet auth, Wagmi/Viem for reads and writes
    → Claim + edition requests go through public-server; hardware-web3-service mints them
    → Editors pay 5 USDC via VerisLicense on Arc to license a photo

public-server also runs the "same scene" check (GPT vision), CLIP search and image forensics.
Capture never waits on a third party: sign and queue always succeed locally.

Smart Contracts (contracts/src):
    → DeviceRegistry: device identity and active check
    → VerisERC1155: mintOriginal / mintEdition, gated by DeviceRegistry
    → VerisLicense: USDC license purchase, checks the photographer holds the token
```

The Solana port lives on the `solana-migration` branch, not main.

## Key Technology Choices

- **Auth**: Privy (`@privy-io/react-auth`) handles wallet connection in owner-portal
- **Web3 client**: Wagmi 2 + Viem 2 in the portal, ethers v6 in hardware-web3-service
- **Chains**: Ethereum Sepolia (primary) plus Arc testnet (USDC is gas), picked by `CHAINS` in `hardware-web3-service/chains.js`
- **Storage**: 0G and Lighthouse (IPFS/Filecoin) behind `storageService.js`; no Synapse SDK
- **Provenance**: device-key signature checked on-chain through DeviceRegistry. There is no ZK proof, vlayer or RISC Zero code on main
- **Database**: better-sqlite3 in `hardware-web3-service` (local, no migrations framework); `public-server` uses hosted Postgres (`pg`) via `DATABASE_URL` since it runs on Render, which has an ephemeral disk
- **NFT standard**: ERC-1155 (not ERC-721) — supports batch minting per claim
- **Contract toolchain**: Foundry (foundry.toml: solc 0.8.24, optimizer on)

## Environment Setup

Each service requires its own `.env`. See `.env.example` in each directory:

- `hardware-web3-service/.env.example` — storage provider and keys, Privy keys, RPC URLs, `CHAINS`
- `owner-portal` — Privy app ID configured in source (check `src/main.jsx` or `src/App.jsx`)
- `public-server` — port and `DATABASE_URL` (Postgres connection string)

## Module System

`hardware-web3-service` uses ES modules (`"type": "module"`): use `import`/`export`. `public-server` is CommonJS: use `require`.
