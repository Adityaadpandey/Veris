// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {DeviceRegistry} from "../src/DeviceRegistry.sol";
import {CandidERC1155} from "../src/CandidERC1155.sol";

contract DeployAndVerifyScript is Script {
    function run() external {
        // Free testnets only (Base Sepolia, Sepolia): never deploy to a mainnet by accident.
        require(block.chainid == 84532 || block.chainid == 11155111, "Testnet only");

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        string memory network = vm.envString("NETWORK");
        string memory baseURI = vm.envOr("BASE_URI", string("https://ipfs.io/ipfs/"));
        
        console.log("=== Deployment Configuration ===");
        console.log("Network:", network);
        console.log("Deployer address:", deployer);
        console.log("Deployer balance:", deployer.balance);
        console.log("Base URI:", baseURI);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        console.log("Deploying DeviceRegistry...");
        DeviceRegistry deviceRegistry = new DeviceRegistry();
        address deviceRegistryAddress = address(deviceRegistry);
        console.log("DeviceRegistry deployed at:", deviceRegistryAddress);

        console.log("Deploying CandidERC1155...");
        CandidERC1155 candid = new CandidERC1155(
            deviceRegistryAddress,
            baseURI
        );
        address candidAddress = address(candid);
        console.log("CandidERC1155 deployed at:", candidAddress);

        vm.stopBroadcast();

        console.log("\n=== Deployment Summary ===");
        console.log("DeviceRegistry:", deviceRegistryAddress);
        console.log("CandidERC1155:", candidAddress);
        console.log("Base URI:", baseURI);
    }
}

