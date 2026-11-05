import dbService from './dbService.js';
import claimClient from './claimClient.js';
import { isZerogRef, rootFromRef } from './zerogStorageService.js';
import { explorerTxUrl, primaryChainName } from './chains.js';

// ZEROG_STORAGESCAN_URL is the StorageScan link with {root} where the root hash goes
const storageLink = (ref) => {
  if (!ref) return null;
  if (!isZerogRef(ref)) return `ipfs://${ref}`;
  const template = process.env.ZEROG_STORAGESCAN_URL;
  return template ? template.replace('{root}', rootFromRef(ref)) : `0g://${rootFromRef(ref)}`;
};

// Everything the claim page shows about a capture, in one record. Safe to call again whenever
// something changes (decision log stored, a chain mint finished); each call sends the full state.
// Never throws: provenance is extra information and must not break a mint.
export async function publishProvenance(imageId) {
  try {
    const image = dbService.getImageById(imageId);
    if (!image?.claim_id) return;
    const decision = image.decision_log ? JSON.parse(image.decision_log) : {};

    const chains = [];
    if (image.token_id != null) {
      const name = primaryChainName();
      chains.push({ chain: name, tokenId: String(image.token_id), txHash: image.tx_hash, explorerUrl: explorerTxUrl(name, image.tx_hash) });
    }
    for (const m of dbService.getChainMints(image.id)) {
      if (m.status === 'minted') chains.push({ chain: m.chain, tokenId: m.token_id, txHash: m.tx_hash, explorerUrl: explorerTxUrl(m.chain, m.tx_hash) });
    }

    await claimClient.postProvenance(image.claim_id, {
      imageHash: image.image_hash,
      owner: image.recipient_address || process.env.OWNER_WALLET_ADDRESS || null,
      verdict: image.verdict || 'pending',
      engine: decision.engine || null,          // '0g' or 'gpt'; the claim page hides the 0G block for 'gpt'
      requestId: decision.requestId || null,
      teeVerified: decision.teeVerified ?? null,
      confidence: decision.confidence ?? null,
      reasons: decision.reasons || [],
      storage: {
        image: { ref: image.filecoin_cid, link: storageLink(image.filecoin_cid) },
        metadata: { ref: image.filecoin_metadata_cid, link: storageLink(image.filecoin_metadata_cid) },
        decisionLog: { ref: image.decision_log_ref, link: storageLink(image.decision_log_ref) },
      },
      chains,
    });
  } catch (e) {
    console.warn(`⚠️ Could not publish provenance for image ${imageId}: ${e.message}`);
  }
}
