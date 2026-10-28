/**
 * DigiLocker identity verification, implemented against Setu's DigiLocker
 * API (https://docs.setu.co/data/digilocker) — a self-serve aggregator in
 * front of the government DigiLocker OAuth2 flow. Chosen over integrating
 * DigiLocker's own partner OAuth2 endpoints directly because those require
 * NIC partner approval (a manual, multi-week process) before any client_id
 * even exists; Setu's sandbox is usable same-day.
 *
 * If/when the app is approved as a direct DigiLocker partner, only this
 * file changes — `createSession()`, `resolveRedirect()`, and
 * `completeSession()` are the whole contract `use-digilocker.tsx` depends on.
 *
 * Sessions are in-memory (Map) — fine for a single server process / demo.
 * A real deployment with multiple instances needs this in Redis or a DB.
 */

const SESSION_TTL_MS = 15 * 60 * 1000;
const sessions = new Map(); // id -> { createdAt, returnTo: string | null }

function purgeExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) sessions.delete(id);
  }
}
setInterval(purgeExpiredSessions, 60 * 1000).unref?.();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} — see server/.env.example`);
  return value;
}

function setuHeaders() {
  return {
    'x-client-id': requireEnv('SETU_CLIENT_ID'),
    'x-client-secret': requireEnv('SETU_CLIENT_SECRET'),
    'x-product-instance-id': requireEnv('SETU_PRODUCT_INSTANCE_ID'),
    'Content-Type': 'application/json',
  };
}

/**
 * Starts a DigiLocker consent request. Returns the URL the user's browser
 * should open, plus an opaque `state` (Setu's request id) the app must send
 * back unchanged on `/callback`.
 *
 * `returnTo` (web only): the page to bounce back to after consent, since a
 * plain browser tab can't be resumed via a custom URL scheme the way
 * `expo-web-browser`'s native auth session can. Native callers omit it and
 * get the app's `verishotshoeapp://` deep link instead — see
 * `resolveRedirect` below.
 */
export async function createSession({ returnTo } = {}) {
  const baseUrl = requireEnv('SETU_BASE_URL');
  const publicServerUrl = requireEnv('PUBLIC_SERVER_URL');

  const res = await fetch(`${baseUrl}/api/digilocker/`, {
    method: 'POST',
    headers: setuHeaders(),
    body: JSON.stringify({ redirectUrl: `${publicServerUrl}/api/digilocker/redirect` }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Setu session create failed (${res.status}): ${body || res.statusText}`);
  }

  /** @type {{ id: string, status: string, url: string, validUpto: string }} */
  const data = await res.json();
  sessions.set(data.id, { createdAt: Date.now(), returnTo: returnTo ?? null });

  return { authUrl: data.url, state: data.id };
}

/**
 * The HTTPS endpoint DigiLocker/Setu redirects the user's browser to once
 * they've consented (or declined) — DigiLocker/Setu will not accept a
 * custom URL scheme as this redirect target directly, so this route is
 * always a real https:// URL. Its only job is figuring out where the
 * *browser* should go next, based on how the session was started:
 *
 * - Native caller (no `returnTo` stored): 302 into the app's own deep
 *   link. `WebBrowser.openAuthSessionAsync` on the client is watching for
 *   exactly that URL to come back and resolves when it does.
 * - Web caller (`returnTo` stored): 302 back to the page the user started
 *   from, carrying the session id forward as a query param, since a full
 *   page navigation is the only way a plain browser tab can "return" here.
 */
export function resolveRedirect(query) {
  const scheme = requireEnv('APP_DEEP_LINK_SCHEME');
  const id = typeof query.id === 'string' ? query.id : '';
  const success = typeof query.success === 'string' ? query.success : 'false';
  const session = sessions.get(id);

  if (session?.returnTo) {
    const url = new URL(session.returnTo);
    url.searchParams.set('digilocker_id', id);
    url.searchParams.set('digilocker_success', success);
    return url.toString();
  }

  const params = new URLSearchParams({ id, success });
  return `${scheme}://digilocker-callback?${params.toString()}`;
}

/**
 * Exchanges the session id for a normalized identity result. Calls Setu's
 * Aadhaar eKYC endpoint server-side and deliberately narrows the response
 * to {verified, name, docType} — the raw eKYC payload (masked Aadhaar
 * number, photo, address, DOB) never leaves this server.
 *
 * NOTE: the exact field names below (`name`, `dob`, etc.) reflect Setu's
 * documented error-code vocabulary but the success-response shape wasn't
 * directly retrievable from their docs during implementation — confirm
 * against a real sandbox response once SETU_CLIENT_ID/SECRET exist, and
 * adjust the `data.<field>` accesses below if they differ.
 */
export async function completeSession(stateOrId) {
  const id = stateOrId;
  if (!id || !sessions.has(id)) {
    return { verified: false, reason: 'This DigiLocker session has expired. Please try again.' };
  }

  const baseUrl = requireEnv('SETU_BASE_URL');
  const res = await fetch(`${baseUrl}/api/digilocker/${id}/aadhaar`, {
    method: 'GET',
    headers: setuHeaders(),
  });

  sessions.delete(id);

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const reason = body?.message || body?.error || 'DigiLocker verification failed.';
    return { verified: false, reason };
  }

  const data = await res.json();
  return {
    verified: true,
    name: data.name ?? data.fullName ?? 'DigiLocker user',
    docType: 'AADHAAR E-KYC',
  };
}
