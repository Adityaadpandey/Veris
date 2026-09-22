// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {DeviceRegistry} from "../src/DeviceRegistry.sol";

contract DeviceRegistryOwnerTest is Test {
    DeviceRegistry registry;
    address device = address(0xD1);

    function setUp() public {
        registry = new DeviceRegistry();
    }

    function test_ownerCanRegister() public {
        registry.registerDevice(device, "0xabc", "pi-1", "cam-1", "Pi", "1.0");
        assertTrue(registry.isDeviceActive(device));
    }

    function test_strangerCannotRegister() public {
        vm.prank(address(0xBAD));
        vm.expectRevert("Only owner can register devices");
        registry.registerDevice(address(0xBAD), "0xabc", "pi-2", "cam-2", "Pi", "1.0");
    }

    function test_deviceCannotRegisterItself() public {
        vm.prank(device);
        vm.expectRevert("Only owner can register devices");
        registry.registerDevice(device, "0xabc", "pi-3", "cam-3", "Pi", "1.0");
    }
}
