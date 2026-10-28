// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../src/CandidERC1155.sol";
import "../src/DeviceRegistry.sol";

/**
 * @title Gas report for the mint path
 * @dev Measures what a photo actually costs. Metadata used to be stored on-chain
 *      as a CID, an image hash and a signature; it now lives on IPFS and the
 *      contract keeps only its keccak256, so these numbers are the cheap path.
 */
contract GasReportTest is Test {
    DeviceRegistry public deviceRegistry;
    CandidERC1155 public candid;

    address public deviceAddress;
    address public owner = address(0x1234567890123456789012345678901234567890);

    // Metadata JSON lives on IPFS; the contract only ever sees its hash.
    bytes32 constant REAL_METADATA_HASH = keccak256("candid-photo-metadata");

    function setUp() public {
        deviceRegistry = new DeviceRegistry();
        candid = new CandidERC1155(address(deviceRegistry), "https://ipfs.io/ipfs/");

        deviceAddress = vm.addr(uint256(keccak256("device")));
        deviceRegistry.registerDevice(
            deviceAddress,
            "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            "candid-pi-0001",
            "camera-456",
            "Raspberry Pi 4",
            "1.0.0"
        );
    }

    function test_GasRegisterDevice() public {
        address fresh = vm.addr(uint256(keccak256("fresh-device")));

        uint256 gasBefore = gasleft();
        deviceRegistry.registerDevice(
            fresh,
            "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            "candid-pi-0002",
            "camera-789",
            "Raspberry Pi 4",
            "1.0.0"
        );
        uint256 used = gasBefore - gasleft();

        console.log("REGISTER_DEVICE_GAS:", used);
        assertGt(used, 0);
    }

    function test_GasMintOriginal() public {
        vm.prank(deviceAddress);
        uint256 gasBefore = gasleft();
        candid.mintOriginal(owner, REAL_METADATA_HASH, 0);
        uint256 used = gasBefore - gasleft();

        console.log("MINT_ORIGINAL_GAS:", used);
        assertGt(used, 0);
    }

    function test_GasMintEdition() public {
        vm.prank(deviceAddress);
        uint256 original = candid.mintOriginal(owner, REAL_METADATA_HASH, 0);

        uint256 gasBefore = gasleft();
        candid.mintEdition(owner, original);
        uint256 used = gasBefore - gasleft();

        console.log("MINT_EDITION_GAS:", used);
        assertGt(used, 0);
    }

    function test_GasBatchMintEditions10() public {
        vm.prank(deviceAddress);
        uint256 original = candid.mintOriginal(owner, REAL_METADATA_HASH, 0);

        uint256 gasBefore = gasleft();
        candid.batchMintEditions(owner, original, 10);
        uint256 used = gasBefore - gasleft();

        console.log("BATCH_MINT_10_GAS:", used);
        console.log("BATCH_MINT_10_PER_EDITION:", used / 10);
        assertGt(used, 0);
    }

    // An edition used to report baseURI<editionId>, a document nobody ever wrote.
    // It should resolve to the original's metadata instead.
    function test_EditionUriPointsAtOriginal() public {
        vm.prank(deviceAddress);
        uint256 original = candid.mintOriginal(owner, REAL_METADATA_HASH, 0);
        uint256 edition = candid.mintEdition(owner, original);

        assertEq(candid.uri(original), "https://ipfs.io/ipfs/1");
        assertEq(candid.uri(edition), candid.uri(original), "edition must resolve to original");
    }
}
