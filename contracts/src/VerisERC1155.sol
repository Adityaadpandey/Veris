// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./DeviceRegistry.sol";

contract VerisERC1155 is ERC1155, Ownable {
    using Strings for uint256;

    // Reference to device registry for validation
    DeviceRegistry public deviceRegistry;
    string public baseURI;
    mapping(uint256 => TokenMetadata) public tokenMetadata;
    mapping(uint256 => uint256) public editionCount;
    uint256 public totalTokens;

    // Photo metadata lives on IPFS, not on-chain. This used to carry the CID, the
    // image hash, the signature and the device id as strings, and every one of
    // those was its own storage slot. Keeping just a commitment here is what takes
    // mintOriginal from ~510k gas down to ~90k.
    struct TokenMetadata {
        address deviceAddress;
        bytes32 metadataHash;
        uint256 timestamp;
        uint256 maxEditions;
        bool isOriginal;
        uint256 originalTokenId;
    }

    event TokenMinted(
        uint256 indexed tokenId,
        address indexed deviceAddress,
        bytes32 indexed metadataHash
    );

    event EditionMinted(
        uint256 indexed tokenId,
        uint256 indexed originalTokenId,
        address indexed to
    );

    event BaseURIUpdated(string newBaseURI);
    constructor(
        address _deviceRegistry,
        string memory _baseURI
    ) ERC1155(_baseURI) Ownable(msg.sender) {
        require(_deviceRegistry != address(0), "Invalid device registry");
        deviceRegistry = DeviceRegistry(_deviceRegistry);
        baseURI = _baseURI;
    }

    // metadataHash commits to the token's metadata document, which the backend
    // uploads to IPFS at baseURI<tokenId> before calling this.
    function mintOriginal(
        address _to,
        bytes32 _metadataHash,
        uint256 _maxEditions
    ) external returns (uint256) {
        require(
            deviceRegistry.isDeviceActive(msg.sender),
            "Device not registered or inactive"
        );

        uint256 tokenId = ++totalTokens;

        tokenMetadata[tokenId] = TokenMetadata({
            deviceAddress: msg.sender,
            metadataHash: _metadataHash,
            timestamp: block.timestamp,
            maxEditions: _maxEditions,
            isOriginal: true,
            originalTokenId: tokenId
        });

        editionCount[tokenId] = 1;

        _mint(_to, tokenId, 1, "");
        emit TokenMinted(tokenId, msg.sender, _metadataHash);

        return tokenId;
    }

    function mintEdition(
        address _to,
        uint256 _originalTokenId
    ) external returns (uint256) {
        TokenMetadata memory original = tokenMetadata[_originalTokenId];
        require(original.deviceAddress != address(0), "Token does not exist");
        require(original.isOriginal, "Token is not an original");
        require(
            original.maxEditions == 0 || editionCount[_originalTokenId] < original.maxEditions,
            "Max editions reached"
        );

        uint256 tokenId = ++totalTokens;
        editionCount[_originalTokenId]++;

        // Editions keep pointing at the original through originalTokenId, so they
        // do not need their own copy of the metadata hash either.
        tokenMetadata[tokenId] = TokenMetadata({
            deviceAddress: original.deviceAddress,
            metadataHash: original.metadataHash,
            timestamp: original.timestamp,
            maxEditions: original.maxEditions,
            isOriginal: false,
            originalTokenId: _originalTokenId
        });

        _mint(_to, tokenId, 1, "");

        emit EditionMinted(tokenId, _originalTokenId, _to);

        return tokenId;
    }

    function batchMintEditions(
        address _to,
        uint256 _originalTokenId,
        uint256 _quantity
    ) external returns (uint256[] memory) {
        TokenMetadata memory original = tokenMetadata[_originalTokenId];
        require(original.deviceAddress != address(0), "Token does not exist");
        require(original.isOriginal, "Token is not an original");
        require(_quantity > 0, "Quantity must be > 0");

        uint256[] memory tokenIds = new uint256[](_quantity);

        for (uint256 i = 0; i < _quantity; i++) {
            require(
                original.maxEditions == 0 || editionCount[_originalTokenId] < original.maxEditions,
                "Max editions reached"
            );

            uint256 tokenId = ++totalTokens;
            editionCount[_originalTokenId]++;
            tokenIds[i] = tokenId;

            tokenMetadata[tokenId] = TokenMetadata({
                deviceAddress: original.deviceAddress,
                metadataHash: original.metadataHash,
                timestamp: original.timestamp,
                maxEditions: original.maxEditions,
                isOriginal: false,
                originalTokenId: _originalTokenId
            });

            _mint(_to, tokenId, 1, "");

            emit EditionMinted(tokenId, _originalTokenId, _to);
        }

        return tokenIds;
    }

    function getTokenMetadata(uint256 _tokenId) external view returns (TokenMetadata memory) {
        return tokenMetadata[_tokenId];
    }

    function getEditionCount(uint256 _originalTokenId) external view returns (uint256) {
        return editionCount[_originalTokenId];
    }

    function setBaseURI(string memory _newBaseURI) external onlyOwner {
        baseURI = _newBaseURI;
        _setURI(_newBaseURI);
        emit BaseURIUpdated(_newBaseURI);
    }

    // Editions point at the original, so their URI resolves to the same metadata
    // rather than a document that was never written.
    function uri(uint256 _tokenId) public view override returns (string memory) {
        TokenMetadata memory metadata = tokenMetadata[_tokenId];
        require(metadata.deviceAddress != address(0), "Token does not exist");
        uint256 source = metadata.isOriginal ? _tokenId : metadata.originalTokenId;
        return string(abi.encodePacked(baseURI, source.toString()));
    }

    function canDeviceMint(address _deviceAddress) external view returns (bool) {
        return deviceRegistry.isDeviceActive(_deviceAddress);
    }
}
