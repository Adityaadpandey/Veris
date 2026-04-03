# Veris Deployment Guide

Full step-by-step deployment: smart contracts → cloud services → Raspberry Pi.

---

## Prerequisites

### Dev Machine

```bash
# Install Foundry (for smart contracts)
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Accounts & API Keys


| Service             | What you need             | Where to get it                                                                |
| ------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| **Sepolia RPC**     | RPC URL                   | [alchemy.com](https://alchemy.com) — free tier                                 |
| **Etherscan**       | API key                   | [etherscan.io/apis](https://etherscan.io/apis) — free                          |
| **Privy**           | App ID + App Secret       | [console.privy.io](https://console.privy.io) — free dev tier                   |
| **Deployer wallet** | Private key + Sepolia ETH | Any wallet; ETH from [sepoliafaucet.com](https://sepoliafaucet.com)            |
| **Device wallet**   | Separate private key      | Generate fresh — this is the Pi's on-chain identity                            |
| **Filecoin faucet** | Test USDFC tokens         | [faucet.calibration.fildev.network](https://faucet.calibration.fildev.network) |


> **Device wallet** — generate with `cast wallet new` (Foundry) or any wallet app. Keep the private key safe — it goes on the Pi.

---

## Step 1: Deploy Smart Contracts

```bash
cd Veris/contracts
forge install
```

Export your keys:

```bash
export PRIVATE_KEY=0x<deployer-private-key>
export SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<your-alchemy-key>
export ETHERSCAN_API_KEY=<your-etherscan-key>
```

Deploy `DeviceRegistry` + `VerisERC1155`:

```bash
forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

**Save the two contract addresses printed in the output.** You'll need them in every `.env`.

Register the Raspberry Pi's device wallet on-chain:

```bash
export DEVICE_ADDRESS=0x<device-wallet-address>
forge script script/RegisterDevice.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast
```

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
VITE_PRIVY_APP_ID=<your-privy-app-id>
VITE_BACKEND_URL=http://<raspi-local-ip>:5000
```

> `VITE_BACKEND_URL` should be your Pi's local IP if users are on the same network, or a tunneled URL (e.g. ngrok) if they're remote.

Build and deploy:

```bash
npm run build
# deploy the dist/ folder to Vercel/Netlify
```

In your **Privy dashboard**: add the deployed portal URL to allowed origins.

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
DEPLOYMENT_JSON_PATH=/home/pi/Veris/contracts/deployment.json

# Blockchain
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<your-alchemy-key>
DEVICE_PRIVATE_KEY=0x<device-wallet-private-key>

# Contract addresses (from Step 1 output)
DEVICE_REGISTRY_ADDRESS=0x<DeviceRegistry-address>
LENSMINT_ERC1155_ADDRESS=0x<LensMintERC1155-address>

# Privy
PRIVY_APP_ID=<your-privy-app-id>
PRIVY_APP_SECRET=<your-privy-app-secret>

# Claim server
CLAIM_SERVER_URL=https://your-app.onrender.com
OWNER_WALLET_ADDRESS=0x<your-owner-wallet-address>

# Filecoin (calibration = testnet, free)
FILECOIN_NETWORK=calibration
FILECOIN_RPC_URL=https://api.calibration.node.glif.io/rpc/v1
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

## Filecoin Testnet Tokens

Before the Pi can upload images, fund the device wallet with test USDFC:

1. Go to [faucet.calibration.fildev.network](https://faucet.calibration.fildev.network)
2. Paste your **device wallet address**
3. Request tokens (you need ~2.5 USDFC minimum for Synapse SDK deposits)

---

## Env Var Cheatsheet


| Variable                  | Used in                    | Value                             |
| ------------------------- | -------------------------- | --------------------------------- |
| `SEPOLIA_RPC_URL`         | web3 service, contracts    | Alchemy/Infura Sepolia URL        |
| `DEVICE_PRIVATE_KEY`      | web3 service               | Pi device wallet private key      |
| `DEVICE_REGISTRY_ADDRESS` | web3 service               | From Step 1 deploy output         |
| `Veris_ERC1155_ADDRESS`   | web3 service               | From Step 1 deploy output         |
| `PRIVY_APP_ID`            | web3 service, owner portal | Privy dashboard                   |
| `PRIVY_APP_SECRET`        | web3 service               | Privy dashboard                   |
| `CLAIM_SERVER_URL`        | web3 service, camera app   | Your Render URL                   |
| `OWNER_WALLET_ADDRESS`    | web3 service               | Wallet that receives original NFT |
| `VITE_PRIVY_APP_ID`       | owner portal               | Same Privy App ID (Vite prefix)   |
| `VITE_BACKEND_URL`        | owner portal               | Pi's IP:5000 or tunnel URL        |


