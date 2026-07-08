/**
 * Smoke test against a live cluster (devnet by default): registers a throwaway
 * device, mints a photo with a real ed25519 signature, mints one edition, then
 * fetches and prints the resulting accounts.
 *
 * Usage:
 *   ts-node scripts/smoke-devnet.ts
 *
 * Reads connection info from `../deployment.json` (or `ANCHOR_PROVIDER_URL` /
 * `SOLANA_RPC_URL` env overrides) and the IDL from `../idl/veris.json`. Uses
 * the local CLI wallet (`~/.config/solana/id.json` or `ANCHOR_WALLET`) as payer;
 * make sure it holds enough SOL (airdrop on devnet if needed).
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Ed25519Program,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import { createHash, randomBytes } from "crypto";
import nacl from "tweetnacl";

import type { Veris } from "../target/types/veris";

const ROOT = path.join(__dirname, "..");

function loadDeployment(): { programId: string; cluster: string; rpcUrl: string } {
  const raw = fs.readFileSync(path.join(ROOT, "deployment.json"), "utf8");
  return JSON.parse(raw);
}

function loadIdl(): anchor.Idl {
  const raw = fs.readFileSync(path.join(ROOT, "idl", "veris.json"), "utf8");
  return JSON.parse(raw);
}

function loadWalletKeypair(): Keypair {
  const walletPath =
    process.env.ANCHOR_WALLET ??
    path.join(os.homedir(), ".config", "solana", "id.json");
  const secret = JSON.parse(fs.readFileSync(walletPath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function sha256(data: string): Buffer {
  return createHash("sha256").update(Buffer.from(data)).digest();
}

async function main() {
  const deployment = loadDeployment();
  const rpcUrl =
    process.env.ANCHOR_PROVIDER_URL ?? process.env.SOLANA_RPC_URL ?? deployment.rpcUrl;
  const programId = new PublicKey(deployment.programId);

  console.log(`Cluster: ${deployment.cluster}`);
  console.log(`RPC URL: ${rpcUrl}`);
  console.log(`Program: ${programId.toBase58()}`);

  const connection = new Connection(rpcUrl, "confirmed");
  const payer = loadWalletKeypair();
  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Payer: ${payer.publicKey.toBase58()} (${balance / 1e9} SOL)`);
  if (balance < 0.05 * 1e9) {
    console.log("Payer balance is low; requesting airdrop...");
    try {
      const sig = await connection.requestAirdrop(payer.publicKey, 1e9);
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...latest });
      console.log("Airdrop confirmed.");
    } catch (err) {
      console.warn("Airdrop failed (continuing anyway):", err);
    }
  }

  const idl = loadIdl();
  const program = new Program(idl as anchor.Idl, provider) as unknown as Program<Veris>;

  const configPda = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId
  )[0];

  // Make sure Config exists; initialize it on first run.
  const configInfo = await connection.getAccountInfo(configPda);
  if (!configInfo) {
    console.log("Initializing Config...");
    await program.methods
      .initialize()
      .accounts({
        config: configPda,
        payer: payer.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .rpc();
  } else {
    console.log("Config already initialized.");
  }

  // Register a throwaway device.
  const device = Keypair.generate();
  const deviceId = `smoke-${Date.now()}`;
  const [devicePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("device"), device.publicKey.toBuffer()],
    programId
  );
  const [deviceIdIndexPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("device-id"), sha256(deviceId)],
    programId
  );

  console.log(`Registering device ${device.publicKey.toBase58()} (${deviceId})...`);
  await program.methods
    .registerDevice(device.publicKey, deviceId, "smoke-cam", "PiCam v3", "1.0.0")
    .accounts({
      config: configPda,
      device: devicePda,
      deviceIdIndex: deviceIdIndexPda,
      signer: payer.publicKey,
      systemProgram: SystemProgram.programId,
    } as any)
    .rpc();
  console.log("Device registered:", devicePda.toBase58());

  // Mint a photo with a real ed25519 signature over the image hash.
  const imageHash = randomBytes(32);
  const signature = nacl.sign.detached(imageHash, device.secretKey);
  const edIx = Ed25519Program.createInstructionWithPublicKey({
    publicKey: device.publicKey.toBytes(),
    message: imageHash,
    signature,
  });

  const [photoRecordPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("photo"), imageHash],
    programId
  );

  console.log("Minting photo...");
  const mintPhotoSig = await program.methods
    .mintPhoto(
      [...imageHash] as any,
      "bafybeismokedevnetplaceholdercid",
      [...signature] as any,
      new BN(Math.floor(Date.now() / 1000)),
      new BN(0),
      payer.publicKey
    )
    .accounts({
      device: devicePda,
      deviceSigner: device.publicKey,
      payer: payer.publicKey,
      photoRecord: photoRecordPda,
      config: configPda,
      instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      systemProgram: SystemProgram.programId,
    } as any)
    .preInstructions([edIx])
    .signers([device])
    .rpc();
  console.log("Photo minted:", photoRecordPda.toBase58(), "tx:", mintPhotoSig);

  // Mint edition #1.
  const [editionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("edition"), photoRecordPda.toBuffer(), new BN(1).toArrayLike(Buffer, "le", 8)],
    programId
  );
  const recipient = Keypair.generate().publicKey;

  console.log("Minting edition #1...");
  const mintEditionSig = await program.methods
    .mintEdition(recipient)
    .accounts({
      photoRecord: photoRecordPda,
      edition: editionPda,
      payer: payer.publicKey,
      systemProgram: SystemProgram.programId,
    } as any)
    .rpc();
  console.log("Edition minted:", editionPda.toBase58(), "tx:", mintEditionSig);

  const photoAccount = await program.account.photoRecord.fetch(photoRecordPda);
  const editionAccount = await program.account.edition.fetch(editionPda);

  console.log("\n--- Smoke test summary ---");
  console.log("PhotoRecord:", JSON.stringify(photoAccount, null, 2));
  console.log("Edition:", JSON.stringify(editionAccount, null, 2));
  console.log(
    `Explorer: https://explorer.solana.com/address/${photoRecordPda.toBase58()}?cluster=${deployment.cluster}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
