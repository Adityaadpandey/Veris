#!/usr/bin/env node
// Local alternative to POST /api/companion/backfill-hashes: node scripts/backfill-companion-hashes.js
require('dotenv').config();

const dbService = require('../dbService');
const { backfillCompanionHashes } = require('../companionCapture');

(async () => {
  await dbService.initialize();
  console.log(await backfillCompanionHashes());
  await dbService.close();
})().catch(e => { console.error(e); process.exit(1); });
