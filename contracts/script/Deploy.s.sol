// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {DeviceRegistry} from "../src/DeviceRegistry.sol";
import {CandidERC1155} from "../src/CandidERC1155.sol";

contract DeployScript is Script {
    function run() external {
        // Free testnets only (Base Sepolia, Sepolia): never deploy to a mainnet by accident.
        require(block.chainid == 84532 || block.chainid == 11155111, "Testnet only");

        // Load deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Run with --network base, --network sepolia or --network mainnet. Base is
        // the cheap option; mainnet is where the per-photo gas really hurts.
        uint256 chainId = block.chainid;
        string memory network = vm.envOr("NETWORK", vm.toString(chainId));

        console.log("Deploying contracts...");
        console.log("Network:", network);
        console.log("Deployer address:", deployer);
        console.log("Deployer balance:", deployer.balance);

        vm.startBroadcast(deployerPrivateKey);

        console.log("\nDeploying DeviceRegistry...");
        DeviceRegistry deviceRegistry = new DeviceRegistry();
        console.log("DeviceRegistry deployed at:", address(deviceRegistry));

        console.log("\nDeploying CandidERC1155...");
        string memory baseURI = "https://ipfs.io/ipfs/";
        CandidERC1155 candid = new CandidERC1155(
            address(deviceRegistry),
            baseURI
        );
        console.log("CandidERC1155 deployed at:", address(candid));

        vm.stopBroadcast();

        console.log("\n=== Deployment Summary ===");
        console.log("DeviceRegistry:", address(deviceRegistry));
        console.log("CandidERC1155:", address(candid));
        console.log("Base URI:", baseURI);

        // Write deployment.json for use by backend services
        string memory deploymentJson = string.concat(
            '{"network":"', network, '","chainId":', vm.toString(chainId),
            ',"contracts":{"DeviceRegistry":{"address":"',
            vm.toString(address(deviceRegistry)),
            '"},"CandidERC1155":{"address":"',
            vm.toString(address(candid)),
            '"}}}'
        );
        vm.writeFile("deployment.json", deploymentJson);
        console.log("\ndeployment.json written.");
    }
}

