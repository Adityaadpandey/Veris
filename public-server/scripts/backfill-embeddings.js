#!/usr/bin/env node
/**
 * backfill-embeddings.js
 *
 * One-time (idempotent) backfill of Gemini descriptions + embeddings for
 * claims that predate AI enrichment, or whose enrichment previously failed.
 *
 * Usage:
 *   node scripts/backfill-embeddings.js
 *   npm run backfill
 *
 * Skips claims already marked ai_status = 'done'. Safe to re-run.
 *
 * Pass --force (or BACKFILL_FORCE=1) to re-enrich EVERY claim, including ones
 * already 'done'. Use this after changing the embedding method (task type,
 * model, or input text) so all stored vectors are regenerated consistently.
 */

require('dotenv').config();

const dbService = require('../dbService');
const geminiService = require('../geminiService');
const { enrichClaim } = require('../enrichService');

const DELAY_MS = parseInt(process.env.BACKFILL_DELAY_MS || '1500', 10);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  if (!geminiService.isAvailable()) {
    console.error('❌ GEMINI_API_KEY is not configured. Aborting backfill.');
    process.exit(1);
  }

  dbService.initialize();

  const force = process.argv.includes('--force') || process.env.BACKFILL_FORCE === '1';
  const pending = force
    ? dbService.getAllClaimsWithCid()
    : dbService.getClaimsMissingAI();
  console.log(`🔎 Found ${pending.length} claim(s) ${force ? 'to re-enrich (--force)' : 'needing enrichment'}.`);

  let done = 0, failed = 0;
  for (let i = 0; i < pending.length; i++) {
    const claim = pending[i];
    console.log(`\n[${i + 1}/${pending.length}] Enriching ${claim.claim_id} (CID ${claim.cid})...`);
    const status = await enrichClaim(claim.claim_id, claim.cid);
    if (status === 'done') done++; else failed++;
    if (i < pending.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\n✅ Backfill complete: ${done} enriched, ${failed} failed.`);
  dbService.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('❌ Backfill crashed:', err);
  process.exit(1);
});
