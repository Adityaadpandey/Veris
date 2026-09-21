import { ethers } from 'ethers';

// Must match build_packet_message() in hardware-camera-app/capture_pipeline.py byte for byte.
export function buildPacketMessage({ imageHash, companionHash, verdict, timestamp, nonce, deviceAddress }) {
  return [
    'veris-capture-v1',
    `image:${imageHash}`,
    `companion:${companionHash || '-'}`,
    `verdict:${verdict || 'pending'}`,
    `ts:${timestamp}`,
    `nonce:${nonce}`,
    `device:${String(deviceAddress).toLowerCase()}`,
  ].join('\n');
}

// How old a packet may be. A capture made offline is uploaded later, so this is hours, not seconds.
const MAX_AGE_MS = Number(process.env.PACKET_MAX_AGE_HOURS || 24) * 3600 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000; // Pi clocks drift a little

// Returns { ok: true } or { ok: false, status, error }. `seenNonce(nonce)` says if it was used before.
export function checkPacket(fields, signature, seenNonce, now = Date.now()) {
  const { timestamp, nonce, deviceAddress } = fields;
  if (!timestamp || !nonce) return { ok: false, status: 400, error: 'Missing packet fields: timestamp, nonce' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, status: 400, error: 'Bad timestamp' };
  if (now - ts > MAX_AGE_MS) return { ok: false, status: 403, error: 'Packet is too old' };
  if (ts - now > MAX_FUTURE_MS) return { ok: false, status: 403, error: 'Packet timestamp is in the future' };

  let signer;
  try {
    signer = ethers.verifyMessage(buildPacketMessage(fields), signature);
  } catch {
    return { ok: false, status: 403, error: 'Signature is not recoverable' };
  }
  if (signer.toLowerCase() !== String(deviceAddress).toLowerCase()) {
    return { ok: false, status: 403, error: 'Signature was not made by deviceAddress' };
  }
  if (seenNonce(nonce)) return { ok: false, status: 409, error: 'Nonce already used' };
  return { ok: true, signer };
}

// Self-check: node packet.js
if (process.argv[1] && process.argv[1].endsWith('packet.js')) {
  const assert = (await import('node:assert')).default;
  const w = ethers.Wallet.createRandom();
  const f = { imageHash: 'ab', companionHash: '', verdict: 'real', timestamp: String(Date.now()), nonce: 'n1', deviceAddress: w.address };
  const sig = await w.signMessage(buildPacketMessage(f));
  assert(checkPacket(f, sig, () => false).ok, 'good packet');
  assert.equal(checkPacket(f, sig, () => true).status, 409, 'replayed nonce');
  assert.equal(checkPacket({ ...f, verdict: 'fake' }, sig, () => false).status, 403, 'tampered field');
  assert.equal(checkPacket({ ...f, deviceAddress: ethers.Wallet.createRandom().address }, sig, () => false).status, 403, 'wrong signer');
  assert.equal(checkPacket({ ...f, timestamp: String(Date.now() - 48 * 3600e3) }, sig, () => false).status, 403, 'stale');
  console.log('packet.js ok');
}
