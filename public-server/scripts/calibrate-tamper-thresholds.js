#!/usr/bin/env node
/**
 * calibrate-tamper-thresholds.js
 *
 * Offline calibration tool for the TAMPER_RECOMPRESSED_MAX / TAMPER_STRUCTURAL_MAX
 * / TAMPER_POSSIBLE_MAX bands in server.js. Those defaults were originally
 * hand-picked; this applies a matrix of known, realistic edits (recompression
 * at several JPEG qualities, center crops, small rotations, and common
 * filters) to real sample photos you provide, measures the resulting
 * imageHash.combinedHashDistance against each original, and prints the
 * distribution so the three thresholds can be set from actual data instead
 * of guesses.
 *
 * Usage:
 *   node scripts/calibrate-tamper-thresholds.js photo1.jpg photo2.jpg ...
 *
 * Pass a handful (5-10+) of real, representative on-chain-style photos —
 * varied lighting/subject matter gives a more reliable picture than one image
 * repeated. This never touches the database or network; it only reads the
 * files you pass in.
 */

const fs = require('fs/promises');
const sharp = require('sharp');
const { computeHashes, combinedHashDistance } = require('../imageHash');

async function cropPercent(buf, fraction) {
  const { width, height } = await sharp(buf).metadata();
  const cropW = Math.round(width * (1 - fraction));
  const cropH = Math.round(height * (1 - fraction));
  const left = Math.round((width - cropW) / 2);
  const top = Math.round((height - cropH) / 2);
  return sharp(buf).extract({ left, top, width: cropW, height: cropH }).jpeg().toBuffer();
}

const TRANSFORMS = [
  { name: 'recompress_q95', apply: buf => sharp(buf).jpeg({ quality: 95 }).toBuffer() },
  { name: 'recompress_q85', apply: buf => sharp(buf).jpeg({ quality: 85 }).toBuffer() },
  { name: 'recompress_q70', apply: buf => sharp(buf).jpeg({ quality: 70 }).toBuffer() },
  { name: 'recompress_q50', apply: buf => sharp(buf).jpeg({ quality: 50 }).toBuffer() },
  { name: 'crop_5pct', apply: buf => cropPercent(buf, 0.05) },
  { name: 'crop_10pct', apply: buf => cropPercent(buf, 0.10) },
  { name: 'crop_20pct', apply: buf => cropPercent(buf, 0.20) },
  { name: 'rotate_2deg', apply: buf => sharp(buf).rotate(2).jpeg().toBuffer() },
  { name: 'rotate_5deg', apply: buf => sharp(buf).rotate(5).jpeg().toBuffer() },
  { name: 'grayscale', apply: buf => sharp(buf).grayscale().jpeg().toBuffer() },
  { name: 'brighten_20pct', apply: buf => sharp(buf).modulate({ brightness: 1.2 }).jpeg().toBuffer() },
  { name: 'blur_2px', apply: buf => sharp(buf).blur(2).jpeg().toBuffer() }
];

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('Usage: node scripts/calibrate-tamper-thresholds.js <image1> [image2] ...');
    process.exit(1);
  }

  const distancesByTransform = {};
  for (const t of TRANSFORMS) distancesByTransform[t.name] = [];

  for (const file of files) {
    const original = await fs.readFile(file);
    const originalHashes = await computeHashes(original);

    for (const t of TRANSFORMS) {
      try {
        const transformed = await t.apply(original);
        const transformedHashes = await computeHashes(transformed);
        const { distance } = combinedHashDistance(originalHashes, transformedHashes);
        if (distance !== null) distancesByTransform[t.name].push(distance);
      } catch (err) {
        console.warn(`  (skipped ${t.name} for ${file}: ${err.message})`);
      }
    }
  }

  console.log(`\nCombined hash distance by transform, across ${files.length} image(s):\n`);
  console.log('transform'.padEnd(20), 'min'.padEnd(8), 'p50'.padEnd(8), 'p95'.padEnd(8), 'max');
  const p95ByTransform = {};
  for (const t of TRANSFORMS) {
    const sorted = [...distancesByTransform[t.name]].sort((a, b) => a - b);
    if (sorted.length === 0) continue;
    const min = sorted[0];
    const p50 = percentile(sorted, 0.50);
    const p95 = percentile(sorted, 0.95);
    const max = sorted[sorted.length - 1];
    p95ByTransform[t.name] = p95;
    console.log(
      t.name.padEnd(20),
      min.toFixed(3).padEnd(8),
      p50.toFixed(3).padEnd(8),
      p95.toFixed(3).padEnd(8),
      max.toFixed(3)
    );
  }

  const recompressionP95 = Math.max(
    p95ByTransform.recompress_q95 || 0,
    p95ByTransform.recompress_q85 || 0,
    p95ByTransform.recompress_q70 || 0
  );
  const structuralP95 = Math.max(
    p95ByTransform.rotate_2deg || 0,
    p95ByTransform.grayscale || 0,
    p95ByTransform.brighten_20pct || 0,
    p95ByTransform.blur_2px || 0,
    p95ByTransform.recompress_q50 || 0
  );
  const possibleP95 = Math.max(
    p95ByTransform.crop_5pct || 0,
    p95ByTransform.crop_10pct || 0,
    p95ByTransform.rotate_5deg || 0
  );

  console.log('\nSuggested thresholds (95th percentile of the transforms each band should still catch):');
  console.log(`  TAMPER_RECOMPRESSED_MAX = ${recompressionP95.toFixed(3)}  (recompression only)`);
  console.log(`  TAMPER_STRUCTURAL_MAX   = ${structuralP95.toFixed(3)}  (+ small rotation/grayscale/brightness/blur/heavy recompression)`);
  console.log(`  TAMPER_POSSIBLE_MAX     = ${possibleP95.toFixed(3)}  (+ crops, larger rotation)`);
  console.log('\nThese are suggestions from YOUR sample set — sanity-check them, then set as env vars');
  console.log('(or update the defaults in server.js) rather than trusting them blindly on one run.\n');
}

main().catch(err => {
  console.error('Calibration failed:', err);
  process.exit(1);
});
