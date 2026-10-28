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

const { computeHashes, computeOrientationHashes, bestCombinedHashDistance, transformForOrientation, sha256Hex } = require('./imageHash');
const { computeForensicDiff } = require('./pixelDiff');
const { extractCaptureTimestamp } = require('./imageForensics');
const dbService = require('./dbService');
const cloudinaryService = require('./cloudinaryService');
const openaiService = require('./openaiService');
const clipService = require('./clipService');
const { fetchImageBuffer } = require('./enrichService');

const COMPANION_FOLDER = process.env.CLOUDINARY_COMPANION_FOLDER || 'veris/companion';

function round(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Compares a device (source-of-truth) image against its companion mobile
 * photo.
 *
 * - visual: 1 - weighted perceptual-hash distance (dHash/pHash/aHash),
 *   checked against all 8 rotation/mirror orientations of the mobile photo
 *   (imageHash.computeOrientationHashes) and keeping the best match. This
 *   matters a lot here specifically: the phone is very often held portrait
 *   while the device camera is fixed landscape (or vice versa), so comparing
 *   only at orientation '0' compares two images that are sideways relative
 *   to each other — same failure mode a physically-rotated re-upload has in
 *   the tamper check, just from mounting angle instead of a re-upload.
 * - content: CLIP cosine similarity (semantic/visual, robust to the framing,
 *   aspect-ratio, and exposure differences two separate camera sensors will
 *   always have) when CLIP is enabled (ENABLE_CLIP=1); otherwise falls back
 *   to block-wise SSIM from the same forensic-diff pass used for tamper
 *   detection. SSIM assumes near-identical framing, which two different
 *   cameras never have, so it's a strictly weaker signal here than in the
 *   tamper-check case — used only when CLIP isn't available.
 * - score: blends visual and content. Weighted toward content when that
 *   content signal is CLIP (the more trustworthy read for "two different
 *   cameras, same scene"); even split when it's the weaker SSIM fallback.
 *
 * The mobile buffer is re-rendered at whichever orientation best matched the
 * device photo before computing SSIM/CLIP, so both signals compare aligned
 * images rather than two frames that are simply rotated relative to each
 * other.
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

  const hashCmp = bestCombinedHashDistance(deviceHashes, mobileOrientations);
  const visual = hashCmp.distance === null ? 0 : round(1 - hashCmp.distance);

  const alignedMobile = hashCmp.orientation && hashCmp.orientation !== '0'
    ? await transformForOrientation(mobileBuffer, hashCmp.orientation)
    : mobileBuffer;

  const forensic = await computeForensicDiff(deviceBuffer, alignedMobile);

  let content = round(forensic.ssim);
  let usedClip = false;
  if (clipService.isAvailable()) {
    try {
      const [deviceEmbedding, mobileEmbedding] = await Promise.all([
        clipService.embedImage(deviceBuffer, 'image/jpeg'),
        clipService.embedImage(alignedMobile, 'image/jpeg')
      ]);
      content = round(Math.max(0, clipService.cosineSimilarity(deviceEmbedding, mobileEmbedding)));
      usedClip = true;
    } catch (clipErr) {
      console.warn(`⚠️  CLIP companion comparison failed, falling back to SSIM: ${clipErr.message}`);
    }
  }

  const score = usedClip
    ? round(0.35 * visual + 0.65 * content)
    : round((visual + content) / 2);

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
 * Full background pipeline for a submitted companion photo: upload to
 * Cloudinary, fetch the device image bytes, score consistency, and persist
 * the result onto the claim row. Mirrors enrichService.enrichClaim's shape —
 * never throws, so the route handler can call this fire-and-forget after
 * acking the request.
 *
 * Everything independent runs in parallel (Cloudinary upload, device-image
 * fetch, AI hint) instead of one after another, and the AI hint specifically
 * is never on the critical path for the first write — it's the slowest step
 * (an OpenAI round trip) and the card doesn't need it to render (see
 * CompanionCaptureCard's AiFlagChip, which just omits itself until it's
 * there). The main record — image, score, forensic read, timestamps — lands
 * as soon as the upload + comparison are done; the hint gets patched in
 * moments later if it wasn't ready in time.
 */
async function processCompanionCapture(claim, mobileBuffer, capturedAt) {
  try {
    const aiHintPromise = getMobileAiHint(mobileBuffer, claim.claim_id);
    const [upload, { buffer: deviceBuffer }] = await Promise.all([
      cloudinaryService.uploadBuffer(mobileBuffer, COMPANION_FOLDER),
      fetchImageBuffer(claim.cid)
    ]);

    const { consistency, forensic } = await compareDeviceAndMobile(deviceBuffer, mobileBuffer);

    const mobileCapturedAt = capturedAt ? new Date(capturedAt) : new Date();
    const deviceExifCapturedAt = await extractCaptureTimestamp(deviceBuffer);
    let deviceCapturedAt = deviceExifCapturedAt || (claim.created_at ? new Date(claim.created_at) : new Date());
    let timestampDeltaSeconds = timestampDelta(mobileCapturedAt, deviceCapturedAt);
    if (deviceExifCapturedAt && timestampDeltaSeconds > EXIF_TIMESTAMP_SANITY_SECONDS) {
      deviceCapturedAt = claim.created_at ? new Date(claim.created_at) : new Date();
      timestampDeltaSeconds = timestampDelta(mobileCapturedAt, deviceCapturedAt);
    }

    // Race the AI hint against a short grace window: if it's already back (or lands within the
    // window), include it in this first write; otherwise persist without it and patch it in below.
    const raceResult = await Promise.race([
      aiHintPromise.then((hint) => ({ ready: true, hint })),
      new Promise((resolve) => setTimeout(() => resolve({ ready: false }), AI_HINT_GRACE_MS))
    ]);

    const companionCapture = {
      mobile_image_url: upload.url,
      mobile_public_id: upload.public_id,
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
    console.error(`❌ Companion capture processing failed for ${claim.claim_id}:`, error.message);
  }
}

module.exports = { compareDeviceAndMobile, processCompanionCapture };
