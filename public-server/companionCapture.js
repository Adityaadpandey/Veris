/**
 * companionCapture.js
 *
 * Companion Capture (mobile + Veris device): compares the phone's own photo
 * against the real, minted device photo from the same claim. Reuses the
 * exact hash/SSIM machinery already built for tamper detection (imageHash.js,
 * pixelDiff.js) — just interpreted differently. The tamper check asks "is
 * this a forged copy of the same exact framing?"; this asks "are these
 * plausibly two cameras pointed at the same scene at the same moment?" —
 * the phone and the device (mounted together on the Clip) never see
 * pixel-identical framing, so this is read as a looser consistency signal,
 * not a forgery check.
 *
 * Demo-quality by design (see the Companion Capture spec): no ML matching
 * model, no on-chain verification, just the deterministic signals this repo
 * already has.
 *
 * CommonJS to match the rest of public-server.
 */

const {
  computeHashes, computeOrientationHashes, bestCombinedHashDistance, combinedHashDistance,
  transformForOrientation, sha256Hex, COMPANION_HASH_WEIGHTS, CROP_CANDIDATES, cropCandidate, textureStdDev
} = require('./imageHash');
const { computeForensicDiff } = require('./pixelDiff');
const { extractCaptureTimestamp } = require('./imageForensics');
const dbService = require('./dbService');
const cloudinaryService = require('./cloudinaryService');
const openaiService = require('./openaiService');
const clipService = require('./clipService');
const { fetchImageBuffer } = require('./enrichService');
const sharp = require('sharp');

const COMPANION_FOLDER = process.env.CLOUDINARY_COMPANION_FOLDER || 'veris/companion';

function round(value) {
  return Math.round(value * 1000) / 1000;
}

// A crop this flat carries almost no real evidence either way — a blank wall or a solid-color
// synthetic patch hashes as a near-perfect match against ANY other flat region, since a flat block
// has no gradients for dHash/pHash to disagree on. Below this grayscale stddev, a crop candidate is
// rejected outright rather than allowed to win the framing search on a fluke.
const MIN_CROP_TEXTURE_STDDEV = 10;

// --- Texture-weighted content score -----------------------------------------------------------
//
// pixelDiff.computeForensicDiff's block SSIM is a flat, unweighted average across every block —
// exactly right for tamper detection, where the two images are SUPPOSED to be identical and a run of
// featureless blocks (sky, a blank wall) genuinely means "unchanged here." It's the wrong call for
// companion pairing: two DIFFERENT scenes can easily share a plain background (a wall, a sky, a
// table) and, because a flat block has no variance for either side to disagree on, that shared
// blandness alone can drag the average SSIM well above what the few blocks that actually differ would
// suggest — verified directly: two synthetic 400x300 frames with a completely different colored patch
// in a completely different corner (nothing in common except the same gray backdrop) still scored
// 0.911 full-frame SSIM. This recomputes the same block grid but weights each block's contribution by
// how much texture BOTH sides actually have there, so a shared blank background can no longer carry
// the whole score — only used to derive `consistency.content`, never the `forensic.ssim` shown in the
// UI, which stays pixelDiff's plain average since "why this photo was flagged" is a different question
// than "how much does this number mean."
const CONTENT_CANVAS = 256;
const CONTENT_BLOCK = 16;
const CONTENT_BLOCKS_PER_SIDE = CONTENT_CANVAS / CONTENT_BLOCK;
const CONTENT_SSIM_C1 = (0.01 * 255) ** 2;
const CONTENT_SSIM_C2 = (0.03 * 255) ** 2;
// A block's weight ramps from 0 to 1 as its (lesser-textured side's) stddev goes from 0 to this value,
// then stays at 1 — a block only needs to clear a modest amount of real detail to count fully.
const CONTENT_BLOCK_FULL_WEIGHT_STDDEV = 8;

async function grayscaleContentCanvas(buffer) {
  return sharp(buffer).grayscale().resize(CONTENT_CANVAS, CONTENT_CANVAS, { fit: 'fill' }).raw().toBuffer();
}

function contentBlockStats(pixels, blockRow, blockCol) {
  const startRow = blockRow * CONTENT_BLOCK;
  const startCol = blockCol * CONTENT_BLOCK;
  let sum = 0, n = 0;
  for (let r = 0; r < CONTENT_BLOCK; r++) {
    for (let c = 0; c < CONTENT_BLOCK; c++) {
      sum += pixels[(startRow + r) * CONTENT_CANVAS + (startCol + c)];
      n++;
    }
  }
  const mean = sum / n;
  let variance = 0;
  for (let r = 0; r < CONTENT_BLOCK; r++) {
    for (let c = 0; c < CONTENT_BLOCK; c++) {
      const d = pixels[(startRow + r) * CONTENT_CANVAS + (startCol + c)] - mean;
      variance += d * d;
    }
  }
  variance /= (n - 1);
  return { mean, variance };
}

function contentBlockSsim(a, b, blockRow, blockCol, statsA, statsB) {
  const startRow = blockRow * CONTENT_BLOCK;
  const startCol = blockCol * CONTENT_BLOCK;
  let cov = 0, n = 0;
  for (let r = 0; r < CONTENT_BLOCK; r++) {
    for (let c = 0; c < CONTENT_BLOCK; c++) {
      const idx = (startRow + r) * CONTENT_CANVAS + (startCol + c);
      cov += (a[idx] - statsA.mean) * (b[idx] - statsB.mean);
      n++;
    }
  }
  cov /= (n - 1);
  const numerator = (2 * statsA.mean * statsB.mean + CONTENT_SSIM_C1) * (2 * cov + CONTENT_SSIM_C2);
  const denominator = (statsA.mean ** 2 + statsB.mean ** 2 + CONTENT_SSIM_C1) * (statsA.variance + statsB.variance + CONTENT_SSIM_C2);
  return denominator === 0 ? 1 : numerator / denominator;
}

/**
 * Texture-weighted alternative to a plain SSIM average (see block comment above).
 *
 * Returns null ONLY in the true degenerate case where NEITHER image has real texture anywhere (e.g.
 * two flat test swatches) — there's genuinely nothing to compare, so the caller should fall back to
 * pixelDiff's plain average instead of trusting a meaningless 0.
 *
 * If at least one side has real texture somewhere but none of it lines up with the other side block-
 * for-block, that's not "no signal" — it's the (low) answer: two unrelated photos that happen to share
 * a bland background would otherwise hide behind that shared blandness, which is exactly the failure
 * mode this function exists to close. Returns 0 in that case, not null.
 */
async function textureWeightedContentScore(bufferA, bufferB) {
  const [a, b] = await Promise.all([grayscaleContentCanvas(bufferA), grayscaleContentCanvas(bufferB)]);
  let weightedSum = 0;
  let weightTotal = 0;
  let anyTexture = false;
  for (let row = 0; row < CONTENT_BLOCKS_PER_SIDE; row++) {
    for (let col = 0; col < CONTENT_BLOCKS_PER_SIDE; col++) {
      const statsA = contentBlockStats(a, row, col);
      const statsB = contentBlockStats(b, row, col);
      if (Math.sqrt(statsA.variance) >= CONTENT_BLOCK_FULL_WEIGHT_STDDEV) anyTexture = true;
      if (Math.sqrt(statsB.variance) >= CONTENT_BLOCK_FULL_WEIGHT_STDDEV) anyTexture = true;
      const texture = Math.sqrt(Math.min(statsA.variance, statsB.variance));
      const weight = Math.min(1, texture / CONTENT_BLOCK_FULL_WEIGHT_STDDEV);
      if (weight <= 0) continue;
      weightedSum += weight * contentBlockSsim(a, b, row, col, statsA, statsB);
      weightTotal += weight;
    }
  }
  if (weightTotal > 0) return weightedSum / weightTotal;
  return anyTexture ? 0 : null;
}

/**
 * Tries every crop window in CROP_CANDIDATES (skipping the uncropped one,
 * which the caller already has as `baseline`) against `target` and returns
 * whichever crop of `source` matches best, or null if none beat `baseline`.
 * `target` is a plain hash set (not an orientation array) — the orientation
 * question is already settled by the time this runs.
 */
async function bestCroppedMatch(source, target, weights) {
  const attempts = await Promise.all(
    CROP_CANDIDATES.filter((c) => c.size !== 1).map(async (candidate) => {
      try {
        const cropped = await cropCandidate(source, candidate);
        const [hashes, stdev] = await Promise.all([computeHashes(cropped), textureStdDev(cropped)]);
        if (stdev < MIN_CROP_TEXTURE_STDDEV) return null;
        const cmp = combinedHashDistance(hashes, target, weights);
        return cmp.distance === null ? null : { distance: cmp.distance, buffer: cropped };
      } catch {
        return null; // a degenerate crop (e.g. tiny source image) just drops out of the running
      }
    })
  );
  return attempts.reduce((best, cur) => (cur && (!best || cur.distance < best.distance) ? cur : best), null);
}

/**
 * A phone and a device camera mounted together virtually never share a focal
 * length or exact framing — one is almost always a tighter or wider field of
 * view than the other. Comparing only full-frame-vs-full-frame (or squishing
 * both into the same canvas, as SSIM's 'fill' resize does) systematically
 * under-scores a perfectly good pairing whenever that's true. This searches
 * crop windows of BOTH the device and the (already orientation-aligned)
 * mobile frame against the other side's full frame, and keeps whichever
 * pairing — uncropped, device-cropped, or mobile-cropped — scores best.
 *
 * @returns {Promise<{ distance: number|null, ssim: number|null, deviceCrop: Buffer|null, mobileCrop: Buffer|null }>}
 */
async function bestFramingAlignment(deviceBuffer, deviceHashes, alignedMobile, baseline) {
  const alignedMobileHashes = await computeHashes(alignedMobile);

  const [croppedDevice, croppedMobile] = await Promise.all([
    bestCroppedMatch(deviceBuffer, alignedMobileHashes, COMPANION_HASH_WEIGHTS),
    bestCroppedMatch(alignedMobile, deviceHashes, COMPANION_HASH_WEIGHTS)
  ]);

  let best = { distance: baseline.distance, deviceCrop: null, mobileCrop: null };
  if (croppedDevice && (best.distance === null || croppedDevice.distance < best.distance)) {
    best = { distance: croppedDevice.distance, deviceCrop: croppedDevice.buffer, mobileCrop: null };
  }
  if (croppedMobile && (best.distance === null || croppedMobile.distance < best.distance)) {
    best = { distance: croppedMobile.distance, deviceCrop: null, mobileCrop: croppedMobile.buffer };
  }

  // Falls back to plain SSIM only in the degenerate case where the winning crop has no texture
  // anywhere on either side to weight by (e.g. two flat test swatches) — with nothing to weight,
  // the unweighted average is the best available answer, and pixelDiff's own "both sides flat" case
  // already resolves to 1 for two identical flat regions rather than to a meaningless 0.
  let contentScore = null;
  if (best.deviceCrop) {
    contentScore = await textureWeightedContentScore(best.deviceCrop, alignedMobile);
    if (contentScore === null) ({ ssim: contentScore } = await computeForensicDiff(best.deviceCrop, alignedMobile));
  } else if (best.mobileCrop) {
    contentScore = await textureWeightedContentScore(deviceBuffer, best.mobileCrop);
    if (contentScore === null) ({ ssim: contentScore } = await computeForensicDiff(deviceBuffer, best.mobileCrop));
  }

  return { distance: best.distance, contentScore, deviceCrop: best.deviceCrop, mobileCrop: best.mobileCrop };
}

/**
 * Compares a device (source-of-truth) image against its companion mobile
 * photo.
 *
 * - visual: 1 - weighted perceptual-hash distance (dHash/pHash only —
 *   COMPANION_HASH_WEIGHTS zeroes out aHash, since two separate sensors
 *   virtually never agree on exposure and aHash is a pure brightness
 *   threshold), checked against all 8 rotation/mirror orientations of the
 *   mobile photo (imageHash.computeOrientationHashes) AND a set of candidate
 *   crop windows on both sides (bestFramingAlignment) so a real field-of-view
 *   difference between the two cameras — not just a rotation — doesn't read
 *   as "different scene." This matters a lot here specifically: the phone is
 *   very often held portrait while the device camera is fixed landscape (or
 *   vice versa), and the two lenses rarely frame the same crop even once
 *   orientation is fixed.
 * - content: CLIP cosine similarity (semantic/visual, robust to framing,
 *   aspect-ratio, and exposure differences) when CLIP is enabled
 *   (ENABLE_CLIP=1) — tried both full-frame and on whichever crop won the
 *   framing search above, keeping the higher of the two. Falls back to the
 *   higher of {full-frame, best-crop} texture-weighted SSIM (see
 *   textureWeightedContentScore) when CLIP isn't available — a plain SSIM
 *   average would let two genuinely different photos that merely SHARE a
 *   plain background (a wall, a sky) drag the score up on that alone, since a
 *   flat block has no texture for either side to disagree on.
 * - score: blends visual and content. Weighted toward content when that
 *   content signal is CLIP (the more trustworthy read for "two different
 *   cameras, same scene"); still content-leaning but less so when it's the
 *   weaker SSIM fallback.
 *
 * The reported `forensic` block (change_type/region_bbox shown in the UI)
 * intentionally stays based on the natural, orientation-only alignment —
 * "crop" is a genuinely useful label here ("framed a little differently,
 * expected from two separate cameras"), so the crop SEARCH above only feeds
 * the numeric score, not what gets displayed as the reason.
 *
 * @returns {Promise<{
 *   consistency: { score: number, visual: number, content: number },
 *   forensic: { ssim: number, change_type: string, region_bbox: object|null }
 * }>}
 */
async function compareDeviceAndMobile(deviceBuffer, mobileBuffer) {
  const [deviceHashes, mobileOrientations] = await Promise.all([
    computeHashes(deviceBuffer),
    computeOrientationHashes(mobileBuffer)
  ]);

  const hashCmp = bestCombinedHashDistance(deviceHashes, mobileOrientations, COMPANION_HASH_WEIGHTS);

  const alignedMobile = hashCmp.orientation && hashCmp.orientation !== '0'
    ? await transformForOrientation(mobileBuffer, hashCmp.orientation)
    : mobileBuffer;

  // Natural (orientation-corrected only) forensic diff — drives the *displayed* change_type and
  // region_bbox, since "these two cameras just don't share a crop" is exactly what that label means
  // to communicate here.
  const forensic = await computeForensicDiff(deviceBuffer, alignedMobile);

  const alignment = await bestFramingAlignment(deviceBuffer, deviceHashes, alignedMobile, hashCmp);
  const visual = alignment.distance === null ? 0 : round(1 - alignment.distance);

  // Texture-weighted, not pixelDiff's plain block average (see the comment on
  // textureWeightedContentScore) — a shared blank background between two genuinely different scenes
  // shouldn't be able to carry this number the way it can carry forensic.ssim.
  const fullFrameContent = await textureWeightedContentScore(deviceBuffer, alignedMobile);
  let content = round(Math.max(fullFrameContent ?? forensic.ssim, alignment.contentScore ?? 0));
  let usedClip = false;
  if (clipService.isAvailable()) {
    try {
      const [fullDevice, fullMobile, deviceCropEmb, mobileCropEmb] = await Promise.all([
        clipService.embedImage(deviceBuffer, 'image/jpeg'),
        clipService.embedImage(alignedMobile, 'image/jpeg'),
        alignment.deviceCrop ? clipService.embedImage(alignment.deviceCrop, 'image/jpeg') : null,
        alignment.mobileCrop ? clipService.embedImage(alignment.mobileCrop, 'image/jpeg') : null
      ]);
      const candidates = [Math.max(0, clipService.cosineSimilarity(fullDevice, fullMobile))];
      if (deviceCropEmb) candidates.push(Math.max(0, clipService.cosineSimilarity(deviceCropEmb, fullMobile)));
      if (mobileCropEmb) candidates.push(Math.max(0, clipService.cosineSimilarity(fullDevice, mobileCropEmb)));
      content = round(Math.max(...candidates));
      usedClip = true;
    } catch (clipErr) {
      console.warn(`⚠️  CLIP companion comparison failed, falling back to SSIM: ${clipErr.message}`);
    }
  }

  const score = usedClip
    ? round(0.3 * visual + 0.7 * content)
    : round(0.45 * visual + 0.55 * content);

  return {
    consistency: { score, visual, content },
    forensic: {
      ssim: forensic.ssim,
      change_type: forensic.change_type,
      region_bbox: forensic.region_bbox
    }
  };
}

// A string that LOOKS like an on-chain reference (same shape as a tx hash)
// but never is one — deterministic from the mobile image's own bytes so the
// same photo always "pairs" to the same ref. Every place this is rendered
// must be labeled off-chain / non-authoritative; there is no real mint or
// transaction behind it (see the Companion Capture spec's Explicitly Out of
// Scope section).
function mockChainRef(mobileBuffer) {
  return `0x${sha256Hex(mobileBuffer)}`;
}

// A real device/mobile capture gap should never be more than this — the two shots are triggered
// from the same button press. Anything past it is almost certainly EXIF's DateTimeOriginal being
// the device's LOCAL wall-clock time with no timezone marker (e.g. IST), misread by a server
// running in UTC as if it already were UTC — a multi-hour "gap" that isn't real. Falls back to the
// claims.created_at estimate in that case instead of showing a nonsense number.
const EXIF_TIMESTAMP_SANITY_SECONDS = 600;

// How long to let the (slowest) AI-hint call hold up the FIRST write before persisting without it
// and patching it in separately once it resolves. Keeps a slow/unavailable OpenAI call from being
// the thing the whole pairing card waits on.
const AI_HINT_GRACE_MS = 2500;

function timestampDelta(mobileCapturedAt, deviceCapturedAt) {
  return Math.round(Math.abs((mobileCapturedAt.getTime() - deviceCapturedAt.getTime()) / 1000) * 10) / 10;
}

/**
 * Best-effort AI hint for the mobile photo — same non-authoritative check already run on the
 * device image at enrichment time. Uses describeImage (not the full processImage pipeline) since
 * companion pairing has no use for the embedding half of that call, and skipping it roughly halves
 * this step's latency. Never throws; resolves null on failure or when OpenAI isn't configured.
 */
async function getMobileAiHint(mobileBuffer, claimId) {
  if (!openaiService.isAvailable()) return null;
  try {
    const described = await openaiService.describeImage(mobileBuffer, 'image/jpeg');
    return { likely_ai_generated: described.likelyAiGenerated, note: described.aiAssessment };
  } catch (err) {
    console.warn(`⚠️  Could not get AI hint for companion photo on ${claimId}: ${err.message}`);
    return null;
  }
}

/**
 * Uploads the phone's own frame to Cloudinary the instant it's taken —
 * deliberately split out from the scoring/linking step below so the mobile
 * app can fire this the second the shutter closes, in parallel with the
 * Pi's own capture -> Filecoin -> ZK proof -> mint pipeline, instead of
 * waiting for that (much slower, tens-of-seconds) pipeline to finish before
 * even starting the upload. See processCompanionLink for the second half.
 */
async function uploadCompanionImage(buffer) {
  return cloudinaryService.uploadBuffer(buffer, COMPANION_FOLDER);
}

/** Fetches raw bytes from an arbitrary https URL (the Cloudinary URL handed back by uploadCompanionImage). */
async function fetchBufferFromUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Links an already-uploaded companion photo to a real claim once that claim
 * exists, scores it against the device image, and persists the result.
 * Mirrors enrichService.enrichClaim's shape — never throws, so the route
 * handler can call this fire-and-forget after acking the request.
 *
 * By the time this runs, the mobile photo is already sitting in Cloudinary
 * (uploaded the instant it was taken via uploadCompanionImage, well before
 * the claim itself existed) — so the only work left on this critical path is
 * fetching both images back and scoring them, not a multi-second upload.
 * Everything independent still runs in parallel (both buffer fetches, the AI
 * hint) and the AI hint is never on the critical path for the first write —
 * it's the slowest step (an OpenAI round trip) and the card doesn't need it
 * to render (see CompanionCaptureCard's AiFlagChip, which just omits itself
 * until it's there). The main record lands as soon as the fetch + comparison
 * are done; the hint gets patched in moments later if it wasn't ready in time.
 */
async function processCompanionLink(claim, mobileImageUrl, mobilePublicId, capturedAt) {
  try {
    const [mobileBuffer, { buffer: deviceBuffer }] = await Promise.all([
      fetchBufferFromUrl(mobileImageUrl),
      fetchImageBuffer(claim.cid)
    ]);

    const aiHintPromise = getMobileAiHint(mobileBuffer, claim.claim_id);

    // Race the AI hint against a short grace window: if it's already back (or lands within the
    // window), include it in this first write; otherwise persist without it and patch it in below.
    const [{ consistency, forensic }, raceResult] = await Promise.all([
      compareDeviceAndMobile(deviceBuffer, mobileBuffer),
      Promise.race([
        aiHintPromise.then((hint) => ({ ready: true, hint })),
        new Promise((resolve) => setTimeout(() => resolve({ ready: false }), AI_HINT_GRACE_MS))
      ])
    ]);

    const mobileCapturedAt = capturedAt ? new Date(capturedAt) : new Date();
    const deviceExifCapturedAt = await extractCaptureTimestamp(deviceBuffer);
    let deviceCapturedAt = deviceExifCapturedAt || (claim.created_at ? new Date(claim.created_at) : new Date());
    let timestampDeltaSeconds = timestampDelta(mobileCapturedAt, deviceCapturedAt);
    if (deviceExifCapturedAt && timestampDeltaSeconds > EXIF_TIMESTAMP_SANITY_SECONDS) {
      deviceCapturedAt = claim.created_at ? new Date(claim.created_at) : new Date();
      timestampDeltaSeconds = timestampDelta(mobileCapturedAt, deviceCapturedAt);
    }

    const companionCapture = {
      mobile_image_url: mobileImageUrl,
      mobile_public_id: mobilePublicId,
      mobile_captured_at: mobileCapturedAt.toISOString(),
      mobile_ai_hint: raceResult.ready ? raceResult.hint : null,
      consistency,
      forensic,
      timestamp_delta_seconds: timestampDeltaSeconds,
      mock_chain_ref: mockChainRef(mobileBuffer),
      paired_at: new Date().toISOString()
    };

    await dbService.setCompanionCapture(claim.claim_id, companionCapture);
    console.log(`🔗 Paired companion capture for ${claim.claim_id} (${Math.round(consistency.score * 100)}% consistency)`);

    if (!raceResult.ready) {
      aiHintPromise
        .then((hint) => hint && dbService.patchCompanionCapture(claim.claim_id, { mobile_ai_hint: hint }))
        .catch(() => {});
    }
  } catch (error) {
    console.error(`❌ Companion capture linking failed for ${claim.claim_id}:`, error.message);
  }
}

module.exports = { compareDeviceAndMobile, uploadCompanionImage, processCompanionLink };
