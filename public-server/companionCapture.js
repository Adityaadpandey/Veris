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

const { computeHashes, combinedHashDistance } = require('./imageHash');
const { computeForensicDiff } = require('./pixelDiff');

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

module.exports = { compareDeviceAndMobile };
