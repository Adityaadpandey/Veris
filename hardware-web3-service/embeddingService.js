import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const EMBEDDING_SERVICE_URL = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:5001';

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function phashSimilarity(h1, h2) {
  if (!h1 || !h2 || h1.length !== h2.length) return 0;
  let diff = 0;
  for (let i = 0; i < h1.length; i++) {
    if (h1[i] !== h2[i]) diff++;
  }
  return 1 - diff / h1.length;
}

class EmbeddingService {
  async generateEmbedding(imagePath) {
    const form = new FormData();
    form.append('image', fs.createReadStream(imagePath));

    const response = await axios.post(`${EMBEDDING_SERVICE_URL}/embed`, form, {
      headers: form.getHeaders(),
      timeout: 30000
    });

    return response.data; // { clip: [...512 floats], phash: "hexstring" }
  }

  async search(imagePath, allEmbeddings) {
    const queryEmb = await this.generateEmbedding(imagePath);

    const scored = allEmbeddings.map(row => {
      const storedClip = JSON.parse(row.clip_embedding);
      const clipSim = cosineSimilarity(queryEmb.clip, storedClip);
      const phashSim = phashSimilarity(queryEmb.phash, row.phash);
      const similarity = Math.round((clipSim * 0.7 + phashSim * 0.3) * 100) / 100;

      return {
        similarity,
        token_id: row.token_id,
        wallet_address: row.wallet_address,
        device_id: row.device_id,
        image_cid: row.image_cid,
        minted_at: row.minted_at
      };
    });

    return scored
      .filter(r => r.similarity >= 0.60)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  }

  async isAvailable() {
    try {
      await axios.get(`${EMBEDDING_SERVICE_URL}/health`, { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }
}

export default new EmbeddingService();
