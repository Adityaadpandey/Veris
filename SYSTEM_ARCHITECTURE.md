# Veris / LensMint — System Architecture

Three diagrams, grounded strictly in the current codebase (no speculative components).
Anything not in the running code (e.g. ESP32 hot-shoe firmware, multi-signal AI verifier) is explicitly labeled as such.

---

## 1. Current Production Architecture (as it actually runs today)

```mermaid
graph TB
  %% ==================== EDGE: Standalone Camera ====================
  subgraph EDGE["🎥 STANDALONE CAMERA DEVICE — Raspberry Pi"]
    direction TB
    PICAM["Picamera2<br/>raspberry_pi_camera_app.py<br/>Kivy GUI · 1920×1080 capture"]
    HWID["hardware_identity.py<br/>SECP256k1 keypair from<br/>SHA256(cpu_serial ‖ mac ‖<br/>machine-id ‖ camera_id ‖ salt)<br/>salt @ /boot/.device_salt"]
    STREAM["stream_server.py<br/>MJPEG :8081 (optional)"]
    LOC["IP Geolocation<br/>(not GPS hardware)"]
    QR["qrcode lib<br/>Renders claim QR"]
    PICAM -->|"sha256(jpg) → ECDSA sign"| HWID
    PICAM --> LOC
    PICAM --> QR
  end

  %% ==================== HARDWARE-WEB3-SERVICE ====================
  subgraph HWS["⚙️ hardware-web3-service · Node.js Express :5000"]
    direction TB
    SRV["server.js<br/>POST /api/images/upload<br/>POST /api/device/ensure-registered<br/>POST /api/search<br/>GET /api/verify/:claimId<br/>POST /api/privy/mint-with-signer"]
    DB1[("better-sqlite3<br/>lensmint.db<br/>tables: images · claims ·<br/>devices · embeddings")]
    W3["web3Service.js<br/>ethers v6 → Sepolia"]
    FCS["filecoinService.js<br/>@lighthouse-web3/sdk"]
    EMB["embeddingService.js<br/>HTTP client → :5001"]
    CC["claimClient.js<br/>axios → public-server"]
    PRV["privyService.js<br/>POST api.privy.io/v1<br/>session-signers"]
    DEP["deploymentService.js<br/>reads deployment.json"]
    HWK["getHardwareKey.js<br/>spawns python3 export_key.py<br/>→ extracts device priv key"]
    POLL{{"setInterval 10s<br/>processEditionRequests()"}}
    SRV --> DB1
    SRV --> W3
    SRV --> FCS
    SRV --> EMB
    SRV --> CC
    SRV --> PRV
    W3 --> DEP
    W3 --> HWK
    POLL --> CC
    POLL --> W3
  end

  %% ==================== PUBLIC SERVER ====================
  subgraph PUB["🌐 public-server · Render.com :5001"]
    direction TB
    PSRV["server.js (CommonJS)<br/>POST /create-claim<br/>GET  /claim/:id (inline HTML)<br/>POST /claim/:id/submit<br/>GET  /check-claim<br/>GET  /verify-claim/:id<br/>GET  /get-pending-edition-requests<br/>POST /update-edition-request<br/>GET  /api/metadata/:id (ERC-1155 JSON)"]
    DB2[("better-sqlite3<br/>claims.db<br/>tables: claims · edition_requests")]
    PSRV --> DB2
  end

  %% ==================== AI EMBEDDING SERVICE ====================
  subgraph AIE["🧠 ai-embedding-service · FastAPI :5001"]
    AISRV["main.py<br/>POST /embed<br/>CLIP ViT-B/32 (512-D)<br/>+ pHash 8×8"]
  end

  %% ==================== AI MODEL (NOT INTEGRATED) ====================
  subgraph AIM["🔬 ai-model · STANDALONE RESEARCH CODE"]
    AIMOD["main.py · ImageVerifier<br/>5-signal fusion: ORB · SSIM-edge ·<br/>HSV-hist · CLIP-cos · pHash<br/>weighted sum + per-signal floor<br/>⚠ NOT wired into pipeline"]
  end

  %% ==================== OWNER PORTAL ====================
  subgraph OP["💻 owner-portal · React + Vite"]
    direction TB
    APP["App.jsx<br/>PrivyProvider · WagmiProvider<br/>chain: sepolia"]
    R1["/ → LandingPage"]
    R2["/dashboard → OwnerDashboard"]
    R3["/claim/:claimId → ClaimPage"]
    R4["/search → SearchPage"]
    APP --> R1 & R2 & R3 & R4
  end

  %% ==================== EXTERNAL SERVICES ====================
  subgraph EXT["☁️ EXTERNAL"]
    LH["Lighthouse Gateway<br/>gateway.lighthouse.storage<br/>→ Filecoin/IPFS"]
    PRIVY["Privy<br/>api.privy.io<br/>(embedded wallets +<br/>session signers)"]
  end

  %% ==================== SEPOLIA ====================
  subgraph CHAIN["⛓ Ethereum Sepolia"]
    DR["DeviceRegistry.sol<br/>registerDevice · updateDevice<br/>isDeviceActive · getDevice"]
    L11["LensMintERC1155.sol (ERC-1155 + Ownable)<br/>mintOriginal · mintEdition ·<br/>batchMintEditions · getTokenMetadata<br/>uses DeviceRegistry.isDeviceActive(msg.sender)"]
    L11 -->|"validates msg.sender"| DR
  end

  %% ==================== EDGE FLOWS ====================
  PICAM -.->|"multipart POST<br/>/api/images/upload"| SRV
  PICAM -.->|"poll 5s<br/>GET /check-claim"| PSRV
  HWID -.->|"export_key.py · stdout"| HWK

  %% ==================== HWS FLOWS ====================
  FCS -->|"lighthouse.upload(file, apiKey)<br/>+ uploadText(metadata.json)"| LH
  W3 -->|"JsonRpcProvider<br/>SEPOLIA_RPC_URL"| CHAIN
  CC -->|"axios POST/GET<br/>CLAIM_SERVER_URL"| PSRV
  EMB -->|"HTTP form-data"| AISRV
  PRV -->|"REST + Bearer"| PRIVY

  %% ==================== USER FLOWS ====================
  USER(("📱 End user phone<br/>scans QR")):::user
  USER -->|"GET /claim/:id"| PSRV
  USER2(("🖼 Owner browser")):::user
  USER2 --> APP
  APP -->|"Wagmi viem<br/>+ Privy"| CHAIN
  APP -->|"Privy embedded wallet"| PRIVY
  APP -->|"img upload"| SRV

  %% ==================== VERIFY-CLAIM CALLBACK ====================
  PSRV -.->|"GET /api/verify/:claimId<br/>(if device_api_url set)"| SRV

  classDef user fill:#fef3c7,stroke:#92400e,color:#78350f
  classDef offline fill:#fee2e2,stroke:#991b1b,color:#7f1d1d,stroke-dasharray:5 5
  class AIM offline
```

**Truth notes for this diagram:**
- Both `hardware-web3-service` and `ai-embedding-service` default to port `5001`. In practice the embedding service is overridden via `EMBEDDING_SERVICE_URL`, and the public-server runs on Render so collisions are ignored.
- "Filecoin storage" means Lighthouse IPFS — no Synapse SDK, no direct Filecoin deal-making in code.
- No ZK proofs / vlayer / RISC-Zero contract code exists in this repo — only `DeviceRegistry` + `LensMintERC1155`.
- `ai-model/` is calibration/diagnostic code only — it is never imported by `hardware-web3-service`.

---

## 2. Device Comparison — Standalone (built) vs. ESP32 Hot-Shoe (spec only)

```mermaid
graph LR
  %% =================================================================
  subgraph BUILT["✅ STANDALONE CAMERA — fully implemented"]
    direction TB
    B_HW["Hardware<br/>━━━━━━━━━━━━━━━<br/>• Raspberry Pi (Pi 4 / Pi 5)<br/>• Picamera2 module (CSI)<br/>• Touchscreen (Kivy fullscreen)<br/>• optional Waveshare UPS HAT<br/>  (smbus2 if available)<br/>• microSD storage"]
    B_SW["Software stack<br/>━━━━━━━━━━━━━━━<br/>• Python 3 / Kivy GUI<br/>• Picamera2 → JPEG @ 1920×1080<br/>• ecdsa SECP256k1 + pysha3 keccak<br/>• qrcode for claim display<br/>• requests → BACKEND_URL<br/>• stream_server.py MJPEG (optional)<br/>• systemd: lensmint.service +<br/>  kiosk-start.sh"]
    B_ID["Identity<br/>━━━━━━━━━━━━━━━<br/>private = SHA256(<br/>  cpu_serial ‖ mac ‖<br/>  /etc/machine-id ‖<br/>  camera_id ‖ salt)<br/>address = keccak256(pub)[-20:]<br/>salt: /boot/.device_salt<br/>  (fallback ~/.lensmint/.device_salt_backup)"]
    B_OUT["Outputs<br/>━━━━━━━━━━━━━━━<br/>• 1× JPEG of the scene<br/>• image_hash = sha256<br/>• signature = ECDSA(image_hash)<br/>• cameraId, deviceAddress<br/>• optional lat/lon (IP geo)"]
    B_FLOW["Trigger<br/>━━━━━━━━━━━━━━━<br/>On-screen Kivy button →<br/>POST /api/images/upload<br/>(single-camera capture)"]
    B_HW --> B_SW --> B_ID --> B_OUT --> B_FLOW
  end

  %% =================================================================
  subgraph SPEC["📐 ESP32 HOT-SHOE MOUNT — design spec only<br/>(docs/superpowers/specs/2026-04-04-esp-dual-camera-verification-design.md · no firmware in repo)"]
    direction TB
    E_HW["Hardware (planned)<br/>━━━━━━━━━━━━━━━<br/>• ESP32-CAM or ESP32-S3<br/>• OV2640 ≥2 MP sensor<br/>• Universal hot-shoe foot<br/>• Cable-release pass-through<br/>  (or flash photodiode trigger)<br/>• LiPo + USB-C charger<br/>• RGB status LED"]
    E_SW["Firmware (planned)<br/>━━━━━━━━━━━━━━━<br/>• Trigger ISR (cable / flash)<br/>• ESP32 camera capture<br/>• HMAC / ECDSA device key<br/>• WiFi STA + HTTPS uploader<br/>• OTA + LED state machine"]
    E_ID["Identity (planned)<br/>━━━━━━━━━━━━━━━<br/>per-device hardware key<br/>(eFuse-derived), registered<br/>against a separate role on<br/>DeviceRegistry"]
    E_OUT["Outputs (planned)<br/>━━━━━━━━━━━━━━━<br/>• ESP verification JPEG<br/>• ESP image_hash + signature<br/>• capture timestamp ±100 ms"]
    E_FLOW["Trigger (planned)<br/>━━━━━━━━━━━━━━━<br/>DSLR shutter → cable<br/>release split → ESP capture<br/>POST /api/dual-camera/upload<br/>(endpoint not yet in server.js)"]
    E_AI["Server-side check (planned)<br/>━━━━━━━━━━━━━━━<br/>ai-model/main.py ImageVerifier<br/>5-signal fusion on (DSLR, ESP):<br/>  ORB · SSIM-edge · HSV-hist ·<br/>  CLIP-cos · pHash<br/>weighted: 0.10 0.20 0.20 0.30 0.20<br/>+ per-signal floors<br/>authentic ⇔ score ≥ threshold ∧<br/>          no signal below floor"]
    E_HW --> E_SW --> E_ID --> E_OUT --> E_FLOW --> E_AI
  end

  %% =================================================================
  subgraph SHARED["⚙️ SHARED BACKEND (same for both devices)"]
    direction TB
    S1["hardware-web3-service<br/>(Lighthouse upload · Sepolia mint · SQLite)"]
    S2["public-server<br/>(claim QR page · edition queue)"]
    S3["DeviceRegistry + LensMintERC1155<br/>on Sepolia"]
    S4["ai-embedding-service<br/>CLIP+pHash for reverse search"]
    S1 --> S2
    S1 --> S3
    S1 --> S4
  end

  BUILT --> SHARED
  SPEC -. proposed extension .-> SHARED

  classDef built fill:#dcfce7,stroke:#15803d,color:#14532d
  classDef spec fill:#fef3c7,stroke:#a16207,color:#713f12,stroke-dasharray:6 4
  classDef shared fill:#e0e7ff,stroke:#3730a3,color:#1e1b4b
  class BUILT,B_HW,B_SW,B_ID,B_OUT,B_FLOW built
  class SPEC,E_HW,E_SW,E_ID,E_OUT,E_FLOW,E_AI spec
  class SHARED,S1,S2,S3,S4 shared
```

---

## 3. End-to-End Flow — Shutter Click → Wallet → AI Check

```mermaid
sequenceDiagram
  autonumber
  actor U as 📷 Photographer
  participant K as Kivy app<br/>(raspberry_pi_camera_app.py)
  participant HI as hardware_identity.py
  participant BE as hardware-web3-service<br/>:5000 (server.js)
  participant DB1 as lensmint.db<br/>(SQLite)
  participant LH as Lighthouse<br/>(IPFS/Filecoin)
  participant PS as public-server<br/>(Render)
  participant DB2 as claims.db<br/>(SQLite)
  participant CH as Sepolia<br/>DeviceRegistry +<br/>LensMintERC1155
  participant AI as ai-embedding-service<br/>:5001 (FastAPI)
  actor V as 📱 NFT recipient
  actor X as 🔍 reverse-search user

  rect rgb(245,245,255)
  Note over K,CH: ── ONE-TIME BOOT: device registration ──
  K->>HI: get_hardware_identity(camera_id)
  HI->>HI: read /proc/cpuinfo Serial · /sys/class/net/*/address ·<br/>/etc/machine-id · ensure /boot/.device_salt
  HI->>HI: priv = SECP256k1(SHA256(hw_id ‖ salt))<br/>addr = "0x" + keccak256(pub)[-20:].hex()
  K->>BE: POST /api/device/ensure-registered<br/>{deviceAddress, publicKey, deviceId, cameraId,<br/> model, firmwareVersion}
  BE->>CH: deviceRegistry.isDeviceActive(addr)
  alt not registered
    BE->>CH: deviceRegistry.registerDevice(...)
    CH-->>BE: tx hash · isActive = true
  else registered but inactive
    BE->>CH: deviceRegistry.updateDevice(addr, fw, true)
  end
  BE->>DB1: cacheDevice(...)
  BE-->>K: {registered, activated, registrationTx, activationTx}
  end

  rect rgb(255,250,240)
  Note over U,K: ── CAPTURE: shutter click on Kivy UI ──
  U->>K: tap "Capture"
  K->>K: Picamera2 → JPEG (PHOTO_SIZE 1920×1080)
  K->>K: image_hash = sha256(jpeg)
  K->>HI: sign_hash(image_hash) → ECDSA secp256k1
  K->>K: ip-geolocate (best-effort lat/lon/name)
  K->>BE: multipart POST /api/images/upload<br/>file=image · imageHash · signature ·<br/>cameraId · deviceAddress · lat/lon/locName
  end

  rect rgb(240,255,245)
  Note over BE,CH: ── BACKEND PIPELINE (single request, sequential) ──
  BE->>BE: validate mime ∈ {jpeg,png,webp} · size ≤50 MB
  BE->>DB1: INSERT images (status='saved', signature, hash, …)
  BE->>LH: lighthouse.upload(filepath) → image CID
  BE->>BE: build ERC-1155 metadata JSON<br/>(name, image=ipfs://CID, attrs:<br/>deviceAddr, deviceId, cameraId,<br/>imageHash, signature, ts)
  BE->>LH: lighthouse.uploadText(metadata) → metadata CID
  BE->>DB1: UPDATE status='uploaded', filecoin_cid, metadata_cid
  BE->>BE: claim_id = uuidv4()
  BE->>PS: POST /create-claim<br/>{claim_id, cid, metadata_cid, device_id,<br/> camera_id, image_hash, signature,<br/> device_address, lat/lon, device_api_url}
  PS->>DB2: INSERT claims (status='pending')
  PS-->>BE: {claim_url = FRONTEND_URL/claim/:id}
  BE->>DB1: createClaim · UPDATE images.claim_id

  Note over BE,CH: original NFT auto-minted to OWNER_WALLET_ADDRESS
  BE->>CH: lensMint.mintOriginal(<br/>  to=OWNER_WALLET, ipfsHash, imageHash,<br/>  signature, maxEditions=0)<br/>(EIP-1559 fee +20 % gas bump)
  Note right of CH: contract checks<br/>deviceRegistry.isDeviceActive(msg.sender)<br/>tokenId = ++totalTokens<br/>emits TokenMinted
  CH-->>BE: receipt → parse TokenMinted → tokenId
  BE->>DB1: status='minted' · token_id · tx_hash
  BE->>PS: POST /update-claim-status<br/>status='open', token_id, tx_hash
  PS->>DB2: UPDATE claims status='open'
  end

  rect rgb(245,240,255)
  Note over BE,AI: ── AI INDEXING (reverse-search hook) ──
  BE->>AI: POST /embed (multipart image)
  AI->>AI: CLIP ViT-B/32 → 512-D L2-normalized vector
  AI->>AI: imagehash.phash(img, 8) → hex
  AI-->>BE: {clip:[…512 floats], phash:"…"}
  BE->>DB1: INSERT embeddings (token_id, clip, phash,<br/>  wallet=OWNER_WALLET, device_id, image_cid, ts)
  BE-->>K: {imageId, claimId, claimUrl, qrCodeUrl,<br/>           filecoinCid, metadataCid}
  K->>K: qrcode.make(claim_url) → display on touchscreen
  end

  rect rgb(255,245,250)
  Note over V,CH: ── EDITION CLAIM (recipient via QR) ──
  V->>PS: scan QR · GET /claim/:claim_id (server-rendered HTML)
  PS-->>V: claim page · NFT preview (lighthouse → ipfs.io → cloudflare-ipfs → dweb.link fallback)
  V->>PS: page polls every 5 s · GET /verify-claim/:id
  PS->>BE: GET {device_api_url}/api/verify/:claimId
  BE->>BE: ethers.verifyMessage(image_hash, signature) == device_address?
  BE->>CH: deviceRegistry.isDeviceActive(device_address)
  BE-->>PS: {checks:{imageFound, signatureValid, deviceRegistered, nftMinted}, verified}
  PS-->>V: render verification badge

  V->>PS: POST /claim/:id/submit {wallet_address}
  PS->>DB2: INSERT edition_requests (status='pending')
  end

  rect rgb(240,250,255)
  Note over BE,CH: ── EDITION MINT WORKER (10 s loop in server.js) ──
  loop every 10 s
    BE->>PS: GET /get-pending-edition-requests?limit=50
    PS->>DB2: SELECT … WHERE status='pending'<br/>      AND claims.status='open' AND token_id NOT NULL
    PS-->>BE: edition_requests[]
    BE->>BE: validate addr 0x… (42 chars)<br/>+ ethers.getAddress checksum
    BE->>PS: POST /update-edition-request status='processing'
    BE->>CH: lensMint.mintEdition(recipient, originalTokenId)
    Note right of CH: requires:<br/>• deviceRegistry.isDeviceActive(msg.sender)<br/>• original.isOriginal == true<br/>• maxEditions==0 ∨ count < maxEditions<br/>emits EditionMinted
    CH-->>BE: receipt → parse EditionMinted → editionTokenId
    BE->>PS: POST /update-edition-request<br/>status='completed' · tx_hash · token_id
    Note over PS,V: claim page poll picks up new status<br/>→ "NFT Minted!"
  end
  end

  rect rgb(252,247,235)
  Note over X,DB1: ── AI CHECK · reverse image search ──
  X->>BE: POST /api/search (multipart image)
  BE->>AI: GET /health (must be 200)
  BE->>AI: POST /embed → {clip, phash}
  BE->>DB1: SELECT * FROM embeddings
  loop for each row
    BE->>BE: clipSim = cosine(query.clip, row.clip)<br/>phashSim = 1 − hamming(phash)/len<br/>score = round(0.7·clipSim + 0.3·phashSim, 2)
  end
  BE->>BE: filter score ≥ 0.60 · sort desc · top 5
  BE-->>X: results[]<br/>{similarity, token_id, wallet_address,<br/> device_id, image_cid, minted_at}
  end

  rect rgb(245,245,245)
  Note over BE,CH: ── OPTIONAL · gas-sponsored mint via Privy ──
  Note over BE,CH: POST /api/privy/mint-with-signer<br/>encodes mintOriginal calldata via ethers.Interface,<br/>POSTs to api.privy.io/v1/apps/{id}/session-signers/{sid}/transactions<br/>with {gasSponsorship:{enabled:true, policy:'sponsor-all'}}<br/>(used by owner-portal flows that hold a Privy session signer)
  end
```

---

### Legend & ground rules used to build these diagrams

| Symbol / style | Meaning |
|---|---|
| Solid box, green | Code that exists and runs in this repo |
| Dashed border, amber | Specified in `docs/superpowers/specs/` but no implementation in repo |
| Red dashed | Code present but not wired into the live pipeline (`ai-model/`) |
| Numbered sequence | Exact order of operations in `server.js` upload handler |
| “poll Ns” | Real interval values from source (`CLAIM_POLL_INTERVAL=5`, edition poll = 10000 ms) |
