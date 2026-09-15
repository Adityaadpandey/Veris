#!/usr/bin/env node
/**
 * backfill-embeddings.js
 *
 * One-time (idempotent) backfill for claims missing EITHER:
 *   - AI enrichment (OpenAI description/tags/embedding) — never processed or
 *     previously failed, OR
 *   - deterministic forensics (multi-hash + EXIF signal) — added after some
 *     claims were already AI-enriched under the old single-hash scheme.
 *
 * Claims that only need forensics take the free backfillForensics() path (no
 * OpenAI call), so this script is safe to run even without OPENAI_API_KEY
 * configured — it'll just skip the AI step for claims that need it and pick
 * those up on a later run once a key is set.
 *
 * Usage:
 *   node scripts/backfill-embeddings.js
 *   npm run backfill
 *
 * Skips claims that already have everything (ai_status = 'done' AND all
 * forensic fields populated). Safe to re-run.
 *
 * Pass --force (or BACKFILL_FORCE=1) to re-run FULL AI enrichment for EVERY
 * claim, including ones already 'done'. Use this after changing the
 * embedding method (task type, model, or input text) so all stored vectors
 * are regenerated consistently. Requires OPENAI_API_KEY.
 */

require('dotenv').config();

const dbService = require('../dbService');
const openaiService = require('../openaiService');
const { enrichClaim, backfillForensics } = require('../enrichService');

const DELAY_MS = parseInt(process.env.BACKFILL_DELAY_MS || '1500', 10);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const force = process.argv.includes('--force') || process.env.BACKFILL_FORCE === '1';

  if (force && !openaiService.isAvailable()) {
    console.error('❌ OPENAI_API_KEY is not configured. --force requires re-running full AI enrichment for every claim.');
    process.exit(1);
  }
  if (!openaiService.isAvailable()) {
    console.warn('⚠️  OPENAI_API_KEY not configured — claims needing AI enrichment will be skipped; forensic hashes/EXIF will still backfill.');
  }

  await dbService.initialize();

  const pending = force
    ? await dbService.getAllClaimsWithCid()
    : await dbService.getClaimsNeedingBackfill();
  console.log(`🔎 Found ${pending.length} claim(s) ${force ? 'to re-enrich (--force)' : 'needing backfill'}.`);

  let done = 0, failed = 0, forensicsOnly = 0;
  for (let i = 0; i < pending.length; i++) {
    const claim = pending[i];
    const needsAI = force || claim.ai_status == null || claim.ai_status === 'failed';
    const runAI = needsAI && openaiService.isAvailable();
    console.log(`\n[${i + 1}/${pending.length}] ${runAI ? 'Enriching' : 'Backfilling forensics for'} ${claim.claim_id} (CID ${claim.cid})...`);
    const status = runAI
      ? await enrichClaim(claim.claim_id, claim.cid)
      : await backfillForensics(claim.claim_id, claim.cid);
    if (status === 'done') { done++; if (!runAI) forensicsOnly++; } else failed++;
    if (i < pending.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\n✅ Backfill complete: ${done} succeeded (${forensicsOnly} forensics-only), ${failed} failed.`);
  await dbService.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('❌ Backfill crashed:', err);
  process.exit(1);
});
