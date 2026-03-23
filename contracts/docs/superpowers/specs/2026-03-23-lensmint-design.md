# LensMint Contract Design

**Date:** 2026-03-23
**Status:** Approved
**Project:** LensMint — on-chain photo authenticity proof

---

## Overview

LensMint is an ERC-1155 smart contract deployed on Base L2 (Base Sepolia testnet) that mints non-fungible proof tokens for photos. Each token records a photo's hash, authenticity score, device ID, IPFS CID, and minting address — providing tamper-evident provenance on-chain.

The system uses a two-step distribution model:
1. **`mintProof`** — the backend/owner wallet mints a proof token to itself, recording the photo data on-chain.
2. **`claimPhoto`** — the owner mints an additional copy to an end-user's wallet. There is no cap on copies per tokenId; the owner may call it any number of times.

The `minter` field in `PhotoData` records the backend owner address (i.e., `msg.sender` at mint time), not the end-user's wallet. It serves as an audit trail of which backend key submitted the proof.

---

## Contract

**File:** `contracts/LensMint.sol`
**Solidity:** `0.8.24`
**Inheritance:** OpenZeppelin 5.x `ERC1155`, `Ownable`

### Constructor

```solidity
constructor() ERC1155("") Ownable(msg.sender) {}
```

- Passes `""` to `ERC1155` — the base URI is unused because `uri()` is fully overridden per-token.
- Passes `msg.sender` to `Ownable`.

### Struct

```solidity
struct PhotoData {
    bytes32 imageHash;          // SHA-256 or keccak256 of raw image bytes
    uint8   authenticityScore;  // 0–100 score from device attestation
    uint64  timestamp;          // Unix timestamp set to block.timestamp at mint
    string  deviceId;           // Unique identifier of the capturing device
    string  ipfsCid;            // IPFS CID where the image is stored
    address minter;             // Backend/owner address that submitted mintProof
}
```

### State

```solidity
uint256 private _nextTokenId = 1;
mapping(uint256 => PhotoData) public photos;   // public for auto-getters; getPhotoData returns full struct (auto-getter cannot for string fields)
mapping(bytes32 => bool)      public hashExists; // public; isHashMinted is a named semantic alias
```

> Note: `photos` is public but Solidity's auto-getter for mappings with struct values containing `string` fields does not return the full struct. `getPhotoData` is therefore still required to return `PhotoData memory` in one call. `hashExists` being public generates an auto-getter identical to `isHashMinted`; the explicit function is provided for semantic clarity in the ABI.

### Functions

#### `mintProof`

```
mintProof(bytes32 hash, uint8 score, string calldata ipfsCid, string calldata deviceId)
    onlyOwner
    returns (uint256 tokenId)
```

- Reverts `HashAlreadyMinted(hash)` if `hashExists[hash]` is true.
- Reverts `InvalidScore(score)` if `score > 100`.
- Sets `hashExists[hash] = true`.
- Stores `PhotoData{ imageHash: hash, authenticityScore: score, timestamp: uint64(block.timestamp), deviceId: deviceId, ipfsCid: ipfsCid, minter: msg.sender }` at `photos[_nextTokenId]`.
- Calls `_mint(msg.sender, _nextTokenId, 1, "")`.
- Emits `PhotoMinted(_nextTokenId, msg.sender, hash)`.
- Increments `_nextTokenId` and returns the used tokenId.

#### `claimPhoto`

```
claimPhoto(uint256 tokenId, address claimer)
    onlyOwner
```

- Reverts `TokenDoesNotExist(tokenId)` if `photos[tokenId].minter == address(0)`.
- Calls `_mint(claimer, tokenId, 1, "")`.
- Emits `PhotoClaimed(tokenId, claimer)`.

#### `getPhotoData`

```
getPhotoData(uint256 tokenId) external view returns (PhotoData memory)
```

- Reverts `TokenDoesNotExist(tokenId)` if `photos[tokenId].minter == address(0)`.
- Returns `photos[tokenId]`.

#### `isHashMinted`

```
isHashMinted(bytes32 hash) external view returns (bool)
```

- Returns `hashExists[hash]`.

#### `uri`

```
uri(uint256 tokenId) public view override returns (string memory)
```

- Reverts `TokenDoesNotExist(tokenId)` if `photos[tokenId].minter == address(0)`.
- Returns `string.concat("ipfs://", photos[tokenId].ipfsCid)`.

### Events

```solidity
event PhotoMinted(uint256 indexed tokenId, address indexed minter, bytes32 indexed imageHash);
event PhotoClaimed(uint256 indexed tokenId, address indexed claimer);
```

### Custom Errors

```solidity
error HashAlreadyMinted(bytes32 hash);
error TokenDoesNotExist(uint256 tokenId);
error InvalidScore(uint8 score);
```

---

## Hardhat Project

**File:** `hardhat.config.ts`
**Solidity:** `0.8.24`
**Networks:**

```
baseSepolia:
  url: https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}
  accounts: [PRIVATE_KEY from .env]
  chainId: 84532
```

**Dependencies:**
- `hardhat`
- `@nomicfoundation/hardhat-toolbox` (includes ethers, chai, mocha, typechain)
- `@openzeppelin/contracts` ^5.0.0
- `dotenv`
- `typescript`, `ts-node`, `@types/node`

**`.env.example` variables:**
```
ALCHEMY_KEY=your_alchemy_api_key
PRIVATE_KEY=your_deployer_private_key_hex
BASESCAN_API_KEY=your_basescan_api_key_for_verification
```

**`tsconfig.json` required options:**
```json
{
  "compilerOptions": {
    "target": "es2020",
    "module": "commonjs",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist"
  },
  "include": ["hardhat.config.ts", "./scripts", "./test", "./typechain-types"]
}
```

---

## Deploy Script

**File:** `scripts/deploy.ts`

Steps:
1. Log `network.name` and `chainId`; abort with an error message if `chainId` is not 84532 and the `--force` flag is not set (safety guard against wrong network).
2. Deploy `LensMint` using ethers.js `ContractFactory`.
3. Wait for deployment transaction confirmation.
4. Read compiled ABI from Hardhat artifacts (`artifacts/contracts/LensMint.sol/LensMint.json`).
5. Create `../backend/abi/` directory if it does not exist (`fs.mkdirSync(..., { recursive: true })`).
6. Write ABI JSON to `../backend/abi/LensMint.json`.
7. Log deployed contract address and ABI output path.

---

## Tests

**File:** `test/LensMint.test.ts`
**Framework:** Hardhat + ethers + chai
**Fixture:** Each test or describe block uses a fresh deployment via `loadFixture` to ensure full isolation.

| # | Test | Assertions |
|---|---|---|
| 1 | `mintProof` succeeds | Returns `tokenId = 1`; `PhotoMinted` event emitted with correct `tokenId`, `minter`, and `imageHash`; `photos[1].imageHash` matches input; `photos[1].authenticityScore` matches; `photos[1].minter` is owner address |
| 2 | Duplicate hash reverts | Second call with identical hash reverts with `HashAlreadyMinted(hash)` |
| 3 | `claimPhoto` mints copy to claimer | `PhotoClaimed` event emitted with correct `tokenId` and `claimer`; `balanceOf(claimer, tokenId) == 1`; owner balance remains 1 (not decremented) |
| 4 | `getPhotoData` returns correct data | All struct fields (`imageHash`, `authenticityScore`, `timestamp`, `deviceId`, `ipfsCid`, `minter`) match the values passed to `mintProof` |
| 5 | `isHashMinted` returns correct state | Returns `false` before any mint (checked on fresh deployment, no shared beforeEach hook); returns `true` after `mintProof` with that hash |
| 6 | `mintProof` reverts on `score > 100` | Reverts with `InvalidScore(score)` when called with `score = 101` |
| 7 | `claimPhoto` reverts for unminted tokenId | Reverts with `TokenDoesNotExist(tokenId)` when `tokenId` was never minted |
| 8 | `getPhotoData` reverts for unminted tokenId | Reverts with `TokenDoesNotExist(tokenId)` when `tokenId` was never minted |
| 9 | `uri` reverts for unminted tokenId | Reverts with `TokenDoesNotExist(tokenId)` when `tokenId` was never minted |
| 10 | Non-owner `mintProof` reverts | Reverts with `OwnableUnauthorizedAccount` when called by a non-owner address |
| 11 | Sequential mints produce incrementing tokenIds | Three sequential `mintProof` calls return tokenIds 1, 2, 3 respectively |

---

## File Tree

```
contracts/
├── contracts/
│   └── LensMint.sol
├── scripts/
│   └── deploy.ts
├── test/
│   └── LensMint.test.ts
├── hardhat.config.ts
├── package.json
├── tsconfig.json
└── .env.example

../backend/
└── abi/
    └── LensMint.json   ← written by deploy script
```
