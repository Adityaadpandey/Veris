const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSignup, createRateLimiter } = require('../waitlist');

test('parseSignup normalises email and drops unknown choices', () => {
  const r = parseSignup({ email: '  Ada@Example.COM ', role: 'Photographer', device: 'bogus' });
  assert.deepEqual(r, { ok: true, value: { email: 'ada@example.com', role: 'Photographer', device: null, source: 'full' } });
});

test('parseSignup rejects bad emails', () => {
  for (const email of ['', 'nope', 'a@b', 'a b@c.com', undefined]) assert.equal(parseSignup({ email }).ok, false);
});

test('rate limiter allows max hits per window then recovers', () => {
  const allow = createRateLimiter({ max: 2, windowMs: 1000 });
  assert.ok(allow('ip', 0)); assert.ok(allow('ip', 1)); assert.equal(allow('ip', 2), false);
  assert.ok(allow('ip', 1500));
  assert.ok(allow('other', 2));
});
