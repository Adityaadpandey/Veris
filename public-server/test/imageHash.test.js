const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { transformForOrientation } = require('../imageHash');

test('transformForOrientation rotates 90 degrees, swapping width and height', async () => {
  const original = await sharp({ create: { width: 40, height: 20, channels: 3, background: { r: 10, g: 10, b: 10 } } })
    .png()
    .toBuffer();
  const rotated = await transformForOrientation(original, '90');
  const meta = await sharp(rotated).metadata();
  assert.strictEqual(meta.width, 20);
  assert.strictEqual(meta.height, 40);
});

test('transformForOrientation with orientation "0" leaves dimensions unchanged', async () => {
  const original = await sharp({ create: { width: 40, height: 20, channels: 3, background: { r: 10, g: 10, b: 10 } } })
    .png()
    .toBuffer();
  const result = await transformForOrientation(original, '0');
  const meta = await sharp(result).metadata();
  assert.strictEqual(meta.width, 40);
  assert.strictEqual(meta.height, 20);
});
