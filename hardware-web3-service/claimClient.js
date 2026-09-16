import axios from 'axios';

// The Pi has no internet of its own — every call this client makes travels over the phone's
// Bluetooth PAN tethering, which routinely takes a few seconds after the link comes up before DNS
// actually resolves and traffic actually routes. A failure with no HTTP response at all (the request
// never reached the server) is exactly what that looks like, and is worth a few quick retries before
// giving up — the alternative, observed in production, is a 2-second DNS hiccup (getaddrinfo EAI_AGAIN)
// turning into an 11-minute wait for the claim to register because nothing retried until the next
// scheduled sweep. A real HTTP error response means the request DID get through, so those are never
// retried here — that's a server-side problem, not a flaky link.
const RETRYABLE_ERROR_CODES = new Set(['EAI_AGAIN', 'ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED']);
const RETRY_DELAYS_MS = [1000, 2000, 4000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withNetworkRetry(label, fn) {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const retryable = !error.response && RETRYABLE_ERROR_CODES.has(error.code);
      if (!retryable || attempt === RETRY_DELAYS_MS.length) throw error;
      console.warn(`⚠️  ${label} failed (${error.code}), retrying in ${RETRY_DELAYS_MS[attempt]}ms...`);
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
}

class ClaimClient {
  constructor() {
    this.baseURL = process.env.CLAIM_SERVER_URL || 'https://lensmint.onrender.com';
    const timeout = parseInt(process.env.CLAIM_CLIENT_TIMEOUT || '30000', 10);
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async createClaim(claim_id, cid, metadata_cid = null, device_id = null, camera_id = null, image_hash = null, signature = null, device_address = null, latitude = null, longitude = null, location_name = null, device_api_url = null) {
    try {
      const response = await withNetworkRetry('createClaim', () => this.client.post('/create-claim', {
        claim_id, cid, metadata_cid, device_id, camera_id,
        image_hash, signature, device_address,
        latitude, longitude, location_name,
        device_api_url: device_api_url || process.env.DEVICE_API_URL || null
      }));

      if (response.data.success) {
        return response.data;
      } else {
        throw new Error(response.data.error || 'Failed to create claim');
      }
    } catch (error) {
      if (error.response) {
        throw new Error(error.response.data.error || 'Claim server error');
      }
      throw error;
    }
  }

  async checkClaim(claim_id) {
    try {
      const response = await withNetworkRetry('checkClaim', () => this.client.get('/check-claim', {
        params: { claim_id }
      }));

      if (response.data.success) {
        return response.data;
      } else {
        throw new Error(response.data.error || 'Failed to check claim');
      }
    } catch (error) {
      if (error.response) {
        throw new Error(error.response.data.error || 'Claim server error');
      }
      throw error;
    }
  }

  async completeClaim(claim_id, tx_hash, token_id) {
    try {
      const response = await withNetworkRetry('completeClaim', () => this.client.post('/complete-claim', {
        claim_id,
        tx_hash,
        token_id
      }));

      if (response.data.success) {
        return response.data;
      } else {
        throw new Error(response.data.error || 'Failed to complete claim');
      }
    } catch (error) {
      if (error.response) {
        throw new Error(error.response.data.error || 'Claim server error');
      }
      throw error;
    }
  }

  async updateClaimStatus(claim_id, status, token_id = null, tx_hash = null) {
    try {
      const response = await withNetworkRetry('updateClaimStatus', () => this.client.post('/update-claim-status', {
        claim_id,
        status,
        token_id,
        tx_hash
      }));

      if (response.data.success) {
        return response.data;
      } else {
        throw new Error(response.data.error || 'Failed to update claim status');
      }
    } catch (error) {
      if (error.response) {
        throw new Error(error.response.data.error || 'Claim server error');
      }
      throw error;
    }
  }

  async createEditionRequest(claim_id, wallet_address) {
    try {
      const response = await withNetworkRetry('createEditionRequest', () => this.client.post('/create-edition-request', {
        claim_id,
        wallet_address
      }));

      if (response.data.success) {
        return response.data;
      } else {
        throw new Error(response.data.error || 'Failed to create edition request');
      }
    } catch (error) {
      if (error.response) {
        throw new Error(error.response.data.error || 'Claim server error');
      }
      throw error;
    }
  }

  async getPendingEditionRequests(limit = 50) {
    try {
      const response = await withNetworkRetry('getPendingEditionRequests', () => this.client.get('/get-pending-edition-requests', {
        params: { limit }
      }));

      if (response.data.success) {
        return response.data;
      } else {
        throw new Error(response.data.error || 'Failed to get pending edition requests');
      }
    } catch (error) {
      if (error.response) {
        throw new Error(error.response.data.error || 'Claim server error');
      }
      throw error;
    }
  }

  async updateEditionRequest(request_id, updates) {
    try {
      const response = await withNetworkRetry('updateEditionRequest', () => this.client.post('/update-edition-request', {
        request_id,
        ...updates
      }));

      if (response.data.success) {
        return response.data;
      } else {
        throw new Error(response.data.error || 'Failed to update edition request');
      }
    } catch (error) {
      if (error.response) {
        throw new Error(error.response.data.error || 'Claim server error');
      }
      throw error;
    }
  }


  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

const claimClient = new ClaimClient();

export default claimClient;
