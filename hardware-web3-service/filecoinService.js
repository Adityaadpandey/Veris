import lighthouse from '@lighthouse-web3/sdk';
import fs from 'fs';
import os from 'os';
import path from 'path';

class FilecoinService {
  constructor() {
    this.initialized = false;
    this.apiKey = null;
    this.wallet = null;
  }

  async initialize(deviceWallet) {
    this.apiKey = process.env.LIGHTHOUSE_API_KEY;
    if (!this.apiKey) {
      console.warn('⚠️  LIGHTHOUSE_API_KEY not set. Filecoin upload disabled.');
      this.initialized = false;
      return false;
    }
    this.wallet = deviceWallet || null;
    this.initialized = true;
    console.log('✅ Filecoin service initialized (Lighthouse IPFS)');
    return true;
  }

  async uploadImage(imageData, retries = 3) {
    if (!this.initialized) {
      throw new Error('Filecoin service not initialized');
    }

    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      let tmpPath = null;
      try {
        let fileData;
        if (Buffer.isBuffer(imageData)) {
          fileData = imageData;
        } else {
          fileData = fs.readFileSync(imageData);
        }

        tmpPath = path.join(os.tmpdir(), `lensmint-${Date.now()}.jpg`);
        fs.writeFileSync(tmpPath, fileData);

        const response = await lighthouse.upload(tmpPath, this.apiKey);
        const cid = response?.data?.Hash;
        if (!cid) {
          throw new Error('Upload succeeded but no CID returned');
        }

        console.log(`   ✅ Lighthouse upload CID: ${cid}`);
        return cid;
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          const delay = attempt * 1000;
          console.warn(`   ⚠️ Upload attempt ${attempt} failed, retrying in ${delay}ms: ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`❌ Lighthouse upload failed after ${retries} attempts: ${error.message}`);
          throw error;
        }
      } finally {
        if (tmpPath && fs.existsSync(tmpPath)) {
          try { fs.unlinkSync(tmpPath); } catch (_) {}
        }
      }
    }
  }

  async uploadMetadata(metadata) {
    if (!this.initialized) {
      throw new Error('Filecoin service not initialized');
    }

    try {
      const metadataJson = JSON.stringify(metadata);
      const response = await lighthouse.uploadText(metadataJson, this.apiKey, 'metadata.json');
      const cid = response?.data?.Hash;
      if (!cid) {
        throw new Error('Metadata upload succeeded but no CID returned');
      }
      console.log(`   ✅ Lighthouse metadata CID: ${cid}`);
      return cid;
    } catch (error) {
      console.error(`❌ Lighthouse metadata upload error: ${error.message}`);
      throw error;
    }
  }

  async getStatus() {
    if (!this.initialized) {
      return { connected: false, message: 'Filecoin service not initialized' };
    }
    return {
      connected: true,
      provider: 'Lighthouse',
      address: this.wallet?.address || 'N/A'
    };
  }

  createMetadata(imageData) {
    const {
      name,
      description,
      imageCid,
      deviceAddress,
      deviceId,
      cameraId,
      imageHash,
      signature,
      timestamp
    } = imageData;

    return {
      name: name || `LensMint Photo #${Date.now()}`,
      description: description || 'Captured by LensMint Camera',
      image: `ipfs://${imageCid}`,
      attributes: [
        { trait_type: 'Device Address', value: deviceAddress },
        { trait_type: 'Device ID', value: deviceId },
        { trait_type: 'Camera ID', value: cameraId },
        { trait_type: 'Image Hash', value: `sha256:${imageHash}` },
        { trait_type: 'Hardware Signature', value: signature },
        { trait_type: 'Timestamp', value: timestamp || new Date().toISOString() }
      ],
      properties: {
        device: { address: deviceAddress, deviceId, cameraId },
        image: { hash: imageHash, signature, filecoinCid: imageCid }
      }
    };
  }
}

const filecoinService = new FilecoinService();

export default filecoinService;
