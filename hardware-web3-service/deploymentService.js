import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolves the Anchor program's deployment.json + IDL, checked in under
// solana-program/ at the repo root. Paths are resolved relative to this
// service's directory so it works regardless of CWD, with env overrides
// for flexibility (e.g. running from a different checkout layout).
class DeploymentService {
  constructor() {
    this.deployment = null;
    this.idl = null;
    this.deploymentPath = null;
    this.idlPath = null;
  }

  _candidatePaths(envVar, relativeSuffix) {
    return [
      process.env[envVar] ? path.resolve(process.env[envVar]) : null,
      path.join(__dirname, '..', 'solana-program', relativeSuffix),
      path.join(__dirname, 'solana-program', relativeSuffix),
      path.join(process.cwd(), 'solana-program', relativeSuffix),
    ].filter(Boolean);
  }

  loadDeployment() {
    if (this.deployment) return true;

    for (const candidate of this._candidatePaths('SOLANA_DEPLOYMENT_PATH', 'deployment.json')) {
      try {
        if (fs.existsSync(candidate)) {
          this.deployment = JSON.parse(fs.readFileSync(candidate, 'utf8'));
          this.deploymentPath = candidate;
          console.log(`✅ Loaded Solana deployment from: ${candidate}`);
          return true;
        }
      } catch (error) {
        console.warn(`⚠️  Could not load deployment from ${candidate}:`, error.message);
      }
    }

    console.warn('⚠️  solana-program/deployment.json not found in any known location');
    return false;
  }

  loadIdl() {
    if (this.idl) return true;

    for (const candidate of this._candidatePaths('VERIS_IDL_PATH', path.join('idl', 'veris.json'))) {
      try {
        if (fs.existsSync(candidate)) {
          this.idl = JSON.parse(fs.readFileSync(candidate, 'utf8'));
          this.idlPath = candidate;
          console.log(`✅ Loaded veris IDL from: ${candidate}`);
          return true;
        }
      } catch (error) {
        console.warn(`⚠️  Could not load IDL from ${candidate}:`, error.message);
      }
    }

    console.warn('⚠️  solana-program/idl/veris.json not found in any known location');
    return false;
  }

  getDeployment() {
    if (!this.deployment && !this.loadDeployment()) return null;
    return this.deployment;
  }

  getIdl() {
    if (!this.idl && !this.loadIdl()) return null;
    return this.idl;
  }

  getProgramId() {
    const deployment = this.getDeployment();
    if (deployment?.programId) return deployment.programId;
    const idl = this.getIdl();
    return idl?.address || process.env.VERIS_PROGRAM_ID || null;
  }

  getCluster() {
    return this.getDeployment()?.cluster || process.env.SOLANA_CLUSTER || 'devnet';
  }

  getRpcUrl() {
    return (
      this.getDeployment()?.rpcUrl ||
      process.env.SOLANA_RPC_URL ||
      'https://api.devnet.solana.com'
    );
  }

  isLoaded() {
    return this.deployment !== null && this.idl !== null;
  }
}

const deploymentService = new DeploymentService();

export default deploymentService;
