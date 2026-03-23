import { ethers, network, artifacts } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  console.log(`Network: ${network.name} (chainId: ${chainId})`);

  const isForced = process.env.FORCE_DEPLOY === "true";
  if (chainId !== 84532n && !isForced) {
    throw new Error(
      `Wrong network! Expected Base Sepolia (84532), got ${chainId}. ` +
      `Set FORCE_DEPLOY=true to deploy anyway.`
    );
  }

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with: ${deployer.address}`);

  const LensMint = await ethers.getContractFactory("LensMint");
  const contract = await LensMint.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`LensMint deployed to: ${address}`);

  // Write ABI to backend
  const artifact = await artifacts.readArtifact("LensMint");
  const abiDir = path.resolve(__dirname, "../../backend/abi");
  fs.mkdirSync(abiDir, { recursive: true });
  const abiPath = path.join(abiDir, "LensMint.json");
  fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));
  console.log(`ABI written to: ${abiPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
