import {
  Connection,
  Keypair,
  PublicKey,
  Ed25519Program,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import anchorPkg from '@coral-xyz/anchor';

const { AnchorProvider, Program, Wallet, BN } = anchorPkg;

import hardwareKeyExtractor from './getHardwareKey.js';
import deploymentService from './deploymentService.js';
import {
  configPda,
  devicePda,
  deviceIdIndexPda,
  photoPda,
  editionPda,
  hexToBytes,
  isValidSolanaAddress,
} from './pdas.js';

const MIN_SOL_BALANCE = parseFloat(process.env.MIN_SOL_BALANCE || '0.05');

// Replaces the old EVM-based web3Service.js. Keeps the same default-export
// singleton shape + method names (initialize, registerDevice, updateDevice,
// isDeviceActive, getDeviceInfo, mintOriginal, mintEdition, getTokenMetadata,
// getDeviceBalance) so server.js's call sites stay mechanical, per
// docs/superpowers/plans/2026-07-09-solana-migration.md Task B.
class SolanaService {
  constructor() {
    this.connection = null;
    this.programId = null;
    this.provider = null;
    this.program = null;
    this.deviceKeypair = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      const rpcUrl = process.env.SOLANA_RPC_URL || deploymentService.getRpcUrl();
      this.connection = new Connection(rpcUrl, 'confirmed');

      const programIdStr = process.env.VERIS_PROGRAM_ID || deploymentService.getProgramId();
      if (!programIdStr) {
        console.warn('⚠️ VERIS_PROGRAM_ID not set and deployment.json not found. Solana features disabled.');
        return false;
      }
      this.programId = new PublicKey(programIdStr);
      console.log(`✅ Using veris program: ${this.programId.toBase58()}`);

      const idl = deploymentService.getIdl();
      if (!idl) {
        console.warn('⚠️ veris IDL not found (solana-program/idl/veris.json). Solana features disabled.');
        return false;
      }

      // Auto-extract the device's ed25519 seed from the camera's hardware
      // identity export (falls back to a Python subprocess call, then a
      // local re-derivation — see getHardwareKey.js).
      let seedHex = process.env.DEVICE_SEED_HEX;
      if (!seedHex) {
        console.log('🔄 Auto-extracting hardware seed from camera export...');
        try {
          seedHex = hardwareKeyExtractor.getSeedHex();
          if (seedHex) console.log('✅ Hardware seed extracted automatically');
        } catch (error) {
          console.warn('⚠️ Could not auto-extract hardware seed:', error.message);
          console.warn('   Options:');
          console.warn('   1. Remove DEVICE_SEED_HEX from .env (if set)');
          console.warn('   2. Ensure the camera app has created .device_key_export');
          console.warn('   3. Run: cd hardware-camera-app && python3 export_key.py');
        }
      }

      if (seedHex) {
        try {
          const seedBytes = hexToBytes(seedHex, 32, 'seed_hex');
          this.deviceKeypair = Keypair.fromSeed(seedBytes);
          console.log(`✅ Device keypair initialized: ${this.deviceKeypair.publicKey.toBase58()}`);
        } catch (error) {
          console.warn('⚠️ Invalid device seed, device keypair not initialized:', error.message);
        }
      } else {
        console.warn('⚠️ Device seed not available. Device keypair not initialized.');
        console.warn('   Some features (minting, registration) will be disabled.');
      }

      // The Anchor provider's wallet is the device keypair when available so
      // that it auto-signs as fee payer / device signer; otherwise a
      // throwaway keypair keeps read-only operations (getTokenMetadata,
      // getDeviceBalance for other addresses) working.
      const walletKeypair = this.deviceKeypair || Keypair.generate();
      this.provider = new AnchorProvider(this.connection, new Wallet(walletKeypair), {
        commitment: 'confirmed',
      });
      this.program = new Program(idl, this.provider);

      this.initialized = true;
      console.log('✅ Solana service initialized');
      console.log(`   Cluster: ${deploymentService.getCluster()}`);
      console.log(`   RPC: ${rpcUrl}`);

      if (this.deviceKeypair) {
        const address = this.deviceKeypair.publicKey.toBase58();
        try {
          const isActive = await this.isDeviceActive(address);
          if (isActive) {
            console.log(`✅ Device wallet ${address} is registered and active`);
          } else {
            const deviceInfo = await this.getDeviceInfo(address);
            if (deviceInfo) {
              console.warn(`⚠️ Device wallet ${address} is registered but INACTIVE`);
              console.warn('   Minting will fail until device is activated');
            } else {
              console.warn(`⚠️ Device wallet ${address} is NOT registered`);
              console.warn('   Minting will fail until device is registered and activated');
            }
          }
        } catch (error) {
          // Expected when RPC is unreachable (e.g. offline dev boot) — must
          // not crash startup.
          console.log(`ℹ️ Could not verify device registration (RPC may be unreachable): ${error.message}`);
        }
      }

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Solana service:', error.message);
      return false;
    }
  }

  getAddress() {
    return this.deviceKeypair ? this.deviceKeypair.publicKey.toBase58() : null;
  }

  async registerDevice(deviceInfo) {
    if (!this.initialized || !this.deviceKeypair) {
      throw new Error('Solana service not initialized or device keypair not set');
    }

    const { deviceAddress, deviceId, cameraId, model, firmwareVersion } = deviceInfo;
    const devicePubkey = deviceAddress ? new PublicKey(deviceAddress) : this.deviceKeypair.publicKey;

    if (!devicePubkey.equals(this.deviceKeypair.publicKey)) {
      throw new Error('registerDevice: deviceAddress must match this service\'s own device keypair (it signs as registered_by)');
    }

    const [config] = configPda(this.programId);
    const [device] = devicePda(this.programId, devicePubkey);
    const [deviceIdIndex] = deviceIdIndexPda(this.programId, deviceId);

    console.log(`📝 Registering device: ${deviceId}`);

    const txHash = await this.program.methods
      .registerDevice(devicePubkey, deviceId, cameraId, model || 'Raspberry Pi', firmwareVersion || '1.0.0')
      .accounts({
        config,
        device,
        deviceIdIndex,
        signer: this.deviceKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([this.deviceKeypair])
      .rpc();

    console.log(`   Transaction: ${txHash}`);
    console.log(`✅ Device registered`);

    return { success: true, txHash, blockNumber: null };
  }

  async isDeviceActive(deviceAddress) {
    if (!this.initialized) return false;

    try {
      const devicePubkey = new PublicKey(deviceAddress);
      const [device] = devicePda(this.programId, devicePubkey);
      const account = await this.program.account.device.fetch(device);
      return !!account.isActive;
    } catch (error) {
      return false;
    }
  }

  async updateDevice(deviceAddress, firmwareVersion, isActive) {
    if (!this.initialized || !this.deviceKeypair) {
      throw new Error('Solana service not initialized or device keypair not set');
    }

    const devicePubkey = new PublicKey(deviceAddress);
    const [device] = devicePda(this.programId, devicePubkey);

    console.log(`📝 Updating device: ${deviceAddress}`);
    console.log(`   Active: ${isActive}`);

    const txHash = await this.program.methods
      .updateDevice(firmwareVersion ?? null, isActive)
      .accounts({
        device,
        signer: this.deviceKeypair.publicKey,
      })
      .signers([this.deviceKeypair])
      .rpc();

    console.log(`   Transaction: ${txHash}`);
    console.log(`✅ Device updated`);

    return { success: true, txHash, blockNumber: null, isActive };
  }

  async getDeviceInfo(deviceAddress) {
    if (!this.initialized) return null;

    try {
      const devicePubkey = new PublicKey(deviceAddress);
      const [device] = devicePda(this.programId, devicePubkey);
      const account = await this.program.account.device.fetch(device);
      return {
        deviceAddress: account.devicePubkey.toBase58(),
        publicKey: account.devicePubkey.toBase58(),
        deviceId: account.deviceId,
        cameraId: account.cameraId,
        model: account.model,
        firmwareVersion: account.firmwareVersion,
        registrationTime: account.registeredAt.toString(),
        isActive: account.isActive,
        registeredBy: account.registeredBy.toBase58(),
      };
    } catch (error) {
      return null;
    }
  }

  async mintOriginal(photoData) {
    if (!this.initialized || !this.deviceKeypair) {
      throw new Error('Solana service not initialized or device keypair not set');
    }

    const { recipient, ipfsHash, imageHash, signature, maxEditions = 0, capturedAt } = photoData;

    const imageHashBytes = hexToBytes(imageHash, 32, 'imageHash');
    const sigBytes = hexToBytes(signature, 64, 'signature');
    const ownerPubkey = new PublicKey(recipient);

    const deviceAddress = this.deviceKeypair.publicKey.toBase58();
    console.log(`🔍 [MINT] Checking device status for: ${deviceAddress}`);
    const isActive = await this.isDeviceActive(deviceAddress);
    console.log(`   📊 isDeviceActive result: ${isActive}`);

    if (!isActive) {
      const deviceInfo = await this.getDeviceInfo(deviceAddress);
      if (deviceInfo) {
        throw new Error(`Device ${deviceAddress} is ${deviceInfo.isActive ? 'registered but inactive' : 'not registered'}`);
      }
      throw new Error(`Device ${deviceAddress} is not registered`);
    }

    console.log(`   ✅ Device ${deviceAddress} is registered and active - proceeding with mint`);

    const [config] = configPda(this.programId);
    const [device] = devicePda(this.programId, this.deviceKeypair.publicKey);
    const [photoRecord] = photoPda(this.programId, imageHashBytes);

    const edIx = Ed25519Program.createInstructionWithPublicKey({
      publicKey: this.deviceKeypair.publicKey.toBytes(),
      message: imageHashBytes,
      signature: sigBytes,
    });

    const capturedAtBN = new BN(capturedAt ?? Math.floor(Date.now() / 1000));

    const txHash = await this.program.methods
      .mintPhoto(
        Array.from(imageHashBytes),
        ipfsHash,
        Array.from(sigBytes),
        capturedAtBN,
        new BN(maxEditions),
        ownerPubkey
      )
      .accounts({
        device,
        deviceSigner: this.deviceKeypair.publicKey,
        payer: this.deviceKeypair.publicKey,
        photoRecord,
        config,
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions([edIx])
      .signers([this.deviceKeypair])
      .rpc();

    console.log(`🎨 Minting original photo NFT`);
    console.log(`   Transaction: ${txHash}`);
    console.log(`   CID: ${ipfsHash}`);

    return { success: true, txHash, blockNumber: null, tokenId: photoRecord.toBase58() };
  }

  async mintEdition(recipient, originalTokenId) {
    if (!this.initialized) {
      throw new Error('Solana service not initialized');
    }

    console.log('   🔍 [mintEdition] Received parameters:');
    console.log(`      - recipient: ${recipient} (type: ${typeof recipient})`);
    console.log(`      - originalTokenId: ${originalTokenId} (type: ${typeof originalTokenId})`);

    if (!recipient || typeof recipient !== 'string') {
      throw new Error(`Recipient must be a base58 string, got ${typeof recipient}`);
    }
    if (!isValidSolanaAddress(recipient)) {
      throw new Error(`Recipient is not a valid Solana address: ${recipient}`);
    }
    if (!originalTokenId || !isValidSolanaAddress(originalTokenId)) {
      throw new Error(`originalTokenId must be a PhotoRecord PDA address, got ${originalTokenId}`);
    }

    const photoRecordKey = new PublicKey(originalTokenId);
    const photoAccount = await this.program.account.photoRecord.fetch(photoRecordKey);

    const nextNumber = photoAccount.editionCount.toNumber() + 1;
    const [edition] = editionPda(this.programId, photoRecordKey, nextNumber);

    const payerPubkey = this.deviceKeypair ? this.deviceKeypair.publicKey : this.provider.wallet.publicKey;
    const signers = this.deviceKeypair ? [this.deviceKeypair] : [];

    console.log(`   📤 Minting edition #${nextNumber} of ${originalTokenId} to ${recipient}`);

    const txHash = await this.program.methods
      .mintEdition(new PublicKey(recipient))
      .accounts({
        photoRecord: photoRecordKey,
        edition,
        payer: payerPubkey,
        systemProgram: SystemProgram.programId,
      })
      .signers(signers)
      .rpc();

    console.log(`📸 Minted edition #${nextNumber}`);
    console.log(`   Transaction: ${txHash}`);

    return { success: true, txHash, blockNumber: null, tokenId: edition.toBase58() };
  }

  async getDeviceBalance() {
    if (!this.initialized || !this.deviceKeypair) {
      console.log('   ⚠️ Solana service not initialized or device keypair not set');
      return null;
    }

    try {
      const address = this.deviceKeypair.publicKey.toBase58();
      console.log(`   🔗 Querying balance for: ${address}`);
      const lamports = await this.connection.getBalance(this.deviceKeypair.publicKey);
      const balanceSol = lamports / LAMPORTS_PER_SOL;
      console.log(`   💰 Raw balance (lamports): ${lamports}`);
      console.log(`   💰 Formatted balance (SOL): ${balanceSol}`);

      return {
        address,
        balance: balanceSol.toString(),
        balanceLamports: lamports.toString(),
      };
    } catch (error) {
      console.error('   ❌ Error getting device balance:', error.message);
      return null;
    }
  }

  async requestAirdropIfLow(minSol = MIN_SOL_BALANCE) {
    if (!this.initialized || !this.deviceKeypair) return null;

    try {
      const lamports = await this.connection.getBalance(this.deviceKeypair.publicKey);
      if (lamports / LAMPORTS_PER_SOL >= minSol) return null;

      const cluster = deploymentService.getCluster();
      if (cluster !== 'devnet' && cluster !== 'localnet' && cluster !== 'testnet') {
        console.warn(`⚠️ Low balance on ${cluster} — airdrop unavailable, fund manually`);
        return null;
      }

      console.log(`💧 Requesting airdrop for ${this.deviceKeypair.publicKey.toBase58()}...`);
      const sig = await this.connection.requestAirdrop(this.deviceKeypair.publicKey, 1 * LAMPORTS_PER_SOL);
      const latest = await this.connection.getLatestBlockhash();
      await this.connection.confirmTransaction({ signature: sig, ...latest });
      console.log(`✅ Airdrop confirmed: ${sig}`);
      return sig;
    } catch (error) {
      console.warn('⚠️ Airdrop request failed:', error.message);
      return null;
    }
  }

  async getTokenMetadata(tokenId) {
    if (!this.initialized) return null;

    try {
      if (!isValidSolanaAddress(tokenId)) return null;
      const photoRecordKey = new PublicKey(tokenId);
      const account = await this.program.account.photoRecord.fetch(photoRecordKey);

      return {
        deviceAddress: account.devicePubkey.toBase58(),
        deviceId: account.deviceId,
        ipfsHash: account.cid,
        imageHash: Buffer.from(account.imageHash).toString('hex'),
        signature: Buffer.from(account.signature).toString('hex'),
        timestamp: account.capturedAt.toString(),
        mintedAt: account.mintedAt.toString(),
        maxEditions: account.maxEditions.toString(),
        editionCount: account.editionCount.toString(),
        isOriginal: true,
        originalTokenId: tokenId,
        owner: account.owner.toBase58(),
        index: account.index.toString(),
      };
    } catch (error) {
      console.error('Error getting token metadata:', error.message);
      return null;
    }
  }
}

const solanaService = new SolanaService();

export default solanaService;
