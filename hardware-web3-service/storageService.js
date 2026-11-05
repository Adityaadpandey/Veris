import filecoinService from './filecoinService.js';
import zerogStorageService, { isZerogRef, rootFromRef } from './zerogStorageService.js';

// Picks the primary store from STORAGE_PROVIDER ('lighthouse' by default, '0g' to make 0G first)
// and falls back to the other one if the primary fails. A ref tells which store it came from:
// "0g<hex>" is 0G, anything else is a Lighthouse CID.
const providers = { lighthouse: filecoinService, '0g': zerogStorageService };

export const refToUri = (ref) => (isZerogRef(ref) ? `0g://${rootFromRef(ref)}` : `ipfs://${ref}`);

class StorageService {
  get initialized() {
    return filecoinService.initialized || zerogStorageService.initialized;
  }

  async initialize(deviceWallet) {
    await filecoinService.initialize(deviceWallet);
    await zerogStorageService.initialize();
  }

  _order() {
    const primary = process.env.STORAGE_PROVIDER === '0g' ? '0g' : 'lighthouse';
    const other = primary === '0g' ? 'lighthouse' : '0g';
    return [primary, other].filter((name) => providers[name].initialized);
  }

  async _withFallback(method, arg) {
    const errors = [];
    for (const name of this._order()) {
      try {
        return await providers[name][method](arg);
      } catch (e) {
        console.warn(`   ⚠️ ${name} ${method} failed: ${e.message}`);
        errors.push(`${name}: ${e.message}`);
      }
    }
    throw new Error(`All storage providers failed (${errors.join('; ') || 'none configured'})`);
  }

  uploadImage(imageData) {
    return this._withFallback('uploadImage', imageData);
  }

  uploadMetadata(metadata) {
    return this._withFallback('uploadMetadata', metadata);
  }

  // Same metadata as before, but the image field follows where the photo actually lives
  createMetadata(fields) {
    const metadata = filecoinService.createMetadata(fields);
    metadata.image = refToUri(fields.imageCid);
    metadata.properties.image.storageRef = fields.imageCid;
    return metadata;
  }
}

export default new StorageService();
