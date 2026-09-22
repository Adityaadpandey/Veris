// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

/**
 * @title VerisLicense
 * @dev An editor pays the photographer in USDC to license a photo for a fixed term.
 *      Built for Arc, where USDC is the gas token and also has an ERC-20 interface (6 decimals).
 *      The payee must be a wallet that currently holds the original token, so money can't be
 *      redirected to an address that has nothing to do with the photo.
 */
contract VerisLicense {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IERC1155 public immutable photos;

    uint256 public constant PRICE = 5_000_000; // 5 USDC
    uint64 public constant TERM = 30 days;

    // tokenId => licensee => unix time the license ends
    mapping(uint256 => mapping(address => uint64)) public licenseEnds;

    event Licensed(
        uint256 indexed tokenId,
        address indexed licensee,
        address indexed photographer,
        uint64 expiresAt
    );

    constructor(address _usdc, address _photos) {
        require(_usdc != address(0) && _photos != address(0), "Invalid address");
        usdc = IERC20(_usdc);
        photos = IERC1155(_photos);
    }

    // Buying again while a license is running adds a full term on top of what is left.
    function buyLicense(uint256 tokenId, address photographer) external returns (uint64 expiresAt) {
        require(photos.balanceOf(photographer, tokenId) > 0, "Payee does not hold the original");

        uint64 current = licenseEnds[tokenId][msg.sender];
        uint64 start = current > block.timestamp ? current : uint64(block.timestamp);
        expiresAt = start + TERM;
        licenseEnds[tokenId][msg.sender] = expiresAt;

        usdc.safeTransferFrom(msg.sender, photographer, PRICE);
        emit Licensed(tokenId, msg.sender, photographer, expiresAt);
    }

    function isLicensed(uint256 tokenId, address licensee) external view returns (bool) {
        return licenseEnds[tokenId][licensee] > block.timestamp;
    }
}
