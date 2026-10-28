// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/CandidERC1155.sol";
import "../src/DeviceRegistry.sol";

contract CompanionHashTest is Test {
    CandidERC1155 public candid;
    address public device = vm.addr(uint256(keccak256("device")));
    address public owner = address(0xBEEF);
    bytes32 constant PHOTO_HASH = keccak256("phone photo");

    function setUp() public {
        DeviceRegistry registry = new DeviceRegistry();
        candid = new CandidERC1155(address(registry), "https://ipfs.io/ipfs/");
        registry.registerDevice(device, "0xabc", "candid-pi-0001", "camera-1", "Raspberry Pi 4", "1.0.0");
        vm.prank(device);
        candid.mintOriginal(owner, keccak256("meta"), 0);
    }

    function test_deviceCanAnchorOnce() public {
        vm.prank(device);
        candid.setCompanionHash(1, PHOTO_HASH);
        assertEq(candid.companionHash(1), PHOTO_HASH);

        vm.prank(device);
        vm.expectRevert("Companion hash already set");
        candid.setCompanionHash(1, keccak256("other"));
    }

    function test_onlyMintingDevice() public {
        vm.prank(owner);
        vm.expectRevert("Only the minting device");
        candid.setCompanionHash(1, PHOTO_HASH);
    }

    function test_rejectsMissingTokenAndEmptyHash() public {
        vm.prank(device);
        vm.expectRevert("Not an original token");
        candid.setCompanionHash(99, PHOTO_HASH);

        vm.prank(device);
        vm.expectRevert("Empty hash");
        candid.setCompanionHash(1, bytes32(0));
    }
}
