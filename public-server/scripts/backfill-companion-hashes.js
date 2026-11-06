#!/usr/bin/env node
// Hashes the phone photo of every already-paired claim so /search can match it.
// New pairings do this on their own; run once after deploying: node scripts/backfill-companion-hashes.js
require('dotenv').config();

const dbService = require('../dbService');
const { mobileSearchHashes, fetchBufferFromUrl } = require('../companionCapture');

async function main() {
  await dbService.initialize();
  const { rows } = await dbService.pool.query(`
    SELECT claim_id, companion_capture FROM claims
    WHERE companion_capture->>'mobile_image_url' IS NOT NULL
      AND companion_capture->>'mobile_image_hash' IS NULL`);
  console.log(`${rows.length} paired claim(s) to hash`);
  for (const { claim_id, companion_capture } of rows) {
    try {
      const hashes = await mobileSearchHashes(await fetchBufferFromUrl(companion_capture.mobile_image_url));
      await dbService.patchCompanionCapture(claim_id, hashes);
      console.log(`  ${claim_id} ok`);
    } catch (e) {
      console.warn(`  ${claim_id} failed: ${e.message}`);
    }
  }
  await dbService.close();
}

main().catch(e => { console.error(e); process.exit(1); });
