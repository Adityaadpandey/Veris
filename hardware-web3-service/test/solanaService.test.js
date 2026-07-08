import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PublicKey, Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';

import {
  configPda,
  devicePda,
  deviceIdIndexPda,
  photoPda,
  editionPda,
  hexToBytes,
  isValidSolanaAddress,
  sha256,
} from '../pdas.js';

// A syntactically valid program id (does not need to be deployed for these
// pure, offline PDA-derivation checks).
const programId = new PublicKey('6beFq5WaWo7dPPEzVNt8gRG1YwJiFyUuhzpH1ydVDd23');

test('configPda matches PublicKey.findProgramAddressSync with the "config" seed', () => {
  const [expected] = PublicKey.findProgramAddressSync([Buffer.from('config')], programId);
  const [actual] = configPda(programId);
  assert.equal(actual.toBase58(), expected.toBase58());
});

test('devicePda matches ["device", devicePubkey]', () => {
  const device = Keypair.generate();
  const [expected] = PublicKey.findProgramAddressSync(
    [Buffer.from('device'), device.publicKey.toBuffer()],
    programId
  );
  const [actual] = devicePda(programId, device.publicKey);
  assert.equal(actual.toBase58(), expected.toBase58());
});

test('deviceIdIndexPda matches ["device-id", sha256(device_id)]', () => {
  const deviceId = 'camera-42';
  const expectedSeed = crypto.createHash('sha256').update(Buffer.from(deviceId)).digest();
  const [expected] = PublicKey.findProgramAddressSync(
    [Buffer.from('device-id'), expectedSeed],
    programId
  );
  const [actual] = deviceIdIndexPda(programId, deviceId);
  assert.equal(actual.toBase58(), expected.toBase58());

  // sha256 helper itself must match Node's crypto sha256
  assert.deepEqual(sha256(deviceId), expectedSeed);
});

test('photoPda matches ["photo", imageHash] for a 32-byte hash', () => {
  const imageHash = crypto.randomBytes(32);
  const [expected] = PublicKey.findProgramAddressSync(
    [Buffer.from('photo'), imageHash],
    programId
  );
  const [actual] = photoPda(programId, imageHash);
  assert.equal(actual.toBase58(), expected.toBase58());
});

test('photoPda rejects a hash that is not exactly 32 bytes', () => {
  assert.throws(() => photoPda(programId, Buffer.alloc(31)));
  assert.throws(() => photoPda(programId, Buffer.alloc(33)));
});

test('editionPda matches ["edition", photoKey, number_le_u64] for several edition numbers', () => {
  const photoKey = Keypair.generate().publicKey;
  for (const number of [1, 2, 3, 255, 65536]) {
    const numBuf = Buffer.alloc(8);
    numBuf.writeBigUInt64LE(BigInt(number));
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from('edition'), photoKey.toBuffer(), numBuf],
      programId
    );
    const [actual] = editionPda(programId, photoKey, number);
    assert.equal(actual.toBase58(), expected.toBase58());
  }
});

test('seed -> Keypair address is stable across repeated derivations', () => {
  const seed = crypto.randomBytes(32);
  const kp1 = Keypair.fromSeed(seed);
  const kp2 = Keypair.fromSeed(seed);
  assert.equal(kp1.publicKey.toBase58(), kp2.publicKey.toBase58());
});

test('seed -> Keypair address matches the Python-facing seed_hex round trip', () => {
  const seed = crypto.randomBytes(32);
  const seedHex = seed.toString('hex');
  const fromHex = Keypair.fromSeed(hexToBytes(seedHex, 32, 'seed_hex'));
  const direct = Keypair.fromSeed(seed);
  assert.equal(fromHex.publicKey.toBase58(), direct.publicKey.toBase58());
});

test('hexToBytes accepts 0x-prefixed and bare hex, rejects wrong lengths', () => {
  const hash32 = crypto.randomBytes(32).toString('hex');
  assert.equal(hexToBytes(hash32, 32).length, 32);
  assert.equal(hexToBytes('0x' + hash32, 32).length, 32);

  assert.throws(() => hexToBytes(hash32.slice(0, 62), 32), /32 bytes/);
  assert.throws(() => hexToBytes(hash32 + 'ab', 32), /32 bytes/);
  assert.throws(() => hexToBytes('not-hex-zzzz', 32));
  assert.throws(() => hexToBytes(123, 32));
});

test('hexToBytes enforces 64-byte signatures', () => {
  const sig64 = crypto.randomBytes(64).toString('hex');
  assert.equal(hexToBytes(sig64, 64).length, 64);
  assert.throws(() => hexToBytes(sig64.slice(0, 126), 64));
});

test('isValidSolanaAddress accepts base58 pubkeys and rejects ETH-style/garbage addresses', () => {
  const kp = Keypair.generate();
  assert.equal(isValidSolanaAddress(kp.publicKey.toBase58()), true);

  assert.equal(isValidSolanaAddress('0x0b693F079939c6C6A08AAd4cEAfbcd2cF2FdcCAc'), false);
  assert.equal(isValidSolanaAddress('not-an-address'), false);
  assert.equal(isValidSolanaAddress(''), false);
  assert.equal(isValidSolanaAddress(null), false);
  assert.equal(isValidSolanaAddress(12345), false);
});

test('tweetnacl detached sign/verify round-trip using a generated ed25519 keypair', () => {
  const kp = Keypair.generate();
  const message = crypto.randomBytes(32);

  const signature = nacl.sign.detached(message, kp.secretKey);
  assert.equal(signature.length, 64);

  const ok = nacl.sign.detached.verify(message, signature, kp.publicKey.toBytes());
  assert.equal(ok, true);

  // Tampered message must fail verification
  const tampered = crypto.randomBytes(32);
  const bad = nacl.sign.detached.verify(tampered, signature, kp.publicKey.toBytes());
  assert.equal(bad, false);

  // Wrong signer's public key must fail verification
  const otherKp = Keypair.generate();
  const wrongKey = nacl.sign.detached.verify(message, signature, otherKp.publicKey.toBytes());
  assert.equal(wrongKey, false);
});
