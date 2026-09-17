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

test('extractCaptureTimestamp resolves the true UTC instant using OffsetTimeOriginal when present', async () => {
  // A camera in India (IST, UTC+5:30) capturing at 2026-09-15T20:48:50Z writes its own local wall
  // clock into DateTimeOriginal: 2026-09-16 02:18:50, plus (per the EXIF 2.31+ spec) an
  // OffsetTimeOriginal tag recording that +05:30 offset.
  const image = await makeTestImage({
    exif: { IFD2: { DateTimeOriginal: '2026:09:16 02:18:50', OffsetTimeOriginal: '+05:30' } }
  });
  const timestamp = await extractCaptureTimestamp(image);
  assert.ok(timestamp instanceof Date, 'expected a Date');
  assert.strictEqual(timestamp.toISOString(), '2026-09-15T20:48:50.000Z');
});

test('extractCaptureTimestamp falls back to the known device timezone when no offset tag is present', async () => {
  // Same scenario as above but WITHOUT an OffsetTimeOriginal tag — the realistic case today, since
  // no Veris capture device currently writes one. Before the fix, this naive local (IST) wall-clock
  // string got read as if it were already UTC, producing a bogus ~5.5 hour "gap" from the phone's
  // real UTC-based capturedAt (the exact 19800.5s bug seen in production). The fix must resolve it
  // to within a few seconds of the true UTC instant regardless of what timezone the test runner
  // itself is in.
  const image = await makeTestImage({ exif: { IFD2: { DateTimeOriginal: '2026:09:16 02:18:50' } } });
  const timestamp = await extractCaptureTimestamp(image);
  assert.ok(timestamp instanceof Date, 'expected a Date');
  const trueInstant = new Date('2026-09-15T20:48:50.454Z').getTime();
  const deltaSeconds = Math.abs(timestamp.getTime() - trueInstant) / 1000;
  assert.ok(
    deltaSeconds < 5,
    `expected timestamp within a few seconds of the true capture instant, got a ${deltaSeconds}s gap (bug reproduction: ~19800s means the IST offset leaked through uncorrected)`
  );
});
