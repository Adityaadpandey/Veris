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
    // Filebase IPFS RPC token (base64 of "accessKey:secretKey:bucket"). When set, new
    // uploads go to Filebase first and Lighthouse is only the fallback.
    this.filebaseToken = process.env.FILEBASE_RPC_TOKEN;
    if (!this.apiKey && !this.filebaseToken) {
      console.warn('⚠️  Neither FILEBASE_RPC_TOKEN nor LIGHTHOUSE_API_KEY set. Upload disabled.');
      this.initialized = false;
      return false;
    }
    this.wallet = deviceWallet || null;
    this.initialized = true;
    const primary = this.filebaseToken ? 'Filebase' : 'Lighthouse';
    const fallback = this.filebaseToken && this.apiKey ? ' (Lighthouse fallback)' : '';
    console.log(`✅ Filecoin service initialized (${primary} IPFS${fallback})`);
    return true;
  }

  // Pin bytes to Filebase through its IPFS RPC API and return the CID.
  async filebaseAdd(buffer, filename) {
    const form = new FormData();
    form.append('file', new Blob([buffer]), filename);
    const res = await fetch('https://rpc.filebase.io/api/v0/add', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.filebaseToken}` },
      body: form
    });
    if (!res.ok) throw new Error(`Filebase HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    // The RPC replies with one JSON object per line; a single file gives one line.
    const lines = (await res.text()).trim().split('\n');
    const cid = JSON.parse(lines[lines.length - 1])?.Hash;
    if (!cid) throw new Error('Filebase upload succeeded but no CID returned');
    return cid;
  }

  // Filebase first, Lighthouse if Filebase is missing or errors out.
  async pin(buffer, filename) {
    if (this.filebaseToken) {
      try {
        const cid = await this.filebaseAdd(buffer, filename);
        console.log(`   ✅ Filebase CID: ${cid}`);
        return cid;
      } catch (err) {
        if (!this.apiKey) throw err;
        console.warn(`   ⚠️ Filebase failed (${err.message}), falling back to Lighthouse`);
      }
    }
    const tmpPath = path.join(os.tmpdir(), `veris-${Date.now()}-${filename}`);
    try {
      fs.writeFileSync(tmpPath, buffer);
      const response = await lighthouse.upload(tmpPath, this.apiKey);
      const cid = response?.data?.Hash;
      if (!cid) throw new Error('Upload succeeded but no CID returned');
      console.log(`   ✅ Lighthouse upload CID: ${cid}`);
      return cid;
    } finally {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    }
  }

  async uploadImage(imageData, retries = 3) {
    if (!this.initialized) {
      throw new Error('Filecoin service not initialized');
    }

    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const fileData = Buffer.isBuffer(imageData) ? imageData : fs.readFileSync(imageData);
        return await this.pin(fileData, 'photo.jpg');
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          const delay = attempt * 1000;
          console.warn(`   ⚠️ Upload attempt ${attempt} failed, retrying in ${delay}ms: ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    console.error(`❌ Upload failed after ${retries} attempts: ${lastError.message}`);
    throw lastError;
  }

  async uploadMetadata(metadata) {
    if (!this.initialized) {
      throw new Error('Filecoin service not initialized');
    }

    try {
      return await this.pin(Buffer.from(JSON.stringify(metadata)), 'metadata.json');
    } catch (error) {
      console.error(`❌ Metadata upload error: ${error.message}`);
      throw error;
    }
  }

  async getStatus() {
    if (!this.initialized) {
      return { connected: false, message: 'Filecoin service not initialized' };
    }
    return {
      connected: true,
      provider: this.filebaseToken ? 'Filebase' : 'Lighthouse',
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
      name: name || `Veris Photo #${Date.now()}`,
      description: description || 'Captured by Veris Camera',
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
