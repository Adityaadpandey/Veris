/**
 * enrichService.js
 *
 * Shared AI-enrichment logic used by both the live server (on /create-claim)
 * and the backfill script. Fetches an image by CID and runs it through Gemini
 * to produce a description, tags, and an embedding, recording status on the
 * claim so failures are retriable. Never throws.
 *
 * CommonJS + native fetch to match the rest of public-server.
 */

const dbService = require('./dbService');
const geminiService = require('./geminiService');
const { dHash } = require('./imageHash');

const LIGHTHOUSE_GATEWAY = process.env.LIGHTHOUSE_GATEWAY || 'https://structural-crocodile-le3p6.lighthouseweb3.xyz/ipfs';

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
 * Enrich a claim with a Gemini description + tags + embedding.
 * Self-contained and never throws — records status on the claim so it can be
 * retried via POST /api/enrich/:claim_id or the backfill script.
 * Returns the final ai_status ('done' | 'failed').
 */
async function enrichClaim(claim_id, cid) {
  if (!geminiService.isAvailable()) {
    dbService.setClaimAI(claim_id, { ai_status: 'failed', ai_error: 'GEMINI_API_KEY not configured' });
    console.warn(`⚠️  Skipping enrichment for ${claim_id}: Gemini not configured`);
    return 'failed';
  }
  try {
    dbService.setClaimAI(claim_id, { ai_status: 'pending', ai_error: '' });
    const { buffer, mimeType } = await fetchImageBuffer(cid);

    // Deterministic perceptual hash for the tamper check. Computed and stored
    // independently of Gemini so verification works even if description fails.
    try {
      const phash = await dHash(buffer);
      dbService.setClaimAI(claim_id, { phash });
    } catch (hashErr) {
      console.warn(`⚠️  Could not compute perceptual hash for ${claim_id}: ${hashErr.message}`);
    }

    const result = await geminiService.processImage(buffer, mimeType);
    dbService.setClaimAI(claim_id, {
      description: result.description,
      tags: result.tags,
      ai_status: 'done',
      ai_error: ''
    });
    dbService.upsertEmbedding(claim_id, cid, result.embedding, result.model, result.dim);
    console.log(`✨ Enriched claim ${claim_id} (${result.tags.length} tags, ${result.dim}-dim embedding)`);
    return 'done';
  } catch (error) {
    dbService.setClaimAI(claim_id, { ai_status: 'failed', ai_error: error.message });
    console.error(`❌ Enrichment failed for ${claim_id}:`, error.message);
    return 'failed';
  }
}

module.exports = { fetchImageBuffer, enrichClaim };
