import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DeploymentService {
  constructor() {
    this.deployment = null;
    this.deploymentPath = null;
  }

  loadDeployment() {
    // Try multiple possible paths for deployment.json
    const possiblePaths = [
      path.join(__dirname, 'deployment.json'),
      process.env.DEPLOYMENT_JSON_PATH ? path.resolve(process.env.DEPLOYMENT_JSON_PATH) : null,
      path.join(__dirname, '../contracts/deployment.json'),
      path.join(__dirname, '../../deployment.json')
    ].filter(Boolean);

    for (const deploymentPath of possiblePaths) {
      try {
        if (fs.existsSync(deploymentPath)) {
          const content = fs.readFileSync(deploymentPath, 'utf8');
          this.deployment = JSON.parse(content);
          this.deploymentPath = deploymentPath;
          console.log(`✅ Loaded deployment from: ${deploymentPath}`);
          return true;
        }
      } catch (error) {
        console.warn(`⚠️  Could not load deployment from ${deploymentPath}:`, error.message);
      }
    }

    return false;
  }

  // Deployment for one chain: deployment-<chainId>.json if the deploy script made one,
  // else the old single deployment.json when it happens to be for that chain.
  forChain(chainId) {
    this._chains = this._chains || {};
    if (this._chains[chainId] !== undefined) return this._chains[chainId];
    const dirs = [__dirname, path.join(__dirname, '../contracts')];
    if (process.env.DEPLOYMENT_JSON_PATH) dirs.push(path.dirname(path.resolve(process.env.DEPLOYMENT_JSON_PATH)));
    let found = null;
    for (const dir of dirs) {
      const file = path.join(dir, `deployment-${chainId}.json`);
      try {
        if (fs.existsSync(file)) { found = JSON.parse(fs.readFileSync(file, 'utf8')); break; }
      } catch (e) {
        console.warn(`⚠️  Could not load ${file}: ${e.message}`);
      }
    }
    if (!found) {
      const legacy = this.getDeployment();
      if (legacy && Number(legacy.chainId) === Number(chainId)) found = legacy;
    }
    this._chains[chainId] = found && {
      deployment: found,
      deviceRegistryAddress: found.contracts?.DeviceRegistry?.address || null,
      verisAddress: found.contracts?.CandidERC1155?.address || null,
      deviceRegistryABI: found.contracts?.DeviceRegistry?.abi || null,
      verisABI: found.contracts?.CandidERC1155?.abi || null,
    };
    return this._chains[chainId];
  }

  getContractAddress(contractName) {
    if (!this.deployment) {
      if (!this.loadDeployment()) {
        return null;
      }
    }

    const contract = this.deployment.contracts?.[contractName];
    return contract?.address || null;
  }

  getContractABI(contractName) {
    if (!this.deployment) {
      if (!this.loadDeployment()) {
        return null;
      }
    }

    const contract = this.deployment.contracts?.[contractName];
    return contract?.abi || null;
  }

  getDeployment() {
    if (!this.deployment) {
      if (!this.loadDeployment()) {
        return null;
      }
    }

    return this.deployment;
  }

  getNetwork() {
    if (!this.deployment) {
      if (!this.loadDeployment()) {
        return null;
      }
    }

    return {
      network: this.deployment.network,
      chainId: this.deployment.chainId
    };
  }

  isLoaded() {
    return this.deployment !== null;
  }

  getDeviceRegistryAddress() {
    return this.getContractAddress('DeviceRegistry');
  }

  getVerisAddress() {
    return this.getContractAddress('CandidERC1155');
  }

  getDeviceRegistryABI() {
    return this.getContractABI('DeviceRegistry');
  }

  getVerisABI() {
    return this.getContractABI('CandidERC1155');
  }
}

const deploymentService = new DeploymentService();

export default deploymentService;
