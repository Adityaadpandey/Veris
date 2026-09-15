/**
 * clipService.js
 *
 * Thin client for the CLIP-based ai-embedding-service already in this repo
 * (see ../ai-embedding-service/main.py). Unlike the dHash/pHash/aHash family
 * in imageHash.js — which compare PIXEL STATISTICS and are inherently fooled
 * by heavy filters, color grading, or noise strong enough to survive the
 * downsample — CLIP embeds what the image actually DEPICTS. A photo that's
 * been noised, grain-filtered, or run through an Instagram-style LUT still
 * embeds close to its original in CLIP space, because the model is matching
 * semantic/visual content, not pixel-level structure.
 *
 * This is the recovery path for edits heavy enough to push the hash-based
 * tamper check into "no_match": see server.js's `possible_match_semantic`
 * verdict tier.
 *
 * Entirely optional — CLIP_SERVICE_URL is unset by default, so isAvailable()
 * is false and every caller in this codebase already checks that before
 * using it (same pattern as openaiService.isAvailable()). No behavior change
 * until someone deploys ai-embedding-service and points this at it.
 *
 * CommonJS + native fetch/FormData/Blob (Node 18+) to match the rest of
 * public-server.
 */

const CLIP_SERVICE_URL = (process.env.CLIP_SERVICE_URL || '').replace(/\/+$/, '');
const CLIP_TIMEOUT_MS = parseInt(process.env.CLIP_TIMEOUT_MS || '20000', 10);

function isAvailable() {
  return Boolean(CLIP_SERVICE_URL);
}

/**
 * Send an image to ai-embedding-service and get back its CLIP embedding.
 * @returns {Promise<{ clip: number[], phash: string }>}
 */
async function embedImage(buffer, mimeType = 'image/jpeg') {
  if (!isAvailable()) throw new Error('CLIP_SERVICE_URL is not configured');

  const form = new FormData();
  form.append('image', new Blob([buffer], { type: mimeType }), 'image.jpg');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIP_TIMEOUT_MS);
  try {
    const res = await fetch(`${CLIP_SERVICE_URL}/embed`, {
      method: 'POST',
      body: form,
      signal: controller.signal
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ai-embedding-service returned HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    if (!Array.isArray(data.clip) || data.clip.length === 0) {
      throw new Error('ai-embedding-service returned no CLIP vector');
    }
    return { clip: data.clip, phash: data.phash || null };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`CLIP request timed out after ${CLIP_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { isAvailable, embedImage };
