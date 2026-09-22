// node --test chains.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import os from 'os';
import path from 'path';

process.env.DATABASE_PATH = path.join(os.tmpdir(), `veris-test-${Date.now()}.db`);
const { default: dbService } = await import('./dbService.js');
const { packetHashFor, explorerTxUrl } = await import('./chains.js');

test('secondary mint rows: pending, retried, then minted', () => {
  dbService.initialize();
  dbService.saveChainMint(1, 'arc', { status: 'pending', payload: '{"a":1}' });
  dbService.saveChainMint(1, 'arc', { status: 'pending', error: 'rpc down', bumpAttempts: true });
  assert.equal(dbService.getPendingChainMints().length, 1);
  assert.equal(dbService.getPendingChainMints()[0].payload, '{"a":1}', 'payload kept for the retry');
  dbService.saveChainMint(1, 'arc', { status: 'minted', token_id: '7', tx_hash: '0xabc' });
  assert.equal(dbService.getPendingChainMints().length, 0);
  assert.deepEqual(dbService.getChainMints(1)[0], { chain: 'arc', status: 'minted', token_id: '7', tx_hash: '0xabc', error: null });
});

test('packet hash is stable and absent for old captures', () => {
  assert.equal(packetHashFor({ image_hash: 'x' }), null);
  const img = { image_hash: 'ab', verdict: 'real', packet_ts: 1, packet_nonce: 'n', device_address: '0x1' };
  assert.equal(packetHashFor(img), packetHashFor({ ...img }));
  assert.notEqual(packetHashFor(img), packetHashFor({ ...img, verdict: 'fake' }));
});

test('explorer links', () => {
  assert.equal(explorerTxUrl('arc', '0x1'), 'https://testnet.arcscan.app/tx/0x1');
  assert.equal(explorerTxUrl('nope', '0x1'), null);
});
