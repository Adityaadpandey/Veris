/**
 * cloudinaryService.js
 *
 * Thin wrapper around the Cloudinary SDK for the Companion Capture feature.
 * The mobile app's own photo is a demo-quality companion to the real,
 * minted device image (which stays on Filecoin/IPFS as it always has) — it
 * doesn't need to be content-addressed or pinned anywhere durable, so
 * Cloudinary is enough and keeps this off the Filecoin/Lighthouse path
 * entirely.
 *
 * CommonJS to match the rest of public-server.
 */

const cloudinary = require('cloudinary').v2;

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || '';
const API_KEY = process.env.CLOUDINARY_API_KEY || '';
const API_SECRET = process.env.CLOUDINARY_API_SECRET || '';

let configured = false;

function ensureConfigured() {
  if (configured) return;
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true
  });
  configured = true;
}

function isAvailable() {
  return Boolean(CLOUD_NAME && API_KEY && API_SECRET);
}

/**
 * Uploads a buffer to Cloudinary under `folder`.
 * @returns {Promise<{url: string, public_id: string}>}
 */
function uploadBuffer(buffer, folder) {
  if (!isAvailable()) {
    return Promise.reject(new Error('Cloudinary is not configured (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET)'));
  }
  ensureConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

module.exports = { uploadBuffer, isAvailable };
