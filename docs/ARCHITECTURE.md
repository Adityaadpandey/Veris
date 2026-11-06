# Veris architecture

Veris turns a camera shot into a hardware-signed photo NFT. Arc is where the photo is
minted and where editors pay the photographer in USDC to license it.

## System

```mermaid
flowchart LR
    subgraph Device["Raspberry Pi camera"]
        CAM[Capture + device-key signature]
    end

    subgraph Phone["Phone / Clip"]
        COMP[Companion photo]
    end

    subgraph HW["hardware-web3-service (Node)"]
        UP[Upload + retry queue]
        STO[Storage: 0G or Lighthouse]
        MINT[Mint on every configured chain]
    end

    subgraph PUB["public-server (Node)"]
        CLAIM[Claims + QR]
        AI[Same-scene check - GPT vision]
        PG[(Postgres)]
        ARK[(Arkiv records)]
    end

    subgraph ARC["Arc testnet - USDC is gas"]
        REG[DeviceRegistry]
        NFT[VerisERC1155]
        LIC[VerisLicense]
        USDC[(USDC)]
    end

    subgraph SEP["Sepolia"]
        NFT2[VerisERC1155 + DeviceRegistry]
    end

    subgraph Portal["owner-portal + mobile-app"]
        VIEW[Claim / verify / search]
        BUY[License button - 5 USDC]
    end

    CAM -->|signed image| UP
    COMP --> CLAIM
    UP --> STO
    UP --> MINT
    MINT -->|mint, device wallet pays gas in USDC| NFT
    MINT -->|mint| NFT2
    REG -.->|active device check| NFT
    UP --> CLAIM
    CLAIM --> AI
    CLAIM --> PG
    CLAIM -.->|mirror| ARK
    CLAIM -->|QR| CAM

    VIEW --> CLAIM
    VIEW -->|read photo + licenses| NFT
    BUY -->|approve + buyLicense| LIC
    LIC -->|5 USDC to photographer| USDC
    LIC -.->|checks photographer holds token| NFT
    BUY -->|record license| CLAIM
```

## License flow (the Arc / USDC part)

```mermaid
sequenceDiagram
    participant E as Editor (wallet)
    participant P as owner-portal
    participant L as VerisLicense (Arc)
    participant U as USDC (Arc)
    participant S as public-server

    E->>P: Open claim, press "License"
    P->>U: approve(VerisLicense, 5 USDC)
    P->>L: buyLicense(tokenId, photographer)
    L->>L: require photographer holds the original token
    L->>U: transferFrom(editor, photographer, 5 USDC)
    L-->>P: Licensed(tokenId, editor, photographer, expiresAt)
    P->>S: POST /api/license/record
    S-->>P: owner earnings + licensee list shown
```

## Fallbacks

Capture never waits on a third party: capture, sign and queue always succeed locally.
Storage falls back 0G to Lighthouse, claim lookup falls back Arkiv to Postgres, and if Arc
is down the Sepolia mint still completes and the Arc mint is retried.
