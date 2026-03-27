// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {DeviceRegistry} from "../src/DeviceRegistry.sol";
import {VerisERC1155} from "../src/VerisERC1155.sol";

contract DeployScript is Script {
    function run() external {
        // Load deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying contracts...");
        console.log("Deployer address:", deployer);
        console.log("Deployer balance:", deployer.balance);

        vm.startBroadcast(deployerPrivateKey);

        console.log("\nDeploying DeviceRegistry...");
        DeviceRegistry deviceRegistry = new DeviceRegistry();
        console.log("DeviceRegistry deployed at:", address(deviceRegistry));

        console.log("\nDeploying VerisERC1155...");
        string memory baseURI = "https://ipfs.io/ipfs/";
        VerisERC1155 veris = new VerisERC1155(
            address(deviceRegistry),
            baseURI
        );
        console.log("VerisERC1155 deployed at:", address(veris));

        vm.stopBroadcast();

        console.log("\n=== Deployment Summary ===");
        console.log("DeviceRegistry:", address(deviceRegistry));
        console.log("VerisERC1155:", address(veris));
        console.log("Base URI:", baseURI);

        // Write deployment.json for use by backend services
        string memory deploymentJson = string.concat(
            '{"network":"sepolia","chainId":11155111,"contracts":{"DeviceRegistry":{"address":"',
            vm.toString(address(deviceRegistry)),
            '"},"VerisERC1155":{"address":"',
            vm.toString(address(veris)),
            '"}}}'
        );
        vm.writeFile("deployment.json", deploymentJson);
        console.log("\ndeployment.json written.");
    }
}

