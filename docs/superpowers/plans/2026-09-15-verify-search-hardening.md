# Verify & Search Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the "Visually similar" scoring bug (a byte-identical image showing up at 91% instead of ~100%, because content-similarity was measured via a re-generated, non-deterministic caption instead of the image itself), and add real pixel-level forensic diffing against the matched on-chain original for the tamper-detection tiers, so "Altered Copy" verdicts explain *what* changed instead of just reporting an opaque hash-distance percentage.

**Architecture:** All changes live in `public-server` (no other service is touched). The duplicated "build a ranked similar-photos list" logic in `server.js`'s two routes (`POST /api/search`, `GET /api/similar/:claim_id`) — which is what let the dedupe/self-match bug exist in one route but not the other — gets extracted into a single shared module, `similarPhotos.js`, that both routes call. A new `pixelDiff.js` module does block-wise SSIM comparison between an uploaded "altered copy" and its matched original (fetched from IPFS, reusing the fetch that already happens for the existing GPT comparison instead of doing it twice) and returns a structured, deterministic diff instead of just a hash-distance number. A new offline script recalibrates the hand-picked tamper thresholds against real sample images.

**Tech Stack:** Node.js (CommonJS), Express, `sharp` for image decoding/transforms, Postgres via `pg`, Node's built-in `node:test` runner (no new dependency). No new npm packages are added anywhere in this plan.

## Global Constraints

- CommonJS throughout `public-server` (`require`/`module.exports`) — this directory does not use ES modules despite the repo-wide CLAUDE.md note; follow its existing convention, confirmed by `imageHash.js`'s and `clipService.js`'s own file-header comments.
- No new npm dependencies. Everything here is built on `sharp`, `pg`, and Node's built-in `node:test` / `node:assert`, all already available.
- CLIP stays opt-in behind `ENABLE_CLIP` (default off). When unavailable — disabled, or a specific candidate row predates CLIP backfill — content-similarity falls back to the existing OpenAI caption-text-embedding cosine for that comparison only, never hard-fails.
- All new/changed JSON response fields are additive. No existing field is renamed or removed; `GET /api/similar/:claim_id` gains extra fields (`tags`, `recipient_address`, `device_id`, `created_at`) as a side effect of sharing `buildSimilarResults` with `/api/search` — this is a backward-compatible superset, not a breaking change.
- Test runner: Node's built-in `node --test` against `public-server/test/`. No Jest/Mocha/supertest install.
- Commits: small, one per logical step group, in the imperative (`fix: ...`, `feat: ...`, `refactor: ...`, `test: ...`), no name/email/co-author trailers.

---

## Task 1: Wire up a test runner

`public-server` currently has no test framework and no `test` npm script. Every later task in this plan needs somewhere to put real, runnable tests, so this has to exist first.

**Files:**
- Create: `public-server/test/smoke.test.js`
- Modify: `public-server/package.json`

**Interfaces:**
- Produces: `public-server/test/` as the directory later tasks add `*.test.js` files to; `npm test` (run from `public-server/`) as the command that runs all of them via `node --test test/`.

- [ ] **Step 1: Write a deliberately failing smoke test**

Create `public-server/test/smoke.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('test runner is wired up', () => {
  assert.strictEqual(1 + 1, 3);
});
```

- [ ] **Step 2: Run it directly and confirm it fails**

Run: `cd public-server && node --test test/`
Expected: output shows 1 failing test, `AssertionError [ERR_ASSERTION]: 1 + 1 !== 3` (or similar), non-zero exit code.

- [ ] **Step 3: Fix the assertion**

Edit `public-server/test/smoke.test.js`, change `3` to `2`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('test runner is wired up', () => {
  assert.strictEqual(1 + 1, 2);
});
```

- [ ] **Step 4: Add the `test` npm script**

In `public-server/package.json`, add to `"scripts"`:

```json
    "test": "node --test test/"
```

Full `scripts` block becomes:

```json
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "backfill": "node scripts/backfill-embeddings.js",
    "test": "node --test test/"
  },
```

- [ ] **Step 5: Run `npm test` and confirm it passes**

Run: `cd public-server && npm test`
Expected: `# pass 1`, `# fail 0`, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add public-server/test/smoke.test.js public-server/package.json
git commit -m "test: wire up node:test as public-server's test runner"
```

---

## Task 2: Extract a shared, deduped, CLIP-aware similar-results builder

This is the actual bug fix. Today, `blendedSimilarity` and `rowOrientationHashes` are defined once in `server.js` (lines 77-109) and the "build the ranked similar-photos list" logic is duplicated almost verbatim inside both `POST /api/search` (lines ~1446-1476) and `GET /api/similar/:claim_id` (lines ~1531-1552) — and they'd drifted: `/api/similar/:claim_id` already excludes the claim it's called for (`rows.filter(r => r.claim_id !== claim_id)`), but `/api/search` never excluded the claim it had just matched via exact SHA-256 hash or via the hash-tamper vote. That's why uploading a byte-identical image showed it again in "visually similar" at 91%: it was being scored against *itself*, and the "content" half of that score came from a freshly re-generated GPT caption (non-deterministic wording) compared against the stored caption's embedding — never actually 1.0 even for the identical photo.

This task creates one shared module both routes will call (wired in Task 6), fixes the dedupe, and switches content-similarity to prefer CLIP image embeddings (deterministic, pixel-grounded) over the caption-text embedding, falling back to text per-row when a CLIP embedding isn't available on either side.

**Files:**
- Create: `public-server/similarPhotos.js`
- Test: `public-server/test/similarPhotos.test.js`

**Interfaces:**
- Consumes: `openaiService.cosineSimilarity(a, b)` (existing, `public-server/openaiService.js:96-108`), `clipService.cosineSimilarity(a, b)` (existing, `public-server/clipService.js:110-115`), `bestCombinedHashDistance(query, entries)` (existing, `public-server/imageHash.js:297-307`).
- Produces:
  - `blendedSimilarity(visual: number|null, content: number): { score: number, visual: number|null, content: number }`
  - `rowOrientationHashes(row: object): Array<{orientation: string, dhash: string|null, phash: string|null, ahash: string|null}>`
  - `contentSimilarity(query: {clipEmbedding?: number[], textEmbedding?: number[]}, row: {clip_embedding?: string, embedding?: string}): number`
  - `buildSimilarResults(params: { rows: object[], excludeClaimId?: string|null, query: {hashes: object, clipEmbedding?: number[]|null, textEmbedding?: number[]|null}, frontendUrl: string, minScore: number, limit: number }): object[]`
  - Server.js (Task 6) imports `{ buildSimilarResults, rowOrientationHashes }` from this module and deletes its own copies.

- [ ] **Step 1: Write the failing tests**

Create `public-server/test/similarPhotos.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { blendedSimilarity, rowOrientationHashes, contentSimilarity, buildSimilarResults } = require('../similarPhotos');

test('blendedSimilarity blends visual and content when both present', () => {
  const result = blendedSimilarity(1, 0.5);
  assert.ok(result.score > 0.5 && result.score <= 1, `expected score in (0.5, 1], got ${result.score}`);
  assert.strictEqual(result.visual, 1);
  assert.strictEqual(result.content, 0.5);
});

test('blendedSimilarity falls back to content-only when visual is null', () => {
  const result = blendedSimilarity(null, 0.42);
  assert.strictEqual(result.score, 0.42);
  assert.strictEqual(result.visual, null);
});

test('rowOrientationHashes prefers parsed orientation_hashes JSON', () => {
  const row = { orientation_hashes: JSON.stringify([{ orientation: '90', dhash: 'a', phash: 'b', ahash: 'c' }]) };
  const result = rowOrientationHashes(row);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].orientation, '90');
});

test('rowOrientationHashes falls back to legacy single-orientation columns', () => {
  const row = { phash: 'aaaa', phash_dct: 'bbbb', ahash: 'cccc' };
  assert.deepStrictEqual(rowOrientationHashes(row), [{ orientation: '0', dhash: 'aaaa', phash: 'bbbb', ahash: 'cccc' }]);
});

test('rowOrientationHashes returns empty array when nothing is stored', () => {
  assert.deepStrictEqual(rowOrientationHashes({}), []);
});

test('contentSimilarity prefers CLIP embeddings when both sides have one', () => {
  const query = { clipEmbedding: [1, 0], textEmbedding: [1, 0] };
  const row = { clip_embedding: JSON.stringify([1, 0]), embedding: JSON.stringify([0, 1]) };
  // CLIP vectors are identical (-> 1); text vectors are orthogonal (-> 0).
  // A result of 1 proves CLIP was used, not text.
  assert.strictEqual(contentSimilarity(query, row), 1);
});

test('contentSimilarity falls back to text embedding when the row has no CLIP embedding', () => {
  const query = { clipEmbedding: [1, 0], textEmbedding: [1, 0] };
  const row = { embedding: JSON.stringify([1, 0]) }; // no clip_embedding column on this row
  assert.strictEqual(contentSimilarity(query, row), 1);
});

test('contentSimilarity returns 0 when neither embedding type is available', () => {
  assert.strictEqual(contentSimilarity({}, {}), 0);
});

test('buildSimilarResults excludes the given claim id', () => {
  const rows = [
    { claim_id: 'self', embedding: JSON.stringify([1, 0]), tags: '[]' },
    { claim_id: 'other', embedding: JSON.stringify([1, 0]), tags: '[]' }
  ];
  const results = buildSimilarResults({
    rows,
    excludeClaimId: 'self',
    query: { hashes: { dhash: null, phash: null, ahash: null }, textEmbedding: [1, 0] },
    frontendUrl: 'https://example.com',
    minScore: 0,
    limit: 10
  });
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].claim_id, 'other');
});

test('buildSimilarResults sorts by similarity descending and respects limit', () => {
  const rows = [
    { claim_id: 'low', embedding: JSON.stringify([0, 1]), tags: '[]' },
    { claim_id: 'high', embedding: JSON.stringify([1, 0]), tags: '[]' }
  ];
  const results = buildSimilarResults({
    rows,
    excludeClaimId: null,
    query: { hashes: { dhash: null, phash: null, ahash: null }, textEmbedding: [1, 0] },
    frontendUrl: 'https://example.com',
    minScore: 0,
    limit: 1
  });
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].claim_id, 'high');
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd public-server && node --test test/similarPhotos.test.js`
Expected: FAIL — `Cannot find module '../similarPhotos'`.

- [ ] **Step 3: Create `similarPhotos.js`**

Create `public-server/similarPhotos.js`:

```js
/**
 * similarPhotos.js
 *
 * Shared "visually similar verified photos" ranking used by both
 * POST /api/search and GET /api/similar/:claim_id, so the two routes can't
 * drift out of sync the way they did before: /api/similar/:claim_id already
 * excluded the claim it was called for, but /api/search never excluded a
 * claim it had just matched exactly (or via the hash-tamper vote), so a
 * byte-identical re-upload showed up again in its own "visually similar"
 * list.
 *
 * Blends two independent signals into one headline score:
 *   - visual  — deterministic multi-hash (dHash + pHash-DCT + aHash) closeness,
 *               see imageHash.combinedHashDistance.
 *   - content — CLIP image-embedding cosine when available (clipService.js),
 *               since that compares actual pixel content and gives an
 *               identical image ~1.0, deterministically. Falls back to the
 *               OpenAI caption-text-embedding cosine only when a CLIP
 *               embedding is missing on either side (CLIP disabled, or the
 *               candidate predates CLIP backfill) — a freshly re-generated
 *               caption is not deterministic, so even a re-uploaded IDENTICAL
 *               image could previously score well under 100% there.
 *
 * CommonJS to match the rest of public-server.
 */

const { cosineSimilarity: textCosineSimilarity } = require('./openaiService');
const clipService = require('./clipService');
const { bestCombinedHashDistance } = require('./imageHash');

// The "similar photos" list blends two independent signals — see file header.
// Ranking by content alone previously put unrelated-but-similar-subject
// photos at ~87%; weighting visual heavily fixes that while keeping content
// as a signal. Both sub-scores are returned to the client, so the headline
// number is never a black box.
const SEARCH_VISUAL_WEIGHT = Math.min(Math.max(
  parseFloat(process.env.SEARCH_VISUAL_WEIGHT || '0.7'), 0), 1);
const SEARCH_CONTENT_WEIGHT = 1 - SEARCH_VISUAL_WEIGHT;

/**
 * Combine visual + content into a single 0..1 headline score. When there's
 * no perceptual hash to compare (e.g. not backfilled), fall back to content only.
 */
function blendedSimilarity(visual, content) {
  const c = Math.max(0, Math.min(1, content)); // cosine can be slightly <0
  if (visual === null || visual === undefined) {
    return { score: c, visual: null, content: c };
  }
  const v = Math.max(0, Math.min(1, visual));
  return {
    score: SEARCH_VISUAL_WEIGHT * v + SEARCH_CONTENT_WEIGHT * c,
    visual: v,
    content: c
  };
}

// Build the {orientation, dhash, phash, ahash}[] list a claim row was stored
// with, for orientation-tolerant matching (see imageHash.computeOrientationHashes
// / bestCombinedHashDistance). Rows already backfilled with orientation_hashes
// use that; older rows that only have the single orientation-'0' columns still
// compare fine, they just won't match a rotated/mirrored re-upload until the
// backfill job (POST /api/enrich/backfill) reaches them.
function rowOrientationHashes(row) {
  if (row.orientation_hashes) {
    try {
      const parsed = typeof row.orientation_hashes === 'string'
        ? JSON.parse(row.orientation_hashes)
        : row.orientation_hashes;
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      // fall through to the legacy single-orientation shape below
    }
  }
  if (row.phash || row.phash_dct || row.ahash) {
    return [{ orientation: '0', dhash: row.phash, phash: row.phash_dct, ahash: row.ahash }];
  }
  return [];
}

/**
 * Content-similarity between a query and one candidate row. Prefers CLIP
 * image embeddings (deterministic, pixel-grounded) over the OpenAI
 * caption-text embedding, per-row: a row's `clip_embedding` may be absent
 * (CLIP disabled, or not yet backfilled) even when `query.clipEmbedding` is
 * present, in which case this falls back to text embeddings for that row only.
 */
function contentSimilarity(query, row) {
  if (query.clipEmbedding && row.clip_embedding) {
    let storedClip;
    try { storedClip = JSON.parse(row.clip_embedding); } catch { storedClip = null; }
    if (storedClip) return clipService.cosineSimilarity(query.clipEmbedding, storedClip);
  }
  if (query.textEmbedding && row.embedding) {
    let storedText;
    try { storedText = JSON.parse(row.embedding); } catch { storedText = null; }
    if (storedText) return textCosineSimilarity(query.textEmbedding, storedText);
  }
  return 0;
}

/**
 * Rank candidate rows (shaped like dbService.getAllEmbeddings()'s output,
 * with an optional `clip_embedding` column) by blended visual+content
 * similarity to `query`.
 *
 * @param {object} params
 * @param {object[]} params.rows - candidate rows
 * @param {string|null} [params.excludeClaimId] - claim_id to leave out (e.g.
 *   a claim already returned as an exact/altered_copy verdict, or the claim
 *   whose own detail page is asking for its neighbors)
 * @param {object} params.query - { hashes, clipEmbedding, textEmbedding }
 * @param {string} params.frontendUrl
 * @param {number} params.minScore
 * @param {number} params.limit
 * @returns {object[]}
 */
function buildSimilarResults({ rows, excludeClaimId = null, query, frontendUrl, minScore, limit }) {
  return rows
    .filter(row => row.claim_id !== excludeClaimId)
    .map(row => {
      const content = contentSimilarity(query, row);
      const cmp = bestCombinedHashDistance(query.hashes, rowOrientationHashes(row));
      const visual = cmp.distance === null ? null : 1 - cmp.distance;
      const blend = blendedSimilarity(visual, content);
      let tags = [];
      try { tags = row.tags ? JSON.parse(row.tags) : []; } catch { tags = []; }
      return {
        claim_id: row.claim_id,
        token_id: row.token_id || null,
        cid: row.cid,
        recipient_address: row.recipient_address || null,
        device_id: row.device_id || null,
        created_at: row.created_at,
        description: row.description || null,
        tags,
        similarity: Math.round(blend.score * 100) / 100,
        visual_similarity: blend.visual === null ? null : Math.round(blend.visual * 100) / 100,
        content_similarity: Math.round(blend.content * 100) / 100,
        claim_url: `${frontendUrl}/claim/${row.claim_id}`
      };
    })
    .filter(r => r.similarity >= minScore)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

module.exports = { blendedSimilarity, rowOrientationHashes, contentSimilarity, buildSimilarResults };
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd public-server && node --test test/similarPhotos.test.js`
Expected: `# pass 9`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add public-server/similarPhotos.js public-server/test/similarPhotos.test.js
git commit -m "feat: add shared, deduped, CLIP-aware similar-results builder"
```

(Not wired into `server.js` yet — that's Task 6, after `dbService`, `imageHash`, and `pixelDiff` are ready.)

---

## Task 3: dbService — expose CLIP embeddings alongside text embeddings

`getAllEmbeddings()` currently only joins `image_embeddings` (OpenAI caption-text vectors). `similarPhotos.contentSimilarity` (Task 2) needs each candidate row's CLIP embedding too, and `GET /api/similar/:claim_id` needs a way to fetch a single claim's CLIP embedding for the query side. No new tables — `clip_embeddings` already exists (`public-server/dbService.js:120-130`); this just exposes it where needed.

There's no test database wired into this repo, so these two thin, mechanical Postgres wrapper changes are verified manually in Task 6's end-to-end smoke test rather than with a fabricated mock — mocking `pg` here would test the mock, not the SQL.

**Files:**
- Modify: `public-server/dbService.js`

**Interfaces:**
- Produces:
  - `dbService.getClipEmbedding(claim_id: string): Promise<{claim_id, cid, embedding, model, dim, created_at}|null>`
  - `dbService.getAllEmbeddings()` rows now additionally include a `clip_embedding` column (the candidate's CLIP embedding as a JSON string, or `null`).

- [ ] **Step 1: Add `getClipEmbedding`**

In `public-server/dbService.js`, right after `upsertClipEmbedding` (ends at line 392) and before `getAllClipEmbeddings` (line 396), insert:

```js
  /** Single claim's CLIP embedding row, or null. Mirrors getEmbedding() but
   * for the separate clip_embeddings table. */
  async getClipEmbedding(claim_id) {
    const { rows } = await this.pool.query('SELECT * FROM clip_embeddings WHERE claim_id = $1', [claim_id]);
    return rows[0] || null;
  }

```

- [ ] **Step 2: Extend `getAllEmbeddings` to include the CLIP embedding**

In `public-server/dbService.js`, replace the existing `getAllEmbeddings` method (lines 366-376):

```js
  /** All embeddings joined with claim details useful for search results. */
  async getAllEmbeddings() {
    const { rows } = await this.pool.query(`
      SELECT e.claim_id, e.cid, e.embedding, e.dim,
             c.token_id, c.recipient_address, c.device_id, c.status,
             c.description, c.tags, c.phash, c.phash_dct, c.ahash, c.orientation_hashes, c.created_at
      FROM image_embeddings e
      JOIN claims c ON e.claim_id = c.claim_id
    `);
    return rows;
  }
```

with:

```js
  /** All embeddings joined with claim details useful for search results.
   * LEFT JOINs clip_embeddings too so callers (similarPhotos.contentSimilarity)
   * can prefer a candidate's CLIP image embedding over its OpenAI
   * caption-text embedding when one is available. */
  async getAllEmbeddings() {
    const { rows } = await this.pool.query(`
      SELECT e.claim_id, e.cid, e.embedding, e.dim,
             c.token_id, c.recipient_address, c.device_id, c.status,
             c.description, c.tags, c.phash, c.phash_dct, c.ahash, c.orientation_hashes, c.created_at,
             ce.embedding AS clip_embedding
      FROM image_embeddings e
      JOIN claims c ON e.claim_id = c.claim_id
      LEFT JOIN clip_embeddings ce ON ce.claim_id = e.claim_id
    `);
    return rows;
  }
```

- [ ] **Step 3: Sanity-check the SQL parses and runs**

Run: `cd public-server && node -e "require('./dbService'); console.log('dbService loads OK')"`
Expected: prints `dbService loads OK` (this only proves the file still parses/loads — the query itself is exercised for real in Task 6's manual smoke test against a live Postgres instance).

- [ ] **Step 4: Commit**

```bash
git add public-server/dbService.js
git commit -m "feat: expose CLIP embeddings from getAllEmbeddings and getClipEmbedding"
```

---

## Task 4: imageHash.js — export the orientation-transform helper

`pixelDiff.js` (Task 5) needs to rotate/mirror the matched original into the same orientation as the upload before diffing pixel-for-pixel — otherwise a rotated-but-genuine match would be scored as one giant "difference". `transformForOrientation` already does exactly this (`public-server/imageHash.js:198-205`), it's just not exported yet.

**Files:**
- Modify: `public-server/imageHash.js`
- Test: `public-server/test/imageHash.test.js`

**Interfaces:**
- Produces: `transformForOrientation(buffer: Buffer, orientation: string): Promise<Buffer>` (PNG-encoded), now exported.

- [ ] **Step 1: Write the failing test**

Create `public-server/test/imageHash.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd public-server && node --test test/imageHash.test.js`
Expected: FAIL — `transformForOrientation is not a function` (it's not exported yet).

- [ ] **Step 3: Export `transformForOrientation`**

In `public-server/imageHash.js`, replace the `module.exports` block (lines 309-312):

```js
module.exports = {
  sha256Hex, dHash, pHash, aHash, computeHashes, hammingDistance, combinedHashDistance,
  ORIENTATIONS, computeOrientationHashes, bestCombinedHashDistance
};
```

with:

```js
module.exports = {
  sha256Hex, dHash, pHash, aHash, computeHashes, hammingDistance, combinedHashDistance,
  ORIENTATIONS, computeOrientationHashes, bestCombinedHashDistance, transformForOrientation
};
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd public-server && node --test test/imageHash.test.js`
Expected: `# pass 2`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add public-server/imageHash.js public-server/test/imageHash.test.js
git commit -m "feat: export transformForOrientation from imageHash"
```

---

## Task 5: pixelDiff.js — real pixel-level forensic diff against the matched original

This is the core of the tamper-hardening half of the work. Today, an "Altered Copy" verdict's only evidence is a single opaque number (`1 - hammingDistance`). Once a candidate lands in the `structural_edit` or `possible_match` tier, Verify & Search already knows *which* on-chain original it matched — unlike a generic reverse-image search, there's ground truth to compare against. This module does that comparison: block-wise SSIM (structural similarity) between the upload and its matched original, classifying the result as a crop (aspect-ratio change), a whole-frame adjustment (recolor/brightness/filter — most blocks changed), a localized edit (a contiguous region changed — likely splice/object edit), or unremarkable re-compression noise (no block crosses the bad threshold).

**Files:**
- Create: `public-server/pixelDiff.js`
- Test: `public-server/test/pixelDiff.test.js`

**Interfaces:**
- Consumes: nothing new (only `sharp`, already a dependency).
- Produces: `computeForensicDiff(originalBuffer: Buffer, uploadBuffer: Buffer): Promise<{ ssim: number, change_type: 'crop'|'global_adjustment'|'localized_edit'|'recompression', region_bbox: {x:number,y:number,width:number,height:number}|null }>`
  - Caller contract: `originalBuffer` must already be rotated/mirrored to match the upload's orientation (via `imageHash.transformForOrientation`, Task 4) before calling this — wired in Task 6.

- [ ] **Step 1: Write the failing tests**

Create `public-server/test/pixelDiff.test.js`:

```js
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
  // Crops only horizontally (256 -> 200 wide, height unchanged), so the
  // aspect ratio shifts from 1.0 to 0.78 — enough to trip the crop check.
  const cropped = await sharp(original)
    .extract({ left: 28, top: 0, width: 200, height: 256 })
    .jpeg()
    .toBuffer();
  const result = await computeForensicDiff(original, cropped);
  assert.strictEqual(result.change_type, 'crop');
});

test('computeForensicDiff finds a localized edit and its region', async () => {
  const original = await makeTestImage({ width: 256, height: 256, color: { r: 120, g: 120, b: 120 } });
  // Composite a solid black block into the top-left corner — same dimensions
  // (no crop), most of the frame untouched (not a global adjustment).
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
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd public-server && node --test test/pixelDiff.test.js`
Expected: FAIL — `Cannot find module '../pixelDiff'`.

- [ ] **Step 3: Create `pixelDiff.js`**

Create `public-server/pixelDiff.js`:

```js
/**
 * pixelDiff.js
 *
 * Real pixel-level comparison between an upload flagged as an "altered copy"
 * (imageHash tamper tiers structural_edit / possible_match) and the on-chain
 * original it matched against. The hash-based tamper check (imageHash.js)
 * only produces a single opaque distance number; this fetches the actual
 * ground-truth original (which Verify & Search always has, unlike a generic
 * reverse-image search) and measures WHERE and roughly WHAT KIND of edit
 * happened, using block-wise SSIM (structural similarity).
 *
 * CommonJS to match the rest of public-server. Uses `sharp` for decoding.
 */

const sharp = require('sharp');

const CANVAS_SIZE = 256; // working resolution, square, both images forced to fit
const BLOCK_SIZE = 16;   // 256 / 16 = 16x16 grid of blocks
const BLOCKS_PER_SIDE = CANVAS_SIZE / BLOCK_SIZE;
const BLOCK_BAD_THRESHOLD = 0.75;       // per-block SSIM below this counts as "changed"
const GLOBAL_ADJUSTMENT_FRACTION = 0.6; // bad-block fraction at/above this -> whole-frame edit
const ASPECT_RATIO_TOLERANCE = 0.05;    // >5% aspect-ratio difference -> treat as a crop

const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;

async function grayscaleCanvas(buffer) {
  return sharp(buffer)
    .grayscale()
    .resize(CANVAS_SIZE, CANVAS_SIZE, { fit: 'fill' })
    .raw()
    .toBuffer();
}

async function aspectRatio(buffer) {
  const { width, height } = await sharp(buffer).metadata();
  if (!width || !height) return null;
  return width / height;
}

/** SSIM of one BLOCK_SIZE x BLOCK_SIZE block between two equal-size grayscale canvases. */
function blockSsim(a, b, blockRow, blockCol) {
  const startRow = blockRow * BLOCK_SIZE;
  const startCol = blockCol * BLOCK_SIZE;
  let sumA = 0, sumB = 0, n = 0;
  for (let r = 0; r < BLOCK_SIZE; r++) {
    for (let c = 0; c < BLOCK_SIZE; c++) {
      const idx = (startRow + r) * CANVAS_SIZE + (startCol + c);
      sumA += a[idx];
      sumB += b[idx];
      n++;
    }
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let varA = 0, varB = 0, covAB = 0;
  for (let r = 0; r < BLOCK_SIZE; r++) {
    for (let c = 0; c < BLOCK_SIZE; c++) {
      const idx = (startRow + r) * CANVAS_SIZE + (startCol + c);
      const da = a[idx] - meanA;
      const db = b[idx] - meanB;
      varA += da * da;
      varB += db * db;
      covAB += da * db;
    }
  }
  varA /= (n - 1);
  varB /= (n - 1);
  covAB /= (n - 1);

  const numerator = (2 * meanA * meanB + C1) * (2 * covAB + C2);
  const denominator = (meanA * meanA + meanB * meanB + C1) * (varA + varB + C2);
  return denominator === 0 ? 1 : numerator / denominator;
}

/**
 * Compare an on-chain original against an uploaded copy that already matched
 * it via perceptual hash (tier structural_edit or possible_match). Caller is
 * responsible for pre-rotating/mirroring `originalBuffer` to the orientation
 * that matched (imageHash.transformForOrientation), so this only ever sees
 * two images that are the SAME way up.
 *
 * @returns {Promise<{ ssim: number, change_type: string, region_bbox: {x:number,y:number,width:number,height:number}|null }>}
 */
async function computeForensicDiff(originalBuffer, uploadBuffer) {
  const [origRatio, uploadRatio] = await Promise.all([
    aspectRatio(originalBuffer),
    aspectRatio(uploadBuffer)
  ]);
  const aspectMismatch = origRatio && uploadRatio
    ? Math.abs(origRatio - uploadRatio) / origRatio > ASPECT_RATIO_TOLERANCE
    : false;

  const [a, b] = await Promise.all([
    grayscaleCanvas(originalBuffer),
    grayscaleCanvas(uploadBuffer)
  ]);

  let sumSsim = 0;
  let badCount = 0;
  let minRow = null, maxRow = null, minCol = null, maxCol = null;
  const totalBlocks = BLOCKS_PER_SIDE * BLOCKS_PER_SIDE;

  for (let row = 0; row < BLOCKS_PER_SIDE; row++) {
    for (let col = 0; col < BLOCKS_PER_SIDE; col++) {
      const score = blockSsim(a, b, row, col);
      sumSsim += score;
      if (score < BLOCK_BAD_THRESHOLD) {
        badCount++;
        minRow = minRow === null ? row : Math.min(minRow, row);
        maxRow = maxRow === null ? row : Math.max(maxRow, row);
        minCol = minCol === null ? col : Math.min(minCol, col);
        maxCol = maxCol === null ? col : Math.max(maxCol, col);
      }
    }
  }

  const ssim = Math.round((sumSsim / totalBlocks) * 1000) / 1000;
  const badFraction = badCount / totalBlocks;

  let changeType;
  let regionBbox = null;
  if (aspectMismatch) {
    changeType = 'crop';
  } else if (badFraction >= GLOBAL_ADJUSTMENT_FRACTION) {
    changeType = 'global_adjustment';
  } else if (badCount > 0) {
    changeType = 'localized_edit';
    regionBbox = {
      x: Math.round((minCol / BLOCKS_PER_SIDE) * 1000) / 1000,
      y: Math.round((minRow / BLOCKS_PER_SIDE) * 1000) / 1000,
      width: Math.round(((maxCol - minCol + 1) / BLOCKS_PER_SIDE) * 1000) / 1000,
      height: Math.round(((maxRow - minRow + 1) / BLOCKS_PER_SIDE) * 1000) / 1000
    };
  } else {
    changeType = 'recompression';
  }

  return { ssim, change_type: changeType, region_bbox: regionBbox };
}

module.exports = { computeForensicDiff };
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd public-server && node --test test/pixelDiff.test.js`
Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add public-server/pixelDiff.js public-server/test/pixelDiff.test.js
git commit -m "feat: add block-wise SSIM forensic diff against matched originals"
```

---

## Task 6: Wire everything into server.js

Integrates Tasks 2-5 into the two live routes: dedupe + CLIP-aware content scoring for "visually similar", and forensic diffing for altered-copy tiers. Also removes the now-duplicated `blendedSimilarity`/`rowOrientationHashes` definitions from `server.js` in favor of the shared module, and fetches the matched original's bytes only once per request (previously fetched a second time inside the OpenAI-comparison branch).

This task's correctness lives at the route level (multipart upload, Postgres, optionally OpenAI/CLIP), which isn't realistically unit-testable without standing up that infrastructure and isn't worth adding a new test-framework dependency (e.g. supertest) for. It's verified with a concrete manual smoke test instead (Step 6 below) — the logic it's wiring together (dedupe, content-similarity fallback, SSIM classification) is already covered by real unit tests in Tasks 2 and 5.

**Files:**
- Modify: `public-server/server.js`

**Interfaces:**
- Consumes: `buildSimilarResults`, `rowOrientationHashes` (`./similarPhotos`, Task 2); `dbService.getClipEmbedding`, `dbService.getAllEmbeddings` with `clip_embedding` (Task 3); `transformForOrientation` (`./imageHash`, Task 4); `computeForensicDiff` (`./pixelDiff`, Task 5).

- [ ] **Step 1: Update imports and remove the now-duplicated helpers**

In `public-server/server.js`, replace the import block (lines 8-14):

```js
const dbService = require('./dbService');
const openaiService = require('./openaiService');
const { cosineSimilarity } = openaiService;
const { enrichClaim, fetchImageBuffer, backfillForensics } = require('./enrichService');
const { sha256Hex, computeHashes, bestCombinedHashDistance } = require('./imageHash');
const { exifSignals } = require('./imageForensics');
const clipService = require('./clipService');
```

with:

```js
const dbService = require('./dbService');
const openaiService = require('./openaiService');
const { enrichClaim, fetchImageBuffer, backfillForensics } = require('./enrichService');
const { sha256Hex, computeHashes, bestCombinedHashDistance, transformForOrientation } = require('./imageHash');
const { exifSignals } = require('./imageForensics');
const clipService = require('./clipService');
const { computeForensicDiff } = require('./pixelDiff');
const { buildSimilarResults, rowOrientationHashes } = require('./similarPhotos');
```

(`cosineSimilarity` is no longer used directly in `server.js` — only inside `similarPhotos.js` now.)

Then delete the `blendedSimilarity` function, its weight constants, and the `rowOrientationHashes` function — the whole block from the `SEARCH_VISUAL_WEIGHT` comment through the end of `rowOrientationHashes` (original lines 57-109):

```js
// The "similar photos" list blends two independent signals:
//   • visual  — deterministic multi-hash (dHash + pHash-DCT + aHash) closeness.
//               Captures composition/framing, so a DIFFERENT ANGLE of the same
//               scene scores LOW even when the content is alike. Using three
//               hash families instead of one closes the gap where dHash alone
//               misses color-grading/blur edits that pHash's frequency domain
//               catches (and vice versa for pixel-level noise).
//   • content — OpenAI text-embedding cosine. Captures subject matter, so two
//               different desks both described as "cluttered desk with laptop"
//               score HIGH even though the photos look nothing alike.
// Ranking by content alone made unrelated-but-similar-subject photos rank at
// ~87%. Weighting VISUAL heavily fixes that while keeping content as a signal.
// Both sub-scores are returned to the client, so the headline number is never
// a black box.
const SEARCH_VISUAL_WEIGHT = Math.min(Math.max(
  parseFloat(process.env.SEARCH_VISUAL_WEIGHT || '0.7'), 0), 1);
const SEARCH_CONTENT_WEIGHT = 1 - SEARCH_VISUAL_WEIGHT;

// Combine visual + content into a single 0..1 headline score. When a candidate
// has no perceptual hash yet (e.g. not backfilled), fall back to content only.
function blendedSimilarity(visual, content) {
  const c = Math.max(0, Math.min(1, content)); // cosine can be slightly <0
  if (visual === null || visual === undefined) {
    return { score: c, visual: null, content: c };
  }
  const v = Math.max(0, Math.min(1, visual));
  return {
    score: SEARCH_VISUAL_WEIGHT * v + SEARCH_CONTENT_WEIGHT * c,
    visual: v,
    content: c
  };
}

// Build the {orientation, dhash, phash, ahash}[] list a claim row was stored
// with, for orientation-tolerant matching (see imageHash.computeOrientationHashes
// / bestCombinedHashDistance). Rows already backfilled with orientation_hashes
// use that; older rows that only have the single orientation-'0' columns still
// compare fine, they just won't match a rotated/mirrored re-upload until the
// backfill job (POST /api/enrich/backfill) reaches them.
function rowOrientationHashes(row) {
  if (row.orientation_hashes) {
    try {
      const parsed = JSON.parse(row.orientation_hashes);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      // fall through to the legacy single-orientation shape below
    }
  }
  if (row.phash || row.phash_dct || row.ahash) {
    return [{ orientation: '0', dhash: row.phash, phash: row.phash_dct, ahash: row.ahash }];
  }
  return [];
}
```

`server.js` now gets `rowOrientationHashes` from `./similarPhotos` instead (still used by the tamper-scan loop further down).

- [ ] **Step 2: Run the full test suite to confirm nothing broke from the import/deletion**

Run: `cd public-server && npm test`
Expected: all existing tests still pass (server.js isn't required by any test file, so this mainly confirms Tasks 1-5's tests are unaffected; the real check is Step 6 below).

- [ ] **Step 3: Rewrite `POST /api/search`**

Replace the entire route (originally lines 1285-1502, from `app.post('/api/search', ...)` through its closing `});`) with:

```js
app.post('/api/search', upload.single('image'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'No image uploaded' });
    }
    if (!req.file.mimetype || !req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ success: false, error: 'Uploaded file must be an image' });
    }

    const buffer = req.file.buffer;

    // ── Layer 1 & 2: deterministic hashing (no external service needed) ──────
    const uploadSha = sha256Hex(buffer);
    let uploadHashes = { dhash: null, phash: null, ahash: null };
    try { uploadHashes = await computeHashes(buffer); } catch (e) {
      console.warn('⚠️  Could not compute perceptual hashes for upload:', e.message);
    }
    const hashDecodeFailed = !uploadHashes.dhash && !uploadHashes.phash && !uploadHashes.ahash;

    let verdict = { type: 'no_match', message: 'This image does not match any verified photo on-chain.' };
    // Fetched lazily the first time an altered-copy tier needs the original's
    // bytes (the forensic diff below, and/or the OpenAI side-by-side
    // comparison further down) and reused for both instead of fetching twice.
    let cachedOriginalBuffer = null;

    const exact = await dbService.getClaimByImageHash(uploadSha);
    if (exact) {
      verdict = {
        type: 'authentic_original',
        claim_id: exact.claim_id,
        token_id: exact.token_id || null,
        message: 'Authentic original — byte-for-byte identical to the verified on-chain image.',
        image_hash: uploadSha,
        claim_url: `${FRONTEND_URL}/claim/${exact.claim_id}`
      };
    } else if (uploadHashes.dhash || uploadHashes.phash || uploadHashes.ahash) {
      // Closest match among claims that have at least one perceptual hash,
      // scored by the weighted vote across all hash families both sides have.
      let best = null;
      for (const row of await dbService.getClaimsWithPhash()) {
        const cmp = bestCombinedHashDistance(uploadHashes, rowOrientationHashes(row));
        if (cmp.distance === null) continue;
        if (best === null || cmp.distance < best.distance) best = { row, ...cmp };
      }

      if (best && best.distance <= TAMPER_POSSIBLE_MAX) {
        const tier = best.distance <= TAMPER_RECOMPRESSED_MAX ? 'recompressed'
          : best.distance <= TAMPER_STRUCTURAL_MAX ? 'structural_edit'
          : 'possible_match';

        const tierMessage = {
          recompressed: 'Near-identical to a verified on-chain image — most likely just re-saved or '
            + 're-encoded (e.g. re-exported at a different quality/format), not edited.',
          structural_edit: 'Altered copy — this matches a verified on-chain image but is NOT byte-identical. '
            + 'It has been cropped, edited, filtered, or AI-modified, so it is not the authentic original.',
          possible_match: 'Possible altered copy — some visual similarity to a verified on-chain image, but '
            + 'the match is weaker, so this is a lower-confidence signal rather than a firm conclusion.'
        }[tier];

        verdict = {
          type: 'altered_copy',
          tier,
          claim_id: best.row.claim_id,
          token_id: best.row.token_id || null,
          message: tierMessage,
          confidence: Math.round((1 - best.distance) * 100) / 100,
          hash_coverage: Math.round(best.coverage * 100) / 100,
          hash_breakdown: best.breakdown,
          // Which stored rotation/mirror orientation matched best — e.g. '180'
          // or '90-flip' means the upload is the same image, reoriented.
          matched_orientation: best.orientation,
          // Kept for backward-compat with any client reading the old single-hash fields.
          bit_distance: best.breakdown.dhash ? best.breakdown.dhash.distance : null,
          visual_match: Math.round((1 - best.distance) * 100),
          original_cid: best.row.cid || null,
          claim_url: `${FRONTEND_URL}/claim/${best.row.claim_id}`
        };

        // ── Real pixel diff against the matched original — only for the two
        // tiers where the hash vote says "probably edited, not just
        // recompressed" (a pure re-encode's SSIM is always ~1.0 with no
        // region, so skip the fetch+compute cost for that tier).
        if ((tier === 'structural_edit' || tier === 'possible_match') && verdict.original_cid) {
          try {
            const { buffer: origBuffer } = await fetchImageBuffer(verdict.original_cid);
            cachedOriginalBuffer = origBuffer;
            const alignedOriginal = best.orientation && best.orientation !== '0'
              ? await transformForOrientation(origBuffer, best.orientation)
              : origBuffer;
            verdict.forensic_diff = await computeForensicDiff(alignedOriginal, buffer);
          } catch (diffErr) {
            console.warn('⚠️  Could not compute forensic diff:', diffErr.message);
          }
        }
      }
    }

    // ── Layer 3: EXIF forensics on the upload — soft, non-authoritative ──────
    try {
      verdict.exif_signal = await exifSignals(buffer);
    } catch (e) {
      console.warn('⚠️  Could not extract EXIF signal for upload:', e.message);
    }

    // ── CLIP query embedding — computed once (if enabled), shared by layer 3b
    // (semantic recovery) and layer 4 (content-similarity for "visually
    // similar"), so a request never pays for two separate CLIP inferences.
    let uploadClip = null;
    if (clipService.isAvailable() && !hashDecodeFailed) {
      try { uploadClip = await clipService.embedImage(buffer, req.file.mimetype); } catch (e) {
        console.warn('⚠️  Could not compute CLIP embedding for upload:', e.message);
      }
    }

    // ── Layer 3b: CLIP semantic-visual recovery — only when hashing found
    // nothing. Catches edits (heavy filters, noise) strong enough to push
    // every hash band above; see CLIP_MATCH_MIN_SCORE comment above. Never
    // runs when the hash scan already produced a verdict — CLIP is a softer
    // signal and shouldn't second-guess a real hash match.
    if (verdict.type === 'no_match' && uploadClip) {
      try {
        let best = null;
        for (const row of await dbService.getAllClipEmbeddings()) {
          let stored;
          try { stored = JSON.parse(row.embedding); } catch { stored = null; }
          if (!stored) continue;
          const score = clipService.cosineSimilarity(uploadClip, stored);
          if (best === null || score > best.score) best = { row, score };
        }
        if (best && best.score >= CLIP_MATCH_MIN_SCORE) {
          verdict = {
            type: 'altered_copy',
            tier: 'possible_match_semantic',
            claim_id: best.row.claim_id,
            token_id: best.row.token_id || null,
            message: 'Possible altered copy — no pixel-level (hash) match, but this photo looks '
              + 'semantically very similar to a verified on-chain image. Likely the same source photo '
              + 'after heavy editing (strong filters, noise, or color changes) rather than an unrelated '
              + 'photo. Best-effort AI signal, not a deterministic proof like the hash-based tiers.',
            confidence: Math.round(best.score * 100) / 100,
            authoritative: false,
            original_cid: best.row.cid || null,
            claim_url: `${FRONTEND_URL}/claim/${best.row.claim_id}`,
            exif_signal: verdict.exif_signal
          };
        }
      } catch (e) {
        console.warn('⚠️  CLIP semantic match failed (hash verdict still returned):', e.message);
      }
    }

    // ── Layers 4 & 5: OpenAI description, similar-photos ranking, AI hint ────
    // Best-effort: if OpenAI is down, the hash verdict above is still returned.
    let queryDescription = null;
    let aiHint = null;
    let similar = [];

    if (openaiService.isAvailable()) {
      try {
        const q = await openaiService.processImage(buffer, req.file.mimetype);
        queryDescription = q.description || null;
        aiHint = {
          likely_ai_generated: Boolean(q.likelyAiGenerated),
          note: q.aiAssessment || null,
          authoritative: false
        };

        // For an altered copy, describe WHAT changed vs the on-chain original by
        // showing OpenAI both images side by side. Non-authoritative, best-effort.
        if (verdict.type === 'altered_copy' && verdict.original_cid) {
          try {
            const origBuffer = cachedOriginalBuffer || (await fetchImageBuffer(verdict.original_cid)).buffer;
            const diff = await openaiService.compareImages(origBuffer, buffer, req.file.mimetype);
            verdict.changes = {
              summary: diff.summary || null,
              items: diff.changes,
              change_type: diff.changeType,
              authoritative: false
            };
          } catch (diffErr) {
            console.warn('⚠️  Could not compare altered copy to original:', diffErr.message);
          }
        }

        // Exclude the claim already surfaced as the verdict itself (exact OR
        // altered_copy) — showing it again in "visually similar" is redundant
        // at best and, for an exact match, was previously confusing: its own
        // re-generated caption embeds slightly differently from its stored
        // one every time (LLM captioning isn't deterministic), so a
        // BYTE-IDENTICAL image could show up there at ~91% instead of the
        // ~100% a user would expect from matching itself.
        const alreadyMatchedClaimId = (verdict.type === 'authentic_original' || verdict.type === 'altered_copy')
          ? verdict.claim_id
          : null;

        similar = buildSimilarResults({
          rows: await dbService.getAllEmbeddings(),
          excludeClaimId: alreadyMatchedClaimId,
          query: { hashes: uploadHashes, clipEmbedding: uploadClip, textEmbedding: q.embedding },
          frontendUrl: FRONTEND_URL,
          minScore: SEARCH_MIN_SCORE,
          limit: 5
        });
      } catch (e) {
        console.warn('⚠️  OpenAI enrichment of query failed (hash verdict still returned):', e.message);
      }
    }

    if (hashDecodeFailed && verdict.type !== 'authentic_original') {
      verdict.hash_decode_failed = true;
      verdict.hash_warning = 'Could not decode this image for visual comparison — the format may be '
        + 'unsupported (e.g. HEIC straight off an iPhone — try exporting/sharing as JPEG or PNG first) '
        + 'or the file may be corrupt. Only the exact byte-for-byte match check ran.';
    }

    res.json({
      success: true,
      verdict,
      ai_hint: aiHint,
      query_description: queryDescription,
      // `results` kept as an alias for backward-compat with any old client.
      results: similar,
      similar
    });
  } catch (error) {
    console.error('❌ Error during search:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

- [ ] **Step 4: Rewrite `GET /api/similar/:claim_id`**

Replace the entire route (originally lines 1505-1559) with:

```js
// Similar verified photos for a given claim (used on the claim page).
app.get('/api/similar/:claim_id', async (req, res) => {
  try {
    const { claim_id } = req.params;
    const limit = Math.min(parseInt(req.query.limit || '4', 10) || 4, 12);

    const self = await dbService.getEmbedding(claim_id);
    if (!self || !self.embedding) {
      return res.json({ success: true, results: [] });
    }

    let selfEmbedding;
    try { selfEmbedding = JSON.parse(self.embedding); } catch { selfEmbedding = null; }
    if (!selfEmbedding) {
      return res.json({ success: true, results: [] });
    }

    const selfClip = await dbService.getClipEmbedding(claim_id);
    let selfClipEmbedding = null;
    if (selfClip && selfClip.embedding) {
      try { selfClipEmbedding = JSON.parse(selfClip.embedding); } catch { selfClipEmbedding = null; }
    }

    const allRows = await dbService.getAllEmbeddings();
    const selfRow = allRows.find(r => r.claim_id === claim_id);
    // Query with just this claim's canonical (orientation '0') hash set — no
    // need to query with all 8 of its own orientations, since it's the
    // CANDIDATE rows below that get checked across all their stored
    // orientations for a rotated/mirrored match.
    const selfHashes = selfRow
      ? { dhash: selfRow.phash, phash: selfRow.phash_dct, ahash: selfRow.ahash }
      : { dhash: null, phash: null, ahash: null };

    const results = buildSimilarResults({
      rows: allRows,
      excludeClaimId: claim_id,
      query: { hashes: selfHashes, clipEmbedding: selfClipEmbedding, textEmbedding: selfEmbedding },
      frontendUrl: FRONTEND_URL,
      minScore: SEARCH_MIN_SCORE,
      limit
    });

    res.json({ success: true, results });
  } catch (error) {
    console.error('❌ Error getting similar photos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

- [ ] **Step 5: Run the full test suite**

Run: `cd public-server && npm test`
Expected: `# fail 0` (all Task 1/2/4/5 tests still pass; this task didn't add its own unit tests, per the note above).

- [ ] **Step 6: Manual end-to-end smoke test**

This needs a running server with `DATABASE_URL` pointing at a real (can be local) Postgres, and at least one existing claim row with a `cid` pointing at a real image and `ai_status = 'done'` (i.e. already enriched, so it has an `image_embeddings` row). Adjust the claim id/image paths below to match your data.

1. Start the server: `cd public-server && npm run dev`
2. Confirm dedupe fixed the original bug — download the exact bytes of an already-claimed image (e.g. via `GET /api/image/:cid` for a claim you know is enriched), then re-upload those exact same bytes:
   ```bash
   curl -s -o /tmp/original.jpg http://localhost:5001/api/image/<CID_OF_AN_EXISTING_CLAIM>
   curl -s -F "image=@/tmp/original.jpg" http://localhost:5001/api/search | python3 -m json.tool
   ```
   Expected: `verdict.type` is `"authentic_original"` with `verdict.claim_id` equal to that claim's id, AND that same `claim_id` does **not** appear anywhere in the `similar` array.
3. Confirm the forensic diff appears for an altered copy — take that same original, crop or recolor it, then upload the edited version:
   ```bash
   python3 -c "
   from PIL import Image
   img = Image.open('/tmp/original.jpg')
   w, h = img.size
   img.crop((int(w*0.1), 0, w, h)).save('/tmp/edited.jpg')
   "
   curl -s -F "image=@/tmp/edited.jpg" http://localhost:5001/api/search | python3 -m json.tool
   ```
   Expected: `verdict.type` is `"altered_copy"` with `tier` `"structural_edit"` or `"possible_match"`, and `verdict.forensic_diff` is present with a `change_type` (likely `"crop"` for this specific edit) and an `ssim` value.
4. Confirm `GET /api/similar/:claim_id` still works and excludes itself:
   ```bash
   curl -s http://localhost:5001/api/similar/<SAME_CLAIM_ID> | python3 -m json.tool
   ```
   Expected: 200 OK, JSON array, that claim's own id never appears in `results`.

- [ ] **Step 7: Commit**

```bash
git add public-server/server.js
git commit -m "fix: dedupe self-matches and add forensic diffing to Verify & Search"
```

---

## Task 7: Threshold calibration script

The `TAMPER_RECOMPRESSED_MAX` / `TAMPER_STRUCTURAL_MAX` / `TAMPER_POSSIBLE_MAX` bands (`public-server/server.js:39-41`) were originally hand-picked. This adds an offline tool that applies a matrix of realistic edits (recompression at several JPEG qualities, crops, small rotations, common filters) to real sample photos and reports the resulting `combinedHashDistance`, so the three thresholds can be set from actual data.

This is a human-in-the-loop calibration step by nature — it needs real, representative photos (not synthetic test fixtures) to mean anything, so running it and deciding whether to change the defaults is a manual step, not something this plan can pre-compute.

**Files:**
- Create: `public-server/scripts/calibrate-tamper-thresholds.js`
- Modify: `public-server/package.json`

**Interfaces:**
- Consumes: `computeHashes`, `combinedHashDistance` (`../imageHash`, existing).
- Produces: a CLI tool, no code interface consumed by anything else in this plan.

- [ ] **Step 1: Create the script**

Create `public-server/scripts/calibrate-tamper-thresholds.js`:

```js
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
```

- [ ] **Step 2: Add the npm script**

In `public-server/package.json`, add to `"scripts"`:

```json
    "calibrate": "node scripts/calibrate-tamper-thresholds.js"
```

Full `scripts` block becomes:

```json
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "backfill": "node scripts/backfill-embeddings.js",
    "test": "node --test test/",
    "calibrate": "node scripts/calibrate-tamper-thresholds.js"
  },
```

- [ ] **Step 3: Run it against real sample photos and review the output**

Run: `cd public-server && npm run calibrate -- /path/to/photo1.jpg /path/to/photo2.jpg /path/to/photo3.jpg` (use at least 3-5 real photos, ideally ones representative of what actually gets claimed through this system).

Expected: a table of min/p50/p95/max combined-hash-distance per transform, followed by three suggested threshold values.

This is a judgment call, not an automated step: compare the suggested values against the current defaults (`TAMPER_RECOMPRESSED_MAX=0.05`, `TAMPER_STRUCTURAL_MAX≈0.156`, `TAMPER_POSSIBLE_MAX=0.24` in `public-server/server.js:39-41`). If they're close, leave the defaults as-is — the calibration confirmed them. If they differ meaningfully, update the three `TAMPER_*_MAX` defaults in `server.js` (or set the corresponding env vars in deployment) to the calibrated values, and re-run the Task 6 manual smoke test to confirm known altered copies still classify sensibly.

- [ ] **Step 4: Commit**

```bash
git add public-server/scripts/calibrate-tamper-thresholds.js public-server/package.json
git commit -m "feat: add offline tamper-threshold calibration script"
```

(If Step 3 led to changing the `TAMPER_*_MAX` defaults in `server.js`, commit that as its own follow-up commit with a message explaining the calibrated values used, e.g. `fix: recalibrate tamper thresholds from sample-photo data`.)
