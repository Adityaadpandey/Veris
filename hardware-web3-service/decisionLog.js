import { publishProvenance } from './provenance.js';
import dbService from './dbService.js';
import storageService from './storageService.js';
import zerogStorageService from './zerogStorageService.js';

// One JSON record per capture: what was checked, by which engine, and what it said.
export function buildDecisionLog(image, liveness) {
  return {
    version: 1,
    imageHash: image.image_hash,
    companionHash: image.companion_hash || null,
    deviceAddress: image.device_address,
    nonce: image.packet_nonce,
    verdict: image.verdict,
    engine: liveness?.engine || null,   // '0g' or 'gpt'
    requestId: liveness?.request_id || null,
    teeVerified: liveness?.tee_verified ?? null,
    live: liveness?.live ?? null,
    consistent: liveness?.consistent ?? null,
    confidence: liveness?.confidence ?? null,
    reasons: liveness?.reasons || [],
    capturedAt: image.packet_ts ? new Date(image.packet_ts).toISOString() : null,
    receivedAt: new Date().toISOString(),
  };
}

// Never throws: if storage is down the log stays in the DB and the retry sweep picks it up.
export async function storeDecisionLog(image) {
  if (!image.decision_log || image.decision_log_ref || !storageService.initialized) return null;
  try {
    const log = JSON.parse(image.decision_log);
    // the log is meant to live on 0G; only fall back to the normal storage order if 0G fails
    const ref = await zerogStorageService.uploadMetadata(log).catch(() => storageService.uploadMetadata(log));
    dbService.setDecisionLogRef(image.id, ref);
    publishProvenance(image.id);
    return ref;
  } catch (e) {
    console.warn(`   ⚠️ Decision log for image ${image.id} not stored yet: ${e.message}`);
    return null;
  }
}

export async function retryDecisionLogs() {
  for (const image of dbService.getImagesNeedingDecisionLog()) await storeDecisionLog(image);
}
