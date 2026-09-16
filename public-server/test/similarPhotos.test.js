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
  assert.strictEqual(contentSimilarity(query, row), 1);
});

test('contentSimilarity falls back to text embedding when the row has no CLIP embedding', () => {
  const query = { clipEmbedding: [1, 0], textEmbedding: [1, 0] };
  const row = { embedding: JSON.stringify([1, 0]) };
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
