import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidSolanaAddress } from '../solanaAddress.js';

test('accepts a real base58-encoded 32-byte pubkey', () => {
  // System program address (32 zero bytes)
  assert.equal(isValidSolanaAddress('11111111111111111111111111111111'), true);
  // A typical devnet-style pubkey
  assert.equal(isValidSolanaAddress('4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T'), true);
  // Token program
  assert.equal(isValidSolanaAddress('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), true);
});

test('rejects a 0x-prefixed hex EVM-style address', () => {
  assert.equal(isValidSolanaAddress('0x71C7656EC7ab88b098defB751B7401B5f6d8976F'), false);
});

test('rejects strings that are too short', () => {
  assert.equal(isValidSolanaAddress('abc'), false);
  assert.equal(isValidSolanaAddress('1111111111111111111111111111111'), false); // 31 chars
});

test('rejects strings with non-base58 characters', () => {
  // 0, O, I, l are not in the base58 alphabet
  assert.equal(isValidSolanaAddress('0OIl111111111111111111111111111111111111'), false);
  assert.equal(isValidSolanaAddress('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!'), false);
});

test('rejects non-string and empty input', () => {
  assert.equal(isValidSolanaAddress(null), false);
  assert.equal(isValidSolanaAddress(undefined), false);
  assert.equal(isValidSolanaAddress(42), false);
  assert.equal(isValidSolanaAddress(''), false);
});

test('rejects base58 strings that decode to a non-32-byte length', () => {
  // 44 z's decodes to more than 32 bytes
  assert.equal(isValidSolanaAddress('z'.repeat(44)), false);
});
