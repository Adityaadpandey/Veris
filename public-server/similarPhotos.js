/**
 * similarPhotos.js
 *
 * Shared "visually similar verified photos" ranking used by both
 * POST /api/search and GET /api/similar/:claim_id, so the two routes can't
 * drift out of sync the way they did before: /api/similar/:claim_id already
 * excluded the claim it was called for, but /api/search never excluded a
 * claim it had just matched exactly (or via the hash-tamper vote), so a
 * byte-identical re-upload showed up again in its own "visually similar"
 * list.
 *
 * Blends two independent signals into one headline score:
 *   - visual  — deterministic multi-hash (dHash + pHash-DCT + aHash) closeness,
 *               see imageHash.combinedHashDistance.
 *   - content — CLIP image-embedding cosine when available (clipService.js),
 *               since that compares actual pixel content and gives an
 *               identical image ~1.0, deterministically. Falls back to the
 *               OpenAI caption-text-embedding cosine only when a CLIP
 *               embedding is missing on either side (CLIP disabled, or the
 *               candidate predates CLIP backfill) — a freshly re-generated
 *               caption is not deterministic, so even a re-uploaded IDENTICAL
 *               image could previously score well under 100% there.
 *
 * CommonJS to match the rest of public-server.
 */

const { cosineSimilarity: textCosineSimilarity } = require('./openaiService');
const clipService = require('./clipService');
const { bestCombinedHashDistance } = require('./imageHash');

const SEARCH_VISUAL_WEIGHT = Math.min(Math.max(
  parseFloat(process.env.SEARCH_VISUAL_WEIGHT || '0.7'), 0), 1);
const SEARCH_CONTENT_WEIGHT = 1 - SEARCH_VISUAL_WEIGHT;

function blendedSimilarity(visual, content) {
  const c = Math.max(0, Math.min(1, content));
  if (visual === null || visual === undefined) {
    return { score: c, visual: null, content: c };
  }
  const v = Math.max(0, Math.min(1, visual));
  return {
    score: SEARCH_VISUAL_WEIGHT * v + SEARCH_CONTENT_WEIGHT * c,
    visual: v,
    content: c
  };
}

function rowOrientationHashes(row) {
  if (row.orientation_hashes) {
    try {
      const parsed = typeof row.orientation_hashes === 'string'
        ? JSON.parse(row.orientation_hashes)
        : row.orientation_hashes;
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      // fall through to the legacy single-orientation shape below
    }
  }
  if (row.phash || row.phash_dct || row.ahash) {
    return [{ orientation: '0', dhash: row.phash, phash: row.phash_dct, ahash: row.ahash }];
  }
  return [];
}

function contentSimilarity(query, row) {
  if (query.clipEmbedding && row.clip_embedding) {
    let storedClip;
    try { storedClip = JSON.parse(row.clip_embedding); } catch { storedClip = null; }
    if (storedClip) return clipService.cosineSimilarity(query.clipEmbedding, storedClip);
  }
  if (query.textEmbedding && row.embedding) {
    let storedText;
    try { storedText = JSON.parse(row.embedding); } catch { storedText = null; }
    if (storedText) return textCosineSimilarity(query.textEmbedding, storedText);
  }
  return 0;
}

function buildSimilarResults({ rows, excludeClaimId = null, query, frontendUrl, minScore, limit }) {
  return rows
    .filter(row => row.claim_id !== excludeClaimId)
    .map(row => {
      const content = contentSimilarity(query, row);
      const cmp = bestCombinedHashDistance(query.hashes, rowOrientationHashes(row));
      const visual = cmp.distance === null ? null : 1 - cmp.distance;
      const blend = blendedSimilarity(visual, content);
      let tags = [];
      try { tags = row.tags ? JSON.parse(row.tags) : []; } catch { tags = []; }
      return {
        claim_id: row.claim_id,
        token_id: row.token_id || null,
        cid: row.cid,
        recipient_address: row.recipient_address || null,
        device_id: row.device_id || null,
        created_at: row.created_at,
        description: row.description || null,
        tags,
        similarity: Math.round(blend.score * 100) / 100,
        visual_similarity: blend.visual === null ? null : Math.round(blend.visual * 100) / 100,
        content_similarity: Math.round(blend.content * 100) / 100,
        claim_url: `${frontendUrl}/claim/${row.claim_id}`
      };
    })
    .filter(r => r.similarity >= minScore)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

module.exports = { blendedSimilarity, rowOrientationHashes, contentSimilarity, buildSimilarResults };
