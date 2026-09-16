const { test } = require('node:test');
const assert = require('node:assert/strict');

test('test runner is wired up', () => {
  assert.strictEqual(1 + 1, 2);
});
