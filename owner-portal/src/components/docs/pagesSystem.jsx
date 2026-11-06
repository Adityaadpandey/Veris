import { Link } from 'react-router-dom'
import { H2, H3, Code, Table, Note, C } from './parts'

export const system = [
  {
    slug: 'camera',
    group: 'Hardware',
    title: 'The Veris camera',
    summary: 'The Raspberry Pi camera: modes, hardware, offline behavior and Bluetooth control.',
    body: (
      <>
        <p>The Veris camera is a Raspberry Pi running a Python application. It captures photos, checks liveness, signs them and sends them to the backend.</p>

        <H2>Operating modes</H2>
        <Table
          head={['Mode', 'Description']}
          rows={[
            ['Touchscreen', 'A full-screen app with a live preview, a shutter, zoom, and the claim QR code shown after each capture.'],
            ['Headless', 'No screen. The shutter is triggered from a phone over Bluetooth and progress is reported back to the phone. Runs as a system service.'],
          ]}
        />

        <H2>Components</H2>
        <Table
          head={['Layer', 'Technology']}
          rows={[
            ['Camera control', 'Picamera2 on Raspberry Pi'],
            ['Interface', 'Kivy (touchscreen mode)'],
            ['Signing', 'secp256k1 with keccak256 addressing'],
            ['Bluetooth', 'RFCOMM serial for the shutter, and Bluetooth PAN tethering for phone data'],
            ['Preview stream', 'MJPEG on port 8081'],
          ]}
        />

        <H2>Offline and pending behavior</H2>
        <ul>
          <li>If the backend cannot be reached, the signed capture is saved to a queue on disk and retried on an interval (five minutes by default).</li>
          <li>If the liveness check cannot be completed, the capture is stored as <C>pending</C> and resumed later. The camera does not upload a capture that has no verdict.</li>
          <li>When there is no network, the camera can tether to a paired phone over Bluetooth to get connectivity.</li>
        </ul>

        <H2>Bluetooth control</H2>
        <p>In headless mode a paired phone sends <C>CAPTURE</C> and the camera answers with the status lines listed in <Link to="/docs/mobile">Mobile app</Link>. The phone must be paired and trusted with the camera first.</p>

        <H2>Location and time</H2>
        <p>A rough location is attached to a capture when available, and a timezone offset is stamped into the photo’s EXIF data. The signed timestamp is what the backend relies on, not the EXIF time.</p>

        <Note>Each camera must be registered in the device registry before its photos can be minted. See <Link to="/docs/contracts">Smart contracts</Link>.</Note>
      </>
    ),
  },
  {
    slug: 'device-identity',
    group: 'Hardware',
    title: 'Device identity and signing',
    summary: 'How a camera gets its key, what it signs and how the signature is verified.',
    body: (
      <>
        <H2>The device key</H2>
        <p>Each camera has a secp256k1 key pair, the same curve used by Ethereum. The private key is derived from the Pi’s hardware identifiers combined with a stored random salt, and is hashed with SHA-256 to form the key. The camera’s public address is the last 20 bytes of the keccak256 hash of its public key, so it doubles as an Ethereum address.</p>
        <p>The private key stays on the device. The backend reads an exported copy only on the same machine when it runs alongside the camera, so that it can pay gas for mints from the camera’s own wallet.</p>

        <H2>What is signed</H2>
        <p>The camera signs the packet text shown in <Link to="/docs/how-it-works">How a photo is sealed</Link> using EIP-191 <C>personal_sign</C>. Each field has a purpose:</p>
        <Table
          head={['Field', 'Purpose']}
          rows={[
            ['image', 'Binds the signature to the exact bytes of the photo.'],
            ['companion', 'Binds an optional second photo of the same scene.'],
            ['verdict', 'Records the liveness result, so the outcome cannot be changed afterwards.'],
            ['ts', 'The time of signing. Packets that are too old or from the future are rejected.'],
            ['nonce', 'A one-time value. A reused nonce is rejected, which prevents replay.'],
            ['device', 'The address that must match the recovered signer.'],
          ]}
        />

        <H2>Verification on the backend</H2>
        <p>The backend rebuilds the packet text from the received fields and recovers the signer from the signature. The upload is accepted only if the recovered address equals the stated device, the hash of the uploaded bytes equals the signed image hash, the timestamp is within the allowed age, and the nonce is new.</p>
        <Code>{`signer = verifyMessage(buildPacketMessage(fields), signature)
signer == deviceAddress        // else 403 "Signature was not made by deviceAddress"
!seenNonce(nonce)              // else 409 "Nonce already used"`}</Code>

        <H2>Registration</H2>
        <p>Signing alone proves a key made the packet. Registration proves the key belongs to a camera Veris trusts. A registrar adds the device’s address, id and model to the on-chain <C>DeviceRegistry</C>. The token contract refuses to mint for an address that is not active in the registry.</p>
      </>
    ),
  },
  {
    slug: 'liveness',
    group: 'Hardware',
    title: 'Liveness and companion capture',
    summary: 'How Veris tells a real scene from a screen, a print or a generated image.',
    body: (
      <>
        <H2>Liveness check</H2>
        <p>Before signing, the camera asks a vision model two questions about the photo: is this a real scene photographed directly, and, when a companion photo exists, do both photos show the same real scene? The model is told to answer false for a photo of a screen, a printed photo or an AI-generated image.</p>
        <p>The answer, an engine identifier, a confidence and short reasons are stored with the capture. The engine is a 0G Router vision model by default, with a fallback to a hosted vision model through the Veris server. When the 0G option is enabled, the response can also carry a TEE verification flag.</p>

        <H2>Verdicts</H2>
        <Table
          head={['Verdict', 'Meaning']}
          rows={[
            ['real', 'The scene appears to be photographed directly.'],
            ['fake', 'The scene appears to be a screen, a print or a generated image.'],
            ['pending', 'No engine answered. The capture is held and re-checked later; it is never labelled by guess.'],
          ]}
        />

        <H2>Companion capture</H2>
        <p>A companion photo is a second photo of the same scene taken by a phone next to the camera at the same moment. Its hash is included in the signed packet, so it is bound to the capture. The two photos are cross-checked for the same scene. A search for the phone photo also finds the claim, so either file can be verified.</p>

        <Note title="Limits">
          Liveness is a signal, not a proof. A determined attacker may produce a convincing physical scene. The device signature proves what the camera captured; it does not prove that what the camera saw was real.
        </Note>
      </>
    ),
  },
  {
    slug: 'architecture',
    group: 'Architecture',
    title: 'System architecture',
    summary: 'The services, how they communicate and what each is responsible for.',
    body: (
      <>
        <H2>Services</H2>
        <Table
          head={['Service', 'Responsibility']}
          rows={[
            ['Camera app', 'Capture, liveness check, hardware signing, QR display, offline queue.'],
            ['Hardware web3 service', 'Verifies signed packets, stores the photo, mints on each configured chain, creates the claim and retries stuck work.'],
            ['Public server', 'Claims and QR pages, the verification and search API, forensics, the Arkiv mirror and license recording.'],
            ['Owner portal', 'The website: landing page, claim pages, dashboard, verification, licensing and docs.'],
            ['Mobile app', 'Remote shutter, archive and verification on a phone.'],
            ['Contracts', 'Device registry, photo tokens and licenses.'],
            ['Embedding service', 'Optional service that computes image embeddings for similar-photo search.'],
          ]}
        />

        <H2>Capture to claim</H2>
        <Code>{`Camera ── sign packet ──► Web3 service
                           │ verify signature, age, nonce, device
                           ├──► Storage (Lighthouse or 0G)
                           ├──► Contracts (mintOriginal on each chain)
                           └──► Public server ── create claim ──► Database
                                                └─ mirror ──────► Arkiv
Camera ◄── claim id ── Public server   (shown as a QR code)`}</Code>

        <H2>Verification</H2>
        <Code>{`Browser hashes the photo
  ├─► Arkiv (public endpoint) ── exact match? ──► Authentic original
  └─► Public server ── layers: exact → perceptual → semantic
                        └─► compare with original ──► Altered copy + changes`}</Code>

        <H2>Resilience</H2>
        <ul>
          <li>Every outside feature sits behind a configuration flag and has a fallback, so a capture does not fail because a third party is down.</li>
          <li>Storage falls back from 0G to Lighthouse, or the reverse.</li>
          <li>Claim lookup falls back from Arkiv to the database.</li>
          <li>If the Arc mint fails, the primary chain mint still completes and the Arc mint is queued and retried.</li>
          <li>Verification of an exact copy works without the Veris server, because the browser can query Arkiv directly.</li>
        </ul>

        <H2>Technology</H2>
        <Table
          head={['Layer', 'Technology']}
          rows={[
            ['Camera', 'Python, Kivy, Picamera2, OpenCV'],
            ['Backend', 'Node.js (Express), ethers, SQLite'],
            ['Public server', 'Node.js (Express), Postgres, sharp'],
            ['Storage', 'Lighthouse (IPFS and Filecoin), 0G Storage'],
            ['Chains', 'Ethereum Sepolia, Arc testnet'],
            ['Public records', 'Arkiv'],
            ['Contracts', 'Solidity 0.8.24, Foundry, OpenZeppelin'],
            ['Web', 'React, Vite, Privy, Wagmi, Viem'],
            ['Mobile', 'Expo, React Native'],
          ]}
        />
      </>
    ),
  },
  {
    slug: 'trust-model',
    group: 'Architecture',
    title: 'Trust model and security',
    summary: 'What Veris guarantees, what it assumes and where its limits are.',
    body: (
      <>
        <H2>What is guaranteed</H2>
        <ul>
          <li>A registered device signed a packet containing the photo’s exact hash.</li>
          <li>The packet was fresh and its nonce unique when the backend accepted it.</li>
          <li>The photo bytes stored equal the bytes that were signed.</li>
          <li>A token for the photo was minted from a device that is active in the registry.</li>
          <li>The companion hash of the minting camera can be set once and only by that camera.</li>
        </ul>

        <H2>What you are trusting</H2>
        <Table
          head={['Assumption', 'Consequence if it fails']}
          rows={[
            ['The device key has not been extracted from the camera', 'Someone could sign arbitrary images as that camera. Revoke the device in the registry.'],
            ['The registrar adds only genuine cameras', 'A fake device could be registered and mint.'],
            ['Veris wrote the public records', 'A match means “Veris registered this exact file”, backed by the device signature and the on-chain mint. Records are written by a Veris wallet.'],
            ['The liveness model is right', 'A staged scene could be marked real. Liveness is a signal, not a proof.'],
          ]}
        />

        <H2>Attacks and defenses</H2>
        <Table
          head={['Attack', 'Defense']}
          rows={[
            ['Replaying an old capture', 'Each packet has a timestamp and a one-time nonce; stale or reused packets are rejected.'],
            ['Swapping the photo after signing', 'The signed image hash must equal the SHA-256 of the uploaded bytes.'],
            ['Using an unknown camera', 'Minting requires the device to be active in the on-chain registry.'],
            ['Photographing a screen or a print', 'The liveness check flags it as fake.'],
            ['Editing a sealed photo and passing it off', 'The edited file’s hash does not match; Verify reports an altered copy and lists what changed.'],
            ['Directing license payments to someone else', 'The license contract pays only a wallet that holds the original token.'],
          ]}
        />

        <H2>What Veris does not do</H2>
        <ul>
          <li>It does not prove that what the camera saw was truthful, unstaged or complete.</li>
          <li>There are no zero-knowledge proofs in the current release.</li>
          <li>A result of “no match” is not evidence that a photo is fake.</li>
          <li>The description of changes between an original and an altered copy is a best-effort assessment.</li>
        </ul>

        <H2>Reporting a vulnerability</H2>
        <p>Veris is a prototype running on test networks. If you find a security problem, please report it privately to the maintainers rather than opening a public issue.</p>
      </>
    ),
  },
  {
    slug: 'privacy-data',
    group: 'Architecture',
    title: 'Data, privacy and retention',
    summary: 'Where data is stored, who can see it, and how long it is kept.',
    body: (
      <>
        <H2>Where data lives</H2>
        <Table
          head={['Data', 'Location']}
          rows={[
            ['The photo', '0G Storage or Lighthouse (IPFS and Filecoin)'],
            ['Ownership and device identity', 'ERC-1155 and the device registry on Sepolia and Arc'],
            ['Licenses', 'The license contract on Arc, paid in USDC'],
            ['Permanent claim record', 'A Postgres database on the public server'],
            ['Public, queryable copy', 'Arkiv'],
            ['Device private key', 'Only on the camera'],
          ]}
        />

        <H2>Privacy when verifying</H2>
        <ul>
          <li><b>Exact copy.</b> The photo is hashed in your browser and only the hash is looked up on Arkiv’s public endpoint. Veris does not receive the photo or the query. Arkiv’s endpoint can see your IP address and the hash.</li>
          <li><b>Edited copy.</b> If there is no exact match, the photo is uploaded to the Veris server for analysis, and the server sends it to an AI provider (OpenAI) to describe it and compare it with the original. Do not upload photos you are not comfortable sharing in this way.</li>
          <li>Fonts are bundled and QR codes are drawn in the browser, so no third party sees page visits or claim links. The page includes no analytics or trackers.</li>
        </ul>

        <H2>Public by design</H2>
        <p>Claim records are meant to be publicly verifiable. A claim exposes the device, time, chain and storage references and, where available, the capture location. Photos on public storage can be retrieved by anyone with the link. Do not seal photos you intend to keep private.</p>

        <H2>Retention</H2>
        <ul>
          <li>Pending records on Arkiv expire after 24 hours, so abandoned captures disappear.</li>
          <li>Minted records live as long as Arkiv allows, capped at about 180 days.</li>
          <li>License records expire exactly when the license term ends.</li>
          <li>Older photos remain in the database and can still be verified through the Veris server, but not through the direct browser check.</li>
        </ul>
      </>
    ),
  },
]
