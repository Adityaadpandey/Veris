# Veris System Architecture - Detailed Diagrams

## 1. Current System Architecture (Standalone Device + ESP32 Hotshoe Mount)

### 1.1 Hardware Architecture

```mermaid
graph TB
    subgraph "Standalone Device - Raspberry Pi 4"
        RPI[Raspberry Pi 4<br/>4GB RAM]
        CAM[Camera Module v3<br/>12MP Sensor]
        TOUCH[3.5 Touchscreen<br/>480x320 Display]
        STORAGE[MicroSD Card<br/>32GB Storage]
        POWER[UPS HAT<br/>Battery Backup]
        
        RPI --> CAM
        RPI --> TOUCH
        RPI --> STORAGE
        POWER --> RPI
    end
    
    subgraph "ESP32 Hotshoe Mount (Future)"
        ESP32[ESP32-CAM<br/>WiFi/BT Module]
        ESPCAM[OV2640 Camera<br/>2MP Sensor]
        HOTSHOE[Hotshoe Mount<br/>Physical Connector]
        ESPBAT[LiPo Battery<br/>3.7V 1000mAh]
        
        ESP32 --> ESPCAM
        HOTSHOE --> ESP32
        ESPBAT --> ESP32
    end
    
    RPI --->|WiFi/BT| ESP32
    
    style RPI fill:#4a90e2
    style ESP32 fill:#e24a4a
```

### 1.2 Software Stack - Standalone Device

```mermaid
graph TB
    subgraph "Application Layer"
        KIVY[Kivy Camera App<br/>Python 3.9+<br/>raspberry_pi_camera_app.py]
        UI[Touch UI<br/>Live Preview<br/>Gallery<br/>QR Display]
    end
    
    subgraph "Hardware Interface Layer"
        PICAM[Picamera2<br/>Camera Control]
        HWID[Hardware Identity<br/>Cryptographic Keys<br/>hardware_identity.py]
        GPIO[GPIO Control<br/>Battery Monitor]
    end
    
    subgraph "System Layer"
        OS[Raspberry Pi OS<br/>Bullseye/Bookworm]
        KERNEL[Linux Kernel<br/>Camera Drivers]
    end
    
    KIVY --> UI
    KIVY --> PICAM
    KIVY --> HWID
    KIVY --> GPIO
    PICAM --> KERNEL
    HWID --> OS
    GPIO --> KERNEL
    
    style KIVY fill:#50c878
    style HWID fill:#ffa500
```

## 2. Complete System Flow - Photo Capture to Wallet

### 2.1 Detailed Photo Capture Flow

```mermaid
sequenceDiagram
    participant User
    participant CameraApp as Camera App<br/>(Raspberry Pi)
    participant HWIdentity as Hardware Identity<br/>(Crypto Module)
    participant Web3Service as Hardware Web3 Service<br/>(Node.js Backend)
    participant Filecoin as Filecoin Network<br/>(Lighthouse/Synapse)
    participant PublicServer as Public Server<br/>(Claim Management)
    participant Blockchain as Ethereum Sepolia<br/>(Smart Contracts)
    
    User->>CameraApp: 1. Press Capture Button
    activate CameraApp
    
    CameraApp->>CameraApp: 2. Capture Image (1920x1080)
    CameraApp->>CameraApp: 3. Save to Local Storage
    
    CameraApp->>HWIdentity: 4. Request Hardware Signature
    activate HWIdentity
    HWIdentity->>HWIdentity: 5. Derive Private Key from Hardware
    HWIdentity->>HWIdentity: 6. Compute SHA256 Hash of Image
    HWIdentity->>HWIdentity: 7. Sign Hash with Private Key
    HWIdentity-->>CameraApp: 8. Return Signature + Hash
    deactivate HWIdentity
    
    CameraApp->>Web3Service: 9. POST /api/images/upload<br/>(image, hash, signature, cameraId, deviceAddress)
    activate Web3Service
    
    Web3Service->>Web3Service: 10. Validate Image (type, size)
    Web3Service->>Web3Service: 11. Save to Captures Directory
    Web3Service->>Web3Service: 12. Store in SQLite Database
    
    Web3Service->>Filecoin: 13. Upload Image
    activate Filecoin
    Filecoin-->>Web3Service: 14. Return Image CID
    deactivate Filecoin
    
    Web3Service->>Web3Service: 15. Create Metadata JSON<br/>(name, description, imageCid, deviceAddress, etc.)
    
    Web3Service->>Filecoin: 16. Upload Metadata
    activate Filecoin
    Filecoin-->>Web3Service: 17. Return Metadata CID
    deactivate Filecoin
    
    Web3Service->>Web3Service: 18. Generate Unique Claim ID (UUID)
    
    Web3Service->>PublicServer: 19. POST /api/claims/create<br/>(claimId, imageCid, metadataCid, deviceId, etc.)
    activate PublicServer
    PublicServer->>PublicServer: 20. Store Claim in SQLite
    PublicServer->>PublicServer: 21. Generate QR Code URL
    PublicServer-->>Web3Service: 22. Return Claim URL
    deactivate PublicServer
    
    Web3Service->>Blockchain: 23. Mint Original NFT to Owner Wallet<br/>mintOriginal(ownerAddress, ipfsHash, imageHash, signature, maxEditions=0)
    activate Blockchain
    Blockchain->>Blockchain: 24. Verify Device is Registered & Active
    Blockchain->>Blockchain: 25. Create ERC-1155 Token
    Blockchain->>Blockchain: 26. Store Metadata On-Chain
    Blockchain-->>Web3Service: 27. Return Token ID + TX Hash
    deactivate Blockchain
    
    Web3Service->>PublicServer: 28. Update Claim Status<br/>(status='open', tokenId, txHash)
    activate PublicServer
    PublicServer->>PublicServer: 29. Mark Claim as Open for Editions
    deactivate PublicServer
    
    Web3Service->>Web3Service: 30. Generate AI Embedding (CLIP + pHash)
    Web3Service->>Web3Service: 31. Store Embedding in Database
    
    Web3Service-->>CameraApp: 32. Return Response<br/>(imageId, claimId, claimUrl, tokenId, txHash)
    deactivate Web3Service
    
    CameraApp->>CameraApp: 33. Generate QR Code from Claim URL
    CameraApp->>User: 34. Display QR Code on Screen
    deactivate CameraApp
```

### 2.2 User Claim & Edition Minting Flow

```mermaid
sequenceDiagram
    participant User
    participant Mobile as User's Mobile<br/>(QR Scanner)
    participant PublicServer as Public Server<br/>(Claim Management)
    participant CameraApp as Camera App<br/>(Polling)
    participant Web3Service as Hardware Web3 Service<br/>(Minting)
    participant Blockchain as Ethereum Sepolia<br/>(Smart Contracts)
    
    User->>Mobile: 1. Scan QR Code
    Mobile->>PublicServer: 2. GET /claim/{claimId}
    activate PublicServer
    PublicServer-->>Mobile: 3. Return Claim Page (HTML)
    deactivate PublicServer
    
    User->>Mobile: 4. Enter Wallet Address
    Mobile->>PublicServer: 5. POST /api/claims/{claimId}/address<br/>(walletAddress)
    activate PublicServer
    PublicServer->>PublicServer: 6. Validate Wallet Address
    PublicServer->>PublicServer: 7. Store Address in Claim Record
    PublicServer->>PublicServer: 8. Create Edition Request<br/>(status='pending')
    PublicServer-->>Mobile: 9. Return Success
    deactivate PublicServer
    
    Mobile->>User: 10. Show "Minting in Progress..."
    
    Note over CameraApp,Web3Service: Camera App Polls Every 5 Seconds
    
    loop Every 5 Seconds
        CameraApp->>PublicServer: 11. GET /api/claims/{claimId}/status
        activate PublicServer
        PublicServer-->>CameraApp: 12. Return Status<br/>(walletAddress if available)
        deactivate PublicServer
    end
    
    CameraApp->>CameraApp: 13. Detect Wallet Address Available
    
    CameraApp->>Web3Service: 14. POST /api/mint/edition<br/>(claimId, walletAddress)
    activate Web3Service
    
    Note over Web3Service: Background Polling Process (Every 10s)
    
    Web3Service->>PublicServer: 15. GET /api/edition-requests/pending
    activate PublicServer
    PublicServer-->>Web3Service: 16. Return Pending Requests
    deactivate PublicServer
    
    Web3Service->>PublicServer: 17. Update Request Status<br/>(status='processing')
    
    Web3Service->>Blockchain: 18. Call mintEdition(walletAddress, originalTokenId)
    activate Blockchain
    Blockchain->>Blockchain: 19. Verify Device is Active
    Blockchain->>Blockchain: 20. Verify Original Token Exists
    Blockchain->>Blockchain: 21. Check Edition Limits
    Blockchain->>Blockchain: 22. Mint Edition NFT
    Blockchain->>Blockchain: 23. Transfer to User Wallet
    Blockchain-->>Web3Service: 24. Return Edition Token ID + TX Hash
    deactivate Blockchain
    
    Web3Service->>PublicServer: 25. Update Edition Request<br/>(status='completed', tokenId, txHash)
    activate PublicServer
    PublicServer->>PublicServer: 26. Mark Request as Complete
    deactivate PublicServer
    
    Web3Service-->>CameraApp: 27. Return Mint Success
    deactivate Web3Service
    
    CameraApp->>User: 28. Display Success Message<br/>"NFT Minted!"
    
    Mobile->>PublicServer: 29. Poll for Status
    activate PublicServer
    PublicServer-->>Mobile: 30. Return Completed Status<br/>(tokenId, txHash)
    deactivate PublicServer
    
    Mobile->>User: 31. Show Success + View on Etherscan Link
```

## 3. Device Registration & Authentication Flow

```mermaid
sequenceDiagram
    participant Device as Raspberry Pi Device
    participant HWIdentity as Hardware Identity Module
    participant Web3Service as Hardware Web3 Service
    participant Blockchain as DeviceRegistry Contract<br/>(Ethereum)
    
    Device->>Device: 1. Boot Up / First Run
    
    Device->>HWIdentity: 2. Initialize Hardware Identity
    activate HWIdentity
    HWIdentity->>HWIdentity: 3. Read CPU Serial Number
    HWIdentity->>HWIdentity: 4. Read MAC Address
    HWIdentity->>HWIdentity: 5. Get/Create Salt (stored locally)
    HWIdentity->>HWIdentity: 6. Derive Private Key<br/>PBKDF2(hardware_id + salt)
    HWIdentity->>HWIdentity: 7. Generate Public Key
    HWIdentity->>HWIdentity: 8. Derive Ethereum Address
    HWIdentity->>HWIdentity: 9. Extract Camera ID (if available)
    HWIdentity-->>Device: 10. Return Identity<br/>(address, publicKey, deviceId, cameraId)
    deactivate HWIdentity
    
    Device->>Web3Service: 11. POST /api/device/ensure-registered<br/>(deviceAddress, publicKey, deviceId, cameraId)
    activate Web3Service
    
    Web3Service->>Blockchain: 12. Check isDeviceActive(deviceAddress)
    activate Blockchain
    Blockchain-->>Web3Service: 13. Return Active Status
    deactivate Blockchain
    
    alt Device is Active
        Web3Service-->>Device: 14a. Return Success (already registered)
    else Device Not Registered
        Web3Service->>Blockchain: 14b. Call registerDevice()<br/>(deviceAddress, publicKey, deviceId, cameraId, model, firmware)
        activate Blockchain
        Blockchain->>Blockchain: 15. Validate Parameters
        Blockchain->>Blockchain: 16. Check Not Already Registered
        Blockchain->>Blockchain: 17. Store Device Info
        Blockchain->>Blockchain: 18. Set isActive = true
        Blockchain->>Blockchain: 19. Emit DeviceRegistered Event
        Blockchain-->>Web3Service: 20. Return TX Hash
        deactivate Blockchain
        Web3Service-->>Device: 21. Return Success (newly registered)
    else Device Registered but Inactive
        Web3Service->>Blockchain: 14c. Call updateDevice()<br/>(deviceAddress, firmware, isActive=true)
        activate Blockchain
        Blockchain->>Blockchain: 15. Verify Device Exists
        Blockchain->>Blockchain: 16. Update isActive = true
        Blockchain->>Blockchain: 17. Emit DeviceUpdated Event
        Blockchain-->>Web3Service: 18. Return TX Hash
        deactivate Blockchain
        Web3Service-->>Device: 19. Return Success (activated)
    end
    
    deactivate Web3Service
    
    Device->>Device: 22. Cache Registration Status
    Device->>Device: 23. Ready for Photo Capture
```

## 4. Scaled Architecture (Multiple Devices)

```mermaid
graph TB
    subgraph "Edge Devices Layer"
        DEV1[Raspberry Pi Device 1<br/>Camera + Identity]
        DEV2[Raspberry Pi Device 2<br/>Camera + Identity]
        DEV3[Raspberry Pi Device 3<br/>Camera + Identity]
        ESP1[ESP32 Hotshoe 1<br/>DSLR Mount]
        ESP2[ESP32 Hotshoe 2<br/>DSLR Mount]
    end
    
    subgraph "Backend Services Layer"
        LB[Load Balancer<br/>NGINX/HAProxy]
        
        subgraph "Web3 Service Cluster"
            WEB3_1[Hardware Web3 Service 1<br/>Node.js + Express]
            WEB3_2[Hardware Web3 Service 2<br/>Node.js + Express]
            WEB3_3[Hardware Web3 Service 3<br/>Node.js + Express]
        end
        
        subgraph "Public Server Cluster"
            PUB1[Public Server 1<br/>Claim Management]
            PUB2[Public Server 2<br/>Claim Management]
        end
        
        subgraph "AI Services"
            AI1[AI Embedding Service 1<br/>CLIP + pHash]
            AI2[AI Embedding Service 2<br/>CLIP + pHash]
        end
    end
    
    subgraph "Data Layer"
        subgraph "Database Cluster"
            DB_PRIMARY[(PostgreSQL Primary<br/>Images + Claims + Embeddings)]
            DB_REPLICA1[(PostgreSQL Replica 1)]
            DB_REPLICA2[(PostgreSQL Replica 2)]
        end
        
        REDIS[(Redis Cache<br/>Session + Status)]
        
        subgraph "Storage"
            S3[S3/MinIO<br/>Local Image Cache]
        end
    end
    
    subgraph "Blockchain Layer"
        RPC1[RPC Node 1<br/>Alchemy/Infura]
        RPC2[RPC Node 2<br/>Backup]
        
        SEPOLIA[Ethereum Sepolia<br/>Smart Contracts]
    end
    
    subgraph "Decentralized Storage"
        LIGHTHOUSE[Lighthouse<br/>Filecoin Gateway]
        FILECOIN[Filecoin Network<br/>Permanent Storage]
    end
    
    DEV1 --> LB
    DEV2 --> LB
    DEV3 --> LB
    ESP1 -.-> DEV1
    ESP2 -.-> DEV2
    
    LB --> WEB3_1
    LB --> WEB3_2
    LB --> WEB3_3
    
    WEB3_1 --> PUB1
    WEB3_2 --> PUB2
    WEB3_3 --> PUB1
    
    WEB3_1 --> AI1
    WEB3_2 --> AI2
    WEB3_3 --> AI1
    
    WEB3_1 --> DB_PRIMARY
    WEB3_2 --> DB_PRIMARY
    WEB3_3 --> DB_PRIMARY
    
    DB_PRIMARY --> DB_REPLICA1
    DB_PRIMARY --> DB_REPLICA2
    
    WEB3_1 --> REDIS
    WEB3_2 --> REDIS
    WEB3_3 --> REDIS
    
    WEB3_1 --> S3
    WEB3_2 --> S3
    WEB3_3 --> S3
    
    WEB3_1 --> RPC1
    WEB3_2 --> RPC2
    WEB3_3 --> RPC1
    
    RPC1 --> SEPOLIA
    RPC2 --> SEPOLIA
    
    WEB3_1 --> LIGHTHOUSE
    WEB3_2 --> LIGHTHOUSE
    WEB3_3 --> LIGHTHOUSE
    
    LIGHTHOUSE --> FILECOIN
    
    style DEV1 fill:#4a90e2
    style DEV2 fill:#4a90e2
    style DEV3 fill:#4a90e2
    style ESP1 fill:#e24a4a
    style ESP2 fill:#e24a4a
    style DB_PRIMARY fill:#50c878
    style SEPOLIA fill:#9b59b6
    style FILECOIN fill:#e67e22
```

## 5. Data Flow - Complete Journey

```mermaid
graph LR
    subgraph "1. Capture"
        A1[User Presses Button]
        A2[Camera Captures Image]
        A3[Hardware Signs Image]
    end
    
    subgraph "2. Upload"
        B1[Upload to Backend]
        B2[Save to Local Storage]
        B3[Store in Database]
    end
    
    subgraph "3. Filecoin Storage"
        C1[Upload Image to Filecoin]
        C2[Get Image CID]
        C3[Create Metadata JSON]
        C4[Upload Metadata]
        C5[Get Metadata CID]
    end
    
    subgraph "4. Claim Creation"
        D1[Generate Claim ID]
        D2[Create Claim Record]
        D3[Generate QR Code URL]
    end
    
    subgraph "5. Original NFT Mint"
        E1[Mint to Owner Wallet]
        E2[Verify Device Active]
        E3[Create ERC-1155 Token]
        E4[Store On-Chain Metadata]
        E5[Return Token ID]
    end
    
    subgraph "6. AI Processing"
        F1[Generate CLIP Embedding]
        F2[Generate pHash]
        F3[Store in Database]
    end
    
    subgraph "7. Display QR"
        G1[Return to Camera App]
        G2[Generate QR Code]
        G3[Display on Screen]
    end
    
    subgraph "8. User Claim"
        H1[User Scans QR]
        H2[Enter Wallet Address]
        H3[Create Edition Request]
    end
    
    subgraph "9. Edition Mint"
        I1[Backend Polls Requests]
        I2[Mint Edition NFT]
        I3[Transfer to User]
        I4[Update Status]
    end
    
    subgraph "10. Completion"
        J1[User Receives NFT]
        J2[View on Etherscan]
        J3[NFT in Wallet]
    end
    
    A1 --> A2 --> A3
    A3 --> B1 --> B2 --> B3
    B3 --> C1 --> C2 --> C3 --> C4 --> C5
    C5 --> D1 --> D2 --> D3
    D3 --> E1 --> E2 --> E3 --> E4 --> E5
    E5 --> F1 --> F2 --> F3
    F3 --> G1 --> G2 --> G3
    G3 --> H1 --> H2 --> H3
    H3 --> I1 --> I2 --> I3 --> I4
    I4 --> J1 --> J2 --> J3
    
    style A1 fill:#4a90e2
    style E3 fill:#9b59b6
    style C1 fill:#e67e22
    style J3 fill:#50c878
```

## 6. Smart Contract Architecture

```mermaid
classDiagram
    class DeviceRegistry {
        +mapping devices
        +address[] registeredDevices
        +registerDevice()
        +updateDevice()
        +deactivateDevice()
        +isDeviceActive()
        +getDevice()
        +getDeviceByDeviceId()
    }
    
    class LensMintERC1155 {
        +DeviceRegistry deviceRegistry
        +mapping tokenMetadata
        +mapping editionCount
        +uint256 totalTokens
        +mintOriginal()
        +mintEdition()
        +batchMintEditions()
        +getTokenMetadata()
        +getEditionCount()
        +canDeviceMint()
    }
    
    class VerisVerifier {
        +verifyProof()
        +verifyImageAuthenticity()
        +verifyDeviceSignature()
    }
    
    class DeviceInfo {
        +address deviceAddress
        +string publicKey
        +string deviceId
        +string cameraId
        +string model
        +string firmwareVersion
        +uint256 registrationTime
        +bool isActive
        +address registeredBy
    }
    
    class TokenMetadata {
        +address deviceAddress
        +string deviceId
        +string ipfsHash
        +string imageHash
        +string signature
        +uint256 timestamp
        +uint256 maxEditions
        +bool isOriginal
        +uint256 originalTokenId
    }
    
    LensMintERC1155 --> DeviceRegistry : validates device
    LensMintERC1155 --> VerisVerifier : verifies proofs
    DeviceRegistry --> DeviceInfo : stores
    LensMintERC1155 --> TokenMetadata : stores
```

## 7. Component Interaction Matrix

```mermaid
graph TB
    subgraph "Frontend Components"
        CAMERA[Camera App<br/>Kivy/Python]
        OWNER[Owner Portal<br/>React/Vite]
        CLAIM[Claim Page<br/>HTML/JS]
    end
    
    subgraph "Backend Services"
        WEB3[Hardware Web3 Service<br/>Express/Node.js]
        PUBLIC[Public Server<br/>Express/Node.js]
        AI[AI Embedding Service<br/>FastAPI/Python]
    end
    
    subgraph "Storage"
        SQLITE[(SQLite<br/>Local DB)]
        FILES[File System<br/>Captures]
    end
    
    subgraph "External Services"
        FILECOIN_EXT[Filecoin<br/>Lighthouse API]
        BLOCKCHAIN_EXT[Ethereum<br/>Sepolia RPC]
        PRIVY[Privy<br/>Auth Service]
    end
    
    CAMERA -->|HTTP API| WEB3
    OWNER -->|HTTP API| WEB3
    CLAIM -->|HTTP API| PUBLIC
    
    WEB3 -->|Store| SQLITE
    WEB3 -->|Save| FILES
    WEB3 -->|Query| PUBLIC
    WEB3 -->|Generate| AI
    
    PUBLIC -->|Store| SQLITE
    
    WEB3 -->|Upload| FILECOIN_EXT
    WEB3 -->|Mint| BLOCKCHAIN_EXT
    OWNER -->|Auth| PRIVY
    
    style CAMERA fill:#4a90e2
    style WEB3 fill:#50c878
    style BLOCKCHAIN_EXT fill:#9b59b6
    style FILECOIN_EXT fill:#e67e22
```

## 8. Security & Cryptography Flow

```mermaid
graph TB
    subgraph "Hardware Identity Generation"
        HW1[CPU Serial Number]
        HW2[MAC Address]
        HW3[Device Salt]
        HW4[Combine Hardware IDs]
        HW5[PBKDF2 Key Derivation]
        HW6[Private Key]
        HW7[Public Key]
        HW8[Ethereum Address]
    end
    
    subgraph "Image Signing"
        IMG1[Capture Image]
        IMG2[Compute SHA256 Hash]
        IMG3[Sign Hash with Private Key]
        IMG4[Attach Signature to Metadata]
    end
    
    subgraph "On-Chain Verification"
        VER1[Receive Image + Signature]
        VER2[Recover Signer Address]
        VER3[Check Device Registry]
        VER4[Verify Device is Active]
        VER5[Verify Signature Matches]
        VER6[Approve/Reject Mint]
    end
    
    HW1 --> HW4
    HW2 --> HW4
    HW3 --> HW4
    HW4 --> HW5
    HW5 --> HW6
    HW6 --> HW7
    HW7 --> HW8
    
    IMG1 --> IMG2
    IMG2 --> IMG3
    HW6 --> IMG3
    IMG3 --> IMG4
    
    IMG4 --> VER1
    VER1 --> VER2
    VER2 --> VER3
    VER3 --> VER4
    VER4 --> VER5
    VER5 --> VER6
    
    style HW6 fill:#e24a4a
    style IMG3 fill:#ffa500
    style VER6 fill:#50c878
```

---

## Summary

This document provides comprehensive Mermaid diagrams covering:

1. **Hardware Architecture** - Standalone Raspberry Pi device and future ESP32 hotshoe mount
2. **Software Stack** - Complete application layers
3. **Photo Capture Flow** - Detailed sequence from button press to NFT mint
4. **User Claim Flow** - QR scan to edition minting
5. **Device Registration** - Authentication and on-chain registration
6. **Scaled Architecture** - Multi-device deployment with load balancing
7. **Data Flow** - Complete journey from capture to wallet
8. **Smart Contracts** - Contract architecture and relationships
9. **Component Interactions** - Service communication matrix
10. **Security Flow** - Cryptographic signing and verification

All diagrams are based on actual implementation details from the codebase.
