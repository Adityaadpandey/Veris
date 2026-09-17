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

test('compareDeviceAndMobile tolerates the mobile photo being rotated relative to the device', async () => {
  // Asymmetric content (an off-center patch) so a 90-degree rotation actually changes the hashes —
  // a uniform color square would look identical to itself rotated and wouldn't exercise the fix.
  const patch = await sharp({ create: { width: 60, height: 60, channels: 3, background: { r: 230, g: 30, b: 30 } } })
    .jpeg()
    .toBuffer();
  const device = await sharp({ create: { width: 256, height: 256, channels: 3, background: { r: 90, g: 90, b: 90 } } })
    .composite([{ input: patch, left: 10, top: 10 }])
    .jpeg()
    .toBuffer();
  const rotatedMobile = await sharp(device).rotate(90).jpeg().toBuffer();

  const { consistency } = await compareDeviceAndMobile(device, rotatedMobile);
  assert.ok(
    consistency.score > 0.9,
    `expected a high score once the best-matching orientation is found, got ${consistency.score}`
  );
});

test('compareDeviceAndMobile always returns consistency.score between 0 and 1', async () => {
  const device = await makeTestImage({ color: { r: 30, g: 200, b: 90 } });
  const mobile = await makeTestImage({ color: { r: 220, g: 40, b: 10 } });
  const { consistency } = await compareDeviceAndMobile(device, mobile);
  assert.ok(consistency.score >= 0 && consistency.score <= 1, `score out of range: ${consistency.score}`);
  assert.ok(consistency.visual >= 0 && consistency.visual <= 1, `visual out of range: ${consistency.visual}`);
  assert.ok(consistency.content >= 0 && consistency.content <= 1, `content out of range: ${consistency.content}`);
});

test('compareDeviceAndMobile tolerates the mobile photo having a tighter field of view (crop + rotation + exposure)', async () => {
  // A phone and a device camera mounted together almost never share a focal length, so the mobile
  // shot is very often a genuine sub-region of the device's wider frame, not just a squished copy of
  // the whole thing — this is the scenario that made real captures score ~25% before the fix.
  const patch = await sharp({ create: { width: 80, height: 80, channels: 3, background: { r: 40, g: 180, b: 210 } } })
    .jpeg()
    .toBuffer();
  const device = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 90, g: 90, b: 90 } } })
    .composite([{ input: patch, left: 160, top: 110 }])
    .jpeg()
    .toBuffer();
  const mobile = await sharp(device)
    .extract({ left: 90, top: 40, width: 220, height: 220 })
    .resize(220, 300) // narrower FOV, different aspect ratio than the device
    .modulate({ brightness: 1.25 }) // a second camera sensor won't agree on exposure either
    .rotate(90) // and won't necessarily be mounted the same way up
    .jpeg()
    .toBuffer();

  const { consistency } = await compareDeviceAndMobile(device, mobile);
  assert.ok(
    consistency.score > 0.55,
    `expected the crop+rotation+exposure search to recover a decent score, got ${consistency.score}`
  );
});

test('compareDeviceAndMobile does not let two different scenes hide behind a shared plain background', async () => {
  // Block-wise SSIM (and hashing) treat a flat, featureless region as a perfect match by
  // construction, since there's no texture there for either side to disagree on. Two genuinely
  // different photos that happen to share a plain backdrop (a wall, a sky, a table) could otherwise
  // score deceptively high purely on that shared blandness rather than on any real correspondence.
  const patchA = await sharp({ create: { width: 80, height: 80, channels: 3, background: { r: 40, g: 180, b: 210 } } })
    .jpeg()
    .toBuffer();
  const device = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 90, g: 90, b: 90 } } })
    .composite([{ input: patchA, left: 160, top: 110 }])
    .jpeg()
    .toBuffer();

  const patchB = await sharp({ create: { width: 80, height: 80, channels: 3, background: { r: 210, g: 40, b: 40 } } })
    .jpeg()
    .toBuffer();
  const differentScene = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 90, g: 90, b: 90 } } })
    .composite([{ input: patchB, left: 30, top: 190 }])
    .jpeg()
    .toBuffer();

  const { consistency } = await compareDeviceAndMobile(device, differentScene);
  assert.ok(
    consistency.score < 0.5,
    `expected a genuinely different scene to score well below a real pairing despite the shared background, got ${consistency.score}`
  );
});
