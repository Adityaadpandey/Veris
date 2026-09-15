const { Pool } = require('pg');

class ClaimDBService {
  constructor() {
    this.pool = null;
  }

  getDatabase() {
    return this.pool;
  }

  async initialize() {
    if (this.pool) return; // already initialized (called once at boot, once in app.listen)

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required (Postgres connection string)');
    }

    try {
      this.pool = new Pool({
        connectionString,
        ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
      });

      await this.createTables();

      console.log(`✅ Claim database initialized (Postgres)`);
    } catch (error) {
      console.error('❌ Failed to initialize database:', error);
      throw error;
    }
  }

  async createTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS claims (
        claim_id TEXT PRIMARY KEY,
        image_id INTEGER,
        cid TEXT NOT NULL,
        metadata_cid TEXT,
        device_id TEXT,
        camera_id TEXT,
        image_hash TEXT,
        signature TEXT,
        device_address TEXT,
        status TEXT DEFAULT 'pending',
        recipient_address TEXT,
        tx_hash TEXT,
        token_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        claimed_at TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    const columnsToAdd = [
      { name: 'device_id', type: 'TEXT' },
      { name: 'camera_id', type: 'TEXT' },
      { name: 'image_hash', type: 'TEXT' },
      { name: 'signature', type: 'TEXT' },
      { name: 'device_address', type: 'TEXT' },
      { name: 'latitude', type: 'REAL' },
      { name: 'longitude', type: 'REAL' },
      { name: 'location_name', type: 'TEXT' },
      { name: 'device_api_url', type: 'TEXT' },
      // AI enrichment (OpenAI): rich description, tags, and processing status
      { name: 'description', type: 'TEXT' },
      { name: 'tags', type: 'TEXT' },        // JSON array string
      { name: 'ai_status', type: 'TEXT' },   // 'pending' | 'done' | 'failed'
      { name: 'ai_error', type: 'TEXT' },
      { name: 'phash', type: 'TEXT' },       // dHash: 64-bit gradient hash (16 hex chars), orientation '0'
      { name: 'phash_dct', type: 'TEXT' },   // pHash: 60-bit DCT/frequency hash (15 hex chars), orientation '0'
      { name: 'ahash', type: 'TEXT' },       // aHash: 64-bit average hash (16 hex chars), orientation '0'
      // JSON array of {orientation, dhash, phash, ahash} for all 8 rotation/mirror
      // variants (see imageHash.computeOrientationHashes), so a physically rotated
      // or mirrored re-upload still matches. phash/phash_dct/ahash above stay in
      // sync as the orientation '0' entry, for any older reader that expects them.
      { name: 'orientation_hashes', type: 'TEXT' },
      { name: 'exif_signal', type: 'TEXT' }, // JSON: non-authoritative EXIF tamper hint
      { name: 'likely_ai_generated', type: 'INTEGER' }, // 0/1 non-authoritative hint
      { name: 'ai_assessment', type: 'TEXT' },          // one-line justification for the hint
      // Companion Capture (mobile + device): everything about the paired phone
      // photo in one place — null until a companion has been submitted and
      // processed. See companionCapture.js for the shape.
      { name: 'companion_capture', type: 'JSONB' }
    ];

    for (const col of columnsToAdd) {
      await this.pool.query(`ALTER TABLE claims ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
    }

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS edition_requests (
        id SERIAL PRIMARY KEY,
        claim_id TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        tx_hash TEXT,
        token_id TEXT,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        minted_at TIMESTAMP,
        FOREIGN KEY (claim_id) REFERENCES claims(claim_id)
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS image_embeddings (
        claim_id TEXT PRIMARY KEY,
        cid TEXT,
        embedding TEXT,
        model TEXT,
        dim INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (claim_id) REFERENCES claims(claim_id)
      )
    `);

    // CLIP image embeddings (clipService.js) — separate table from
    // image_embeddings above because that one holds OpenAI TEXT embeddings
    // (of the generated description) and a claim can have both signals at
    // once; each table's claim_id stays its own primary key.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS clip_embeddings (
        claim_id TEXT PRIMARY KEY,
        cid TEXT,
        embedding TEXT,
        model TEXT,
        dim INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (claim_id) REFERENCES claims(claim_id)
      )
    `);

    await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status)`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_claims_cid ON claims(cid)`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_claims_ai_status ON claims(ai_status)`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_claims_image_hash ON claims(image_hash)`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_edition_requests_claim ON edition_requests(claim_id)`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_edition_requests_status ON edition_requests(status)`);
  }

  async createClaim(claim_id, image_id, cid, metadata_cid = null, device_id = null, camera_id = null, image_hash = null, signature = null, device_address = null, latitude = null, longitude = null, location_name = null, device_api_url = null) {
    try {
      await this.pool.query(`
        INSERT INTO claims (claim_id, image_id, cid, metadata_cid, device_id, camera_id, image_hash, signature, device_address, latitude, longitude, location_name, device_api_url, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
      `, [claim_id, image_id, cid, metadata_cid, device_id, camera_id, image_hash, signature, device_address, latitude, longitude, location_name, device_api_url]);

      return this.getClaim(claim_id);
    } catch (error) {
      if (error.code === '23505') { // unique_violation
        return null;
      }
      throw error;
    }
  }

  async getClaim(claim_id) {
    const { rows } = await this.pool.query('SELECT * FROM claims WHERE claim_id = $1', [claim_id]);
    return rows[0] || null;
  }

  async updateClaim(claim_id, recipient_address) {
    const { rowCount } = await this.pool.query(`
      UPDATE claims
      SET status = 'claimed',
          recipient_address = $1,
          claimed_at = CURRENT_TIMESTAMP
      WHERE claim_id = $2
    `, [recipient_address, claim_id]);

    if (rowCount === 0) {
      return null;
    }

    return this.getClaim(claim_id);
  }

  async updateClaimStatus(claim_id, status, token_id = null, tx_hash = null) {
    const updateFields = ['status = $1'];
    const values = [status];

    if (token_id !== null) {
      values.push(token_id);
      updateFields.push(`token_id = $${values.length}`);
    }

    if (tx_hash !== null) {
      values.push(tx_hash);
      updateFields.push(`tx_hash = $${values.length}`);
    }

    values.push(claim_id);

    const { rowCount } = await this.pool.query(`
      UPDATE claims
      SET ${updateFields.join(', ')}
      WHERE claim_id = $${values.length}
    `, values);

    if (rowCount === 0) {
      return null;
    }

    return this.getClaim(claim_id);
  }

  async createEditionRequest(claim_id, wallet_address) {
    try {
      const { rows } = await this.pool.query(`
        INSERT INTO edition_requests (claim_id, wallet_address, status)
        VALUES ($1, $2, 'pending')
        RETURNING id
      `, [claim_id, wallet_address]);

      return this.getEditionRequest(rows[0].id);
    } catch (error) {
      console.error('Error creating edition request:', error);
      throw error;
    }
  }

  async getEditionRequest(id) {
    const { rows } = await this.pool.query('SELECT * FROM edition_requests WHERE id = $1', [id]);
    return rows[0] || null;
  }

  async getPendingEditionRequests(limit = 50) {
    const { rows } = await this.pool.query(`
      SELECT e.*, c.token_id as original_token_id
      FROM edition_requests e
      JOIN claims c ON e.claim_id = c.claim_id
      WHERE e.status = 'pending' AND c.status = 'open' AND c.token_id IS NOT NULL
      ORDER BY e.created_at ASC
      LIMIT $1
    `, [limit]);
    return rows;
  }

  async updateEditionRequest(id, updates) {
    const updateFields = [];
    const values = [];

    if (updates.status) {
      values.push(updates.status);
      updateFields.push(`status = $${values.length}`);
    }

    if (updates.tx_hash) {
      values.push(updates.tx_hash);
      updateFields.push(`tx_hash = $${values.length}`);
    }

    if (updates.token_id) {
      values.push(updates.token_id);
      updateFields.push(`token_id = $${values.length}`);
    }

    if (updates.error_message) {
      values.push(updates.error_message);
      updateFields.push(`error_message = $${values.length}`);
    }

    if (updates.status === 'completed' || updates.status === 'minted') {
      updateFields.push('minted_at = CURRENT_TIMESTAMP');
    }

    if (updateFields.length === 0) {
      return this.getEditionRequest(id);
    }

    values.push(id);

    await this.pool.query(`
      UPDATE edition_requests
      SET ${updateFields.join(', ')}
      WHERE id = $${values.length}
    `, values);

    return this.getEditionRequest(id);
  }

  async completeClaim(claim_id, tx_hash, token_id) {
    const { rowCount } = await this.pool.query(`
      UPDATE claims
      SET status = 'completed',
          tx_hash = $1,
          token_id = $2,
          completed_at = CURRENT_TIMESTAMP
      WHERE claim_id = $3
    `, [tx_hash, token_id || null, claim_id]);

    if (rowCount === 0) {
      return null;
    }

    return this.getClaim(claim_id);
  }

  async getAllClaims(limit = 100) {
    const { rows } = await this.pool.query(`
      SELECT * FROM claims
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);
    return rows;
  }

  // Case-insensitive: recipient_address is stored however the wallet lib happened to checksum it
  // at claim time, and callers query with whatever casing the connected wallet reports today.
  async getClaimsByRecipient(recipient_address, limit = 200) {
    const { rows } = await this.pool.query(`
      SELECT * FROM claims
      WHERE lower(recipient_address) = lower($1)
      ORDER BY created_at DESC
      LIMIT $2
    `, [recipient_address, limit]);
    return rows;
  }

  async getClaimsByStatus(status) {
    const { rows } = await this.pool.query('SELECT * FROM claims WHERE status = $1 ORDER BY created_at DESC', [status]);
    return rows;
  }


  // ── AI enrichment (OpenAI descriptions + embeddings) ───────────────────────

  async setClaimAI(claim_id, { description = null, tags = null, ai_status = null, ai_error = null, phash = null, phash_dct = null, ahash = null, orientation_hashes = null, exif_signal = null, likely_ai_generated = null, ai_assessment = null } = {}) {
    const fields = [];
    const values = [];

    if (description !== null) { values.push(description); fields.push(`description = $${values.length}`); }
    if (tags !== null) {
      values.push(Array.isArray(tags) ? JSON.stringify(tags) : tags);
      fields.push(`tags = $${values.length}`);
    }
    if (ai_status !== null) { values.push(ai_status); fields.push(`ai_status = $${values.length}`); }
    if (ai_error !== null) { values.push(ai_error); fields.push(`ai_error = $${values.length}`); }
    if (phash !== null) { values.push(phash); fields.push(`phash = $${values.length}`); }
    if (phash_dct !== null) { values.push(phash_dct); fields.push(`phash_dct = $${values.length}`); }
    if (ahash !== null) { values.push(ahash); fields.push(`ahash = $${values.length}`); }
    if (orientation_hashes !== null) {
      values.push(typeof orientation_hashes === 'string' ? orientation_hashes : JSON.stringify(orientation_hashes));
      fields.push(`orientation_hashes = $${values.length}`);
    }
    if (exif_signal !== null) {
      values.push(typeof exif_signal === 'string' ? exif_signal : JSON.stringify(exif_signal));
      fields.push(`exif_signal = $${values.length}`);
    }
    if (likely_ai_generated !== null) { values.push(likely_ai_generated ? 1 : 0); fields.push(`likely_ai_generated = $${values.length}`); }
    if (ai_assessment !== null) { values.push(ai_assessment); fields.push(`ai_assessment = $${values.length}`); }

    if (fields.length === 0) return this.getClaim(claim_id);

    values.push(claim_id);
    await this.pool.query(`UPDATE claims SET ${fields.join(', ')} WHERE claim_id = $${values.length}`, values);
    return this.getClaim(claim_id);
  }

  /** Persists the full companion_capture object (see companionCapture.js) onto a claim row. */
  async setCompanionCapture(claim_id, companionCapture) {
    await this.pool.query(
      'UPDATE claims SET companion_capture = $1 WHERE claim_id = $2',
      [JSON.stringify(companionCapture), claim_id]
    );
    return this.getClaim(claim_id);
  }

  /**
   * Merges `partial` into the existing companion_capture JSONB (top-level keys only, via the `||`
   * operator) in one round trip — no read-modify-write race. Used to patch in the AI hint after the
   * main companion_capture write already landed, so a slow OpenAI call never delays the fields the
   * claim page actually needs to show the pairing (see companionCapture.processCompanionCapture).
   */
  async patchCompanionCapture(claim_id, partial) {
    await this.pool.query(
      `UPDATE claims SET companion_capture = COALESCE(companion_capture, '{}'::jsonb) || $1::jsonb WHERE claim_id = $2`,
      [JSON.stringify(partial), claim_id]
    );
    return this.getClaim(claim_id);
  }

  async upsertEmbedding(claim_id, cid, embedding, model, dim) {
    const serialized = Array.isArray(embedding) ? JSON.stringify(embedding) : embedding;
    await this.pool.query(`
      INSERT INTO image_embeddings (claim_id, cid, embedding, model, dim)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (claim_id) DO UPDATE SET
        cid = excluded.cid,
        embedding = excluded.embedding,
        model = excluded.model,
        dim = excluded.dim,
        created_at = CURRENT_TIMESTAMP
    `, [claim_id, cid, serialized, model, dim]);
  }

  async getEmbedding(claim_id) {
    const { rows } = await this.pool.query('SELECT * FROM image_embeddings WHERE claim_id = $1', [claim_id]);
    return rows[0] || null;
  }

  /** All embeddings joined with claim details useful for search results.
   * LEFT JOINs clip_embeddings too so callers (similarPhotos.contentSimilarity)
   * can prefer a candidate's CLIP image embedding over its OpenAI
   * caption-text embedding when one is available. */
  async getAllEmbeddings() {
    const { rows } = await this.pool.query(`
      SELECT e.claim_id, e.cid, e.embedding, e.dim,
             c.token_id, c.recipient_address, c.device_id, c.status,
             c.description, c.tags, c.phash, c.phash_dct, c.ahash, c.orientation_hashes, c.created_at,
             ce.embedding AS clip_embedding
      FROM image_embeddings e
      JOIN claims c ON e.claim_id = c.claim_id
      LEFT JOIN clip_embeddings ce ON ce.claim_id = e.claim_id
    `);
    return rows;
  }

  // ── CLIP image embeddings (clipService.js) ──────────────────────────────

  /** Single claim's CLIP embedding row, or null. Mirrors getEmbedding() but
   * for the separate clip_embeddings table. */
  async getClipEmbedding(claim_id) {
    const { rows } = await this.pool.query('SELECT * FROM clip_embeddings WHERE claim_id = $1', [claim_id]);
    return rows[0] || null;
  }

  async upsertClipEmbedding(claim_id, cid, embedding, model, dim) {
    const serialized = Array.isArray(embedding) ? JSON.stringify(embedding) : embedding;
    await this.pool.query(`
      INSERT INTO clip_embeddings (claim_id, cid, embedding, model, dim)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (claim_id) DO UPDATE SET
        cid = excluded.cid,
        embedding = excluded.embedding,
        model = excluded.model,
        dim = excluded.dim,
        created_at = CURRENT_TIMESTAMP
    `, [claim_id, cid, serialized, model, dim]);
  }

  /** All CLIP embeddings — used as the semantic-visual fallback when the
   * hash-based tamper check can't find a confident match (heavy filters/noise). */
  async getAllClipEmbeddings() {
    const { rows } = await this.pool.query(`
      SELECT e.claim_id, e.cid, e.embedding,
             c.token_id, c.status, c.created_at
      FROM clip_embeddings e
      JOIN claims c ON e.claim_id = c.claim_id
    `);
    return rows;
  }

  // ── Verification (deterministic tamper check) ──────────────────────────────

  /** Exact-match lookup: an on-chain image whose SHA-256 equals the upload's. */
  async getClaimByImageHash(image_hash) {
    if (!image_hash) return null;
    const { rows } = await this.pool.query('SELECT * FROM claims WHERE image_hash = $1', [image_hash]);
    return rows[0] || null;
  }

  /** All claims that have at least one perceptual hash, for the tamper scan. */
  async getClaimsWithPhash() {
    const { rows } = await this.pool.query(`
      SELECT claim_id, cid, token_id, image_hash, phash, phash_dct, ahash, orientation_hashes,
             recipient_address, device_id, status, description, tags, created_at
      FROM claims
      WHERE (phash IS NOT NULL AND phash != '')
         OR (phash_dct IS NOT NULL AND phash_dct != '')
         OR (ahash IS NOT NULL AND ahash != '')
    `);
    return rows;
  }

  /**
   * Claims still missing SOMETHING the backfill can fill in: either AI
   * enrichment (never processed or previously failed) or one of the
   * deterministic forensic fields (multi-hash / orientation hashes / EXIF
   * signal) added after earlier claims were already enriched. Callers should
   * only re-run the (costly) OpenAI step when ai_status is actually
   * null/failed — see enrichService.backfillForensics for the free-of-cost
   * path that fills in just the forensic columns.
   *
   * `includeClip` adds "missing a CLIP embedding" to the criteria. It's an
   * opt-in flag (not just always-on) because clip_embeddings lives in its own
   * table with no per-claim column to short-circuit on — if CLIP is disabled
   * (DISABLE_CLIP=1) every claim would permanently match "no clip row yet"
   * and the backfill would re-select and re-hash the ENTIRE table on every
   * run for no reason. Callers should only pass true when clipService.isAvailable().
   */
  async getClaimsNeedingBackfill({ includeClip = false } = {}) {
    const clipCondition = includeClip
      ? `OR NOT EXISTS (SELECT 1 FROM clip_embeddings ce WHERE ce.claim_id = c.claim_id)`
      : '';
    const { rows } = await this.pool.query(`
      SELECT c.* FROM claims c
      WHERE c.cid IS NOT NULL AND c.cid != ''
        AND (
          c.ai_status IS NULL OR c.ai_status = 'failed'
          OR c.phash_dct IS NULL OR c.phash_dct = ''
          OR c.ahash IS NULL OR c.ahash = ''
          OR c.orientation_hashes IS NULL OR c.orientation_hashes = ''
          OR c.exif_signal IS NULL OR c.exif_signal = ''
          ${clipCondition}
        )
      ORDER BY c.created_at ASC
    `);
    return rows;
  }

  // Every claim with an image, regardless of ai_status — used by the backfill
  // --force path when the embedding method changes and all vectors must be
  // regenerated so query and stored embeddings stay consistent.
  async getAllClaimsWithCid() {
    const { rows } = await this.pool.query(`
      SELECT * FROM claims
      WHERE cid IS NOT NULL AND cid != ''
      ORDER BY created_at ASC
    `);
    return rows;
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

const dbService = new ClaimDBService();

module.exports = dbService;
