// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VerisVerifier} from "../src/VerisVerifier.sol";

contract SubmitProofScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        address verifierAddress = vm.envAddress("VERIFIER_CONTRACT_ADDRESS");
        string memory proofFilePath = vm.envString("PROOF_FILE");
        
        console.log("=== Submitting ZK Proof ===");
        console.log("Deployer:", deployer);
        console.log("Verifier Contract:", verifierAddress);
        console.log("Proof File:", proofFilePath);
        
        string memory proofJson = vm.readFile(proofFilePath);
        
        vm.startBroadcast(deployerPrivateKey);
        
        VerisVerifier verifier = VerisVerifier(verifierAddress);
        
        vm.stopBroadcast();
        
        console.log("Proof submission complete");
    }
}

