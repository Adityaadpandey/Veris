// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {DeviceRegistry} from "../src/DeviceRegistry.sol";
import {VerisERC1155} from "../src/VerisERC1155.sol";
import {VerisLicense} from "../src/VerisLicense.sol";

contract FakeUSDC is ERC20 {
    constructor() ERC20("USDC", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract VerisLicenseTest is Test {
    FakeUSDC usdc;
    VerisERC1155 photos;
    VerisLicense license;
    address device = address(0xD1);
    address photographer = address(0xA11CE);
    address editor = address(0xED17);
    uint256 tokenId;

    function setUp() public {
        DeviceRegistry registry = new DeviceRegistry();
        registry.registerDevice(device, "0xabc", "pi-1", "cam-1", "Pi", "1.0");
        photos = new VerisERC1155(address(registry), "https://x/");
        vm.prank(device);
        tokenId = photos.mintOriginal(photographer, keccak256("meta"), 0);

        usdc = new FakeUSDC();
        license = new VerisLicense(address(usdc), address(photos));
        usdc.mint(editor, 20_000_000);
        vm.prank(editor);
        usdc.approve(address(license), type(uint256).max);
    }

    function test_editorPaysPhotographerFiveUsdc() public {
        vm.prank(editor);
        uint64 ends = license.buyLicense(tokenId, photographer);
        assertEq(usdc.balanceOf(photographer), 5_000_000);
        assertEq(usdc.balanceOf(editor), 15_000_000);
        assertEq(ends, uint64(block.timestamp) + 30 days);
        assertTrue(license.isLicensed(tokenId, editor));
    }

    function test_licenseEndsAfterTerm() public {
        vm.prank(editor);
        license.buyLicense(tokenId, photographer);
        vm.warp(block.timestamp + 31 days);
        assertFalse(license.isLicensed(tokenId, editor));
    }

    function test_cannotPayAWalletThatDoesNotHoldTheOriginal() public {
        vm.prank(editor);
        vm.expectRevert("Payee does not hold the original");
        license.buyLicense(tokenId, address(0xBAD));
    }

    function test_buyingAgainStacksTheTerm() public {
        vm.startPrank(editor);
        license.buyLicense(tokenId, photographer);
        uint64 ends = license.buyLicense(tokenId, photographer);
        vm.stopPrank();
        assertEq(ends, uint64(block.timestamp) + 60 days);
    }
}
