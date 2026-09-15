const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { computeForensicDiff } = require('../pixelDiff');

async function makeTestImage({ width = 256, height = 256, color = { r: 120, g: 120, b: 120 } } = {}) {
  return sharp({ create: { width, height, channels: 3, background: color } }).jpeg().toBuffer();
}

test('computeForensicDiff reports near-1 SSIM and no region for identical images', async () => {
  const image = await makeTestImage();
  const result = await computeForensicDiff(image, image);
  assert.ok(result.ssim > 0.99, `expected ssim > 0.99, got ${result.ssim}`);
  assert.strictEqual(result.region_bbox, null);
});

test('computeForensicDiff classifies an aspect-ratio-changing crop as "crop"', async () => {
  const original = await makeTestImage({ width: 256, height: 256 });
  const cropped = await sharp(original)
    .extract({ left: 28, top: 0, width: 200, height: 256 })
    .jpeg()
    .toBuffer();
  const result = await computeForensicDiff(original, cropped);
  assert.strictEqual(result.change_type, 'crop');
});

test('computeForensicDiff finds a localized edit and its region', async () => {
  const original = await makeTestImage({ width: 256, height: 256, color: { r: 120, g: 120, b: 120 } });
  const patch = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .jpeg()
    .toBuffer();
  const edited = await sharp(original)
    .composite([{ input: patch, left: 10, top: 10 }])
    .jpeg()
    .toBuffer();
  const result = await computeForensicDiff(original, edited);
  assert.strictEqual(result.change_type, 'localized_edit');
  assert.ok(result.region_bbox, 'expected a region_bbox for a localized edit');
  assert.ok(result.region_bbox.x < 0.3 && result.region_bbox.y < 0.3, 'expected the region near the top-left corner');
});

test('computeForensicDiff classifies a whole-frame brightness shift as "global_adjustment"', async () => {
  const original = await makeTestImage({ color: { r: 70, g: 70, b: 70 } });
  const brightened = await sharp(original).modulate({ brightness: 3.0 }).jpeg().toBuffer();
  const result = await computeForensicDiff(original, brightened);
  assert.strictEqual(result.change_type, 'global_adjustment');
});
