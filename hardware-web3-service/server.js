import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import os from 'os';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';

dotenv.config();

import dbService from './dbService.js';
import solanaService from './solanaService.js';
import filecoinService from './filecoinService.js';
import claimClient from './claimClient.js';
import { hexToBytes, isValidSolanaAddress } from './pdas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for all routes
app.use(cors());

function ensureCapturesDirectory() {
  let capturesPath = process.env.CAPTURES_PATH;
  
  if (!capturesPath) {
    capturesPath = path.resolve(__dirname, '../captures');
  } else {
    capturesPath = path.resolve(capturesPath);
  }

  if (!fs.existsSync(capturesPath)) {
    try {
      fs.mkdirSync(capturesPath, { recursive: true, mode: 0o755 });
      console.log(`✅ Created captures directory: ${capturesPath}`);
    } catch (mkdirError) {
      if (mkdirError.code === 'EACCES') {
        const fallbackPath = path.join(os.homedir(), '.lensmint', 'captures');
        capturesPath = fallbackPath;
        if (!fs.existsSync(capturesPath)) {
          fs.mkdirSync(capturesPath, { recursive: true, mode: 0o755 });
        }
        console.log(`⚠️  Permission denied, using fallback path: ${capturesPath}`);
      } else {
        throw mkdirError;
      }
    }
  }
  
  return capturesPath;
}

const CAPTURES_PATH = ensureCapturesDirectory();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/captures', express.static(CAPTURES_PATH));

const upload = multer({
  dest: CAPTURES_PATH,
  limits: { fileSize: 50 * 1024 * 1024 }
});

let servicesInitialized = false;

async function initializeServices() {
  try {
    console.log('🔄 Initializing services...');

    dbService.initialize();
    console.log('✅ Database initialized');

    await solanaService.initialize();

    if (solanaService.deviceKeypair) {
      await filecoinService.initialize(solanaService.getAddress());
      if (filecoinService.initialized) {
        console.log('✅ Filecoin service initialized');
      } else {
        console.warn('⚠️ Filecoin service not available');
      }
    } else {
      console.warn('⚠️ Device keypair not available, Filecoin service disabled');
    }

    const claimHealth = await claimClient.healthCheck();
    if (claimHealth.status === 'ok') {
      console.log('✅ Claim server connected');
    } else {
      console.warn('⚠️ Claim server not available');
    }

    servicesInitialized = true;
    console.log('✅ All services initialized');
  } catch (error) {
    console.error('❌ Error initializing services:', error);
    servicesInitialized = false;
  }
}

let claimPollingInterval = null;
const processingEditionRequests = new Set();
const retryingImages = new Set();

function startClaimPolling() {
  if (claimPollingInterval) return;

  claimPollingInterval = setInterval(async () => {
    try {
      await processEditionRequests();
    } catch (error) {
      console.error('❌ Error in claim polling:', error);
    }
  }, 10000);

  async function processEditionRequests() {
    try {
      const response = await claimClient.getPendingEditionRequests(50);
      
      if (!response || !response.success || !response.edition_requests || response.edition_requests.length === 0) {
        return;
      }

      const newRequests = response.edition_requests.filter(req => !processingEditionRequests.has(req.id));
      
      if (newRequests.length === 0) {
        return;
      }

      console.log(`🔄 Processing ${newRequests.length} pending edition request(s)...`);

      for (const request of newRequests) {
        if (processingEditionRequests.has(request.id)) {
          continue;
        }

        processingEditionRequests.add(request.id);

        try {
          console.log(`🔄 Processing edition request: ${request.id} for claim ${request.claim_id}`);
          console.log(`   📍 Wallet address: ${request.wallet_address}`);
          console.log(`   📍 Original Token ID: ${request.original_token_id}`);

          if (!request.original_token_id) {
            console.warn(`   ⚠️ No original token ID for request ${request.id}, skipping`);
            processingEditionRequests.delete(request.id);
            continue;
          }

          if (!request.wallet_address) {
            console.error(`   ❌ No wallet address for request ${request.id}, skipping`);
            processingEditionRequests.delete(request.id);
            continue;
          }

          let recipientAddress = request.wallet_address;
          if (typeof recipientAddress === 'string') {
            recipientAddress = recipientAddress.trim();
            if (!isValidSolanaAddress(recipientAddress)) {
              console.error(`   ❌ Invalid address format: ${recipientAddress}`);
              processingEditionRequests.delete(request.id);
              continue;
            }
          }

          const originalTokenId = request.original_token_id;
          if (!originalTokenId || !isValidSolanaAddress(String(originalTokenId))) {
            console.error(`   ❌ Invalid token ID: ${request.original_token_id}`);
            processingEditionRequests.delete(request.id);
            continue;
          }

          try {
            await claimClient.updateEditionRequest(request.id, {
              status: 'processing'
            });
          } catch (e) {
            console.warn(`   ⚠️ Could not mark request as processing: ${e.message}`);
          }

          const mintResult = await solanaService.mintEdition(
            recipientAddress,
            originalTokenId
          );

          await claimClient.updateEditionRequest(request.id, {
            status: 'completed',
            tx_hash: mintResult.txHash,
            token_id: mintResult.tokenId || 'edition'
          });

          console.log(`✅ Edition minted! Request ID: ${request.id}, TX: ${mintResult.txHash}`);
        } catch (error) {
          console.error(`❌ Error processing edition request ${request.id}:`, error);
          try {
            await claimClient.updateEditionRequest(request.id, {
              status: 'failed',
              error_message: error.message
            });
          } catch (e) {
            console.error(`   ⚠️ Could not update edition request status: ${e.message}`);
          }
        } finally {
          processingEditionRequests.delete(request.id);
        }
      }
    } catch (error) {
      if (error.message && !error.message.includes('404')) {
        console.error('❌ Error fetching edition requests:', error.message);
      }
    }
  }

  console.log('✅ Claim polling started');
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'LensMint Backend',
    servicesInitialized
  });
});

app.get('/api/status', async (req, res) => {
  try {
    const claimHealth = await claimClient.healthCheck();

    // Get device info if available
    let deviceInfo = null;
    let deviceBalance = null;
    if (solanaService.deviceKeypair) {
      try {
        deviceInfo = await solanaService.getDeviceInfo(solanaService.getAddress());
        deviceBalance = await solanaService.getDeviceBalance();
      } catch (error) {
        // Device not registered yet
      }
    }

    res.json({
      success: true,
      status: 'online',
      services: {
        database: servicesInitialized,
        blockchain: solanaService.initialized,
        filecoin: filecoinService.initialized,
        claimServer: claimHealth.status === 'ok'
      },
      device: deviceInfo,
      balance: deviceBalance,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/balance', async (req, res) => {
  try {
    const { address } = req.query;
    console.log(`\n💰 [BALANCE CHECK] Request from: ${address || 'unknown'}`);

    if (!solanaService.deviceKeypair) {
      console.log('   ❌ Device keypair not initialized');
      return res.status(400).json({
        success: false,
        error: 'Device wallet not initialized'
      });
    }

    console.log('   🔍 Checking SOL balance...');
    console.log(`   📍 Wallet address: ${solanaService.getAddress()}`);
    const solBalance = await solanaService.getDeviceBalance();

    if (!solBalance) {
      console.log('   ❌ Failed to get SOL balance');
      return res.status(500).json({
        success: false,
        error: 'Failed to get SOL balance'
      });
    }

    const balanceSol = parseFloat(solBalance.balance);
    // NOTE: field name kept as MIN_ETH_BALANCE-compatible SOL threshold —
    // the Raspberry Pi app reads response keys named `eth`/`balanceEth`
    // verbatim (raspberry_pi_camera_app.py ~L1193, L1362); only the *values*
    // become SOL. Default threshold is 0.05 SOL per the migration plan.
    const minSolBalance = parseFloat(process.env.MIN_SOL_BALANCE || '0.05');
    const hasEnoughSol = balanceSol >= minSolBalance;

    console.log(`   📊 SOL Balance: ${balanceSol} SOL`);
    console.log(`   📊 SOL Required: ${minSolBalance} SOL`);
    console.log(`   ${hasEnoughSol ? '✅' : '⚠️'} SOL Status: ${hasEnoughSol ? 'Sufficient' : 'Low - needs funding'}`);

    const lighthouseReady = filecoinService.initialized;
    console.log(`   ${lighthouseReady ? '✅' : '⚠️'} Lighthouse Status: ${lighthouseReady ? 'Ready' : 'Not initialized (set LIGHTHOUSE_API_KEY)'}`);

    const allFunded = hasEnoughSol && lighthouseReady;
    const needsFunding = !hasEnoughSol || !lighthouseReady;

    console.log(`   ${allFunded ? '✅' : '⚠️'} Overall Status: ${allFunded ? 'All balances sufficient' : 'Some balances need funding'}`);
    console.log(`💰 [BALANCE CHECK] Complete - Returning response\n`);

    res.json({
      success: true,
      address: solBalance.address,
      // Legacy key names kept for Raspberry Pi app compatibility — values
      // are now SOL, not ETH. `sol`/`balanceSol` are the same data under
      // non-legacy names for new consumers.
      eth: {
        balance: solBalance.balance,
        balanceEth: balanceSol,
        minBalance: minSolBalance,
        hasEnoughBalance: hasEnoughSol,
        needsFunding: !hasEnoughSol
      },
      sol: {
        balance: solBalance.balance,
        balanceSol: balanceSol,
        minBalance: minSolBalance,
        hasEnoughBalance: hasEnoughSol,
        needsFunding: !hasEnoughSol
      },
      lighthouse: {
        initialized: lighthouseReady,
        hasEnoughBalance: lighthouseReady,
        needsFunding: !lighthouseReady
      },
      hasEnoughBalance: allFunded,
      needsFunding: needsFunding
    });
  } catch (error) {
    console.error('❌ Error getting balance:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/device/register', async (req, res) => {
  try {
    const {
      deviceAddress,
      publicKey,
      deviceId,
      cameraId,
      model,
      firmwareVersion
    } = req.body;

    if (!deviceAddress || !deviceId || !cameraId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: deviceAddress, deviceId, cameraId'
      });
    }

    const result = await solanaService.registerDevice({
      deviceAddress,
      deviceId,
      cameraId,
      model: model || 'Raspberry Pi',
      firmwareVersion: firmwareVersion || '1.0.0'
    });

    dbService.cacheDevice({
      device_address: deviceAddress,
      device_id: deviceId,
      camera_id: cameraId,
      public_key: publicKey,
      is_registered: true
    });

    res.json({
      success: true,
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      deviceAddress
    });
  } catch (error) {
    console.error('❌ Device registration failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/device/ensure-registered', async (req, res) => {
  try {
    const {
      deviceAddress,
      publicKey,
      deviceId,
      cameraId,
      model,
      firmwareVersion
    } = req.body;

    console.log(`\n📋 [DEVICE REGISTRATION] Starting for: ${deviceAddress}`);
    console.log(`   Device ID: ${deviceId}`);
    console.log(`   Camera ID: ${cameraId}`);

    if (!deviceAddress || !deviceId || !cameraId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: deviceAddress, deviceId, cameraId'
      });
    }

    let registered = false;
    let activated = false;
    let registrationTx = null;
    let activationTx = null;

    // Step 1: Check if device is registered and active
    console.log(`\n🔍 Step 1: Checking device registration status...`);
    try {
      // Use isDeviceActive which is more reliable
      const isActive = await solanaService.isDeviceActive(deviceAddress);
      console.log(`   📊 isDeviceActive result: ${isActive}`);

      if (isActive) {
        // Device is registered and active
        registered = true;
        activated = true;
        console.log(`   ✅ Device ${deviceAddress} is registered and active`);

        // Get full device info for logging
        try {
          const deviceInfo = await solanaService.getDeviceInfo(deviceAddress);
          if (deviceInfo) {
            console.log(`   📊 Registration details:`);
            console.log(`      - Device ID: ${deviceInfo.deviceId}`);
            console.log(`      - Model: ${deviceInfo.model}`);
            console.log(`      - Firmware: ${deviceInfo.firmwareVersion}`);
            console.log(`      - Registered by: ${deviceInfo.registeredBy}`);
            console.log(`      - Registration time: ${new Date(Number(deviceInfo.registrationTime) * 1000).toISOString()}`);
          }
        } catch (e) {
          // Ignore - we already know it's active
        }
      } else {
        // Device is not active - check if it's registered at all
        console.log(`   📊 Device is not active, checking registration status...`);
        const deviceInfo = await solanaService.getDeviceInfo(deviceAddress);

        if (deviceInfo) {
          // Device is registered but inactive
          registered = true;
          activated = false;
          console.log(`   ⚠️ Device ${deviceAddress} is registered but INACTIVE`);
          console.log(`   🔄 Activating device...`);

          try {
            // Activate the device
            const updateResult = await solanaService.updateDevice(
              deviceAddress,
              firmwareVersion || '1.0.0',
              true
            );
            activationTx = updateResult.txHash;
            activated = true;
            console.log(`   ✅ Activation transaction submitted: ${activationTx}`);
            console.log(`   ⏳ Waiting for transaction confirmation...`);
            console.log(`   ✅ Device ${deviceAddress} activated`);
          } catch (updateError) {
            if (updateError.message?.includes('not registered')) {
              console.warn(`   ⚠️ Activation failed: Device not registered (program state mismatch)`);
              console.warn(`   🔄 Will try to register device instead...`);
              registered = false; // Mark as not registered so we register it
            } else {
              throw updateError;
            }
          }
        } else {
          console.log(`   ❌ Device ${deviceAddress} is NOT registered`);
        }
      }
    } catch (error) {
      // Device not registered or error checking
      console.log(`   ❌ Error checking device status: ${error.message}`);
      console.log(`   ℹ️ Assuming device is not registered`);
    }

    // Step 3: Register if not registered
    if (!registered) {
      console.log(`\n📝 Step 3: Registering device...`);
      console.log(`   Device Address: ${deviceAddress}`);
      console.log(`   Device ID: ${deviceId}`);
      console.log(`   Camera ID: ${cameraId}`);
      console.log(`   Model: ${model || 'Raspberry Pi'}`);
      console.log(`   Firmware: ${firmwareVersion || '1.0.0'}`);

      try {
        console.log(`   🔄 Calling registerDevice()...`);
        const result = await solanaService.registerDevice({
          deviceAddress,
          deviceId,
          cameraId,
          model: model || 'Raspberry Pi',
          firmwareVersion: firmwareVersion || '1.0.0'
        });

        registrationTx = result.txHash;
        registered = true;
        activated = true; // Registration sets isActive to true
        console.log(`   ✅ Registration transaction submitted: ${registrationTx}`);
        console.log(`   ⏳ Waiting for transaction confirmation...`);
        console.log(`   ✅ Device registered`);
        console.log(`   ✅ Device is automatically set to ACTIVE on registration`);

        // Cache device info in database
        dbService.cacheDevice({
          device_address: deviceAddress,
          device_id: deviceId,
          camera_id: cameraId,
          public_key: publicKey,
          is_registered: true
        });
        console.log(`   💾 Device info cached in database`);
      } catch (error) {
        console.log(`   ❌ Registration error: ${error.message}`);

        // Check if error is "already registered"
        if (error.message?.includes('already registered') || error.message?.includes('Device already registered') || error.message?.includes('already in use')) {
          console.log(`   ℹ️ Device appears to be already registered (race condition?)`);
          registered = true;

          // Try to activate if not active
          try {
            console.log(`   🔄 Re-checking device status...`);
            const deviceInfo = await solanaService.getDeviceInfo(deviceAddress);
            if (deviceInfo && !deviceInfo.isActive) {
              console.log(`   🔄 Device is registered but inactive, activating...`);
              const updateResult = await solanaService.updateDevice(
                deviceAddress,
                firmwareVersion || '1.0.0',
                true
              );
              activationTx = updateResult.txHash;
              activated = true;
              console.log(`   ✅ Activation transaction: ${activationTx}`);
            } else if (deviceInfo && deviceInfo.isActive) {
              activated = true;
              console.log(`   ✅ Device is already active`);
            }
          } catch (e) {
            console.error(`   ❌ Error checking/activating device: ${e.message}`);
          }
        } else {
          throw error;
        }
      }
    }

    console.log(`\n📊 [DEVICE REGISTRATION] Summary:`);
    console.log(`   Registered: ${registered ? '✅' : '❌'}`);
    console.log(`   Active: ${activated ? '✅' : '❌'}`);
    if (registrationTx) {
      console.log(`   Registration TX: ${registrationTx}`);
    }
    if (activationTx) {
      console.log(`   Activation TX: ${activationTx}`);
    }
    console.log(`✅ [DEVICE REGISTRATION] Complete\n`);

    res.json({
      success: true,
      registered,
      activated,
      deviceAddress,
      registrationTx,
      activationTx
    });
  } catch (error) {
    console.error(`\n❌ [DEVICE REGISTRATION] Failed: ${error.message}`);
    console.error(`   Stack: ${error.stack}\n`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/device/update', async (req, res) => {
  try {
    const {
      deviceAddress,
      firmwareVersion,
      isActive
    } = req.body;

    if (!deviceAddress || typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: deviceAddress, isActive (boolean)'
      });
    }

    const result = await solanaService.updateDevice(
      deviceAddress,
      firmwareVersion || '1.0.0',
      isActive
    );

    res.json({
      success: true,
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      deviceAddress,
      isActive: result.isActive
    });
  } catch (error) {
    console.error('❌ Device update failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/images/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
    }

    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        error: `Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`
      });
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (req.file.size > maxSize) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        error: `File too large. Maximum size: ${maxSize / 1024 / 1024}MB`
      });
    }

    const {
      imageHash,
      signature,
      cameraId,
      deviceAddress,
      latitude,
      longitude,
      locationName
    } = req.body;

    if (!imageHash || !signature || !cameraId || !deviceAddress) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: imageHash, signature, cameraId, deviceAddress'
      });
    }

    const filename = `photo_${Date.now()}.jpg`;
    const filepath = path.join(CAPTURES_PATH, filename);
    fs.renameSync(req.file.path, filepath);

    const image = dbService.createImage({
      filename,
      filepath,
      image_hash: imageHash,
      camera_id: cameraId,
      device_address: deviceAddress,
      signature,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      location_name: locationName || null
    });

    console.log(`📸 Image uploaded: ${image.id} - ${filename}`);

    let filecoinCid = null;
    let metadataCid = null;
    let claimId = null;
    let claimUrl = null;

    console.log(`\n📸 [IMAGE UPLOAD] Processing image: ${image.id}`);
    console.log(`   File: ${filename}`);
    console.log(`   Device: ${deviceAddress}`);
    console.log(`   Camera ID: ${cameraId}`);

    try {
      if (filecoinService.initialized) {
        console.log(`   🔄 Uploading to Filecoin...`);
        filecoinCid = await filecoinService.uploadImage(filepath);
        console.log(`   ✅ Image uploaded to Filecoin: ${filecoinCid}`);

        const deviceInfo = dbService.getDevice(deviceAddress);
        const deviceId = deviceInfo?.device_id || 'unknown';

        const metadata = filecoinService.createMetadata({
          name: `LensMint Photo #${image.id}`,
          description: 'Captured by LensMint Camera',
          imageCid: filecoinCid,
          deviceAddress,
          deviceId,
          cameraId,
          imageHash,
          signature,
          timestamp: new Date().toISOString()
        });

        console.log(`   🔄 Uploading metadata to Filecoin...`);
        metadataCid = await filecoinService.uploadMetadata(metadata);
        console.log(`   ✅ Metadata uploaded to Filecoin: ${metadataCid}`);

        dbService.updateImageStatus(image.id, 'uploaded', {
          filecoin_cid: filecoinCid,
          filecoin_metadata_cid: metadataCid
        });

        console.log(`   🔄 Creating claim with claim server...`);
        claimId = uuidv4();
        try {
          const deviceInfo = dbService.getDevice(deviceAddress);
          const deviceId = deviceInfo?.device_id || 'unknown';

          const claimResult = await claimClient.createClaim(
            claimId,
            filecoinCid,
            metadataCid,
            deviceId,
            cameraId,
            imageHash,
            signature,
            deviceAddress,
            image.latitude,
            image.longitude,
            image.location_name
          );
          claimUrl = claimResult.claim_url;

          dbService.createClaim(claimId, image.id, filecoinCid);

          dbService.updateImageStatus(image.id, 'uploaded', {
            claim_id: claimId
          });

          console.log(`   ✅ Claim created: ${claimId}`);
          console.log(`   ✅ Claim URL: ${claimUrl}`);

          const ownerWallet = process.env.OWNER_WALLET_ADDRESS;
          if (ownerWallet) {
            console.log(`   🎨 Minting original NFT to owner wallet: ${ownerWallet}`);
            try {
              const mintResult = await solanaService.mintOriginal({
                recipient: ownerWallet,
                ipfsHash: filecoinCid,
                imageHash: imageHash,
                signature: signature,
                maxEditions: 0
              });

              dbService.updateImageStatus(image.id, 'minted', {
                token_id: mintResult.tokenId,
                tx_hash: mintResult.txHash,
                recipient_address: ownerWallet
              });

              dbService.updateClaim(claimId, {
                token_id: mintResult.tokenId,
                tx_hash: mintResult.txHash,
                recipient_address: ownerWallet,
                status: 'open'
              });

              try {
                await claimClient.updateClaimStatus(claimId, 'open', mintResult.tokenId, mintResult.txHash);
                console.log(`   ✅ Claim server updated: status=open, token_id=${mintResult.tokenId}`);
              } catch (e) {
                console.warn(`   ⚠️ Could not update claim server status: ${e.message}`);
              }

              console.log(`   ✅ Original NFT minted! Token ID: ${mintResult.tokenId}, TX: ${mintResult.txHash}`);
              console.log(`   ✅ Claim is now OPEN - users can mint unlimited editions`);

              // Semantic search embeddings are generated by the public claim
              // server (Gemini) when the claim is created — nothing to do here.

            } catch (mintError) {
              console.error(`   ❌ Original NFT minting failed: ${mintError.message}`);
              console.error(`   ⚠️ Image uploaded but original NFT not minted - will retry later`);
              dbService.setImageError(image.id, mintError.message);
            }
          } else {
            console.warn(`   ⚠️ OWNER_WALLET_ADDRESS not set - original NFT will not be minted`);
            console.warn(`   ⚠️ Set OWNER_WALLET_ADDRESS in .env to enable automatic minting`);
          }
        } catch (claimError) {
          console.error(`   ❌ Claim creation error: ${claimError.message}`);
          console.error(`   ⚠️ Filecoin upload succeeded but claim creation failed`);
          console.error(`   ⚠️ Check if claim server is running at ${process.env.CLAIM_SERVER_URL || 'https://lensmint.onrender.com'}`);
          dbService.setImageError(image.id, `Claim creation failed: ${claimError.message}`);
        }
      } else {
        console.warn(`   ⚠️ Filecoin not initialized, skipping upload and claim creation`);
        console.warn(`   ⚠️ Image saved locally but no claim created`);
      }
    } catch (error) {
      console.error(`   ❌ Filecoin upload error: ${error.message}`);
      console.error(`   ⚠️ Image saved locally but Filecoin upload failed`);
    }

    console.log(`📸 [IMAGE UPLOAD] Complete - Claim ID: ${claimId || 'none'}\n`);

    res.json({
      success: true,
      imageId: image.id,
      filename,
      filepath: `/captures/${filename}`,
      imageHash,
      filecoinCid: filecoinCid || null,
      metadataCid: metadataCid || null,
      claimId: claimId || null,
      claimUrl: claimUrl || null,
      qrCodeUrl: claimUrl || null, // Same as claimUrl for QR code
      status: filecoinCid ? 'uploaded' : 'saved'
    });
  } catch (error) {
    console.error('❌ Image upload failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Semantic image search has moved to the public claim server (Gemini-powered).
// See public-server: POST /api/search and GET /api/similar/:claim_id.

app.get('/api/images/list', (req, res) => {
  try {
    const { status } = req.query;
    const images = dbService.getImages(status, 100);

    res.json({
      success: true,
      count: images.length,
      images: images.map(img => ({
        id: img.id,
        filename: img.filename,
        filepath: `/captures/${img.filename}`,
        imageHash: img.image_hash,
        cameraId: img.camera_id,
        status: img.status,
        filecoinCid: img.filecoin_cid,
        claimId: img.claim_id,
        tokenId: img.token_id,
        txHash: img.tx_hash,
        createdAt: img.created_at,
        errorMessage: img.error_message,
        uploadedAt: img.uploaded_at,
        mintedAt: img.minted_at
      }))
    });
  } catch (error) {
    console.error('❌ Error listing images:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/images/:id/photo', (req, res) => {
  try {
    const image = dbService.getImageById(parseInt(req.params.id));
    if (!image) return res.status(404).send('Not found');
    if (!fs.existsSync(image.filepath)) return res.status(404).send('File not on disk');
    res.sendFile(image.filepath);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/api/verify/:claimId', async (req, res) => {
  try {
    const { claimId } = req.params;
    const image = dbService.getImageByClaimId(claimId);

    if (!image) {
      return res.status(404).json({ success: false, error: 'Claim not found on this device' });
    }

    const checks = {
      imageFound: true,
      deviceRegistered: false,
      signatureValid: false,
      nftMinted: !!image.token_id
    };

    if (image.device_address && solanaService.initialized) {
      try {
        checks.deviceRegistered = await solanaService.isDeviceActive(image.device_address);
      } catch (_) {}
    }

    if (image.signature && image.image_hash && image.device_address) {
      try {
        const imageHashBytes = hexToBytes(image.image_hash, 32, 'image_hash');
        const sigBytes = hexToBytes(image.signature, 64, 'signature');
        const devicePubkeyBytes = new PublicKey(image.device_address).toBytes();
        checks.signatureValid = nacl.sign.detached.verify(imageHashBytes, sigBytes, devicePubkeyBytes);
      } catch (_) {}
    }

    res.json({
      success: true,
      claimId,
      imageHash: image.image_hash,
      deviceAddress: image.device_address,
      cameraId: image.camera_id,
      timestamp: image.created_at,
      tokenId: image.token_id || null,
      txHash: image.tx_hash || null,
      checks,
      verified: checks.deviceRegistered && checks.signatureValid
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/images/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const image = dbService.getImageById(parseInt(id));

    if (!image) {
      return res.status(404).json({
        success: false,
        error: 'Image not found'
      });
    }

    let claimStatus = null;
    if (image.claim_id) {
      try {
        const claim = await claimClient.checkClaim(image.claim_id);
        claimStatus = claim;
      } catch (error) {
      }
    }

    const claimUrl = image.claim_id
      ? `${process.env.CLAIM_SERVER_URL || 'https://lensmint.onrender.com'}/claim/${image.claim_id}`
      : null;

    res.json({
      success: true,
      image: {
        id: image.id,
        filename: image.filename,
        filepath: `/captures/${image.filename}`,
        imageHash: image.image_hash,
        cameraId: image.camera_id,
        deviceAddress: image.device_address,
        status: image.status,
        filecoinCid: image.filecoin_cid,
        metadataCid: image.filecoin_metadata_cid,
        claimId: image.claim_id,
        claimUrl,
        tokenId: image.token_id,
        txHash: image.tx_hash,
        recipientAddress: image.recipient_address,
        signature: image.signature,
        createdAt: image.created_at,
        uploadedAt: image.uploaded_at,
        mintedAt: image.minted_at,
        errorMessage: image.error_message
      },
      claimStatus
    });
  } catch (error) {
    console.error('❌ Error getting image:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Mint originals for images that were uploaded + have a claim but no token_id yet
app.post('/api/mint-pending', async (req, res) => {
  try {
    const ownerWallet = process.env.OWNER_WALLET_ADDRESS;
    if (!ownerWallet) {
      return res.status(400).json({ success: false, error: 'OWNER_WALLET_ADDRESS not set in .env' });
    }
    if (!solanaService.initialized) {
      return res.status(503).json({ success: false, error: 'Solana service not initialized' });
    }

    // Find images that are uploaded (have filecoin_cid + claim_id) but no token_id
    const uploaded = dbService.getImages('uploaded', 50).filter(img => img.claim_id && !img.token_id);
    if (uploaded.length === 0) {
      return res.json({ success: true, message: 'No images pending mint', processed: 0 });
    }

    const results = [];
    for (const image of uploaded) {
      const result = { id: image.id, claimId: image.claim_id, status: 'failed' };
      try {
        const mintResult = await solanaService.mintOriginal({
          recipient: ownerWallet,
          ipfsHash: image.filecoin_cid,
          imageHash: image.image_hash,
          signature: image.signature,
          maxEditions: 0
        });

        dbService.updateImageStatus(image.id, 'minted', {
          token_id: mintResult.tokenId,
          tx_hash: mintResult.txHash,
          recipient_address: ownerWallet
        });

        dbService.updateClaim(image.claim_id, {
          token_id: mintResult.tokenId,
          tx_hash: mintResult.txHash,
          recipient_address: ownerWallet,
          status: 'open'
        });

        await claimClient.updateClaimStatus(image.claim_id, 'open', mintResult.tokenId, mintResult.txHash).catch(() => {});

        result.status = 'minted';
        result.tokenId = mintResult.tokenId;
        result.txHash = mintResult.txHash;
        console.log(`✅ Minted token #${mintResult.tokenId} for image ${image.id}, claim ${image.claim_id}`);
      } catch (err) {
        result.error = err.message;
        console.error(`❌ Mint failed for image ${image.id}: ${err.message}`);
      }
      results.push(result);
    }

    res.json({ success: true, processed: results.length, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/retry-pending', async (req, res) => {
  const ownerWallet = process.env.OWNER_WALLET_ADDRESS;
  if (!ownerWallet) {
    return res.status(400).json({ success: false, error: 'OWNER_WALLET_ADDRESS not set in .env' });
  }
  if (!solanaService.initialized) {
    return res.status(503).json({ success: false, error: 'Solana service not initialized' });
  }

  try {
    const savedImages = dbService.getImages('saved', 50);
    const uploadedImages = dbService.getImages('uploaded', 50);

    // Phase 2: Filecoin done + claim registered, but mint failed
    const needsMintOnly = uploadedImages.filter(img => img.claim_id && !img.token_id);
    // Phase 3: Filecoin done but claim registration failed
    const needsClaimAndMint = uploadedImages.filter(img => !img.claim_id && img.filecoin_cid);

    const candidates = [
      ...savedImages.map(img => ({ ...img, _phase: 1 })),
      ...needsClaimAndMint.map(img => ({ ...img, _phase: 3 })),
      ...needsMintOnly.map(img => ({ ...img, _phase: 2 })),
    ];

    if (candidates.length === 0) {
      return res.json({ success: true, message: 'Nothing to retry', processed: 0 });
    }

    const results = [];

    for (const image of candidates) {
      if (retryingImages.has(image.id)) {
        results.push({ id: image.id, phase: image._phase, status: 'skipped', reason: 'already in progress' });
        continue;
      }
      retryingImages.add(image.id);
      const result = { id: image.id, phase: image._phase };

      try {
        // Phase 1: saved → upload to Filecoin
        if (image._phase === 1) {
          if (!filecoinService.initialized) throw new Error('Filecoin not initialized — set LIGHTHOUSE_API_KEY');
          if (!fs.existsSync(image.filepath)) throw new Error('Local file not found');

          const filecoinCid = await filecoinService.uploadImage(image.filepath);
          const deviceInfo = dbService.getDevice(image.device_address);
          const deviceId = deviceInfo?.device_id || 'unknown';
          const metadata = filecoinService.createMetadata({
            name: `LensMint Photo #${image.id}`,
            description: 'Captured by LensMint Camera',
            imageCid: filecoinCid,
            deviceAddress: image.device_address,
            deviceId,
            cameraId: image.camera_id,
            imageHash: image.image_hash,
            signature: image.signature,
            timestamp: image.created_at
          });
          const metadataCid = await filecoinService.uploadMetadata(metadata);
          dbService.updateImageStatus(image.id, 'uploaded', { filecoin_cid: filecoinCid, filecoin_metadata_cid: metadataCid });
          image.filecoin_cid = filecoinCid;
          image.filecoin_metadata_cid = metadataCid;
          result.filecoinCid = filecoinCid;
          console.log(`✅ [Retry P1] Filecoin upload done for image ${image.id}: ${filecoinCid}`);
          image._phase = 3;
        }

        // Phase 3: uploaded + no claimId → create claim
        if (image._phase === 3) {
          const claimId = (await import('uuid')).v4();
          const deviceInfo = dbService.getDevice(image.device_address);
          const deviceId = deviceInfo?.device_id || 'unknown';
          const claimResult = await claimClient.createClaim(
            claimId,
            image.filecoin_cid,
            image.filecoin_metadata_cid,
            deviceId,
            image.camera_id,
            image.image_hash,
            image.signature,
            image.device_address
          );
          dbService.createClaim(claimId, image.id, image.filecoin_cid);
          dbService.updateImageStatus(image.id, 'uploaded', { claim_id: claimId });
          image.claim_id = claimId;
          result.claimId = claimId;
          result.claimUrl = claimResult.claim_url;
          console.log(`✅ [Retry P3] Claim created ${claimId} for image ${image.id}`);
          image._phase = 2;
        }

        // Phase 2: uploaded + claimId + no tokenId → mint
        if (image._phase === 2) {
          const mintResult = await solanaService.mintOriginal({
            recipient: ownerWallet,
            ipfsHash: image.filecoin_cid,
            imageHash: image.image_hash,
            signature: image.signature,
            maxEditions: 0
          });
          dbService.updateImageStatus(image.id, 'minted', {
            token_id: mintResult.tokenId,
            tx_hash: mintResult.txHash,
            recipient_address: ownerWallet
          });
          dbService.updateClaim(image.claim_id, {
            token_id: mintResult.tokenId,
            tx_hash: mintResult.txHash,
            recipient_address: ownerWallet,
            status: 'open'
          });
          await claimClient.updateClaimStatus(image.claim_id, 'open', mintResult.tokenId, mintResult.txHash).catch(() => {});
          result.status = 'minted';
          result.tokenId = mintResult.tokenId;
          result.txHash = mintResult.txHash;
          console.log(`✅ [Retry P2] Minted token #${mintResult.tokenId} for image ${image.id}`);
        }

        if (!result.status) result.status = 'processed';
      } catch (err) {
        dbService.setImageError(image.id, err.message);
        result.status = 'failed';
        result.error = err.message;
        console.error(`❌ [Retry P${image._phase}] Image ${image.id}: ${err.message}`);
      } finally {
        retryingImages.delete(image.id);
      }
      results.push(result);
    }

    res.json({ success: true, processed: results.length, results });
  } catch (error) {
    console.error('❌ Retry pending error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/claims/check', async (req, res) => {
  try {
    const { claim_id } = req.query;

    if (!claim_id) {
      return res.status(400).json({
        success: false,
        error: 'claim_id is required'
      });
    }

    const claim = await claimClient.checkClaim(claim_id);

    res.json({
      success: true,
      ...claim
    });
  } catch (error) {
    console.error('❌ Error checking claim:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/status', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    servicesInitialized,
    timestamp: new Date().toISOString()
  });
});

async function startServer() {
  await initializeServices();

  if (servicesInitialized) {
    startClaimPolling();
  }

  app.listen(PORT, () => {
    console.log('═══════════════════════════════════════');
    console.log('📷 LensMint Backend Server');
    console.log('═══════════════════════════════════════');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Captures directory: ${CAPTURES_PATH}`);
    console.log(`🌐 API Endpoints:`);
    console.log(`   - GET  /health`);
    console.log(`   - GET  /api/status`);
    console.log(`   - POST /api/device/register`);
    console.log(`   - POST /api/images/upload`);
    console.log(`   - GET  /api/images/list`);
    console.log(`   - GET  /api/images/:id`);
    console.log(`   - GET  /api/claims/check`);
    console.log(`   - GET  /api/proofs/:claim_id`);
    console.log(`   - GET  /api/proofs/token/:token_id`);
    console.log(`   - GET  /api/balance`);
    console.log('═══════════════════════════════════════');
  });
}

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');

  if (claimPollingInterval) {
    clearInterval(claimPollingInterval);
  }

  dbService.close();
  process.exit(0);
});

startServer().catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
