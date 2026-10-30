# Veris Deployment Guide

Full step-by-step deployment: Solana program → cloud services → Raspberry Pi.

---

## Prerequisites

### Dev Machine

```bash
# Rust + Solana CLI (Agave) + Anchor
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.32.1 && avm use 0.32.1
```

### Accounts & API Keys


| Service             | What you need           | Where to get it                                                                 |
| ------------------- | ----------------------- | ------------------------------------------------------------------------------- |
| **Solana RPC**      | Devnet RPC URL          | `https://api.devnet.solana.com` (free) or [helius.dev](https://helius.dev)      |
| **Deployer wallet** | Keypair + devnet SOL    | `solana-keygen new`; SOL from [faucet.solana.com](https://faucet.solana.com)    |
| **Device wallet**   | Derived on the Pi       | ed25519 keypair from hardware ID + salt — nothing to generate manually          |
| **Lighthouse**      | API key                 | [files.lighthouse.storage](https://files.lighthouse.storage) — free tier        |


> **Device wallet** — the Pi derives its own ed25519 identity (`seed = sha256(hw_id + salt)`) on first boot of the camera app. Its base58 address needs a little devnet SOL to pay mint fees (~0.05 SOL is plenty; fees are ~5000 lamports per tx).

---

## Step 1: Deploy the Solana Program

```bash
cd Veris/solana-program
anchor build
anchor test          # 23 tests on a local validator — must be green
```

Fund the deployer and deploy to devnet (the program keypair at
`target/deploy/veris-keypair.json` keeps the program ID
`6beFq5WaWo7dPPEzVNt8gRG1YwJiFyUuhzpH1ydVDd23`):

```bash
solana airdrop 2 -u devnet          # or use faucet.solana.com
anchor deploy --provider.cluster devnet
```

Initialize the global config (one-time) and smoke-test the live deployment:

```bash
npx ts-node scripts/smoke-devnet.ts
# registers a throwaway device → mints a photo (real ed25519 sig) → mints an edition
```

**If the program ID ever changes** (new program keypair): update
`solana-program/deployment.json`, both `[programs.*]` entries in `Anchor.toml`,
`PROGRAM_ID` in `owner-portal/src/lib/veris.js`, and `VERIS_PROGRAM_ID` in the
web3-service `.env`. Consumers read the IDL from `solana-program/idl/veris.json`
(re-copy from `target/idl/veris.json` after interface changes; the portal keeps
its own copy at `owner-portal/src/lib/idl/veris.json`).

---

## Step 2: Deploy the Claim Server

The claim server must be **publicly reachable** — both the Pi and users' phones hit it.

Deploy to [Render](https://render.com) (free tier) or any VPS.

```bash
cd Veris/public-server
npm install
```

Create `.env`:

```env
PORT=5001
NODE_ENV=production
CLAIM_SERVER_URL=https://your-app.onrender.com
FRONTEND_URL=https://your-owner-portal.vercel.app
CORS_ORIGIN=*
DATABASE_PATH=/var/data/Veris-claims.db
```

> On Render: set env vars in the dashboard, set `DATABASE_PATH` to a persistent disk path.

Start command: `npm run start`

Note your public URL — e.g. `https://Veris.onrender.com`. This is your `CLAIM_SERVER_URL`.

---

## Step 3: Deploy the Owner Portal

Deploy to [Vercel](https://vercel.com) (free) or Netlify.

```bash
cd Veris/owner-portal
npm install
```

Create `.env` (Vite reads these at build time):

```env
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
VITE_BACKEND_URL=http://<raspi-local-ip>:5000
```

> `VITE_BACKEND_URL` should be your Pi's local IP if users are on the same network, or a tunneled URL (e.g. ngrok) if they're remote. Users connect with any wallet-adapter wallet (Phantom, Solflare) — no auth provider to configure.

Build and deploy:

```bash
npm run build
# deploy the dist/ folder to Vercel/Netlify
```

---

## Step 4: Set Up the Raspberry Pi

### 4a. OS

Flash **Raspberry Pi OS 64-bit** to SD card. Boot and connect to WiFi/Ethernet.

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git cmake libjpeg62-turbo-dev python3-pip python3-venv
```

### 4b. Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 4c. Copy the project

```bash
git clone https://github.com/<your-repo>/Veris.git /home/pi/Veris
# or scp/rsync from your dev machine
```

### 4d. Configure `hardware-web3-service`

```bash
cd /home/pi/Veris/hardware-web3-service
npm install
mkdir -p /home/pi/Veris/captures
```

Create `/home/pi/Veris/hardware-web3-service/.env`:

```env
PORT=5000
NODE_ENV=production
CAPTURES_PATH=/home/pi/Veris/captures
DATABASE_PATH=/home/pi/Veris/database.db

# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_CLUSTER=devnet
VERIS_PROGRAM_ID=6beFq5WaWo7dPPEzVNt8gRG1YwJiFyUuhzpH1ydVDd23
MIN_SOL_BALANCE=0.05
# DEVICE_SEED_HEX is optional — normally read from
# hardware-camera-app/.device_key_export (written by the camera app)

# Claim server
CLAIM_SERVER_URL=https://your-app.onrender.com
OWNER_WALLET_ADDRESS=<your-owner-wallet-base58-address>

# Filecoin storage
LIGHTHOUSE_API_KEY=<your-lighthouse-key>
```

### 4e. Configure the Python Camera App

```bash
cd /home/pi/Veris/hardware-camera-app
pip3 install -r requirements.txt
# or:
bash install_dependencies.sh
```

Set env vars (add to `~/.bashrc` for persistence):

```bash
export BACKEND_URL=http://localhost:5000
export CLAIM_SERVER_URL=https://your-app.onrender.com
```

First run derives the device identity and writes `.device_key_export`. Fund the
printed base58 address with a little devnet SOL (the camera app also shows a
funding QR when the balance is low).

### 4f. Install MJPG-Streamer

```bash
git clone https://github.com/jacksonliam/mjpg-streamer.git /home/pi/mjpg-streamer
cd /home/pi/mjpg-streamer/mjpg-streamer-experimental
make
sudo make install
```

---

## Step 5: Start Services on the Pi

```bash
cd /home/pi/Veris

# Backend Web3 service
pm2 start hardware-web3-service/server.js \
  --name Veris-backend \
  --env production

# Camera stream
pm2 start \
  "mjpg_streamer -i 'input_raspicam.so -fps 30' -o 'output_http.so -w /usr/local/share/mjpg-streamer/www -p 8081'" \
  --name camera-stream

# Persist across reboots
pm2 save
pm2 startup   # run the command it prints
```

Camera GUI (autostart on display):

```bash
# Add to /etc/xdg/autostart/Veris.desktop
[Desktop Entry]
Type=Application
Name=Veris Camera
Exec=bash /home/pi/Veris/hardware-camera-app/run_camera_app.sh
```

---

## Step 6: Verify Everything

```bash
# Pi backend
curl http://localhost:5000/health

# Device registered + funded?
curl http://localhost:5000/api/status
curl http://localhost:5000/api/balance

# PM2 process list
pm2 status

# Logs
pm2 logs Veris-backend
pm2 logs camera-stream
```

Check the claim server from any browser:

```
https://your-app.onrender.com/health
```

Spot-check on-chain state at
`https://explorer.solana.com/address/6beFq5WaWo7dPPEzVNt8gRG1YwJiFyUuhzpH1ydVDd23?cluster=devnet`.

---

## Startup Order


| Order | Service               | Where          | Port |
| ----- | --------------------- | -------------- | ---- |
| 1     | Claim server          | Cloud (Render) | 5001 |
| 2     | Owner portal          | Cloud (Vercel) | 443  |
| 3     | `Veris-backend`       | Pi (PM2)       | 5000 |
| 4     | `camera-stream`       | Pi (PM2)       | 8081 |
| 5     | Camera app (Kivy GUI) | Pi (autostart) | —    |


---

## Devnet SOL

Before the Pi can mint, fund the device wallet with devnet SOL:

1. Get the device's base58 address from the camera app screen or `curl http://localhost:5000/api/balance`
2. `solana airdrop 1 <device-address> -u devnet`, or use [faucet.solana.com](https://faucet.solana.com)
3. ~0.05 SOL covers thousands of mints (fees are ~5000 lamports/tx; each PhotoRecord/Edition PDA holds a small rent-exempt balance)

---

## Env Var Cheatsheet


| Variable               | Used in                  | Value                                  |
| ---------------------- | ------------------------ | -------------------------------------- |
| `SOLANA_RPC_URL`       | web3 service             | Devnet RPC URL                         |
| `SOLANA_CLUSTER`       | web3 service             | `devnet`                               |
| `VERIS_PROGRAM_ID`     | web3 service             | From `solana-program/deployment.json`  |
| `MIN_SOL_BALANCE`      | web3 service             | Airdrop/warning threshold (`0.05`)     |
| `DEVICE_SEED_HEX`      | web3 service (optional)  | Overrides `.device_key_export`         |
| `LIGHTHOUSE_API_KEY`   | web3 service             | Lighthouse dashboard                   |
| `CLAIM_SERVER_URL`     | web3 service, camera app | Your Render URL                        |
| `OWNER_WALLET_ADDRESS` | web3 service             | Base58 wallet that owns original photos|
| `VITE_SOLANA_RPC_URL`  | owner portal             | Devnet RPC URL (build-time)            |
| `VITE_BACKEND_URL`     | owner portal             | Pi's IP:5000 or tunnel URL             |
