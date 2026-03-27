# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Veris is a Web3 camera system that creates verifiable, blockchain-backed photo NFTs using Raspberry Pi hardware, Zero-Knowledge proofs, and Filecoin storage. The core value proposition: hardware-signed images + ZK proofs = verifiable proof a photo isn't AI-generated.

## Repository Structure

| Directory | Purpose |
|-----------|---------|
| `hardware-camera-app/` | Python/Kivy GUI on Raspberry Pi for camera capture |
| `hardware-web3-service/` | Node.js backend for Filecoin upload, ZK proofs, NFT minting |
| `lensmint-public-server/` | Node.js claim server with SQLite, generates QR codes |
| `owner-portal/` | React/Vite dashboard for users to claim/mint NFTs |
| `contracts/` | Solidity smart contracts with Foundry toolchain |

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
cd lensmint-public-server
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
npm run submit-proof                 # Submit ZK proofs via vlayer
```

### Hardware Camera App (Python/Raspberry Pi)
```bash
cd hardware-camera-app
python3 main.py   # Requires Raspberry Pi with Picamera2
```

## Architecture & Data Flow

```
Raspberry Pi Camera
    → Capture + cryptographic hardware signature
    → POST to hardware-web3-service
        → Upload image to Filecoin (via Synapse SDK / Lighthouse)
        → Generate ZK proof (vlayer API)
        → Register device on DeviceRegistry contract
        → Mint ERC-1155 NFT via LensMintERC1155
        → Create claim in lensmint-public-server (SQLite)
        → Return QR code to camera app

User scans QR code → owner-portal (React)
    → Privy wallet auth
    → Wagmi/Viem to interact with contracts
    → Claim NFT via lensmint-public-server + hardware-web3-service

Smart Contracts (Solidity):
    → DeviceRegistry: device identity and validation
    → LensMintERC1155: ERC-1155 NFT minting
    → LensMintVerifier: ZK proof verification (RISC Zero)
```

## Key Technology Choices

- **Auth**: Privy (`@privy-io/react-auth`) handles wallet connection in owner-portal
- **Web3 client**: Wagmi 2 + Viem 2 for contract interaction
- **Storage**: Filecoin via Synapse SDK; Lighthouse as fallback
- **ZK proofs**: vlayer API + RISC Zero for verifiable image provenance
- **Database**: better-sqlite3 in both Node.js services (no migrations framework)
- **NFT standard**: ERC-1155 (not ERC-721) — supports batch minting per claim
- **Contract toolchain**: Foundry (foundry.toml: solc 0.8.24, optimizer on)

## Environment Setup

Each service requires its own `.env`. See `.env.example` in each directory:

- `hardware-web3-service/.env.example` — Filecoin contract address, Privy keys, vlayer endpoint, RPC URL
- `owner-portal` — Privy app ID configured in source (check `src/main.jsx` or `src/App.jsx`)
- `lensmint-public-server` — port and database path

## Module System

All Node.js services use ES modules (`"type": "module"` in package.json). Use `import`/`export`, not `require`.
