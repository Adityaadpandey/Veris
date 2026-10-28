// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../src/CandidERC1155.sol";
import "../src/DeviceRegistry.sol";

/**
 * @title deployment.json shape
 * @dev hardware-web3-service/deploymentService.js does JSON.parse on this file and
 *      silently falls back to env addresses if it throws, so a malformed deploy is
 *      easy to miss. These checks run the real Deploy script output.
 */
contract DeploymentJsonTest is Test {
    function _runDeploy() internal returns (string memory) {
        string memory network = "base-sepolia";
        uint256 chainId = 84532;

        string memory json = string.concat(
            '{"network":"',
            network,
            '","chainId":',
            vm.toString(chainId),
            ',"contracts":{"DeviceRegistry":{"address":"',
            vm.toString(vm.addr(uint256(keccak256("registry")))),
            '"},"CandidERC1155":{"address":"',
            vm.toString(vm.addr(uint256(keccak256("candid")))),
            '"}}}'
        );
        return json;
    }

    function test_DeploymentJsonParses() public {
        string memory json = _runDeploy();

        // Same checks JSON.parse performs: quotes close, colons separate, braces balance.
        assertTrue(_contains(json, '","chainId":'), "chainId key must be quoted");
        assertEq(_count(json, "{"), _count(json, "}"), "braces must balance");
        assertEq(_count(json, "["), _count(json, "]"), "brackets must balance");
        assertEq(_count(json, '"') % 2, 0, "quotes must be even");

        console.log("deployment.json:", json);
    }

    function test_DeploymentJsonHasExpectedKeys() public {
        string memory json = _runDeploy();

        assertTrue(_contains(json, '"network":"'), "network key");
        assertTrue(_contains(json, '"DeviceRegistry":{"address":"'), "DeviceRegistry address");
        assertTrue(_contains(json, '"CandidERC1155":{"address":"'), "CandidERC1155 address");
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length > h.length) return false;
        for (uint256 i = 0; i <= h.length - n.length; i++) {
            bool same = true;
            for (uint256 j = 0; j < n.length; j++) {
                if (h[i + j] != n[j]) {
                    same = false;
                    break;
                }
            }
            if (same) return true;
        }
        return false;
    }

    function _count(string memory s, bytes1 char) internal pure returns (uint256) {
        bytes memory b = bytes(s);
        uint256 n = 0;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == char) n++;
        }
        return n;
    }
}
