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

// No Veris capture device today writes an OffsetTimeOriginal tag (Picamera2/libcamera doesn't add
// one), so a DateTimeOriginal with no offset is naive local wall-clock time with nothing in the
// file saying which timezone that is. Every device currently deployed runs its Pi's system clock
// in India Standard Time (UTC+5:30, no DST) — used as the fallback so a delta against the phone's
// real UTC-based capturedAt comes out close to zero for a simultaneous shot, instead of leaking the
// full IST offset through as a bogus multi-hour gap.
const DEVICE_FALLBACK_UTC_OFFSET_MINUTES = 5 * 60 + 30;

const EXIF_DATE_RE = /^(\d{4})[-:](\d{2})[-:](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;
const EXIF_OFFSET_RE = /^([+-])(\d{2}):(\d{2})$/;

function parseOffsetMinutes(offset) {
  const match = typeof offset === 'string' ? offset.trim().match(EXIF_OFFSET_RE) : null;
  if (!match) return null;
  const [, sign, hours, minutes] = match;
  const total = Number(hours) * 60 + Number(minutes);
  return sign === '-' ? -total : total;
}

// Resolves a naive EXIF date string ("2026:09:16 02:18:50") to the true UTC instant it represents,
// given the camera's UTC offset in minutes. Deliberately does its own arithmetic instead of relying
// on exifr's built-in Date revival for this tag: that revival constructs the Date using whatever
// timezone the CURRENT process happens to be running in, which has nothing to do with the timezone
// the camera actually captured in — the two only coincidentally match in local dev.
function resolveExifTimestamp(raw, offsetMinutes) {
  if (typeof raw !== 'string') return null;
  const match = raw.trim().match(EXIF_DATE_RE);
  if (!match) return null;
  const [year, month, day, hours, minutes, seconds] = match.slice(1).map(Number);
  const asUtc = Date.UTC(year, month - 1, day, hours, minutes, seconds);
  return new Date(asUtc - offsetMinutes * 60000);
}

/**
 * Best-effort original capture timestamp from EXIF (DateTimeOriginal, falling
 * back to CreateDate). Used by Companion Capture to compare the device
 * photo's actual capture instant against the phone's, instead of a later
 * pipeline-artifact time (e.g. when the claim row was created, which can
 * trail the real capture by however long minting took). Never throws —
 * returns null when EXIF is missing or has no usable timestamp, same
 * "no metadata is itself informative, not an error" stance as exifSignals.
 *
 * Corrects for the camera's capture timezone using OffsetTimeOriginal/OffsetTime when the file
 * has one, and DEVICE_FALLBACK_UTC_OFFSET_MINUTES otherwise — see resolveExifTimestamp.
 */
async function extractCaptureTimestamp(buffer) {
  try {
    const exif = await exifr.parse(buffer, {
      pick: ['DateTimeOriginal', 'CreateDate', 'OffsetTimeOriginal', 'OffsetTime'],
      reviveValues: false
    });
    const raw = exif?.DateTimeOriginal || exif?.CreateDate;
    if (!raw) return null;
    const offsetMinutes = parseOffsetMinutes(exif?.OffsetTimeOriginal || exif?.OffsetTime) ?? DEVICE_FALLBACK_UTC_OFFSET_MINUTES;
    return resolveExifTimestamp(raw, offsetMinutes);
  } catch {
    return null;
  }
}

module.exports = { exifSignals, extractCaptureTimestamp };
