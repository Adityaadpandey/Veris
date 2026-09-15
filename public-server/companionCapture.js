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

const { computeHashes, combinedHashDistance, sha256Hex } = require('./imageHash');
const { computeForensicDiff } = require('./pixelDiff');
const dbService = require('./dbService');
const cloudinaryService = require('./cloudinaryService');
const openaiService = require('./openaiService');
const { fetchImageBuffer } = require('./enrichService');

const COMPANION_FOLDER = process.env.CLOUDINARY_COMPANION_FOLDER || 'veris/companion';

function round(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Compares a device (source-of-truth) image against its companion mobile
 * photo.
 *
 * - visual: 1 - weighted perceptual-hash distance (dHash/pHash/aHash) — a
 *   coarse "same general shot" signal, tolerant of the two cameras' slightly
 *   different position/lens/framing.
 * - content: block-wise SSIM from the same forensic-diff pass used for
 *   tamper detection — finer-grained pixel-structure agreement.
 * - score: simple mean of the two. Deliberately not weighted like
 *   similarPhotos.blendedSimilarity — that blend tunes for "same exact
 *   photo, maybe edited"; here neither signal is more authoritative than
 *   the other, since both cameras are shooting slightly different frames
 *   by construction.
 *
 * @returns {Promise<{
 *   consistency: { score: number, visual: number, content: number },
 *   forensic: { ssim: number, change_type: string, region_bbox: object|null }
 * }>}
 */
async function compareDeviceAndMobile(deviceBuffer, mobileBuffer) {
  const [deviceHashes, mobileHashes, forensic] = await Promise.all([
    computeHashes(deviceBuffer),
    computeHashes(mobileBuffer),
    computeForensicDiff(deviceBuffer, mobileBuffer)
  ]);

  const hashCmp = combinedHashDistance(deviceHashes, mobileHashes);
  const visual = hashCmp.distance === null ? 0 : round(1 - hashCmp.distance);
  const content = round(forensic.ssim);
  const score = round((visual + content) / 2);

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

/**
 * Full background pipeline for a submitted companion photo: upload to
 * Cloudinary, fetch the device image bytes, score consistency, get an
 * AI-generated hint for the mobile photo, and persist the result onto the
 * claim row. Mirrors enrichService.enrichClaim's shape — never throws, so
 * the route handler can call this fire-and-forget after acking the request.
 */
async function processCompanionCapture(claim, mobileBuffer, capturedAt) {
  try {
    const upload = await cloudinaryService.uploadBuffer(mobileBuffer, COMPANION_FOLDER);
    const { buffer: deviceBuffer } = await fetchImageBuffer(claim.cid);
    const { consistency, forensic } = await compareDeviceAndMobile(deviceBuffer, mobileBuffer);

    // Best-effort — same non-authoritative AI hint already computed for the
    // device image at enrichment time, just for the mobile photo instead.
    let aiHint = { likely_ai_generated: null, note: 'AI check unavailable' };
    if (openaiService.isAvailable()) {
      try {
        const described = await openaiService.processImage(mobileBuffer, 'image/jpeg');
        aiHint = { likely_ai_generated: described.likelyAiGenerated, note: described.aiAssessment };
      } catch (aiErr) {
        console.warn(`⚠️  Could not get AI hint for companion photo on ${claim.claim_id}: ${aiErr.message}`);
      }
    }

    // claims.created_at is the closest existing field to "when the device
    // captured" — the claim row is created immediately off the Pi's capture
    // in the real flow, so this is a reasonable stand-in for an explicit
    // device-capture timestamp.
    const mobileCapturedAt = capturedAt ? new Date(capturedAt) : new Date();
    const deviceCapturedAt = claim.created_at ? new Date(claim.created_at) : new Date();
    const timestampDeltaSeconds = Math.abs((mobileCapturedAt.getTime() - deviceCapturedAt.getTime()) / 1000);

    const companionCapture = {
      mobile_image_url: upload.url,
      mobile_public_id: upload.public_id,
      mobile_captured_at: mobileCapturedAt.toISOString(),
      mobile_ai_hint: aiHint,
      consistency,
      forensic,
      timestamp_delta_seconds: Math.round(timestampDeltaSeconds * 10) / 10,
      mock_chain_ref: mockChainRef(mobileBuffer),
      paired_at: new Date().toISOString()
    };

    await dbService.setCompanionCapture(claim.claim_id, companionCapture);
    console.log(`🔗 Paired companion capture for ${claim.claim_id} (${Math.round(consistency.score * 100)}% consistency)`);
  } catch (error) {
    console.error(`❌ Companion capture processing failed for ${claim.claim_id}:`, error.message);
  }
}

module.exports = { compareDeviceAndMobile, processCompanionCapture };
