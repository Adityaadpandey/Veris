/**
 * imageHash.js
 *
 * Deterministic image fingerprinting for the "Verify & Search" flow.
 *
 *   - sha256Hex(buffer)     exact content hash (matches the hardware camera's
 *                           hashlib.sha256(image_data).hexdigest(), so an upload
 *                           of the original bytes matches the on-chain image_hash)
 *   - dHash(buffer)         64-bit gradient hash. Robust to re-encoding and
 *                           minor edits; sensitive to structural content changes.
 *   - pHash(buffer)         64-bit DCT (frequency-domain) hash. Catches the
 *                           edits dHash tends to miss — color/contrast grading,
 *                           heavier JPEG recompression, blur/sharpen — because
 *                           it looks at low-frequency structure rather than
 *                           pixel-to-pixel gradients.
 *   - aHash(buffer)         64-bit average (mean-threshold) hash. Cheap, catches
 *                           near-duplicates fastest but is more brightness-
 *                           sensitive; used as a third vote, weighted lowest.
 *   - hammingDistance(a,b)  number of differing bits between two same-length hex
 *                           hashes.
 *   - computeHashes(buffer) all three perceptual hashes in one call.
 *   - combinedHashDistance(a, b)  weighted 0..1 dissimilarity across whichever
 *                           of {dhash, phash, ahash} both sides have, so a
 *                           single missing hash (e.g. not yet backfilled)
 *                           degrades gracefully instead of failing outright.
 *
 * These are pure functions with no external services — same input always yields
 * the same output — which is what makes the tamper verdict provable, not fuzzy.
 * Combining three hash families matters because each is blind to a different
 * class of edit; voting across all three is far harder to fool than any one
 * alone.
 *
 * CommonJS to match the rest of public-server. Uses `sharp` for decoding.
 */

const crypto = require('crypto');
const sharp = require('sharp');

/** SHA-256 of the raw bytes, lowercase hex (no prefix). */
function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** Pack an array of 0/1 bits (length must be a multiple of 4) into lowercase hex. */
function bitsToHex(bits) {
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hex += nibble.toString(16);
  }
  return hex;
}

/**
 * dHash: resize to 9x8 grayscale, then for each row compare each pixel to the
 * one on its right. 8 rows x 8 comparisons = 64 bits.
 */
async function dHash(buffer) {
  const width = 9;
  const height = 8;
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
  return bitsToHex(bits);
}

/**
 * aHash: resize to 8x8 grayscale, threshold every pixel against the mean.
 */
async function aHash(buffer) {
  const size = 8;
  const pixels = await sharp(buffer)
    .grayscale()
    .resize(size, size, { fit: 'fill' })
    .raw()
    .toBuffer();

  let sum = 0;
  for (let i = 0; i < pixels.length; i++) sum += pixels[i];
  const mean = sum / pixels.length;

  const bits = [];
  for (let i = 0; i < pixels.length; i++) bits.push(pixels[i] > mean ? 1 : 0);
  return bitsToHex(bits);
}

// 1D DCT-II along one axis of an NxN matrix (applied twice for a 2D DCT).
// N=32 keeps this at ~32k multiply-adds per axis pass — negligible even on
// modest hardware, so no need for an FFT-based shortcut.
function dct1d(vector) {
  const n = vector.length;
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += vector[i] * Math.cos((Math.PI / n) * (i + 0.5) * k);
    }
    out[k] = sum * (k === 0 ? Math.sqrt(1 / n) : Math.sqrt(2 / n));
  }
  return out;
}

function dct2d(matrix, n) {
  // Rows first.
  const rows = [];
  for (let r = 0; r < n; r++) {
    rows.push(dct1d(matrix.subarray(r * n, r * n + n)));
  }
  // Then columns of the row-transformed result.
  const out = new Float64Array(n * n);
  for (let c = 0; c < n; c++) {
    const col = new Float64Array(n);
    for (let r = 0; r < n; r++) col[r] = rows[r][c];
    const transformed = dct1d(col);
    for (let r = 0; r < n; r++) out[r * n + c] = transformed[r];
  }
  return out;
}

/**
 * pHash: the classic Krawetz perceptual hash.
 *   1. Downscale to 32x32 grayscale (low-pass first via sharp's resize).
 *   2. 2D DCT of the 32x32 block.
 *   3. Keep the top-left 8x8 low-frequency coefficients (dropping the DC term).
 *   4. Threshold each against their median -> 64 bits.
 * Frequency-domain, so it's far less sensitive to pixel-level noise/gradient
 * changes than dHash and catches color/contrast/blur edits dHash misses.
 */
async function pHash(buffer) {
  const n = 32;
  const raw = await sharp(buffer)
    .grayscale()
    .resize(n, n, { fit: 'fill' })
    .raw()
    .toBuffer();

  const matrix = new Float64Array(n * n);
  for (let i = 0; i < matrix.length; i++) matrix[i] = raw[i];

  const freq = dct2d(matrix, n);

  const keep = 8;
  const coeffs = [];
  for (let r = 0; r < keep; r++) {
    for (let c = 0; c < keep; c++) {
      if (r === 0 && c === 0) continue; // drop DC (overall brightness)
      coeffs.push(freq[r * n + c]);
    }
  }

  const sorted = [...coeffs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  // 63 coefficients (8x8 minus DC) rounds down to 60 usable bits (multiple of
  // 4 for hex packing); that's still a strong, well-tested signal in practice.
  const bits = coeffs.slice(0, 60).map(v => (v > median ? 1 : 0));
  return bitsToHex(bits);
}

/** Compute all three perceptual hashes for a buffer in parallel. */
async function computeHashes(buffer) {
  const [dhash, phash, ahash] = await Promise.all([
    dHash(buffer).catch(() => null),
    pHash(buffer).catch(() => null),
    aHash(buffer).catch(() => null)
  ]);
  return { dhash, phash, ahash };
}

// The 8 members of the dihedral group D4: the 4 axis-aligned rotations, each
// with and without a horizontal mirror. dHash/pHash/aHash all compare
// pixels/coefficients at fixed positions, so none of them are rotation- or
// mirror-invariant on their own — a physically rotated re-upload of an
// on-chain image hashes completely differently at orientation '0'. Hashing
// every orientation once at ingest time and matching a query against all of
// them fixes that without needing the query itself to be rotated.
const ORIENTATIONS = ['0', '90', '180', '270', '0-flip', '90-flip', '180-flip', '270-flip'];

/**
 * Render `buffer` rotated (0/90/180/270 degrees) and optionally mirrored
 * horizontally. Uses an explicit numeric angle, which makes sharp rotate the
 * actual pixel grid rather than just auto-orienting from EXIF, so this is a
 * genuine pixel-level transform independent of whatever orientation tag the
 * file carries.
 */
async function transformForOrientation(buffer, orientation) {
  const [angleStr, flip] = orientation.split('-');
  const angle = parseInt(angleStr, 10);
  let pipeline = sharp(buffer);
  if (angle) pipeline = pipeline.rotate(angle);
  if (flip === 'flip') pipeline = pipeline.flop();
  return pipeline.png().toBuffer();
}

/**
 * All three perceptual hashes at each of the 8 orientations in ORIENTATIONS.
 * Meant to be computed once per image at ingest/backfill time and stored, so
 * search-time matching can compare a query's single hash set against every
 * stored orientation (see bestCombinedHashDistance) instead of requiring the
 * query to already be right-side-up.
 */
async function computeOrientationHashes(buffer) {
  const results = [];
  for (const orientation of ORIENTATIONS) {
    try {
      const transformed = orientation === '0' ? buffer : await transformForOrientation(buffer, orientation);
      const hashes = await computeHashes(transformed);
      results.push({ orientation, ...hashes });
    } catch {
      // Skip just this orientation rather than losing the whole set.
    }
  }
  return results;
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

// Relative weight of each hash family when voting on a combined distance.
// dHash and pHash each catch edits the other misses (gradient vs frequency
// domain), so they're weighted equally and heaviest; aHash is the noisiest
// (pure brightness threshold) so it only nudges the result.
const HASH_WEIGHTS = { dhash: 0.4, phash: 0.4, ahash: 0.2 };

// Same idea, tuned for comparing two different CAMERAS pointed at the same
// scene (companion capture) rather than checking whether a single image was
// re-uploaded unmodified. aHash is a pure brightness threshold, and two
// separate sensors virtually never agree on exposure even when they're
// looking at the same thing, so it gets zeroed out here instead of just
// down-weighted — otherwise a perfectly good pairing loses points purely for
// one camera metering brighter than the other.
const COMPANION_HASH_WEIGHTS = { dhash: 0.55, phash: 0.45, ahash: 0 };

/**
 * Weighted, normalized (0..1) dissimilarity across whichever hash families
 * both `a` and `b` have populated. Missing hashes are skipped and the
 * remaining weights renormalized, so a candidate that predates a hash type
 * being added still compares fairly on what it does have.
 * `weights` defaults to HASH_WEIGHTS but can be overridden (e.g.
 * COMPANION_HASH_WEIGHTS above) by a caller comparing images for a different
 * purpose than tamper detection.
 * Returns { distance, coverage, breakdown } — distance is null if there was
 * no usable overlap at all (coverage === 0).
 */
function combinedHashDistance(a, b, weights = HASH_WEIGHTS) {
  const breakdown = {};
  let weightedSum = 0;
  let weightTotal = 0;

  for (const key of Object.keys(weights)) {
    const w = weights[key];
    if (!w) continue;
    const ha = a && a[key];
    const hb = b && b[key];
    if (!ha || !hb) continue;
    const bits = ha.length * 4;
    const dist = hammingDistance(ha, hb);
    if (!Number.isFinite(dist)) continue;
    const normalized = dist / bits; // 0..1
    breakdown[key] = { distance: dist, bits, normalized: Math.round(normalized * 1000) / 1000 };
    weightedSum += w * normalized;
    weightTotal += w;
  }

  if (weightTotal === 0) return { distance: null, coverage: 0, breakdown };
  return {
    distance: weightedSum / weightTotal,
    coverage: weightTotal, // sum of weights actually used, out of 1.0
    breakdown
  };
}

/**
 * Best (minimum-distance) combinedHashDistance between a single query hash
 * set and an array of {orientation, dhash, phash, ahash} entries, as produced
 * by computeOrientationHashes. This is what makes matching rotation/mirror
 * tolerant: the query is hashed once as-is, and compared against every
 * orientation the candidate was stored at.
 * Same null-distance contract as combinedHashDistance when nothing matches.
 */
function bestCombinedHashDistance(query, entries, weights = HASH_WEIGHTS) {
  let best = { distance: null, coverage: 0, breakdown: {}, orientation: null };
  for (const entry of entries || []) {
    const cmp = combinedHashDistance(query, entry, weights);
    if (cmp.distance === null) continue;
    if (best.distance === null || cmp.distance < best.distance) {
      best = { ...cmp, orientation: entry.orientation || null };
    }
  }
  return best;
}

// Candidate crop windows tried when two frames plausibly show the same scene
// at different fields of view — a phone and a device camera mounted together
// virtually never share a focal length or exact framing, so comparing only
// full-frame-vs-full-frame (or a uniform 'fill' squish) systematically
// under-scores a perfectly good pairing. Each candidate is a square window
// sized as a fraction of the shorter side, recentered by (dx, dy) as a
// fraction of the frame; kept small and center-biased since two cameras
// mounted together are rarely offset by much more than that.
const CROP_CANDIDATES = [
  { size: 1.0, dx: 0, dy: 0 },
  { size: 0.85, dx: 0, dy: 0 },
  { size: 0.85, dx: -0.1, dy: 0 },
  { size: 0.85, dx: 0.1, dy: 0 },
  { size: 0.85, dx: 0, dy: -0.1 },
  { size: 0.85, dx: 0, dy: 0.1 },
  { size: 0.7, dx: 0, dy: 0 },
  { size: 0.7, dx: -0.12, dy: 0 },
  { size: 0.7, dx: 0.12, dy: 0 },
  { size: 0.7, dx: 0, dy: -0.12 },
  { size: 0.7, dx: 0, dy: 0.12 },
  { size: 0.55, dx: 0, dy: 0 }
];

/**
 * Grayscale standard deviation of `buffer` — a cheap texture/detail estimate.
 * A near-flat region (sky, a blank wall, a synthetic solid-color patch) has a
 * stddev near 0; both perceptual hashes AND block SSIM treat "two flat
 * regions" as a perfect match (a flat block has zero gradients and zero
 * variance, so there's nothing in either signal to actually disagree on),
 * which makes flat regions a cheap way to fake a "match" that isn't really
 * evidence of anything. Used to keep the companion-capture crop search (see
 * companionCapture.js) from picking a flat, uninformative window as its
 * "best" alignment.
 */
async function textureStdDev(buffer) {
  const stats = await sharp(buffer).grayscale().stats();
  return stats.channels[0].stdev;
}

/** Extracts the square sub-region described by `candidate` (see CROP_CANDIDATES) from `buffer`. */
async function cropCandidate(buffer, candidate) {
  const { width, height } = await sharp(buffer).metadata();
  if (!width || !height) return buffer;
  const side = Math.max(8, Math.round(Math.min(width, height) * candidate.size));
  const cx = width / 2 + candidate.dx * width;
  const cy = height / 2 + candidate.dy * height;
  const left = Math.max(0, Math.min(width - side, Math.round(cx - side / 2)));
  const top = Math.max(0, Math.min(height - side, Math.round(cy - side / 2)));
  return sharp(buffer).extract({ left, top, width: side, height: side }).toBuffer();
}

module.exports = {
  sha256Hex, dHash, pHash, aHash, computeHashes, hammingDistance, combinedHashDistance,
  ORIENTATIONS, computeOrientationHashes, bestCombinedHashDistance, transformForOrientation,
  COMPANION_HASH_WEIGHTS, CROP_CANDIDATES, cropCandidate, textureStdDev
};
