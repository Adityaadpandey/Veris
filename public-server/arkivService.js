/**
 * arkivService.js
 *
 * Mirrors each claim's provenance record to Arkiv (ARKIV_ENABLED=true). Postgres stays the source of
 * truth: every write here is best-effort, and reads fall back to Postgres when Arkiv is off or fails.
 *
 * - A claim still waiting on its mint is written with a 24 hour life, so abandoned captures
 *   disappear on their own. Once minted, a new longer-lived entity is created (ARKIV_CLAIM_DAYS,
 *   180 at most, which is about what Arkiv allows).
 * - A license is an entity that expires exactly when its term ends.
 * - Entities are tagged with claimId / imageHash / deviceId so they can be searched.
 *
 * The SDK is ESM-only, so it's loaded lazily from this CommonJS file.
 */

const enabled = () => process.env.ARKIV_ENABLED === 'true' && !!process.env.ARKIV_PRIVATE_KEY;

let sdk; // { Claims, publicClient, walletClient, ExpirationTime, query helpers }
async function load() {
  if (sdk) return sdk;
  const { createPublicClient, createWalletClient, ExpirationTime } = await import('@arkiv-network/sdk');
  const { rabdi } = await import('@arkiv-network/sdk/chains');
  const { and, eq } = await import('@arkiv-network/sdk/query');
  const { addr, bytes, defineSchema, str } = await import('@arkiv-network/sdk/schema');
  const { http } = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');

  const Claims = defineSchema('veris-claim', {
    claimId: str().indexed(),
    imageHash: str().indexed(),
    deviceId: str().indexed().optional(),
    owner: addr().indexed().optional(),
    status: str().indexed(),
    record: bytes(), // the full provenance JSON
  });

  const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? '' });
  const account = privateKeyToAccount(process.env.ARKIV_PRIVATE_KEY);
  sdk = {
    Claims, ExpirationTime, and, eq, addr,
    publicClient: createPublicClient({ chain, transport: http() }),
    walletClient: createWalletClient({ chain, transport: http(), account }),
  };
  return sdk;
}

const toBytes = (obj) => new TextEncoder().encode(JSON.stringify(obj));
const fromBytes = (b) => JSON.parse(new TextDecoder().decode(b));

function fields(claimId, record, addr = (v) => v) {
  const f = {
    claimId,
    imageHash: record.imageHash || '',
    status: record.minted ? 'minted' : 'pending',
    record: toBytes(record),
  };
  if (record.deviceId) f.deviceId = record.deviceId;
  if (/^0x[0-9a-fA-F]{40}$/.test(record.owner || '')) f.owner = addr(record.owner); // an addr column wants addr(...), a plain string is refused
  return f;
}

/**
 * Writes the record. `previous` is { key, status } from the last write, so an unchanged state is
 * patched in place and a pending -> minted change gets a fresh entity with the longer life.
 * Returns { key, status }.
 */
async function writeClaimRecord(claimId, record, previous = null) {
  const { Claims, walletClient, ExpirationTime, addr } = await load();
  const f = fields(claimId, record, addr);
  if (previous?.key && previous.status === f.status) {
    await walletClient.patchEntity(Claims, previous.key, { set: f });
    return { key: previous.key, status: f.status };
  }
  // Arkiv refuses a life longer than ~182 days, so a minted claim gets the maximum and Postgres
  // stays the permanent record.
  const expiration = f.status === 'minted'
    ? ExpirationTime.fromDays(Math.min(Number(process.env.ARKIV_CLAIM_DAYS || 180), 180))
    : ExpirationTime.fromHours(24);
  const { entityKey } = await walletClient.createEntity(Claims, f, { expiration });
  return { key: entityKey, status: f.status };
}

async function query(filter) {
  const { Claims, publicClient } = await load();
  const result = await publicClient.select({ $key: true, record: true, status: true }).from(Claims).where(filter).limit(20).fetch();
  return result.entities.map((row) => ({ key: row.$key, status: row.status.value, ...fromBytes(row.record.value) }));
}

async function getClaimRecord(claimId) {
  const { eq } = await load();
  const rows = await query(eq('claimId', claimId));
  return rows.find((r) => r.status === 'minted') || rows[0] || null;
}

async function search({ imageHash, deviceId }) {
  const { eq } = await load();
  return query(eq(imageHash ? 'imageHash' : 'deviceId', imageHash || deviceId));
}

let Licenses;
async function writeLicense(l) {
  const { walletClient, ExpirationTime } = await load();
  const { bytes, defineSchema, str } = await import('@arkiv-network/sdk/schema');
  Licenses = Licenses || defineSchema('veris-license', {
    tokenId: str().indexed(), licensee: str().indexed(), chain: str(), txHash: str(), record: bytes(),
  });
  const { entityKey } = await walletClient.createEntity(Licenses, {
    tokenId: String(l.tokenId), licensee: l.licensee.toLowerCase(), chain: l.chain, txHash: l.txHash, record: toBytes(l),
  }, { expiration: ExpirationTime.atDate(new Date(l.expiresAt * 1000)) });
  return entityKey;
}

module.exports = { enabled, writeClaimRecord, writeLicense, getClaimRecord, search, _fields: fields };
