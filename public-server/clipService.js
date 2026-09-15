/**
 * clipService.js
 *
 * In-process CLIP image embeddings via @xenova/transformers (ONNX Runtime),
 * so semantic/visual similarity works directly inside public-server on
 * Render — no separate model-serving deployment to stand up or depend on.
 *
 * Unlike dHash/pHash/aHash (imageHash.js), which compare PIXEL STATISTICS
 * and can be pushed past every threshold by heavy noise or a strong color
 * filter, CLIP embeds what the image actually DEPICTS. A photo that's been
 * noised, grain-filtered, or run through a heavy color/brightness LUT still
 * embeds close to its original in CLIP space, because the model is matching
 * semantic/visual content rather than pixel-level structure. Verified locally:
 * a synthetic image run through brightness+saturation+hue+blur+gamma edits
 * still scored 0.86 cosine similarity against its own original, vs 0.70 for a
 * genuinely different image — a clear, usable gap. This is the recovery path
 * for edits heavy enough to push the hash-based tamper check into "no_match"
 * — see server.js's `possible_match_semantic` verdict tier.
 *
 * Model: Xenova/clip-vit-base-patch32, quantized ONNX (~85MB on disk,
 * downloaded once on first boot and cached under the OS temp/cache dir — no
 * external API calls after that). First embedding call after a cold start
 * pays ~10-15s model-load latency; every call after that is ~30ms on CPU.
 * Loading is kicked off at process start (below) so that cost is usually
 * absorbed before the first real request arrives.
 *
 * This DOES add real memory to the public-server process (roughly
 * 150-250MB resident once loaded) — that's easily most of the budget on a
 * small (e.g. 512MB) Render instance on top of everything else the process
 * already holds (Postgres pool, Express, sharp, OpenAI client). So this is
 * OPT-IN, off by default: set ENABLE_CLIP=1 explicitly once the instance size
 * accounts for it. Every caller already checks isAvailable() first (same
 * pattern as openaiService), so the rest of Verify & Search works completely
 * normally without it — CLIP is purely an additive recovery signal, nothing
 * else depends on it.
 *
 * Nothing loads at require-time even when enabled — the model is loaded
 * lazily on the FIRST call that actually needs it (embedImage), so simply
 * requiring this module never costs memory. That first call pays the ~10-15s
 * load latency; every call after that is ~30ms on CPU.
 *
 * CommonJS wrapping a dynamic import, since @xenova/transformers is ESM-only.
 */

const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');

const MODEL_ID = process.env.CLIP_MODEL_ID || 'Xenova/clip-vit-base-patch32';
const ENABLED = process.env.ENABLE_CLIP === '1' || process.env.ENABLE_CLIP === 'true';

let extractorPromise = null;

function isAvailable() {
  return ENABLED;
}

function loadExtractor() {
  if (!extractorPromise) {
    extractorPromise = import('@xenova/transformers')
      .then(({ pipeline }) => {
        console.log(`🧠 Loading CLIP model (${MODEL_ID})...`);
        return pipeline('image-feature-extraction', MODEL_ID);
      })
      .then(extractor => {
        console.log('✅ CLIP model ready');
        return extractor;
      })
      .catch(err => {
        extractorPromise = null; // allow a retry on the next call instead of wedging forever
        throw err;
      });
  }
  return extractorPromise;
}

function l2normalize(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return Array.from(vec);
  return Array.from(vec, v => v / norm);
}

/**
 * Embed an image buffer with CLIP.
 * The underlying pipeline only reliably accepts a file path or URL (not a
 * data: URL), so this writes to a short-lived temp file and always cleans it
 * up, even on failure.
 * @returns {Promise<number[]>} 512-dim L2-normalized embedding
 */
async function embedImage(buffer, mimeType = 'image/jpeg') {
  if (!isAvailable()) throw new Error('CLIP is disabled (set ENABLE_CLIP=1 to turn it on)');

  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const tmpPath = path.join(os.tmpdir(), `veris-clip-${crypto.randomBytes(8).toString('hex')}.${ext}`);
  await fs.writeFile(tmpPath, buffer);

  try {
    const extractor = await loadExtractor();
    const out = await extractor(tmpPath, { pooling: 'mean' });
    return l2normalize(Array.from(out.data));
  } finally {
    fs.unlink(tmpPath).catch(() => {});
  }
}

/** Cosine similarity between two already-normalized vectors (plain dot product). */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

module.exports = { isAvailable, embedImage, cosineSimilarity };
