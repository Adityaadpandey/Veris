import { PublicKey } from '@solana/web3.js';
import crypto from 'crypto';

// Pure PDA-derivation + validation helpers for the `veris` Anchor program.
// No network access here — mirrors solana-program/tests/veris.ts exactly so
// solanaService and the camera/claim server agree on addresses.

export function sha256(data) {
  return crypto.createHash('sha256').update(Buffer.isBuffer(data) ? data : Buffer.from(data)).digest();
}

export function configPda(programId) {
  return PublicKey.findProgramAddressSync([Buffer.from('config')], programId);
}

export function devicePda(programId, devicePubkey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('device'), devicePubkey.toBuffer()],
    programId
  );
}

export function deviceIdIndexPda(programId, deviceId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('device-id'), sha256(deviceId)],
    programId
  );
}

export function photoPda(programId, imageHashBytes) {
  if (!Buffer.isBuffer(imageHashBytes) || imageHashBytes.length !== 32) {
    throw new Error('imageHash must be a 32-byte Buffer');
  }
  return PublicKey.findProgramAddressSync(
    [Buffer.from('photo'), imageHashBytes],
    programId
  );
}

export function editionPda(programId, photoRecordKey, editionNumber) {
  const numBuf = Buffer.alloc(8);
  numBuf.writeBigUInt64LE(BigInt(editionNumber));
  return PublicKey.findProgramAddressSync(
    [Buffer.from('edition'), photoRecordKey.toBuffer(), numBuf],
    programId
  );
}

/**
 * Parses a hex string (optionally 0x-prefixed) into a Buffer of exactly
 * `expectedLength` bytes. Throws a descriptive error otherwise.
 */
export function hexToBytes(hex, expectedLength, label = 'value') {
  if (typeof hex !== 'string') {
    throw new Error(`${label} must be a hex string`);
  }
  const stripped = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]*$/.test(stripped) || stripped.length % 2 !== 0) {
    throw new Error(`${label} is not valid hex`);
  }
  const buf = Buffer.from(stripped, 'hex');
  if (buf.length !== expectedLength) {
    throw new Error(`${label} must be ${expectedLength} bytes, got ${buf.length}`);
  }
  return buf;
}

export function isValidSolanaAddress(addr) {
  if (typeof addr !== 'string' || addr.length < 32 || addr.length > 44) return false;
  try {
    // eslint-disable-next-line no-new
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
}
