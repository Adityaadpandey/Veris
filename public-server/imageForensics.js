/**
 * imageForensics.js
 *
 * Metadata-based tamper signals for the "Verify & Search" flow. Complements
 * the perceptual-hash comparison in imageHash.js: hashes catch VISUAL edits,
 * this catches edits that leave a trace in EXIF even when the pixels look
 * clean (e.g. exported through Photoshop/Lightroom/an AI tool but otherwise
 * untouched).
 *
 * Explicitly non-authoritative — EXIF is trivial to strip or forge, so this
 * is only ever a soft hint alongside the hash-based verdict, never something
 * that flips authentic_original/altered_copy on its own.
 *
 * CommonJS to match the rest of public-server. Uses `exifr` for parsing.
 */

const exifr = require('exifr');

// Substring match against the EXIF Software/ProcessingSoftware tag. Lowercase.
const EDITOR_SIGNATURES = [
  'photoshop', 'lightroom', 'gimp', 'affinity photo', 'paint.net',
  'pixelmator', 'snapseed', 'picsart', 'facetune', 'canva',
  'midjourney', 'dall-e', 'dalle', 'stable diffusion', 'firefly'
];

/**
 * Extract tamper-relevant EXIF signals from raw image bytes. Never throws —
 * an image with no/corrupt EXIF (common after re-encoding, e.g. a screenshot
 * or a WhatsApp re-share) is itself a mildly informative "no metadata" result,
 * not an error.
 *
 * @returns {{
 *   hasExif: boolean,
 *   software: string|null,
 *   cameraMake: string|null,
 *   cameraModel: string|null,
 *   editedBySoftware: boolean,
 *   captureToModifyGapSeconds: number|null,
 *   suspicious: boolean,
 *   reasons: string[]
 * }}
 */
async function exifSignals(buffer) {
  const reasons = [];
  let exif = null;
  try {
    exif = await exifr.parse(buffer, { pick: [
      'Software', 'ProcessingSoftware', 'Make', 'Model',
      'DateTimeOriginal', 'ModifyDate', 'CreateDate'
    ] });
  } catch {
    exif = null;
  }

  if (!exif) {
    return {
      hasExif: false,
      software: null,
      cameraMake: null,
      cameraModel: null,
      editedBySoftware: false,
      captureToModifyGapSeconds: null,
      suspicious: false,
      reasons: ['no_exif_present']
    };
  }

  const software = (exif.Software || exif.ProcessingSoftware || null);
  const softwareLower = software ? String(software).toLowerCase() : '';
  const editedBySoftware = EDITOR_SIGNATURES.some(sig => softwareLower.includes(sig));
  if (editedBySoftware) reasons.push(`edited_with:${software}`);

  let captureToModifyGapSeconds = null;
  const original = exif.DateTimeOriginal || exif.CreateDate;
  const modified = exif.ModifyDate;
  if (original instanceof Date && modified instanceof Date) {
    captureToModifyGapSeconds = Math.round((modified.getTime() - original.getTime()) / 1000);
    // A few seconds is normal in-camera processing. Minutes-to-hours later
    // strongly suggests the file was reopened and re-saved by something else.
    if (captureToModifyGapSeconds > 300) reasons.push('modified_long_after_capture');
  }

  const suspicious = editedBySoftware || captureToModifyGapSeconds > 300;

  return {
    hasExif: true,
    software: software || null,
    cameraMake: exif.Make || null,
    cameraModel: exif.Model || null,
    editedBySoftware,
    captureToModifyGapSeconds,
    suspicious,
    reasons
  };
}

module.exports = { exifSignals };
