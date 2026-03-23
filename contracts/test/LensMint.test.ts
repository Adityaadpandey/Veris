import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("LensMint", function () {
  const IMAGE_HASH = ethers.keccak256(ethers.toUtf8Bytes("test-photo"));
  const SCORE = 85;
  const IPFS_CID = "QmTestCID123";
  const DEVICE_ID = "device-001";

  async function deployFixture() {
    const [owner, claimer, nonOwner] = await ethers.getSigners();
    const LensMint = await ethers.getContractFactory("LensMint");
    const contract = await LensMint.deploy();
    return { contract, owner, claimer, nonOwner };
  }

  async function deployAndMintFixture() {
    const base = await deployFixture();
    const { contract } = base;
    await contract.mintProof(IMAGE_HASH, SCORE, IPFS_CID, DEVICE_ID);
    return base;
  }

  // Test 1: mintProof succeeds — checks return value and PhotoMinted event
  it("mintProof: returns tokenId=1 and emits PhotoMinted", async function () {
    const { contract, owner } = await loadFixture(deployFixture);

    // staticCall reads the return value without mutating state
    const tokenId = await contract.mintProof.staticCall(IMAGE_HASH, SCORE, IPFS_CID, DEVICE_ID);
    expect(tokenId).to.equal(1n);

    // Real call: assert the PhotoMinted event with all three indexed args
    await expect(contract.mintProof(IMAGE_HASH, SCORE, IPFS_CID, DEVICE_ID))
      .to.emit(contract, "PhotoMinted")
      .withArgs(1n, owner.address, IMAGE_HASH);

    // Verify on-chain storage
    const photo = await contract.getPhotoData(1);
    expect(photo.imageHash).to.equal(IMAGE_HASH);
    expect(photo.authenticityScore).to.equal(SCORE);
    expect(photo.minter).to.equal(owner.address);
  });

  // Test 2: duplicate hash reverts
  it("mintProof: reverts with HashAlreadyMinted on duplicate hash", async function () {
    const { contract } = await loadFixture(deployFixture);
    await contract.mintProof(IMAGE_HASH, SCORE, IPFS_CID, DEVICE_ID);
    await expect(
      contract.mintProof(IMAGE_HASH, SCORE, IPFS_CID, DEVICE_ID)
    ).to.be.revertedWithCustomError(contract, "HashAlreadyMinted").withArgs(IMAGE_HASH);
  });

  // Test 3: claimPhoto mints copy to claimer
  it("claimPhoto: mints copy to claimer; owner balance unchanged", async function () {
    const { contract, owner, claimer } = await loadFixture(deployAndMintFixture);
    const tokenId = 1n;

    await expect(contract.claimPhoto(tokenId, claimer.address))
      .to.emit(contract, "PhotoClaimed")
      .withArgs(tokenId, claimer.address);

    expect(await contract.balanceOf(claimer.address, tokenId)).to.equal(1n);
    expect(await contract.balanceOf(owner.address, tokenId)).to.equal(1n);
  });

  // Test 4: getPhotoData returns correct data
  it("getPhotoData: returns all struct fields correctly", async function () {
    const { contract, owner } = await loadFixture(deployAndMintFixture);
    const photo = await contract.getPhotoData(1);

    expect(photo.imageHash).to.equal(IMAGE_HASH);
    expect(photo.authenticityScore).to.equal(SCORE);
    expect(photo.deviceId).to.equal(DEVICE_ID);
    expect(photo.ipfsCid).to.equal(IPFS_CID);
    expect(photo.minter).to.equal(owner.address);
    // timestamp should be a recent block timestamp (non-zero)
    expect(photo.timestamp).to.be.greaterThan(0n);
  });

  // Test 5: isHashMinted
  it("isHashMinted: returns false before mint and true after", async function () {
    const { contract } = await loadFixture(deployFixture); // fresh deployment, no mints
    expect(await contract.isHashMinted(IMAGE_HASH)).to.equal(false);
    await contract.mintProof(IMAGE_HASH, SCORE, IPFS_CID, DEVICE_ID);
    expect(await contract.isHashMinted(IMAGE_HASH)).to.equal(true);
  });

  // Test 6: score > 100 reverts
  it("mintProof: reverts with InvalidScore when score > 100", async function () {
    const { contract } = await loadFixture(deployFixture);
    await expect(
      contract.mintProof(IMAGE_HASH, 101, IPFS_CID, DEVICE_ID)
    ).to.be.revertedWithCustomError(contract, "InvalidScore").withArgs(101);
  });

  // Test 7: claimPhoto reverts for unminted tokenId
  it("claimPhoto: reverts with TokenDoesNotExist for unminted tokenId", async function () {
    const { contract, claimer } = await loadFixture(deployFixture);
    await expect(
      contract.claimPhoto(99, claimer.address)
    ).to.be.revertedWithCustomError(contract, "TokenDoesNotExist").withArgs(99);
  });

  // Test 8: getPhotoData reverts for unminted tokenId
  it("getPhotoData: reverts with TokenDoesNotExist for unminted tokenId", async function () {
    const { contract } = await loadFixture(deployFixture);
    await expect(
      contract.getPhotoData(99)
    ).to.be.revertedWithCustomError(contract, "TokenDoesNotExist").withArgs(99);
  });

  // Test 9: uri reverts for unminted tokenId
  it("uri: reverts with TokenDoesNotExist for unminted tokenId", async function () {
    const { contract } = await loadFixture(deployFixture);
    await expect(
      contract.uri(99)
    ).to.be.revertedWithCustomError(contract, "TokenDoesNotExist").withArgs(99);
  });

  // Test 10: non-owner mintProof reverts
  it("mintProof: reverts for non-owner caller", async function () {
    const { contract, nonOwner } = await loadFixture(deployFixture);
    await expect(
      contract.connect(nonOwner).mintProof(IMAGE_HASH, SCORE, IPFS_CID, DEVICE_ID)
    ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount").withArgs(nonOwner.address);
  });

  // Test 11: sequential mints increment tokenId
  it("mintProof: sequential calls produce tokenIds 1, 2, 3", async function () {
    const { contract } = await loadFixture(deployFixture);
    const hash1 = ethers.keccak256(ethers.toUtf8Bytes("photo-1"));
    const hash2 = ethers.keccak256(ethers.toUtf8Bytes("photo-2"));
    const hash3 = ethers.keccak256(ethers.toUtf8Bytes("photo-3"));

    const id1 = await contract.mintProof.staticCall(hash1, SCORE, IPFS_CID, DEVICE_ID);
    await contract.mintProof(hash1, SCORE, IPFS_CID, DEVICE_ID);

    const id2 = await contract.mintProof.staticCall(hash2, SCORE, IPFS_CID, DEVICE_ID);
    await contract.mintProof(hash2, SCORE, IPFS_CID, DEVICE_ID);

    const id3 = await contract.mintProof.staticCall(hash3, SCORE, IPFS_CID, DEVICE_ID);
    await contract.mintProof(hash3, SCORE, IPFS_CID, DEVICE_ID);

    expect(id1).to.equal(1n);
    expect(id2).to.equal(2n);
    expect(id3).to.equal(3n);
  });

  // Test 12: non-owner claimPhoto reverts
  it("claimPhoto: reverts for non-owner caller", async function () {
    const { contract, claimer, nonOwner } = await loadFixture(deployAndMintFixture);
    await expect(
      contract.connect(nonOwner).claimPhoto(1, claimer.address)
    ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount").withArgs(nonOwner.address);
  });

  // Test 13: uri returns correct ipfs string for valid token
  it("uri: returns correct ipfs:// URI for valid token", async function () {
    const { contract } = await loadFixture(deployAndMintFixture);
    expect(await contract.uri(1)).to.equal(`ipfs://${IPFS_CID}`);
  });
});
