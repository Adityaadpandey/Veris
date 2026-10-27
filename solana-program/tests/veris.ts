import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  Ed25519Program,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import { createHash, randomBytes } from "crypto";
import nacl from "tweetnacl";
import { assert } from "chai";

import type { Veris } from "../target/types/veris";

describe("veris", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Veris as Program<Veris>;
  const programId = program.programId;

  // ---- PDA helpers -------------------------------------------------------

  const configPda = (): [PublicKey, number] =>
    PublicKey.findProgramAddressSync([Buffer.from("config")], programId);

  const devicePda = (devicePubkey: PublicKey): [PublicKey, number] =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("device"), devicePubkey.toBuffer()],
      programId
    );

  const deviceIdIndexPda = (deviceId: string): [PublicKey, number] =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("device-id"), sha256(deviceId)],
      programId
    );

  const photoPda = (imageHash: Buffer): [PublicKey, number] =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("photo"), imageHash],
      programId
    );

  const editionPda = (photoKey: PublicKey, number: number): [PublicKey, number] =>
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("edition"),
        photoKey.toBuffer(),
        new BN(number).toArrayLike(Buffer, "le", 8),
      ],
      programId
    );

  function sha256(data: string): Buffer {
    return createHash("sha256").update(Buffer.from(data)).digest();
  }

  function randHash32(): Buffer {
    return randomBytes(32);
  }

  function ed25519Ix(signer: Keypair, message: Buffer) {
    const signature = nacl.sign.detached(message, signer.secretKey);
    return Ed25519Program.createInstructionWithPublicKey({
      publicKey: signer.publicKey.toBytes(),
      message,
      signature,
    });
  }

  async function fund(pubkey: PublicKey, sol = 2) {
    const sig = await provider.connection.requestAirdrop(
      pubkey,
      sol * anchor.web3.LAMPORTS_PER_SOL
    );
    const latest = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      signature: sig,
      ...latest,
    });
  }

  async function expectError(promise: Promise<any>, codeName?: string) {
    try {
      await promise;
      assert.fail("expected transaction to fail");
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (codeName) {
        const matched =
          msg.includes(codeName) ||
          err?.error?.errorCode?.code === codeName ||
          (Array.isArray(err?.error?.errorMessages) &&
            err.error.errorMessages.join(" ").includes(codeName));
        assert.isTrue(
          matched,
          `expected error to mention "${codeName}", got: ${msg}`
        );
      }
    }
  }

  async function expectOneOfErrors(promise: Promise<any>, codeNames: string[]) {
    try {
      await promise;
      assert.fail("expected transaction to fail");
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      const matched = codeNames.some((c) => msg.includes(c));
      assert.isTrue(
        matched,
        `expected error to mention one of [${codeNames.join(", ")}], got: ${msg}`
      );
    }
  }

  // ---- shared fixtures ----------------------------------------------------

  const deviceA = Keypair.generate();
  const deviceB = Keypair.generate();
  const deviceC = Keypair.generate();
  const deviceIdA = "device-alpha";
  const deviceIdB = "device-beta";
  const deviceIdC = "device-gamma";

  let happyImageHash: Buffer;
  let happyPhotoPda: PublicKey;
  let firstEditionRecipient: Keypair;

  // ------------------------------------------------------------------------

  it("initializes the config", async () => {
    const [config] = configPda();
    await program.methods
      .initialize()
      .accounts({
        config,
        payer: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .rpc();

    const configAccount = await program.account.config.fetch(config);
    assert.isTrue(configAccount.authority.equals(provider.wallet.publicKey));
    assert.equal(configAccount.totalPhotos.toNumber(), 0);
    assert.equal(configAccount.totalDevices.toNumber(), 0);
  });

  describe("register_device", () => {
    it("registers a device (happy path)", async () => {
      const [config] = configPda();
      const [device] = devicePda(deviceA.publicKey);
      const [deviceIdIndex] = deviceIdIndexPda(deviceIdA);

      await program.methods
        .registerDevice(deviceA.publicKey, deviceIdA, "cam-1", "PiCam v3", "1.0.0")
        .accounts({
          config,
          device,
          deviceIdIndex,
          signer: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();

      const deviceAccount = await program.account.device.fetch(device);
      assert.isTrue(deviceAccount.devicePubkey.equals(deviceA.publicKey));
      assert.equal(deviceAccount.deviceId, deviceIdA);
      assert.equal(deviceAccount.cameraId, "cam-1");
      assert.equal(deviceAccount.model, "PiCam v3");
      assert.equal(deviceAccount.firmwareVersion, "1.0.0");
      assert.isTrue(deviceAccount.isActive);
      assert.isTrue(deviceAccount.registeredBy.equals(provider.wallet.publicKey));

      const configAccount = await program.account.config.fetch(config);
      assert.equal(configAccount.totalDevices.toNumber(), 1);
    });

    it("rejects registering the same device pubkey twice", async () => {
      const [config] = configPda();
      const [device] = devicePda(deviceA.publicKey);
      const [deviceIdIndex] = deviceIdIndexPda("device-alpha-dup");

      await expectError(
        program.methods
          .registerDevice(
            deviceA.publicKey,
            "device-alpha-dup",
            "cam-1",
            "PiCam v3",
            "1.0.0"
          )
          .accounts({
            config,
            device,
            deviceIdIndex,
            signer: provider.wallet.publicKey,
            systemProgram: SystemProgram.programId,
          } as any)
          .rpc()
      );
    });

    it("rejects registering a duplicate device_id with a different pubkey", async () => {
      const [config] = configPda();
      const otherDevice = Keypair.generate();
      const [device] = devicePda(otherDevice.publicKey);
      const [deviceIdIndex] = deviceIdIndexPda(deviceIdA); // same id as deviceA

      await expectError(
        program.methods
          .registerDevice(
            otherDevice.publicKey,
            deviceIdA,
            "cam-2",
            "PiCam v3",
            "1.0.0"
          )
          .accounts({
            config,
            device,
            deviceIdIndex,
            signer: provider.wallet.publicKey,
            systemProgram: SystemProgram.programId,
          } as any)
          .rpc()
      );
    });

    it("registers a second device for use in negative mint_photo tests", async () => {
      const [config] = configPda();
      const [device] = devicePda(deviceB.publicKey);
      const [deviceIdIndex] = deviceIdIndexPda(deviceIdB);

      await program.methods
        .registerDevice(deviceB.publicKey, deviceIdB, "cam-2", "PiCam v3", "1.0.0")
        .accounts({
          config,
          device,
          deviceIdIndex,
          signer: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();
    });

    it("registers a third device for use in the inactive-device test", async () => {
      const [config] = configPda();
      const [device] = devicePda(deviceC.publicKey);
      const [deviceIdIndex] = deviceIdIndexPda(deviceIdC);

      await program.methods
        .registerDevice(deviceC.publicKey, deviceIdC, "cam-3", "PiCam v3", "1.0.0")
        .accounts({
          config,
          device,
          deviceIdIndex,
          signer: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();
    });
  });

  describe("update_device / deactivate_device authorization", () => {
    it("allows the registered_by authority to update firmware", async () => {
      const [device] = devicePda(deviceA.publicKey);
      await program.methods
        .updateDevice("1.1.0", true)
        .accounts({
          device,
          signer: provider.wallet.publicKey,
        } as any)
        .rpc();

      const deviceAccount = await program.account.device.fetch(device);
      assert.equal(deviceAccount.firmwareVersion, "1.1.0");
      assert.isTrue(deviceAccount.isActive);
    });

    it("allows the device's own key to update itself", async () => {
      const [device] = devicePda(deviceA.publicKey);
      await program.methods
        .updateDevice("1.2.0", true)
        .accounts({
          device,
          signer: deviceA.publicKey,
        } as any)
        .signers([deviceA])
        .rpc();

      const deviceAccount = await program.account.device.fetch(device);
      assert.equal(deviceAccount.firmwareVersion, "1.2.0");
    });

    it("rejects update_device from an unrelated signer", async () => {
      const [device] = devicePda(deviceA.publicKey);
      const intruder = Keypair.generate();
      await fund(intruder.publicKey);

      await expectError(
        program.methods
          .updateDevice("9.9.9", true)
          .accounts({
            device,
            signer: intruder.publicKey,
          } as any)
          .signers([intruder])
          .rpc(),
        "Unauthorized"
      );
    });

    it("rejects deactivate_device from an unrelated signer", async () => {
      const [device] = devicePda(deviceA.publicKey);
      const intruder = Keypair.generate();
      await fund(intruder.publicKey);

      await expectError(
        program.methods
          .deactivateDevice()
          .accounts({
            device,
            signer: intruder.publicKey,
          } as any)
          .signers([intruder])
          .rpc(),
        "Unauthorized"
      );
    });

    it("deactivates device C for the inactive-device mint_photo test", async () => {
      const [device] = devicePda(deviceC.publicKey);
      await program.methods
        .deactivateDevice()
        .accounts({
          device,
          signer: provider.wallet.publicKey,
        } as any)
        .rpc();

      const deviceAccount = await program.account.device.fetch(device);
      assert.isFalse(deviceAccount.isActive);
    });
  });

  describe("mint_photo", () => {
    it("mints a photo (happy path) with a valid ed25519 verification", async () => {
      const [config] = configPda();
      const [device] = devicePda(deviceA.publicKey);
      const imageHash = randHash32();
      const cid = "bafybeigdyrhappyhash";
      const capturedAt = new BN(Math.floor(Date.now() / 1000));
      const maxEditions = new BN(3);
      const owner = provider.wallet.publicKey;
      const [photoRecord] = photoPda(imageHash);

      const signature = nacl.sign.detached(imageHash, deviceA.secretKey);
      const edIx = ed25519Ix(deviceA, imageHash);

      await program.methods
        .mintPhoto(
          [...imageHash] as any,
          cid,
          [...signature] as any,
          capturedAt,
          maxEditions,
          owner
        )
        .accounts({
          device,
          deviceSigner: deviceA.publicKey,
          payer: provider.wallet.publicKey,
          photoRecord,
          config,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram: SystemProgram.programId,
        } as any)
        .preInstructions([edIx])
        .signers([deviceA])
        .rpc();

      const photoAccount = await program.account.photoRecord.fetch(photoRecord);
      assert.equal(photoAccount.index.toNumber(), 1);
      assert.isTrue(photoAccount.devicePubkey.equals(deviceA.publicKey));
      assert.equal(photoAccount.deviceId, deviceIdA);
      assert.equal(photoAccount.cid, cid);
      assert.deepEqual(Array.from(photoAccount.imageHash), Array.from(imageHash));
      assert.equal(photoAccount.maxEditions.toNumber(), 3);
      assert.equal(photoAccount.editionCount.toNumber(), 0);
      assert.isTrue(photoAccount.owner.equals(owner));

      const configAccount = await program.account.config.fetch(config);
      assert.equal(configAccount.totalPhotos.toNumber(), 1);

      happyImageHash = imageHash;
      happyPhotoPda = photoRecord;
    });

    it("rejects mint_photo when the ed25519 verification instruction is missing", async () => {
      const [config] = configPda();
      const [device] = devicePda(deviceA.publicKey);
      const imageHash = randHash32();
      const [photoRecord] = photoPda(imageHash);
      const signature = nacl.sign.detached(imageHash, deviceA.secretKey);

      await expectError(
        program.methods
          .mintPhoto(
            [...imageHash] as any,
            "cid-no-ed25519",
            [...signature] as any,
            new BN(Math.floor(Date.now() / 1000)),
            new BN(0),
            provider.wallet.publicKey
          )
          .accounts({
            device,
            deviceSigner: deviceA.publicKey,
            payer: provider.wallet.publicKey,
            photoRecord,
            config,
            instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
            systemProgram: SystemProgram.programId,
          } as any)
          .signers([deviceA])
          .rpc(),
        "MissingEd25519Verification"
      );
    });

    it("rejects mint_photo when the ed25519 instruction was signed by the wrong key", async () => {
      const [config] = configPda();
      const [device] = devicePda(deviceA.publicKey);
      const imageHash = randHash32();
      const [photoRecord] = photoPda(imageHash);

      // ed25519 ix proves deviceB signed, but the mint_photo call claims deviceA.
      const wrongKeyIx = ed25519Ix(deviceB, imageHash);
      const fakeSignature = nacl.sign.detached(imageHash, deviceB.secretKey);

      await expectOneOfErrors(
        program.methods
          .mintPhoto(
            [...imageHash] as any,
            "cid-wrong-key",
            [...fakeSignature] as any,
            new BN(Math.floor(Date.now() / 1000)),
            new BN(0),
            provider.wallet.publicKey
          )
          .accounts({
            device,
            deviceSigner: deviceA.publicKey,
            payer: provider.wallet.publicKey,
            photoRecord,
            config,
            instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
            systemProgram: SystemProgram.programId,
          } as any)
          .preInstructions([wrongKeyIx])
          .signers([deviceA])
          .rpc(),
        ["MissingEd25519Verification", "SignatureMismatch"]
      );
    });

    it("rejects mint_photo when the signed message does not match image_hash", async () => {
      const [config] = configPda();
      const [device] = devicePda(deviceA.publicKey);
      const imageHash = randHash32();
      const wrongMessage = randHash32();
      const [photoRecord] = photoPda(imageHash);

      const edIx = ed25519Ix(deviceA, wrongMessage);
      const signature = nacl.sign.detached(wrongMessage, deviceA.secretKey);

      await expectOneOfErrors(
        program.methods
          .mintPhoto(
            [...imageHash] as any,
            "cid-wrong-message",
            [...signature] as any,
            new BN(Math.floor(Date.now() / 1000)),
            new BN(0),
            provider.wallet.publicKey
          )
          .accounts({
            device,
            deviceSigner: deviceA.publicKey,
            payer: provider.wallet.publicKey,
            photoRecord,
            config,
            instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
            systemProgram: SystemProgram.programId,
          } as any)
          .preInstructions([edIx])
          .signers([deviceA])
          .rpc(),
        ["MissingEd25519Verification", "SignatureMismatch"]
      );
    });

    it("rejects mint_photo for an inactive device", async () => {
      const [config] = configPda();
      const [device] = devicePda(deviceC.publicKey);
      const imageHash = randHash32();
      const [photoRecord] = photoPda(imageHash);

      const edIx = ed25519Ix(deviceC, imageHash);
      const signature = nacl.sign.detached(imageHash, deviceC.secretKey);

      await expectError(
        program.methods
          .mintPhoto(
            [...imageHash] as any,
            "cid-inactive",
            [...signature] as any,
            new BN(Math.floor(Date.now() / 1000)),
            new BN(0),
            provider.wallet.publicKey
          )
          .accounts({
            device,
            deviceSigner: deviceC.publicKey,
            payer: provider.wallet.publicKey,
            photoRecord,
            config,
            instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
            systemProgram: SystemProgram.programId,
          } as any)
          .preInstructions([edIx])
          .signers([deviceC])
          .rpc(),
        "DeviceNotActive"
      );
    });

    it("rejects a duplicate mint of the same image_hash", async () => {
      const [config] = configPda();
      const [device] = devicePda(deviceA.publicKey);
      const [photoRecord] = photoPda(happyImageHash);

      const edIx = ed25519Ix(deviceA, happyImageHash);
      const signature = nacl.sign.detached(happyImageHash, deviceA.secretKey);

      await expectError(
        program.methods
          .mintPhoto(
            [...happyImageHash] as any,
            "cid-dup",
            [...signature] as any,
            new BN(Math.floor(Date.now() / 1000)),
            new BN(0),
            provider.wallet.publicKey
          )
          .accounts({
            device,
            deviceSigner: deviceA.publicKey,
            payer: provider.wallet.publicKey,
            photoRecord,
            config,
            instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
            systemProgram: SystemProgram.programId,
          } as any)
          .preInstructions([edIx])
          .signers([deviceA])
          .rpc()
      );
    });
  });

  describe("mint_edition", () => {
    const recipient1 = Keypair.generate();
    const recipient2 = Keypair.generate();
    const recipient3 = Keypair.generate();
    const recipient4 = Keypair.generate();

    it("mints editions 1..3 up to max_editions", async () => {
      for (const [i, recipient] of [recipient1, recipient2, recipient3].entries()) {
        const number = i + 1;
        const [edition] = editionPda(happyPhotoPda, number);

        await program.methods
          .mintEdition(recipient.publicKey)
          .accounts({
            photoRecord: happyPhotoPda,
            edition,
            payer: provider.wallet.publicKey,
            systemProgram: SystemProgram.programId,
          } as any)
          .rpc();

        const editionAccount = await program.account.edition.fetch(edition);
        assert.equal(editionAccount.number.toNumber(), number);
        assert.isTrue(editionAccount.owner.equals(recipient.publicKey));
        assert.isTrue(editionAccount.photo.equals(happyPhotoPda));
      }

      const photoAccount = await program.account.photoRecord.fetch(happyPhotoPda);
      assert.equal(photoAccount.editionCount.toNumber(), 3);

      firstEditionRecipient = recipient1;
    });

    it("rejects minting a 4th edition once max_editions is reached", async () => {
      const [edition] = editionPda(happyPhotoPda, 4);

      await expectError(
        program.methods
          .mintEdition(recipient4.publicKey)
          .accounts({
            photoRecord: happyPhotoPda,
            edition,
            payer: provider.wallet.publicKey,
            systemProgram: SystemProgram.programId,
          } as any)
          .rpc(),
        "MaxEditionsReached"
      );
    });
  });

  describe("transfers", () => {
    it("allows the photo owner to transfer_photo", async () => {
      const newOwner = Keypair.generate();

      await program.methods
        .transferPhoto(newOwner.publicKey)
        .accounts({
          photoRecord: happyPhotoPda,
          owner: provider.wallet.publicKey,
        } as any)
        .rpc();

      const photoAccount = await program.account.photoRecord.fetch(happyPhotoPda);
      assert.isTrue(photoAccount.owner.equals(newOwner.publicKey));
    });

    it("rejects transfer_photo from a non-owner", async () => {
      // provider.wallet is no longer the owner after the previous test.
      const anotherOwner = Keypair.generate();

      await expectError(
        program.methods
          .transferPhoto(anotherOwner.publicKey)
          .accounts({
            photoRecord: happyPhotoPda,
            owner: provider.wallet.publicKey,
          } as any)
          .rpc(),
        "Unauthorized"
      );
    });

    it("allows the edition owner to transfer_edition", async () => {
      await fund(firstEditionRecipient.publicKey);

      const [edition] = editionPda(happyPhotoPda, 1);
      const newOwner = Keypair.generate();

      await program.methods
        .transferEdition(newOwner.publicKey)
        .accounts({
          edition,
          owner: firstEditionRecipient.publicKey,
        } as any)
        .signers([firstEditionRecipient])
        .rpc();

      const editionAccount = await program.account.edition.fetch(edition);
      assert.isTrue(editionAccount.owner.equals(newOwner.publicKey));
    });

    it("rejects transfer_edition from a non-owner", async () => {
      const [edition] = editionPda(happyPhotoPda, 1);
      const anotherOwner = Keypair.generate();

      // firstEditionRecipient is no longer the owner after the previous test.
      await expectError(
        program.methods
          .transferEdition(anotherOwner.publicKey)
          .accounts({
            edition,
            owner: firstEditionRecipient.publicKey,
          } as any)
          .signers([firstEditionRecipient])
          .rpc(),
        "Unauthorized"
      );
    });
  });
});
