const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { extractCaptureTimestamp } = require('../imageForensics');

async function makeTestImage({ width = 64, height = 64, color = { r: 10, g: 10, b: 10 }, exif } = {}) {
  let pipeline = sharp({ create: { width, height, channels: 3, background: color } }).jpeg();
  if (exif) pipeline = pipeline.withExif(exif);
  return pipeline.toBuffer();
}

test('extractCaptureTimestamp reads DateTimeOriginal when present', async () => {
  const image = await makeTestImage({ exif: { IFD2: { DateTimeOriginal: '2026:09:15 20:14:00' } } });
  const timestamp = await extractCaptureTimestamp(image);
  assert.ok(timestamp instanceof Date, 'expected a Date');
  assert.strictEqual(timestamp.getUTCFullYear(), 2026);
});

test('extractCaptureTimestamp falls back to CreateDate when DateTimeOriginal is absent', async () => {
  const image = await makeTestImage({ exif: { IFD2: { DateTimeDigitized: '2026:09:15 20:14:00' } } });
  const timestamp = await extractCaptureTimestamp(image);
  assert.ok(timestamp instanceof Date, 'expected a Date from the CreateDate fallback');
});

test('extractCaptureTimestamp returns null when the image has no EXIF timestamp', async () => {
  const image = await makeTestImage();
  const timestamp = await extractCaptureTimestamp(image);
  assert.strictEqual(timestamp, null);
});
