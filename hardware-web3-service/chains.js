import { ethers } from 'ethers';
import web3Service, { Web3Service } from './web3Service.js';
import dbService from './dbService.js';
import { buildPacketMessage } from './packet.js';
import { publishProvenance } from './provenance.js';

// Chains a capture can be minted on. The original service (RPC_URL + deployment.json) stays the
// primary one; CHAINS=sepolia,arc adds a secondary service for every other name in the list.
// Arc values are from docs.arc.network (testnet); gas there is paid in USDC.
export const CHAIN_INFO = {
  sepolia: { chainId: 11155111, rpcEnv: 'SEPOLIA_RPC_URL', explorer: 'https://sepolia.etherscan.io' },
  'base-sepolia': { chainId: 84532, rpcEnv: 'BASE_SEPOLIA_RPC_URL', defaultRpc: 'https://sepolia.base.org', explorer: 'https://sepolia.basescan.org' },
  arc: { chainId: 5042002, rpcEnv: 'ARC_RPC_URL', defaultRpc: 'https://rpc.testnet.arc.network', explorer: 'https://testnet.arcscan.app' },
};

export const explorerTxUrl = (chainName, txHash) =>
  CHAIN_INFO[chainName] && txHash ? `${CHAIN_INFO[chainName].explorer}/tx/${txHash}` : null;

const secondaries = new Map(); // chain name -> Web3Service
let primaryName = 'sepolia';
export const primaryChainName = () => primaryName;

export async function initChains() {
  const wanted = (process.env.CHAINS || 'sepolia').split(',').map((c) => c.trim()).filter(Boolean);
  const primaryChainId = web3Service.initialized ? Number((await web3Service.provider.getNetwork()).chainId) : null;
  primaryName = Object.keys(CHAIN_INFO).find((n) => CHAIN_INFO[n].chainId === primaryChainId) || wanted[0] || primaryName;
  for (const name of wanted) {
    const info = CHAIN_INFO[name];
    if (!info) { console.warn(`⚠️ Unknown chain "${name}" in CHAINS, skipping`); continue; }
    if (info.chainId === primaryChainId) continue; // that one is the primary service
    const service = new Web3Service({ name, ...info });
    if (await service.initialize()) {
      secondaries.set(name, service);
      console.log(`✅ Secondary chain ready: ${name}`);
    }
  }
}

export const packetHashFor = (image) =>
  image?.packet_nonce
    ? ethers.keccak256(ethers.toUtf8Bytes(buildPacketMessage({
        imageHash: image.image_hash, companionHash: image.companion_hash, verdict: image.verdict,
        timestamp: image.packet_ts, nonce: image.packet_nonce, deviceAddress: image.device_address,
      })))
    : null;

async function mintSecondary(row) {
  const service = secondaries.get(row.chain);
  if (!service) return; // chain not configured (or its RPC was down at boot); stays pending
  try {
    const r = await service.mintOriginal(JSON.parse(row.payload));
    dbService.saveChainMint(row.image_id, row.chain, { status: 'minted', token_id: r.tokenId, tx_hash: r.txHash, error: null });
    console.log(`   ✅ ${row.chain} mint: token ${r.tokenId}`);
    publishProvenance(row.image_id);
  } catch (e) {
    dbService.saveChainMint(row.image_id, row.chain, { status: 'pending', error: e.message, bumpAttempts: true });
    console.warn(`   ⚠️ ${row.chain} mint failed, queued for retry: ${e.message}`);
  }
}

// Mints on the primary chain (its result is what callers wait for), then on every other
// configured chain in the background. A secondary chain being down never fails the primary mint.
export async function mintEverywhere(image, { recipient, ipfsHash }) {
  const payload = {
    recipient, ipfsHash, imageHash: image.image_hash, signature: image.signature,
    packetHash: packetHashFor(image), maxEditions: 0,
  };
  const primary = await web3Service.mintOriginal(payload);
  for (const chain of secondaries.keys()) {
    dbService.saveChainMint(image.id, chain, { status: 'pending', payload: JSON.stringify(payload) });
    mintSecondary({ image_id: image.id, chain, payload: JSON.stringify(payload) });
  }
  return primary;
}

export async function retrySecondaryMints() {
  for (const row of dbService.getPendingChainMints()) await mintSecondary(row);
}
