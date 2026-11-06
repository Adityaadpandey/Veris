import { Indexer, MemData } from '@0gfoundation/0g-storage-ts-sdk';
import { ethers } from 'ethers';
import fs from 'fs';

// A 0G root hash is stored where a Lighthouse CID used to be, as "0g" + 64 hex chars.
// It is URL-safe, so existing /api/image/:cid style lookups keep working, and no
// Lighthouse CID starts with "0g" (base58 has no zero, base32 CIDs start with "b").
export const ZEROG_PREFIX = '0g';
export const isZerogRef = (ref) => typeof ref === 'string' && /^0g[0-9a-f]{64}$/i.test(ref);
export const refFromRoot = (rootHash) => ZEROG_PREFIX + rootHash.replace(/^0x/, '').toLowerCase();
export const rootFromRef = (ref) => '0x' + ref.slice(ZEROG_PREFIX.length);

class ZerogStorageService {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    const key = process.env.ZEROG_PRIVATE_KEY;
    if (!key) {
      console.warn('⚠️  ZEROG_PRIVATE_KEY not set. 0G Storage disabled.');
      return false;
    }
    // a typo in an optional service's key must not stop the backend from starting
    try {
      this.rpcUrl = process.env.ZEROG_EVM_RPC || 'https://evmrpc-testnet.0g.ai';
      this.indexer = new Indexer(process.env.ZEROG_INDEXER_RPC || 'https://indexer-storage-testnet-turbo.0g.ai');
      this.signer = new ethers.Wallet(key.trim(), new ethers.JsonRpcProvider(this.rpcUrl));
    } catch (e) {
      console.warn(`⚠️  0G Storage disabled, ZEROG_PRIVATE_KEY is not a valid key (${e.shortMessage || e.message}). Expected 0x + 64 hex characters.`);
      return false;
    }
    this.initialized = true;
    console.log(`✅ 0G Storage initialized (wallet ${this.signer.address})`);
    return true;
  }

  // One wallet signs every upload, so two at once fight over the same nonce
  // ("replacement transaction underpriced"). Run them one after another.
  _upload(bytes) {
    const run = (this._queue || Promise.resolve()).then(() => this._uploadNow(bytes));
    this._queue = run.catch(() => {});
    return run;
  }

  async _uploadNow(bytes) {
    const data = new MemData(new Uint8Array(bytes));
    const [, treeErr] = await data.merkleTree(); // the SDK needs this before upload
    if (treeErr !== null) throw new Error(`0G merkle tree: ${treeErr}`);
    const [tx, err] = await this.indexer.upload(data, this.rpcUrl, this.signer);
    if (err !== null) throw new Error(`0G upload: ${err}`);
    if (!('rootHash' in tx)) throw new Error('0G upload was fragmented, not expected for a photo');
    return refFromRoot(tx.rootHash);
  }

  async uploadImage(imageData) {
    if (!this.initialized) throw new Error('0G Storage not initialized');
    const bytes = Buffer.isBuffer(imageData) ? imageData : fs.readFileSync(imageData);
    const ref = await this._upload(bytes);
    console.log(`   ✅ 0G upload root: ${ref}`);
    return ref;
  }

  async uploadMetadata(metadata) {
    if (!this.initialized) throw new Error('0G Storage not initialized');
    return this._upload(Buffer.from(JSON.stringify(metadata)));
  }

  async download(ref) {
    if (!this.initialized) throw new Error('0G Storage not initialized');
    const [blob, err] = await this.indexer.downloadToBlob(rootFromRef(ref), { proof: true });
    if (err !== null) throw new Error(`0G download: ${err}`);
    return Buffer.from(await blob.arrayBuffer());
  }
}

export default new ZerogStorageService();
