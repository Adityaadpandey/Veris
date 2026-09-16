/**
 * imageHash.js
 *
 * Deterministic image fingerprinting for the "Verify & Search" flow.
 *
 *   - sha256Hex(buffer)     exact content hash (matches the hardware camera's
 *                           hashlib.sha256(image_data).hexdigest(), so an upload
 *                           of the original bytes matches the on-chain image_hash)
 *   - dHash(buffer)         64-bit perceptual (difference) hash, robust to
 *                           re-encoding / minor edits, returned as 16 hex chars
 *   - hammingDistance(a,b)  number of differing bits between two hex hashes
 *
 * These are pure functions with no external services — same input always yields
 * the same output — which is what makes the tamper verdict provable, not fuzzy.
 *
 * CommonJS to match the rest of public-server. Uses `sharp` for decoding.
 */

const crypto = require('crypto');
const sharp = require('sharp');

/** SHA-256 of the raw bytes, lowercase hex (no prefix). */
function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * dHash: resize to 9x8 grayscale, then for each row compare each pixel to the
 * one on its right. 8 rows x 8 comparisons = 64 bits, packed into 16 hex chars.
 * Robust to scaling, compression, and small edits; sensitive to real content
 * changes. Deterministic for a given input.
 */
async function dHash(buffer) {
  const width = 9;
  const height = 8;
  // raw single-channel (grayscale) pixel buffer, 72 bytes
  const pixels = await sharp(buffer)
    .grayscale()
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer();

  const bits = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width - 1; col++) {
      const left = pixels[row * width + col];
      const right = pixels[row * width + col + 1];
      bits.push(left > right ? 1 : 0);
    }
  }

  // Pack 64 bits into a 16-char hex string, 4 bits at a time.
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hex += nibble.toString(16);
  }
  return hex;
}

// Popcount lookup for a nibble (0-15).
const NIBBLE_BITS = Array.from({ length: 16 }, (_, n) =>
  ((n >> 0) & 1) + ((n >> 1) & 1) + ((n >> 2) & 1) + ((n >> 3) & 1)
);

/**
 * Hamming distance between two equal-length hex hashes = number of differing
 * bits. Returns Infinity if the hashes are missing or different lengths (i.e.
 * incomparable), so callers never treat a non-comparison as a close match.
 */
function hammingDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    if (Number.isNaN(xor)) return Infinity;
    dist += NIBBLE_BITS[xor];
  }
  return dist;
}

module.exports = { sha256Hex, dHash, hammingDistance };
