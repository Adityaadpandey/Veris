// Reads photos stored on 0G. A ref is "0g" + 64 hex (the root hash); anything else is an IPFS CID.
// The SDK is ESM-only, so it's loaded lazily from this CommonJS file.
const isZerogRef = (ref) => /^0g[0-9a-f]{64}$/i.test(ref || '');

let indexer;
async function download(ref) {
  if (!indexer) {
    const { Indexer } = await import('@0gfoundation/0g-storage-ts-sdk');
    indexer = new Indexer(process.env.ZEROG_INDEXER_RPC || 'https://indexer-storage-testnet-turbo.0g.ai');
  }
  const [blob, err] = await indexer.downloadToBlob('0x' + ref.slice(2), { proof: true });
  if (err !== null) throw new Error(`0G download: ${err}`);
  return { buffer: Buffer.from(await blob.arrayBuffer()), mimeType: 'image/jpeg' };
}

module.exports = { isZerogRef, download };
