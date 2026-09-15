const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { compareDeviceAndMobile } = require('../companionCapture');

async function makeTestImage({ width = 256, height = 256, color = { r: 120, g: 120, b: 120 } } = {}) {
  return sharp({ create: { width, height, channels: 3, background: color } }).jpeg().toBuffer();
}

test('compareDeviceAndMobile scores identical images near 1', async () => {
  const image = await makeTestImage();
  const { consistency, forensic } = await compareDeviceAndMobile(image, image);
  assert.ok(consistency.visual > 0.99, `expected visual > 0.99, got ${consistency.visual}`);
  assert.ok(consistency.content > 0.99, `expected content > 0.99, got ${consistency.content}`);
  assert.ok(consistency.score > 0.99, `expected score > 0.99, got ${consistency.score}`);
  assert.ok(forensic.ssim > 0.99, `expected ssim > 0.99, got ${forensic.ssim}`);
  assert.strictEqual(forensic.region_bbox, null);
});

test('compareDeviceAndMobile flags an aspect-ratio-changing crop as "crop"', async () => {
  const device = await makeTestImage({ width: 256, height: 256 });
  const mobile = await sharp(device)
    .extract({ left: 28, top: 0, width: 200, height: 256 })
    .jpeg()
    .toBuffer();
  const { forensic } = await compareDeviceAndMobile(device, mobile);
  assert.strictEqual(forensic.change_type, 'crop');
});

test('compareDeviceAndMobile scores a recolored companion lower than an identical one', async () => {
  const device = await makeTestImage({ color: { r: 70, g: 70, b: 70 } });
  const recolored = await sharp(device).modulate({ brightness: 3.0, saturation: 1.8 }).jpeg().toBuffer();

  const identical = await compareDeviceAndMobile(device, device);
  const different = await compareDeviceAndMobile(device, recolored);

  assert.ok(
    different.consistency.score < identical.consistency.score,
    `expected recolored score (${different.consistency.score}) < identical score (${identical.consistency.score})`
  );
  assert.strictEqual(different.forensic.change_type, 'global_adjustment');
});

test('compareDeviceAndMobile finds a localized edit and its region', async () => {
  const device = await makeTestImage({ width: 256, height: 256, color: { r: 120, g: 120, b: 120 } });
  const patch = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .jpeg()
    .toBuffer();
  const mobile = await sharp(device)
    .composite([{ input: patch, left: 10, top: 10 }])
    .jpeg()
    .toBuffer();
  const { forensic } = await compareDeviceAndMobile(device, mobile);
  assert.strictEqual(forensic.change_type, 'localized_edit');
  assert.ok(forensic.region_bbox, 'expected a region_bbox for a localized edit');
});

test('compareDeviceAndMobile always returns consistency.score between 0 and 1', async () => {
  const device = await makeTestImage({ color: { r: 30, g: 200, b: 90 } });
  const mobile = await makeTestImage({ color: { r: 220, g: 40, b: 10 } });
  const { consistency } = await compareDeviceAndMobile(device, mobile);
  assert.ok(consistency.score >= 0 && consistency.score <= 1, `score out of range: ${consistency.score}`);
  assert.ok(consistency.visual >= 0 && consistency.visual <= 1, `visual out of range: ${consistency.visual}`);
  assert.ok(consistency.content >= 0 && consistency.content <= 1, `content out of range: ${consistency.content}`);
});
