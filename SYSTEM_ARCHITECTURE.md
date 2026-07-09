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
    HWID["hardware_identity.py<br/>ed25519 keypair (PyNaCl) from<br/>SHA256(cpu_serial ‖ mac ‖<br/>machine-id ‖ camera_id ‖ salt)<br/>address = base58(pubkey)<br/>salt @ /boot/.device_salt"]
    STREAM["stream_server.py<br/>MJPEG :8081 (optional)"]
    LOC["IP Geolocation<br/>(not GPS hardware)"]
    QR["qrcode lib<br/>Renders claim QR"]
    PICAM -->|"sha256(jpg) → ed25519 sign"| HWID
    PICAM --> LOC
    PICAM --> QR
  end

  %% ==================== HARDWARE-WEB3-SERVICE ====================
  subgraph HWS["⚙️ hardware-web3-service · Node.js Express :5000"]
    direction TB
    SRV["server.js<br/>POST /api/images/upload<br/>POST /api/device/ensure-registered<br/>POST /api/search<br/>GET /api/verify/:claimId"]
    DB1[("better-sqlite3<br/>lensmint.db<br/>tables: images · claims ·<br/>devices · embeddings")]
    W3["solanaService.js<br/>@solana/web3.js + Anchor<br/>→ Solana devnet"]
    FCS["filecoinService.js<br/>@lighthouse-web3/sdk"]
    EMB["embeddingService.js<br/>HTTP client → :5001"]
    CC["claimClient.js<br/>axios → public-server"]
    DEP["deploymentService.js<br/>reads solana-program/deployment.json<br/>+ idl/veris.json"]
    HWK["getHardwareKey.js<br/>reads .device_key_export seed_hex<br/>(or spawns python3 export_key.py)<br/>→ Keypair.fromSeed"]
    POLL{{"setInterval 10s<br/>processEditionRequests()"}}
    SRV --> DB1
    SRV --> W3
    SRV --> FCS
    SRV --> EMB
    SRV --> CC
    W3 --> DEP
    W3 --> HWK
    POLL --> CC
    POLL --> W3
  end

  %% ==================== PUBLIC SERVER ====================
  subgraph PUB["🌐 public-server · Render.com :5001"]
    direction TB
    PSRV["server.js (CommonJS)<br/>POST /create-claim<br/>GET  /claim/:id (inline HTML)<br/>POST /claim/:id/submit<br/>GET  /check-claim<br/>GET  /verify-claim/:id<br/>GET  /get-pending-edition-requests<br/>POST /update-edition-request<br/>GET  /api/metadata/:id (NFT metadata JSON)"]
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
    APP["App.jsx<br/>ConnectionProvider · WalletProvider<br/>(wallet-adapter: Phantom/Solflare)<br/>cluster: devnet"]
    R1["/ → LandingPage"]
    R2["/dashboard → OwnerDashboard"]
    R3["/claim/:claimId → ClaimPage"]
    R4["/search → SearchPage"]
    APP --> R1 & R2 & R3 & R4
  end

  %% ==================== EXTERNAL SERVICES ====================
  subgraph EXT["☁️ EXTERNAL"]
    LH["Lighthouse Gateway<br/>gateway.lighthouse.storage<br/>→ Filecoin/IPFS"]
  end

  %% ==================== SOLANA ====================
  subgraph CHAIN["⛓ Solana Devnet — veris Anchor program"]
    DR["Device + DeviceIdIndex PDAs<br/>register_device · update_device ·<br/>deactivate_device"]
    L11["PhotoRecord + Edition PDAs<br/>mint_photo (requires native ed25519<br/>verify ix — instruction introspection) ·<br/>mint_edition · transfer_photo/edition<br/>PhotoRecord seeded by image_hash (dedupe)"]
    L11 -->|"requires Device.is_active<br/>+ device signer"| DR
  end

  %% ==================== EDGE FLOWS ====================
  PICAM -.->|"multipart POST<br/>/api/images/upload"| SRV
  PICAM -.->|"poll 5s<br/>GET /check-claim"| PSRV
  HWID -.->|"export_key.py · stdout"| HWK

  %% ==================== HWS FLOWS ====================
  FCS -->|"lighthouse.upload(file, apiKey)<br/>+ uploadText(metadata.json)"| LH
  W3 -->|"Connection<br/>SOLANA_RPC_URL"| CHAIN
  CC -->|"axios POST/GET<br/>CLAIM_SERVER_URL"| PSRV
  EMB -->|"HTTP form-data"| AISRV

  %% ==================== USER FLOWS ====================
  USER(("📱 End user phone<br/>scans QR")):::user
  USER -->|"GET /claim/:id"| PSRV
  USER2(("🖼 Owner browser")):::user
  USER2 --> APP
  APP -->|"wallet-adapter tx<br/>+ Anchor account reads"| CHAIN
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
- All on-chain state lives in the single `veris` Anchor program (`solana-program/`) — device registry, photo provenance records, and editions are PDAs; there are no SPL token mints.
- The hardware signature is verified **by the Solana runtime itself**: `mint_photo` requires a native ed25519-program instruction in the same transaction and checks it via instruction introspection.
- `ai-model/` is calibration/diagnostic code only — it is never imported by `hardware-web3-service`.

---

## 2. Device Comparison — Standalone (built) vs. ESP32 Hot-Shoe (spec only)

```mermaid
graph LR
  %% =================================================================
  subgraph BUILT["✅ STANDALONE CAMERA — fully implemented"]
    direction TB
    B_HW["Hardware<br/>━━━━━━━━━━━━━━━<br/>• Raspberry Pi (Pi 4 / Pi 5)<br/>• Picamera2 module (CSI)<br/>• Touchscreen (Kivy fullscreen)<br/>• optional Waveshare UPS HAT<br/>  (smbus2 if available)<br/>• microSD storage"]
    B_SW["Software stack<br/>━━━━━━━━━━━━━━━<br/>• Python 3 / Kivy GUI<br/>• Picamera2 → JPEG @ 1920×1080<br/>• PyNaCl ed25519 + base58<br/>• qrcode for claim display<br/>• requests → BACKEND_URL<br/>• stream_server.py MJPEG (optional)<br/>• systemd: lensmint.service +<br/>  kiosk-start.sh"]
    B_ID["Identity<br/>━━━━━━━━━━━━━━━<br/>seed = SHA256(<br/>  cpu_serial ‖ mac ‖<br/>  /etc/machine-id ‖<br/>  camera_id ‖ salt)<br/>keypair = ed25519(seed)<br/>address = base58(pubkey)<br/>salt: /boot/.device_salt<br/>  (fallback ~/.lensmint/.device_salt_backup)"]
    B_OUT["Outputs<br/>━━━━━━━━━━━━━━━<br/>• 1× JPEG of the scene<br/>• image_hash = sha256<br/>• signature = ed25519(image_hash)<br/>• cameraId, deviceAddress (base58)<br/>• optional lat/lon (IP geo)"]
    B_FLOW["Trigger<br/>━━━━━━━━━━━━━━━<br/>On-screen Kivy button →<br/>POST /api/images/upload<br/>(single-camera capture)"]
    B_HW --> B_SW --> B_ID --> B_OUT --> B_FLOW
  end

  %% =================================================================
  subgraph SPEC["📐 ESP32 HOT-SHOE MOUNT — design spec only<br/>(docs/superpowers/specs/2026-04-04-esp-dual-camera-verification-design.md · no firmware in repo)"]
    direction TB
    E_HW["Hardware (planned)<br/>━━━━━━━━━━━━━━━<br/>• ESP32-CAM or ESP32-S3<br/>• OV2640 ≥2 MP sensor<br/>• Universal hot-shoe foot<br/>• Cable-release pass-through<br/>  (or flash photodiode trigger)<br/>• LiPo + USB-C charger<br/>• RGB status LED"]
    E_SW["Firmware (planned)<br/>━━━━━━━━━━━━━━━<br/>• Trigger ISR (cable / flash)<br/>• ESP32 camera capture<br/>• HMAC / ECDSA device key<br/>• WiFi STA + HTTPS uploader<br/>• OTA + LED state machine"]
    E_ID["Identity (planned)<br/>━━━━━━━━━━━━━━━<br/>per-device hardware key<br/>(eFuse-derived), registered<br/>as its own Device PDA on<br/>the veris program"]
    E_OUT["Outputs (planned)<br/>━━━━━━━━━━━━━━━<br/>• ESP verification JPEG<br/>• ESP image_hash + signature<br/>• capture timestamp ±100 ms"]
    E_FLOW["Trigger (planned)<br/>━━━━━━━━━━━━━━━<br/>DSLR shutter → cable<br/>release split → ESP capture<br/>POST /api/dual-camera/upload<br/>(endpoint not yet in server.js)"]
    E_AI["Server-side check (planned)<br/>━━━━━━━━━━━━━━━<br/>ai-model/main.py ImageVerifier<br/>5-signal fusion on (DSLR, ESP):<br/>  ORB · SSIM-edge · HSV-hist ·<br/>  CLIP-cos · pHash<br/>weighted: 0.10 0.20 0.20 0.30 0.20<br/>+ per-signal floors<br/>authentic ⇔ score ≥ threshold ∧<br/>          no signal below floor"]
    E_HW --> E_SW --> E_ID --> E_OUT --> E_FLOW --> E_AI
  end

  %% =================================================================
  subgraph SHARED["⚙️ SHARED BACKEND (same for both devices)"]
    direction TB
    S1["hardware-web3-service<br/>(Lighthouse upload · Solana mint · SQLite)"]
    S2["public-server<br/>(claim QR page · edition queue)"]
    S3["veris Anchor program<br/>on Solana devnet"]
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
  participant CH as Solana devnet<br/>veris Anchor program
  participant AI as ai-embedding-service<br/>:5001 (FastAPI)
  actor V as 📱 NFT recipient
  actor X as 🔍 reverse-search user

  rect rgb(245,245,255)
  Note over K,CH: ── ONE-TIME BOOT: device registration ──
  K->>HI: get_hardware_identity(camera_id)
  HI->>HI: read /proc/cpuinfo Serial · /sys/class/net/*/address ·<br/>/etc/machine-id · ensure /boot/.device_salt
  HI->>HI: seed = SHA256(hw_id ‖ salt)<br/>keypair = ed25519(seed)<br/>addr = base58(pubkey)
  K->>BE: POST /api/device/ensure-registered<br/>{deviceAddress, deviceId, cameraId,<br/> model, firmwareVersion}
  BE->>CH: fetch Device PDA ["device", pubkey] · is_active?
  alt not registered
    BE->>CH: register_device ix<br/>(inits Device + DeviceIdIndex PDAs)
    CH-->>BE: tx signature · is_active = true
  else registered but inactive
    BE->>CH: update_device(fw, is_active=true) ix
  end
  BE->>DB1: cacheDevice(...)
  BE-->>K: {registered, activated, registrationTx, activationTx}
  end

  rect rgb(255,250,240)
  Note over U,K: ── CAPTURE: shutter click on Kivy UI ──
  U->>K: tap "Capture"
  K->>K: Picamera2 → JPEG (PHOTO_SIZE 1920×1080)
  K->>K: image_hash = sha256(jpeg)
  K->>HI: sign_hash(image_hash) → ed25519 (64-byte sig)
  K->>K: ip-geolocate (best-effort lat/lon/name)
  K->>BE: multipart POST /api/images/upload<br/>file=image · imageHash · signature ·<br/>cameraId · deviceAddress · lat/lon/locName
  end

  rect rgb(240,255,245)
  Note over BE,CH: ── BACKEND PIPELINE (single request, sequential) ──
  BE->>BE: validate mime ∈ {jpeg,png,webp} · size ≤50 MB
  BE->>DB1: INSERT images (status='saved', signature, hash, …)
  BE->>LH: lighthouse.upload(filepath) → image CID
  BE->>BE: build NFT metadata JSON<br/>(name, image=ipfs://CID, attrs:<br/>deviceAddr, deviceId, cameraId,<br/>imageHash, signature, ts)
  BE->>LH: lighthouse.uploadText(metadata) → metadata CID
  BE->>DB1: UPDATE status='uploaded', filecoin_cid, metadata_cid
  BE->>BE: claim_id = uuidv4()
  BE->>PS: POST /create-claim<br/>{claim_id, cid, metadata_cid, device_id,<br/> camera_id, image_hash, signature,<br/> device_address, lat/lon, device_api_url}
  PS->>DB2: INSERT claims (status='pending')
  PS-->>BE: {claim_url = FRONTEND_URL/claim/:id}
  BE->>DB1: createClaim · UPDATE images.claim_id

  Note over BE,CH: original photo record auto-minted, owner = OWNER_WALLET_ADDRESS
  BE->>CH: tx = [ed25519-verify ix (native program:<br/>  device pubkey · image_hash · signature),<br/>  mint_photo ix (device keypair signs)]
  Note right of CH: program introspects the ed25519 ix —<br/>runtime itself verified the hardware sig ·<br/>Device.is_active required ·<br/>PhotoRecord PDA ["photo", image_hash]<br/>(duplicate image → address collision) ·<br/>emits PhotoMinted
  CH-->>BE: tx signature → tokenId = PhotoRecord PDA (base58)
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
  BE->>BE: nacl.sign.detached.verify(image_hash_bytes,<br/>signature, device_pubkey)?
  BE->>CH: fetch Device PDA · is_active?
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
    BE->>BE: validate base58 Solana address
    BE->>PS: POST /update-edition-request status='processing'
    BE->>CH: mint_edition(recipient) ix<br/>(edition PDA = ["edition", photo, count+1])
    Note right of CH: permissionless · requires:<br/>• PhotoRecord exists<br/>• max_editions==0 ∨ count < max_editions<br/>emits EditionMinted
    CH-->>BE: tx signature → Edition PDA (base58)
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
  Note over V,CH: ── OPTIONAL · self-mint from the claim page ──
  Note over V,CH: owner-portal ClaimPage can mint the edition directly<br/>from the recipient's connected wallet (wallet-adapter):<br/>reads PhotoRecord PDA · builds mint_edition via Anchor ·<br/>wallet.sendTransaction — no backend involved
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
