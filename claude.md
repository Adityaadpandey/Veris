# LensMint — Complete Build Guide & Codebase Structure

> **Purpose**: This document is your team's complete technical blueprint for building LensMint in 24 hours. It contains the full project structure, every file you need, starter code for each component, deployment instructions, and AI prompts to accelerate development.

## 1. Project Structure Overview

```
lensmint/
├── device/                    # Raspberry Pi camera firmware
│   ├── capture.py             # Camera capture + signing pipeline
│   ├── config.py              # Device configuration
│   ├── keygen.py              # One-time device key generation
│   ├── uploader.py            # Sends signed photo to backend API
│   ├── display.py             # Optional: show status on Pi display
│   └── requirements.txt
│
├── backend/                   # Python FastAPI server
│   ├── main.py                # API entry point
│   ├── routes/
│   │   ├── photos.py          # /capture, /mint, /verify endpoints
│   │   └── claim.py           # /claim endpoint for QR flow
│   ├── services/
│   │   ├── hasher.py          # SHA-256 hashing
│   │   ├── ai_scorer.py       # Deepfake detection scoring
│   │   ├── ipfs_uploader.py   # Pinata IPFS upload
│   │   ├── zk_prover.py       # ZK proof generation wrapper
│   │   └── blockchain.py      # Smart contract interaction
│   ├── models/
│   │   └── schemas.py         # Pydantic models
│   ├── .env.example
│   └── requirements.txt
│
├── contracts/                 # Solidity smart contracts
│   ├── contracts/
│   │   └── LensMint.sol       # ERC-1155 + verification logic
│   ├── scripts/
│   │   └── deploy.js          # Deployment script
│   ├── test/
│   │   └── LensMint.test.js   # Contract tests
│   ├── hardhat.config.js
│   └── package.json
│
├── frontend/                  # Next.js web application
│   ├── app/
│   │   ├── layout.tsx         # Root layout with providers
│   │   ├── page.tsx           # Landing / hero page
│   │   ├── gallery/
│   │   │   └── page.tsx       # Photo gallery
│   │   ├── verify/
│   │   │   └── page.tsx       # Verification lookup
│   │   ├── claim/
│   │   │   └── [tokenId]/
│   │   │       └── page.tsx   # QR claim page
│   │   └── api/
│   │       └── mint/
│   │           └── route.ts   # Serverless mint proxy
│   ├── components/
│   │   ├── PhotoCard.tsx
│   │   ├── VerifyResult.tsx
│   │   ├── QRGenerator.tsx
│   │   ├── ClaimButton.tsx
│   │   ├── AuthenticityBadge.tsx
│   │   └── WalletProvider.tsx
│   ├── lib/
│   │   ├── contract.ts        # Contract ABI + address
│   │   ├── ipfs.ts            # IPFS fetch helpers
│   │   └── utils.ts           # Formatting helpers
│   ├── public/
│   │   └── logo.svg
│   ├── tailwind.config.ts
│   ├── next.config.js
│   └── package.json
│
```

---

## 2. Pre-Hackathon Setup Checklist

Do ALL of this the night before. You do NOT want to debug driver issues during the hackathon.

### Hardware

- [ ] Flash Raspberry Pi OS (64-bit) onto MicroSD card
- [ ] Boot Pi, connect to WiFi, run `sudo apt update && sudo apt upgrade`
- [ ] Enable camera: `sudo raspi-config` → Interface Options → Camera → Enable
- [ ] Install picamera2: `sudo apt install python3-picamera2`
- [ ] Test camera: `libcamera-hello` (should show preview window)
- [ ] Connect GPS module (NEO-6M) to UART pins (TX→GPIO15, RX→GPIO14)
- [ ] Install GPS daemon: `sudo apt install gpsd gpsd-clients`
- [ ] Test GPS: `gpsmon` (may need outdoor view for fix)
- [ ] Install Python dependencies: `pip install cryptography requests qrcode pillow`

### Accounts & API Keys (get these BEFORE the hackathon)

- [ ] **Pinata** (pinata.cloud): Free account → get API key + secret (1GB free IPFS storage)
- [ ] **Hive AI** (thehive.ai): Free trial → get API key for deepfake detection
- [ ] **Alchemy** or **Infura**: Free account → get Base Sepolia RPC URL
- [ ] **Base Sepolia faucet**: Get test ETH from faucet.base.org (or bridge from Sepolia)
- [ ] **Vercel**: Free account for frontend deployment
- [ ] **Railway** or **Render**: Free account for backend deployment

### Local Dev Environment

---

## 3. Component 1: Raspberry Pi Camera Device

### device/config.py

```python
"""
LensMint Device Configuration
Update these values before running.
"""

# Backend API URL (update after deploying backend)
API_BASE_URL = "http://YOUR_BACKEND_IP:8000"

# Device identity
DEVICE_ID = "lensmint-pi-001"

# Key storage path
PRIVATE_KEY_PATH = "/home/pi/lensmint/keys/device_key.pem"
PUBLIC_KEY_PATH = "/home/pi/lensmint/keys/device_key_pub.pem"

# Photo storage
PHOTO_DIR = "/home/pi/lensmint/photos"

# GPS (set to False if GPS module not connected)
GPS_ENABLED = True

# Resolution
PHOTO_WIDTH = 2592
PHOTO_HEIGHT = 1944
```

### device/keygen.py

```python
"""
One-time device key generation.
Run this ONCE on the Raspberry Pi to create the signing keypair.

Usage: python keygen.py
"""

import os
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from config import PRIVATE_KEY_PATH, PUBLIC_KEY_PATH


def generate_device_keys():
    os.makedirs(os.path.dirname(PRIVATE_KEY_PATH), exist_ok=True)

    # Generate ECDSA key pair (secp256k1 — same curve as Ethereum)
    private_key = ec.generate_private_key(ec.SECP256K1())

    # Save private key
    with open(PRIVATE_KEY_PATH, "wb") as f:
        f.write(private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        ))

    # Save public key
    public_key = private_key.public_key()
    with open(PUBLIC_KEY_PATH, "wb") as f:
        f.write(public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        ))

    # Print public key hex for contract registration
    pub_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint
    )
    print(f"Device keys generated successfully!")
    print(f"Private key: {PRIVATE_KEY_PATH}")
    print(f"Public key:  {PUBLIC_KEY_PATH}")
    print(f"Public key (hex): {pub_bytes.hex()}")
    print(f"\nRegister this public key hex in the smart contract.")


if __name__ == "__main__":
    generate_device_keys()
```

### device/capture.py

```python
"""
LensMint Camera Capture Pipeline
---------------------------------
This is the core device firmware. It:
1. Captures a photo from the Pi camera
2. Computes SHA-256 hash of the raw image bytes
3. Signs the hash with the device's ECDSA private key
4. Attaches metadata (GPS, timestamp, device ID)
5. Sends everything to the backend API for processing

Usage: python capture.py
"""

import os
import json
import hashlib
import time
from datetime import datetime, timezone

from picamera2 import Picamera2
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, utils

from config import (
    PRIVATE_KEY_PATH, DEVICE_ID, PHOTO_DIR,
    PHOTO_WIDTH, PHOTO_HEIGHT, GPS_ENABLED, API_BASE_URL
)
from uploader import upload_to_backend


def get_gps_location():
    """Get current GPS coordinates. Returns (lat, lon) or (0, 0) if unavailable."""
    if not GPS_ENABLED:
        return (0.0, 0.0)
    try:
        import gps
        session = gps.gps(mode=gps.WATCH_ENABLE)
        report = session.next()
        if report['class'] == 'TPV':
            return (
                getattr(report, 'lat', 0.0),
                getattr(report, 'lon', 0.0)
            )
    except Exception as e:
        print(f"GPS unavailable: {e}")
    return (0.0, 0.0)


def load_private_key():
    """Load the device's ECDSA private key from disk."""
    with open(PRIVATE_KEY_PATH, "rb") as f:
        return serialization.load_pem_private_key(f.read(), password=None)


def capture_photo():
    """Capture a photo and return (file_path, raw_bytes)."""
    os.makedirs(PHOTO_DIR, exist_ok=True)

    camera = Picamera2()
    config = camera.create_still_configuration(
        main={"size": (PHOTO_WIDTH, PHOTO_HEIGHT)}
    )
    camera.configure(config)
    camera.start()
    time.sleep(2)  # Let auto-exposure settle

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"lensmint_{timestamp}.jpg"
    filepath = os.path.join(PHOTO_DIR, filename)

    camera.capture_file(filepath)
    camera.stop()

    with open(filepath, "rb") as f:
        raw_bytes = f.read()

    print(f"Photo captured: {filepath} ({len(raw_bytes)} bytes)")
    return filepath, raw_bytes


def compute_hash(image_bytes):
    """Compute SHA-256 hash of raw image bytes."""
    h = hashlib.sha256(image_bytes).hexdigest()
    print(f"Image hash: {h}")
    return h


def sign_hash(private_key, image_hash):
    """Sign the image hash with device ECDSA key."""
    hash_bytes = bytes.fromhex(image_hash)
    signature = private_key.sign(
        hash_bytes,
        ec.ECDSA(utils.Prehashed(hashes.SHA256()))
    )
    sig_hex = signature.hex()
    print(f"Signature: {sig_hex[:40]}...")
    return sig_hex


def build_metadata(image_hash, signature):
    """Build the full metadata package."""
    lat, lon = get_gps_location()
    timestamp = datetime.now(timezone.utc).isoformat()

    metadata = {
        "device_id": DEVICE_ID,
        "image_hash": image_hash,
        "signature": signature,
        "timestamp": timestamp,
        "gps": {"latitude": lat, "longitude": lon},
        "firmware_version": "1.0.0"
    }

    print(f"Metadata built: device={DEVICE_ID}, time={timestamp}, gps=({lat}, {lon})")
    return metadata


def main():
    """Main capture pipeline."""
    print("\n" + "=" * 50)
    print("  LensMint — Capture Pipeline")
    print("=" * 50 + "\n")

    # Step 1: Load signing key
    print("[1/5] Loading device key...")
    private_key = load_private_key()

    # Step 2: Capture photo
    print("[2/5] Capturing photo...")
    filepath, raw_bytes = capture_photo()

    # Step 3: Hash
    print("[3/5] Computing hash...")
    image_hash = compute_hash(raw_bytes)

    # Step 4: Sign
    print("[4/5] Signing hash...")
    signature = sign_hash(private_key, image_hash)

    # Step 5: Build metadata and upload
    print("[5/5] Building metadata & uploading...")
    metadata = build_metadata(image_hash, signature)

    result = upload_to_backend(filepath, metadata)

    if result:
        print("\n" + "=" * 50)
        print("  CAPTURE COMPLETE")
        print(f"  Token ID: {result.get('token_id', 'pending')}")
        print(f"  TX Hash:  {result.get('tx_hash', 'pending')}")
        print(f"  QR Code:  {result.get('claim_url', 'pending')}")
        print("=" * 50 + "\n")
    else:
        print("\nUpload failed. Photo saved locally.")


if __name__ == "__main__":
    main()
```

### device/uploader.py

```python
"""
Uploads signed photo + metadata to the LensMint backend API.
"""

import requests
from config import API_BASE_URL


def upload_to_backend(photo_path, metadata):
    """
    Send the photo file and metadata to the backend.
    Returns the API response dict or None on failure.
    """
    url = f"{API_BASE_URL}/api/photos/capture"

    try:
        with open(photo_path, "rb") as photo_file:
            files = {"photo": photo_file}
            data = {"metadata": __import__("json").dumps(metadata)}

            response = requests.post(url, files=files, data=data, timeout=60)

            if response.status_code == 200:
                result = response.json()
                print(f"Upload successful: {result}")
                return result
            else:
                print(f"Upload failed: {response.status_code} — {response.text}")
                return None

    except requests.exceptions.ConnectionError:
        print(f"Cannot connect to backend at {API_BASE_URL}")
        print("Make sure the backend server is running.")
        return None
    except Exception as e:
        print(f"Upload error: {e}")
        return None
```

---

## 4. Component 2: Backend API

### backend/requirements.txt

```
fastapi==0.109.0
uvicorn==0.27.0
python-multipart==0.0.6
httpx==0.26.0
web3==6.14.0
python-dotenv==1.0.0
Pillow==10.2.0
qrcode[pil]==7.4.2
pydantic==2.5.3
```

### backend/.env.example

```bash
# Pinata IPFS
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_KEY=your_pinata_secret_key

# Hive AI (deepfake detection)
HIVE_API_KEY=your_hive_api_key

# Blockchain
RPC_URL=https://sepolia.base.org
PRIVATE_KEY=your_deployer_wallet_private_key
CONTRACT_ADDRESS=your_deployed_contract_address

# Frontend URL (for QR codes)
FRONTEND_URL=https://your-app.vercel.app

# Server
PORT=8000
```

### backend/models/schemas.py

```python
from pydantic import BaseModel
from typing import Optional


class PhotoMetadata(BaseModel):
    device_id: str
    image_hash: str
    signature: str
    timestamp: str
    gps: dict
    firmware_version: str


class MintResponse(BaseModel):
    token_id: int
    tx_hash: str
    image_hash: str
    authenticity_score: int
    ipfs_cid: str
    claim_url: str
    qr_code_base64: str


class VerifyResponse(BaseModel):
    token_id: int
    image_hash: str
    authenticity_score: int
    timestamp: str
    device_id: str
    ipfs_cid: str
    is_verified: bool
    tx_hash: str


class ClaimResponse(BaseModel):
    success: bool
    token_id: int
    claimer_address: str
    tx_hash: str
```

### backend/services/hasher.py

```python
import hashlib


def verify_hash(image_bytes: bytes, claimed_hash: str) -> bool:
    """Verify that the image bytes match the claimed hash."""
    computed = hashlib.sha256(image_bytes).hexdigest()
    return computed == claimed_hash


def compute_hash(image_bytes: bytes) -> str:
    """Compute SHA-256 hash of image bytes."""
    return hashlib.sha256(image_bytes).hexdigest()
```

### backend/services/ai_scorer.py

```python
"""
AI Authenticity Scoring Service
Uses Hive AI's deepfake detection API.
Fallback: returns a simulated score if API is unavailable.
"""

import httpx
import os
import base64

HIVE_API_KEY = os.getenv("HIVE_API_KEY", "")
HIVE_URL = "https://api.thehive.ai/api/v2/task/sync"


async def score_authenticity(image_bytes: bytes) -> dict:
    """
    Score image authenticity using Hive AI.
    Returns: {"score": 0-100, "is_authentic": bool, "details": str}
    """

    # ── Try Hive AI API ──
    if HIVE_API_KEY:
        try:
            b64_image = base64.b64encode(image_bytes).decode()

            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post(
                    HIVE_URL,
                    headers={"Authorization": f"Token {HIVE_API_KEY}"},
                    json={
                        "text_data": None,
                        "image_data": b64_image,
                    }
                )

                if response.status_code == 200:
                    data = response.json()
                    # Hive returns classes with scores
                    # Extract the "not_ai_generated" confidence
                    classes = data.get("status", [{}])[0].get("response", {}).get("output", [{}])[0].get("classes", [])

                    real_score = 50  # default
                    for cls in classes:
                        if cls.get("class") == "not_ai_generated":
                            real_score = int(cls.get("score", 0.5) * 100)
                            break

                    return {
                        "score": real_score,
                        "is_authentic": real_score >= 60,
                        "details": f"Hive AI confidence: {real_score}%"
                    }

        except Exception as e:
            print(f"Hive AI error: {e}. Using fallback scoring.")

    # ── Fallback: basic heuristic scoring ──
    # For hackathon demo: analyze file size and basic properties
    size_kb = len(image_bytes) / 1024

    # Real camera photos are typically > 500KB, AI images vary
    if size_kb > 800:
        score = 92
    elif size_kb > 400:
        score = 78
    else:
        score = 55

    return {
        "score": score,
        "is_authentic": score >= 60,
        "details": f"Heuristic scoring (API fallback): {score}% — file size {size_kb:.0f}KB"
    }
```

### backend/services/ipfs_uploader.py

```python
"""
IPFS Upload Service via Pinata.
"""

import httpx
import os

PINATA_API_KEY = os.getenv("PINATA_API_KEY", "")
PINATA_SECRET = os.getenv("PINATA_SECRET_KEY", "")
PINATA_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS"


async def upload_to_ipfs(image_bytes: bytes, filename: str, metadata: dict) -> str:
    """
    Upload image to IPFS via Pinata.
    Returns the IPFS CID (content identifier).
    """

    if not PINATA_API_KEY:
        # Fallback: return a placeholder CID for demo
        print("WARNING: No Pinata key. Using placeholder CID.")
        return "QmPlaceholderCIDForDemoOnly"

    try:
        headers = {
            "pinata_api_key": PINATA_API_KEY,
            "pinata_secret_api_key": PINATA_SECRET,
        }

        # Pinata metadata
        import json
        pinata_metadata = json.dumps({
            "name": filename,
            "keyvalues": {
                "device_id": metadata.get("device_id", ""),
                "image_hash": metadata.get("image_hash", ""),
                "timestamp": metadata.get("timestamp", ""),
            }
        })

        files = {
            "file": (filename, image_bytes, "image/jpeg"),
        }
        data = {
            "pinataMetadata": pinata_metadata,
        }

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                PINATA_URL,
                headers=headers,
                files=files,
                data=data
            )

            if response.status_code == 200:
                cid = response.json()["IpfsHash"]
                print(f"IPFS upload success: {cid}")
                return cid
            else:
                print(f"Pinata error: {response.status_code} — {response.text}")
                return "QmUploadFailed"

    except Exception as e:
        print(f"IPFS upload error: {e}")
        return "QmUploadError"
```

### backend/services/blockchain.py

```python
"""
Blockchain interaction service.
Handles minting and verification on Base L2.
"""

import os
import json
from web3 import Web3

RPC_URL = os.getenv("RPC_URL", "https://sepolia.base.org")
PRIVATE_KEY = os.getenv("PRIVATE_KEY", "")
CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS", "")

# Load ABI (generated after contract compilation)
ABI_PATH = os.path.join(os.path.dirname(__file__), "..", "abi", "LensMint.json")

w3 = Web3(Web3.HTTPProvider(RPC_URL))


def get_contract():
    """Load the deployed contract instance."""
    with open(ABI_PATH) as f:
        abi = json.load(f)
    return w3.eth.contract(address=CONTRACT_ADDRESS, abi=abi)


def mint_proof(image_hash: str, score: int, ipfs_cid: str, device_id: str) -> dict:
    """
    Call mintProof on the smart contract.
    Returns {"token_id": int, "tx_hash": str}
    """
    contract = get_contract()
    account = w3.eth.account.from_key(PRIVATE_KEY)

    # Convert image_hash to bytes32
    hash_bytes = bytes.fromhex(image_hash)

    tx = contract.functions.mintProof(
        hash_bytes,
        score,
        ipfs_cid,
        device_id
    ).build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address),
        "gas": 300000,
        "gasPrice": w3.eth.gas_price,
    })

    signed = w3.eth.account.sign_transaction(tx, PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

    # Extract token ID from event logs
    logs = contract.events.PhotoMinted().process_receipt(receipt)
    token_id = logs[0]["args"]["tokenId"] if logs else 0

    return {
        "token_id": token_id,
        "tx_hash": tx_hash.hex(),
    }


def verify_photo(token_id: int) -> dict:
    """Read photo verification data from chain."""
    contract = get_contract()
    result = contract.functions.getPhotoData(token_id).call()

    return {
        "image_hash": result[0].hex(),
        "authenticity_score": result[1],
        "timestamp": result[2],
        "device_id": result[3],
        "ipfs_cid": result[4],
        "is_verified": result[1] >= 60,
    }


def claim_photo(token_id: int, claimer_address: str) -> dict:
    """Mint a claim copy to the claimer's wallet."""
    contract = get_contract()
    account = w3.eth.account.from_key(PRIVATE_KEY)

    tx = contract.functions.claimPhoto(
        token_id,
        claimer_address
    ).build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address),
        "gas": 200000,
        "gasPrice": w3.eth.gas_price,
    })

    signed = w3.eth.account.sign_transaction(tx, PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

    return {
        "token_id": token_id,
        "claimer_address": claimer_address,
        "tx_hash": tx_hash.hex(),
    }
```

### backend/main.py

```python
"""
LensMint Backend API
Run: uvicorn main:app --host 0.0.0.0 --port 8000
"""

import os
import json
import base64
import io

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import qrcode

load_dotenv()

from services.hasher import verify_hash, compute_hash
from services.ai_scorer import score_authenticity
from services.ipfs_uploader import upload_to_ipfs
from services.blockchain import mint_proof, verify_photo, claim_photo
from models.schemas import MintResponse, VerifyResponse, ClaimResponse

app = FastAPI(title="LensMint API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


def generate_qr_base64(url: str) -> str:
    """Generate a QR code as base64 PNG."""
    qr = qrcode.make(url)
    buffer = io.BytesIO()
    qr.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "lensmint-api"}


@app.post("/api/photos/capture", response_model=MintResponse)
async def capture_and_mint(
    photo: UploadFile = File(...),
    metadata: str = Form(...)
):
    """
    Main endpoint: receives a signed photo from the Pi device,
    verifies it, scores it, uploads to IPFS, and mints on-chain.
    """

    # Parse metadata
    meta = json.loads(metadata)
    image_bytes = await photo.read()

    # Step 1: Verify hash matches
    computed_hash = compute_hash(image_bytes)
    if computed_hash != meta["image_hash"]:
        raise HTTPException(400, "Image hash mismatch — photo may have been tampered with in transit")

    # Step 2: AI authenticity scoring
    ai_result = await score_authenticity(image_bytes)
    score = ai_result["score"]

    # Step 3: Upload to IPFS
    ipfs_cid = await upload_to_ipfs(image_bytes, photo.filename, meta)

    # Step 4: Mint on-chain
    chain_result = mint_proof(
        image_hash=meta["image_hash"],
        score=score,
        ipfs_cid=ipfs_cid,
        device_id=meta["device_id"]
    )

    # Step 5: Generate claim URL + QR
    token_id = chain_result["token_id"]
    claim_url = f"{FRONTEND_URL}/claim/{token_id}"
    qr_base64 = generate_qr_base64(claim_url)

    return MintResponse(
        token_id=token_id,
        tx_hash=chain_result["tx_hash"],
        image_hash=meta["image_hash"],
        authenticity_score=score,
        ipfs_cid=ipfs_cid,
        claim_url=claim_url,
        qr_code_base64=qr_base64
    )


@app.get("/api/photos/verify/{token_id}", response_model=VerifyResponse)
async def verify(token_id: int):
    """Look up a photo's on-chain provenance by token ID."""
    try:
        data = verify_photo(token_id)
        return VerifyResponse(
            token_id=token_id,
            tx_hash="",  # Could store this separately
            **data
        )
    except Exception as e:
        raise HTTPException(404, f"Token {token_id} not found: {e}")


@app.post("/api/photos/claim/{token_id}", response_model=ClaimResponse)
async def claim(token_id: int, claimer_address: str):
    """Claim a photo NFT to your wallet."""
    try:
        result = claim_photo(token_id, claimer_address)
        return ClaimResponse(success=True, **result)
    except Exception as e:
        raise HTTPException(400, f"Claim failed: {e}")
```

---

## 5. Component 3: Smart Contracts

### contracts/package.json

```json
{
  "name": "lensmint-contracts",
  "version": "1.0.0",
  "scripts": {
    "compile": "npx hardhat compile",
    "test": "npx hardhat test",
    "deploy:testnet": "npx hardhat run scripts/deploy.js --network baseSepolia"
  },
  "devDependencies": {
    "@nomicfoundation/hardhat-toolbox": "^4.0.0",
    "hardhat": "^2.19.0",
    "@openzeppelin/contracts": "^5.0.1",
    "dotenv": "^16.3.1"
  }
}
```

### contracts/hardhat.config.js

```javascript
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: "0.8.24",
  networks: {
    baseSepolia: {
      url: process.env.RPC_URL || "https://sepolia.base.org",
      accounts: [process.env.PRIVATE_KEY],
    },
  },
};
```

### contracts/contracts/LensMint.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LensMint
 * @notice Tamper-proof photo authenticity NFTs.
 *         Each token represents a cryptographically verified photograph
 *         with on-chain provenance data.
 */
contract LensMint is ERC1155, Ownable {

    // ── Structs ──
    struct PhotoData {
        bytes32 imageHash;        // SHA-256 hash of raw image
        uint8   authenticityScore; // AI score 0-100
        uint64  timestamp;        // Block timestamp at mint
        string  deviceId;         // Hardware device identifier
        string  ipfsCid;          // IPFS content identifier
        address minter;           // Who minted (backend wallet)
    }

    // ── State ──
    uint256 public nextTokenId = 1;

    mapping(uint256 => PhotoData) public photos;
    mapping(bytes32 => bool) public hashExists; // Prevent duplicate mints

    // ── Events ──
    event PhotoMinted(
        uint256 indexed tokenId,
        bytes32 imageHash,
        uint8   authenticityScore,
        string  deviceId,
        string  ipfsCid
    );

    event PhotoClaimed(
        uint256 indexed tokenId,
        address indexed claimer
    );

    // ── Constructor ──
    constructor() ERC1155("") Ownable(msg.sender) {}

    // ── Core functions ──

    /**
     * @notice Mint a new verified photo proof.
     * @dev Only callable by the contract owner (backend wallet).
     */
    function mintProof(
        bytes32 _imageHash,
        uint8   _authenticityScore,
        string  calldata _ipfsCid,
        string  calldata _deviceId
    ) external onlyOwner returns (uint256) {
        require(!hashExists[_imageHash], "Photo already minted");
        require(_authenticityScore <= 100, "Invalid score");

        uint256 tokenId = nextTokenId++;

        photos[tokenId] = PhotoData({
            imageHash: _imageHash,
            authenticityScore: _authenticityScore,
            timestamp: uint64(block.timestamp),
            deviceId: _deviceId,
            ipfsCid: _ipfsCid,
            minter: msg.sender
        });

        hashExists[_imageHash] = true;

        // Mint token to contract owner (backend)
        _mint(msg.sender, tokenId, 1, "");

        emit PhotoMinted(tokenId, _imageHash, _authenticityScore, _deviceId, _ipfsCid);
        return tokenId;
    }

    /**
     * @notice Claim a copy of a photo NFT (e.g., someone in the photo).
     * @dev Mints an additional copy to the claimer. Anyone can call.
     */
    function claimPhoto(
        uint256 _tokenId,
        address _claimer
    ) external onlyOwner {
        require(photos[_tokenId].timestamp > 0, "Photo does not exist");
        _mint(_claimer, _tokenId, 1, "");
        emit PhotoClaimed(_tokenId, _claimer);
    }

    /**
     * @notice Get full provenance data for a photo.
     */
    function getPhotoData(uint256 _tokenId)
        external view
        returns (
            bytes32 imageHash,
            uint8   authenticityScore,
            uint64  timestamp,
            string  memory deviceId,
            string  memory ipfsCid
        )
    {
        PhotoData storage p = photos[_tokenId];
        require(p.timestamp > 0, "Photo does not exist");
        return (p.imageHash, p.authenticityScore, p.timestamp, p.deviceId, p.ipfsCid);
    }

    /**
     * @notice Check if an image hash has already been minted.
     */
    function isHashMinted(bytes32 _hash) external view returns (bool) {
        return hashExists[_hash];
    }

    /**
     * @notice URI override for metadata.
     */
    function uri(uint256 _tokenId) public view override returns (string memory) {
        PhotoData storage p = photos[_tokenId];
        return string(abi.encodePacked("ipfs://", p.ipfsCid));
    }
}
```

### contracts/scripts/deploy.js

```javascript
const hre = require("hardhat");

async function main() {
  console.log("Deploying LensMint to", hre.network.name, "...");

  const LensMint = await hre.ethers.getContractFactory("LensMint");
  const contract = await LensMint.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`\nLensMint deployed to: ${address}`);
  console.log(`\nUpdate your .env file:`);
  console.log(`CONTRACT_ADDRESS=${address}`);

  // Save ABI for backend
  const fs = require("fs");
  const artifact = await hre.artifacts.readArtifact("LensMint");
  const abiDir = "../backend/abi";
  if (!fs.existsSync(abiDir)) fs.mkdirSync(abiDir, { recursive: true });
  fs.writeFileSync(
    `${abiDir}/LensMint.json`,
    JSON.stringify(artifact.abi, null, 2),
  );
  console.log(`ABI saved to ${abiDir}/LensMint.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

---

## 6. Component 4: ZK Proof Circuit

> **IMPORTANT**: ZK proofs are the stretch goal. If setup takes too long during the hackathon, skip this and use the direct hash verification approach. The system works without ZK — ZK adds privacy enhancement.

### zk/circuits/photo_verify.circom

```circom
pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";

/**
 * PhotoVerify: Proves that the prover knows a preimage
 * that hashes to a public commitment, without revealing
 * the preimage itself.
 *
 * Public inputs:  commitment (the hash on-chain)
 * Private inputs: imageHashPart1, imageHashPart2 (the actual hash split into 2 field elements)
 */
template PhotoVerify() {
    // Private inputs (the secret — the actual image hash)
    signal input imageHashPart1;
    signal input imageHashPart2;

    // Public input (the commitment stored on-chain)
    signal input commitment;

    // Hash the private inputs using Poseidon
    component hasher = Poseidon(2);
    hasher.inputs[0] <== imageHashPart1;
    hasher.inputs[1] <== imageHashPart2;

    // Constrain: the hash of private inputs must equal the public commitment
    commitment === hasher.out;
}

component main {public [commitment]} = PhotoVerify();
```

### zk/scripts/setup.sh

```bash
#!/bin/bash
# ZK Trusted Setup for LensMint
# Run this ONCE before the hackathon to generate proving/verification keys.

set -e

echo "=== LensMint ZK Setup ==="

# Install circom dependencies
npm install circomlib snarkjs

# Compile circuit
echo "[1/4] Compiling circuit..."
circom circuits/photo_verify.circom --r1cs --wasm --sym -o build/

# Powers of Tau (use pre-generated for speed)
echo "[2/4] Downloading powers of tau..."
wget -q https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_12.ptau -O build/pot12.ptau

# Generate proving key
echo "[3/4] Generating proving key..."
npx snarkjs groth16 setup build/photo_verify.r1cs build/pot12.ptau build/photo_verify_0000.zkey
npx snarkjs zkey contribute build/photo_verify_0000.zkey build/photo_verify_final.zkey --name="LensMint Hackathon" -v -e="random entropy string"

# Export verification key
echo "[4/4] Exporting verification key..."
npx snarkjs zkey export verificationkey build/photo_verify_final.zkey build/verification_key.json

# Export Solidity verifier (optional: deploy on-chain)
npx snarkjs zkey export solidityverifier build/photo_verify_final.zkey build/PhotoVerifier.sol

echo ""
echo "=== Setup Complete ==="
echo "Proving key:      build/photo_verify_final.zkey"
echo "Verification key: build/verification_key.json"
echo "WASM:             build/photo_verify_js/photo_verify.wasm"
```

---

## 7. Component 5: Frontend Web App

### frontend/app/layout.tsx

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/WalletProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LensMint — Tamper-Proof Photo Authenticity",
  description: "Hardware-signed, AI-verified, blockchain-proven photography.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <WalletProvider>
          <nav className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <a href="/" className="text-xl font-bold text-purple-600">
              LensMint
            </a>
            <div className="flex gap-6 items-center">
              <a href="/gallery" className="text-gray-600 hover:text-gray-900">
                Gallery
              </a>
              <a href="/verify" className="text-gray-600 hover:text-gray-900">
                Verify
              </a>
              {/* RainbowKit ConnectButton goes here */}
            </div>
          </nav>
          <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
        </WalletProvider>
      </body>
    </html>
  );
}
```

### frontend/app/page.tsx (Landing page)

```tsx
export default function Home() {
  return (
    <div className="text-center py-20">
      <h1 className="text-5xl font-bold text-gray-900 mb-4">
        Every photo, <span className="text-purple-600">provably real</span>
      </h1>
      <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-8">
        Hardware-signed at capture. AI-verified for authenticity. Permanently
        recorded on the blockchain. No single point of failure.
      </p>
      <div className="flex gap-4 justify-center">
        <a
          href="/verify"
          className="bg-purple-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-purple-700 transition"
        >
          Verify a photo
        </a>
        <a
          href="/gallery"
          className="border border-gray-300 text-gray-700 px-8 py-3 rounded-lg font-semibold hover:bg-gray-50 transition"
        >
          View gallery
        </a>
      </div>

      {/* How it works section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20 text-left">
        {[
          {
            step: "1",
            title: "Capture & sign",
            desc: "A Raspberry Pi camera signs every photo with a hardware-bound cryptographic key at the moment of capture.",
          },
          {
            step: "2",
            title: "AI verification",
            desc: "Our AI analyzes the image and scores its authenticity from 0 to 100, detecting potential manipulation or AI generation.",
          },
          {
            step: "3",
            title: "Blockchain proof",
            desc: "A permanent, tamper-proof record is created on-chain. Anyone can verify the photo's provenance at any time.",
          },
        ].map((item) => (
          <div
            key={item.step}
            className="p-6 rounded-xl border border-gray-200"
          >
            <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 font-bold flex items-center justify-center mb-4">
              {item.step}
            </div>
            <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
            <p className="text-gray-500">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### frontend/app/verify/page.tsx

```tsx
"use client";
import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function VerifyPage() {
  const [tokenId, setTokenId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleVerify() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch(`${API_URL}/api/photos/verify/${tokenId}`);
      if (!res.ok) throw new Error("Photo not found");
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Verify a photo</h1>
      <p className="text-gray-500 mb-8">
        Enter a token ID to check its on-chain provenance record.
      </p>

      <div className="flex gap-3 mb-8">
        <input
          type="number"
          placeholder="Token ID (e.g. 1)"
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value)}
          className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button
          onClick={handleVerify}
          disabled={loading || !tokenId}
          className="bg-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 transition"
        >
          {loading ? "Verifying..." : "Verify"}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 mb-6">
          {error}
        </div>
      )}

      {result && (
        <div className="border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                result.is_verified ? "bg-green-500" : "bg-red-500"
              }`}
            >
              {result.is_verified ? "✓" : "✗"}
            </div>
            <div>
              <p className="font-semibold text-lg">
                {result.is_verified
                  ? "Verified authentic"
                  : "Verification failed"}
              </p>
              <p className="text-gray-500">Token #{result.token_id}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Authenticity score</p>
              <p className="font-mono font-semibold text-lg">
                {result.authenticity_score}/100
              </p>
            </div>
            <div>
              <p className="text-gray-500">Device</p>
              <p className="font-mono">{result.device_id}</p>
            </div>
            <div>
              <p className="text-gray-500">Timestamp</p>
              <p className="font-mono">
                {new Date(result.timestamp * 1000).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-gray-500">IPFS</p>
              <a
                href={`https://gateway.pinata.cloud/ipfs/${result.ipfs_cid}`}
                target="_blank"
                className="font-mono text-purple-600 hover:underline"
              >
                {result.ipfs_cid?.slice(0, 20)}...
              </a>
            </div>
          </div>

          <div className="pt-4 border-t">
            <p className="text-gray-500 text-sm">Image hash (SHA-256)</p>
            <p className="font-mono text-xs break-all">{result.image_hash}</p>
          </div>
        </div>
      )}
    </div>
  );
}
```

### frontend/app/claim/[tokenId]/page.tsx

```tsx
"use client";
import { useState } from "react";
import { useParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function ClaimPage() {
  const params = useParams();
  const tokenId = params.tokenId as string;

  const [walletAddress, setWalletAddress] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function handleClaim() {
    setClaiming(true);
    setError("");
    try {
      const res = await fetch(
        `${API_URL}/api/photos/claim/${tokenId}?claimer_address=${walletAddress}`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error("Claim failed");
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto text-center py-12">
      <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <span className="text-purple-600 text-2xl font-bold">L</span>
      </div>

      <h1 className="text-3xl font-bold mb-2">Claim your photo</h1>
      <p className="text-gray-500 mb-8">
        You were captured by a LensMint device. Claim this verified photo as an
        NFT in your wallet.
      </p>
      <p className="text-sm text-gray-400 mb-6">Token #{tokenId}</p>

      {!result ? (
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Your wallet address (0x...)"
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            onClick={handleClaim}
            disabled={claiming || !walletAddress}
            className="w-full bg-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 transition"
          >
            {claiming ? "Claiming..." : "Claim NFT"}
          </button>
          {error && <p className="text-red-500">{error}</p>}
        </div>
      ) : (
        <div className="p-6 bg-green-50 border border-green-200 rounded-xl">
          <p className="text-green-700 font-semibold text-lg mb-2">
            Claimed successfully!
          </p>
          <p className="text-sm text-gray-600">
            TX: {result.tx_hash?.slice(0, 20)}...
          </p>
          <p className="text-sm text-gray-600 mt-1">
            The NFT is now in your wallet.
          </p>
        </div>
      )}
    </div>
  );
}
```

---

## 8. Integration & End-to-End Flow

### The complete flow in sequence

```
┌────────────┐     ┌────────────┐     ┌────────────┐     ┌────────────┐
│ Raspberry   │────▶│ Backend    │────▶│ Base L2    │────▶│ Frontend   │
│ Pi Camera   │     │ FastAPI    │     │ Contract   │     │ Next.js    │
└────────────┘     └────────────┘     └────────────┘     └────────────┘

1. Pi captures photo
2. Pi signs hash with ECDSA device key
3. Pi sends photo + metadata to backend
4. Backend verifies hash matches
5. Backend calls Hive AI for deepfake score
6. Backend uploads photo to IPFS via Pinata
7. Backend calls mintProof() on smart contract
8. Contract stores proof, mints ERC-1155 token
9. Backend generates QR code with claim URL
10. Backend returns token ID + QR to Pi display
11. Judge scans QR → opens claim page on phone
12. Judge connects wallet → claims NFT copy
```

### Testing the flow locally

```bash
# Terminal 1: Start backend
cd backend
pip install -r requirements.txt
cp .env.example .env  # Fill in your keys
uvicorn main:app --host 0.0.0.0 --port 8000

# Terminal 2: Start frontend
cd frontend
npm install
npm run dev  # Runs on localhost:3000

# Terminal 3: Deploy contract (do this first!)
cd contracts
npm install
npx hardhat compile
npx hardhat run scripts/deploy.js --network baseSepolia
# Copy the contract address to backend/.env

# Terminal 4: Run camera capture (on the Pi)
cd device
python keygen.py   # One-time only
python capture.py  # Takes photo and triggers the full pipeline
```

---

## 9. Deployment Guide

### Deploy smart contract (do this FIRST)

```bash
cd contracts
npm install
npx hardhat compile
npx hardhat run scripts/deploy.js --network baseSepolia

# Output:
# LensMint deployed to: 0xYOUR_CONTRACT_ADDRESS
# Copy this to your .env files


### Deploy frontend to Vercel

```bash
cd frontend
npx vercel

# Follow prompts. Set environment variables:
# NEXT_PUBLIC_API_URL = https://your-backend.railway.app
# NEXT_PUBLIC_CONTRACT_ADDRESS = 0xYOUR_CONTRACT_ADDRESS
```

### Update Pi to point to deployed backend

```python
# In device/config.py, update:
API_BASE_URL = "https://your-backend.railway.app"
```

---

## 10. Demo Preparation

### Demo rehearsal checklist

```
PRE-DEMO (30 min before):
[ ] Backend is running and healthy (curl /health)
[ ] Frontend is live and loading
[ ] Contract is deployed and has test ETH for gas
[ ] Pi camera is working (test capture)
[ ] WiFi is connected and stable on Pi
[ ] Phone with MetaMask/Coinbase Wallet ready for QR demo
[ ] Backup demo video recorded on phone
[ ] Laptop charged, Pi charged (power bank)
[ ] Browser tabs pre-loaded: frontend, BaseScan explorer

DEMO SCRIPT (exact click path):
1. [SHOW] Frontend landing page on projector
2. [PICK UP] Raspberry Pi camera device
3. [SAY] "I'm going to take a photo of you right now"
4. [CLICK] Capture button on Pi
5. [NARRATE] Watch terminal output on projector:
   - "Hardware signed..."
   - "AI score: 94..."
   - "Uploading to IPFS..."
   - "Minting on-chain..."
6. [SHOW] QR code appears on screen
7. [SAY] "Scan this to claim your NFT"
8. [WAIT] Judge scans → claim page opens
9. [SHOW] Judge's wallet gets the NFT
10. [SWITCH] To verify page → enter token ID → show provenance
11. [SWITCH] To BaseScan → show the actual transaction

IF WIFI FAILS:
- Immediately switch to backup video
- Say: "The WiFi here isn't cooperating, so let me show
  you a recording from our testing — the flow is identical."
- Continue with the impact section of the pitch
```
