/**
 * enrichService.js
 *
 * Shared AI-enrichment logic used by both the live server (on /create-claim)
 * and the backfill script. Fetches an image by CID and runs it through OpenAI
 * to produce a description, tags, and an embedding, recording status on the
 * claim so failures are retriable. Never throws.
 *
 * CommonJS + native fetch to match the rest of public-server.
 */

const dbService = require('./dbService');
const openaiService = require('./openaiService');
const clipService = require('./clipService');
const { computeOrientationHashes } = require('./imageHash');
const { exifSignals } = require('./imageForensics');

const LIGHTHOUSE_GATEWAY = process.env.LIGHTHOUSE_GATEWAY || 'https://unemployed-tyrannosaurus-wprec.lighthouseweb3.xyz/ipfs';

const IPFS_GATEWAYS = [
  LIGHTHOUSE_GATEWAY,
  'https://w3s.link/ipfs',
  'https://ipfs.io/ipfs',
  'https://dweb.link/ipfs'
];

/**
 * Fetch raw image bytes for a CID, trying each gateway in turn.
 * Returns { buffer, mimeType } or throws if all gateways fail.
 */
async function fetchImageBuffer(cid) {
  let lastErr;
  for (const gateway of IPFS_GATEWAYS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const upstream = await fetch(`${gateway}/${cid}`, { signal: controller.signal });
      clearTimeout(timer);
      if (!upstream.ok) { lastErr = new Error(`gateway ${gateway} -> HTTP ${upstream.status}`); continue; }
      const mimeType = upstream.headers.get('content-type') || 'image/jpeg';
      const buffer = Buffer.from(await upstream.arrayBuffer());
      if (buffer.length === 0) { lastErr = new Error(`gateway ${gateway} -> empty body`); continue; }
      return { buffer, mimeType };
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Could not fetch image for CID ${cid}: ${lastErr?.message || 'unknown error'}`);
}

/**
 * Embed and store a claim's CLIP vector — best-effort, non-throwing. Shared
 * by enrichClaim and backfillForensics since both need the same step. Skips
 * entirely (no-op) when clipService.isAvailable() is false, e.g. DISABLE_CLIP=1.
 */
async function storeClipEmbedding(claim_id, cid, buffer, mimeType) {
  if (!clipService.isAvailable()) return;
  try {
    const embedding = await clipService.embedImage(buffer, mimeType);
    await dbService.upsertClipEmbedding(claim_id, cid, embedding, 'clip-vit-base-patch32', embedding.length);
  } catch (clipErr) {
    console.warn(`⚠️  Could not compute CLIP embedding for ${claim_id}: ${clipErr.message}`);
  }
}

/**
 * Enrich a claim with an OpenAI description + tags + embedding.
 * Self-contained and never throws — records status on the claim so it can be
 * retried via POST /api/enrich/:claim_id or the backfill script.
 * Returns the final ai_status ('done' | 'failed').
 */
async function enrichClaim(claim_id, cid) {
  if (!openaiService.isAvailable()) {
    await dbService.setClaimAI(claim_id, { ai_status: 'failed', ai_error: 'OPENAI_API_KEY not configured' });
    console.warn(`⚠️  Skipping enrichment for ${claim_id}: OpenAI not configured`);
    return 'failed';
  }
  try {
    await dbService.setClaimAI(claim_id, { ai_status: 'pending', ai_error: '' });
    const { buffer, mimeType } = await fetchImageBuffer(cid);

    // Deterministic perceptual hashes for the tamper check. Computed and
    // stored independently of OpenAI so verification works even if the
    // description step fails. Three hash families (gradient/frequency/
    // average) at all 8 rotation/mirror orientations, so a physically
    // rotated or mirrored re-upload of this image still matches on search
    // (see imageHash.computeOrientationHashes). phash/phash_dct/ahash stay
    // set to the orientation '0' entry for any older reader that expects them.
    try {
      const orientations = await computeOrientationHashes(buffer);
      const canonical = orientations.find(o => o.orientation === '0') || {};
      if (!canonical.dhash && !canonical.phash && !canonical.ahash) {
        // computeOrientationHashes swallows sharp decode errors internally
        // (so this never throws), which means an undecodable format — e.g.
        // HEIC, which this server's sharp build can't read — would otherwise
        // fail completely silently at ingest time. Log it so it's at least
        // visible in the server logs instead of just quietly never matching.
        console.warn(`⚠️  Claim ${claim_id}: image did not decode for any perceptual hash (unsupported format or corrupt file?)`);
      }
      await dbService.setClaimAI(claim_id, {
        phash: canonical.dhash || null,
        phash_dct: canonical.phash || null,
        ahash: canonical.ahash || null,
        orientation_hashes: orientations
      });
    } catch (hashErr) {
      console.warn(`⚠️  Could not compute perceptual hashes for ${claim_id}: ${hashErr.message}`);
    }

    // EXIF forensics on the on-chain original itself — best-effort, non-
    // authoritative. Mostly useful to flag if a "camera" claim was actually
    // captured/re-saved through editing software before being submitted.
    try {
      const exif = await exifSignals(buffer);
      await dbService.setClaimAI(claim_id, { exif_signal: exif });
    } catch (exifErr) {
      console.warn(`⚠️  Could not extract EXIF signal for ${claim_id}: ${exifErr.message}`);
    }

    // CLIP embedding — the semantic/visual fallback for edits heavy enough
    // (strong filters, noise) to push the hash-based tamper check past every
    // threshold. Best-effort, no-op if CLIP is disabled.
    await storeClipEmbedding(claim_id, cid, buffer, mimeType);

    const result = await openaiService.processImage(buffer, mimeType);
    await dbService.setClaimAI(claim_id, {
      description: result.description,
      tags: result.tags,
      likely_ai_generated: result.likelyAiGenerated,
      ai_assessment: result.aiAssessment,
      ai_status: 'done',
      ai_error: ''
    });
    await dbService.upsertEmbedding(claim_id, cid, result.embedding, result.model, result.dim);
    console.log(`✨ Enriched claim ${claim_id} (${result.tags.length} tags, ${result.dim}-dim embedding)`);
    return 'done';
  } catch (error) {
    await dbService.setClaimAI(claim_id, { ai_status: 'failed', ai_error: error.message });
    console.error(`❌ Enrichment failed for ${claim_id}:`, error.message);
    return 'failed';
  }
}

/**
 * Fill in ONLY the deterministic forensic fields (multi-hash + EXIF signal)
 * for a claim that already has AI enrichment but predates one of those fields
 * being added. Free — no OpenAI call — so it's safe to run against every
 * claim missing forensics without worrying about API cost or rate limits.
 * Never throws. Returns 'done' | 'failed'.
 */
async function backfillForensics(claim_id, cid) {
  try {
    const { buffer, mimeType } = await fetchImageBuffer(cid);
    const orientations = await computeOrientationHashes(buffer);
    const canonical = orientations.find(o => o.orientation === '0') || {};
    if (!canonical.dhash && !canonical.phash && !canonical.ahash) {
      console.warn(`⚠️  Claim ${claim_id}: image did not decode for any perceptual hash (unsupported format or corrupt file?)`);
    }
    const exif = await exifSignals(buffer);
    await dbService.setClaimAI(claim_id, {
      phash: canonical.dhash || null,
      phash_dct: canonical.phash || null,
      ahash: canonical.ahash || null,
      orientation_hashes: orientations,
      exif_signal: exif
    });
    await storeClipEmbedding(claim_id, cid, buffer, mimeType);
    console.log(`🔍 Backfilled forensics for ${claim_id}`);
    return 'done';
  } catch (error) {
    console.error(`❌ Forensics backfill failed for ${claim_id}:`, error.message);
    return 'failed';
  }
}

module.exports = { fetchImageBuffer, enrichClaim, backfillForensics };
