// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/VerisERC1155.sol";
import "../src/DeviceRegistry.sol";

contract CompanionHashTest is Test {
    VerisERC1155 public veris;
    address public device = vm.addr(uint256(keccak256("device")));
    address public owner = address(0xBEEF);
    bytes32 constant PHOTO_HASH = keccak256("phone photo");

    function setUp() public {
        DeviceRegistry registry = new DeviceRegistry();
        veris = new VerisERC1155(address(registry), "https://ipfs.io/ipfs/");
        registry.registerDevice(device, "0xabc", "veris-pi-0001", "camera-1", "Raspberry Pi 4", "1.0.0");
        vm.prank(device);
        veris.mintOriginal(owner, keccak256("meta"), 0);
    }

    function test_deviceCanAnchorOnce() public {
        vm.prank(device);
        veris.setCompanionHash(1, PHOTO_HASH);
        assertEq(veris.companionHash(1), PHOTO_HASH);

        vm.prank(device);
        vm.expectRevert("Companion hash already set");
        veris.setCompanionHash(1, keccak256("other"));
    }

    function test_onlyMintingDevice() public {
        vm.prank(owner);
        vm.expectRevert("Only the minting device");
        veris.setCompanionHash(1, PHOTO_HASH);
    }

    function test_rejectsMissingTokenAndEmptyHash() public {
        vm.prank(device);
        vm.expectRevert("Not an original token");
        veris.setCompanionHash(99, PHOTO_HASH);

        vm.prank(device);
        vm.expectRevert("Empty hash");
        veris.setCompanionHash(1, bytes32(0));
    }
}
