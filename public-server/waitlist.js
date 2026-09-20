// Waitlist sign-ups from the landing page: input cleaning and a small per-IP rate limit.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROLES = ['Photographer', 'Journalist or editor', 'Insurer or investigator', 'Developer', 'Something else'];
const DEVICES = ['Hotshoe', 'Clip-on', 'Standalone', 'Not sure yet'];

// Returns { ok: true, value } or { ok: false, error }. Unknown role/device values are dropped, not rejected.
function parseSignup(body) {
  const email = String(body?.email ?? '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, error: 'Enter a valid email address.' };
  const pick = (v, allowed) => (allowed.includes(v) ? v : null);
  return { ok: true, value: { email, role: pick(body.role, ROLES), device: pick(body.device, DEVICES), source: body.source === 'hero' ? 'hero' : 'full' } };
}

// At most `max` sign-ups per IP per window. Memory only, which is enough for one small server.
function createRateLimiter({ max = 5, windowMs = 10 * 60 * 1000 } = {}) {
  const hits = new Map();
  return function allow(key, now = Date.now()) {
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) { hits.set(key, recent); return false; }
    recent.push(now); hits.set(key, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    return true;
  };
}

module.exports = { parseSignup, createRateLimiter };
