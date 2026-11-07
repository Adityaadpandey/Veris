// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {VerisLicense} from "../src/VerisLicense.sol";

// Deploys only VerisLicense, pointing at a VerisERC1155 that is already live.
//   VERIS_ADDRESS=0x... forge script script/DeployLicense.s.sol --rpc-url arc --broadcast
// USDC defaults to the Arc testnet USDC; set USDC_ADDRESS to override it.
contract DeployLicenseScript is Script {
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        require(block.chainid == 84532 || block.chainid == 11155111 || block.chainid == 5042002, "Testnet only");

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address veris = vm.envAddress("VERIS_ADDRESS");
        address usdc = vm.envOr("USDC_ADDRESS", ARC_USDC);

        vm.startBroadcast(deployerPrivateKey);
        VerisLicense license = new VerisLicense(usdc, veris);
        vm.stopBroadcast();

        console.log("VerisLicense:", address(license));
        console.log("Add it to deployment-%s.json under contracts.VerisLicense", vm.toString(block.chainid));
    }
}
