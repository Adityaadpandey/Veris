// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title LensMint
/// @notice ERC-1155 contract for on-chain photo authenticity proof on Base L2.
contract LensMint is ERC1155, Ownable {

    // ─── Structs ────────────────────────────────────────────────────────────

    struct PhotoData {
        bytes32 imageHash;          // Hash of the raw image bytes
        uint8   authenticityScore;  // Device-attested score 0–100
        uint64  timestamp;          // block.timestamp at mint time
        string  deviceId;           // Capturing device identifier
        string  ipfsCid;            // IPFS CID of the stored image
        address minter;             // Backend/owner wallet that minted
    }

    // ─── Errors ─────────────────────────────────────────────────────────────

    error HashAlreadyMinted(bytes32 hash);
    error TokenDoesNotExist(uint256 tokenId);
    error InvalidScore(uint8 score);

    // ─── Events ─────────────────────────────────────────────────────────────

    event PhotoMinted(uint256 indexed tokenId, address indexed minter, bytes32 indexed imageHash);
    event PhotoClaimed(uint256 indexed tokenId, address indexed claimer);

    // ─── State ──────────────────────────────────────────────────────────────

    uint256 private _nextTokenId = 1;

    /// @dev Full struct getter not possible via auto-getter when struct has string fields.
    ///      Use getPhotoData() for full struct in one call.
    mapping(uint256 => PhotoData) public photos;

    /// @dev isHashMinted() is a semantic alias for this auto-getter.
    mapping(bytes32 => bool) public hashExists;

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor() ERC1155("") Ownable(msg.sender) {}

    // ─── Write Functions ─────────────────────────────────────────────────────

    /// @notice Mint a photo proof token. Only callable by owner (backend wallet).
    /// @param hash     keccak256/SHA-256 of the raw image bytes
    /// @param score    Authenticity score 0–100 from device attestation
    /// @param ipfsCid  IPFS CID where the image is stored
    /// @param deviceId Unique identifier of the capturing device
    /// @return tokenId The newly minted token ID
    function mintProof(
        bytes32 hash,
        uint8 score,
        string calldata ipfsCid,
        string calldata deviceId
    ) external onlyOwner returns (uint256 tokenId) {
        if (hashExists[hash]) revert HashAlreadyMinted(hash);
        if (score > 100) revert InvalidScore(score);

        tokenId = _nextTokenId;
        _nextTokenId++;

        hashExists[hash] = true;
        photos[tokenId] = PhotoData({
            imageHash:          hash,
            authenticityScore:  score,
            timestamp:          uint64(block.timestamp),
            deviceId:           deviceId,
            ipfsCid:            ipfsCid,
            minter:             msg.sender
        });

        _mint(msg.sender, tokenId, 1, "");
        emit PhotoMinted(tokenId, msg.sender, hash);
    }

    /// @notice Mint a copy of an existing proof to an end-user's wallet.
    /// @param tokenId  ID of a previously minted proof token
    /// @param claimer  Address to receive the copy (must not be address(0); OZ _mint reverts with ERC1155InvalidReceiver if zero)
    function claimPhoto(uint256 tokenId, address claimer) external onlyOwner {
        if (photos[tokenId].minter == address(0)) revert TokenDoesNotExist(tokenId);
        _mint(claimer, tokenId, 1, "");
        emit PhotoClaimed(tokenId, claimer);
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /// @notice Returns all metadata for a given token.
    function getPhotoData(uint256 tokenId) external view returns (PhotoData memory) {
        if (photos[tokenId].minter == address(0)) revert TokenDoesNotExist(tokenId);
        return photos[tokenId];
    }

    /// @notice Returns true if the given image hash has already been minted.
    function isHashMinted(bytes32 hash) external view returns (bool) {
        return hashExists[hash];
    }

    /// @notice Returns the IPFS URI for a given token: "ipfs://<CID>"
    function uri(uint256 tokenId) public view override returns (string memory) {
        if (photos[tokenId].minter == address(0)) revert TokenDoesNotExist(tokenId);
        return string.concat("ipfs://", photos[tokenId].ipfsCid);
    }
}
