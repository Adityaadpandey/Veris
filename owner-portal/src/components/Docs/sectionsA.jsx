import { Badge, Callout, Code, H3, Steps, Table } from './parts'

const VERIFY = 'https://veris.live/claim'

export const GETTING_STARTED = [
  {
    id: 'overview',
    title: 'Overview',
    keywords: 'introduction what is veris authenticity proof photo deepfake',
    body: (
      <>
        <p className="vd-lead">
          Veris (Visual Evidence and Reality Integrity System) proves that a photo is real at the moment it is taken.
          A small device clips onto the camera or phone you already own. When the shutter fires, Veris signs the photo
          with a key tied to the hardware, stores it, and files a permanent public record. Anyone can later check a
          photo against that record, with no account.
        </p>

        <H3>The problem</H3>
        <p>
          Camera metadata can be rewritten with free tools, and most platforms strip it on upload. "I was there" is one
          person's word, and AI detectors only offer a guess. A guess does not settle an argument, so the discussion
          stops being about what the photo shows.
        </p>

        <H3>The approach</H3>
        <p>Veris moves the proof to the moment of capture instead of trying to detect fakes afterwards:</p>
        <ul>
          <li><strong>Seal at the shutter.</strong> The device hashes the image and signs the hash with a key derived from the device's hardware identity.</li>
          <li><strong>Record publicly.</strong> The image and its metadata go to IPFS and Filecoin, and an ERC-1155 token is minted on Ethereum Sepolia carrying the hash and signature.</li>
          <li><strong>Check by lookup.</strong> Verification is a repeatable lookup: hash the file, compare it to the record, and check the signature against a registered device.</li>
        </ul>
        <p>
          The result is deliberately asymmetric. A <em>match</em> means the file is the one that left a registered Veris
          device. <em>No record</em> means Veris cannot vouch for the file. It does not mean the file is fake.
        </p>

        <H3>The Veris devices</H3>
        <Table
          head={['Device', 'Fits', 'Status']}
          rows={[
            ['Standalone', 'The reference unit: a Raspberry Pi camera with its own screen. Runs the whole pipeline end to end.', <Badge key="a" kind="ok">Operational</Badge>],
            ['Hotshoe', 'Slides into the hot shoe of a DSLR or mirrorless camera and fires from the shoe\'s centre X-sync pin.', <Badge key="b" kind="plan">In design</Badge>],
            ['Clip-on', 'Clips onto the back of almost any phone, powered by USB-C and paired over Bluetooth.', <Badge key="c" kind="plan">In design</Badge>],
          ]}
        />

        <Callout kind="status" title="Implemented vs planned">
          These docs separate what the code in this repository does today from what is designed or planned. Look for
          the <Badge kind="ok">Implemented</Badge> and <Badge kind="plan">Planned</Badge> badges. The{' '}
          <a href="#status-and-roadmap">Status and roadmap</a> section lists every gap in one place.
        </Callout>

        <Callout kind="note" title="Naming">
          Veris grew out of an earlier project called Veris. Several identifiers in the code still use the old name,
          for example the <code>VerisERC1155</code> contract, <code>veris.db</code> and the <code>veris.service</code> unit.
          They refer to the same system.
        </Callout>
      </>
    ),
  },
  {
    id: 'quickstart',
    title: 'Quickstart',
    keywords: 'start verify photo owner portal sign in run locally',
    body: (
      <>
        <H3>Verify a photo</H3>
        <p>You need nothing but the photo file.</p>
        <Steps>
          <li>Open <a href={VERIFY} target="_blank" rel="noopener noreferrer">veris.live/claim</a>.</li>
          <li>Drop in the photo you want to check.</li>
          <li>Read the verdict. See <a href="#verification-verdicts">Verification verdicts</a> for what each result means.</li>
        </Steps>
        <p>
          The photographer's name and location are not part of the check. Prototype claim pages can still show GPS and
          the device ID, which is a known gap (see <a href="#threat-model">Threat model</a>).
        </p>

        <H3>Use the owner portal</H3>
        <p>
          The owner portal is for people who own a Veris device. It shows the photos your device has captured and how
          far each one has progressed (saved, uploaded, minted).
        </p>
        <Steps>
          <li>Open the owner portal and choose <strong>Owner portal</strong>. The dashboard asks you to sign in.</li>
          <li>Sign in with a wallet, email or SMS. If you sign in without a wallet, Privy creates an embedded wallet for you.</li>
          <li>Browse your captures, check device status, and open any photo's claim page.</li>
        </Steps>

        <H3>Run the whole stack locally</H3>
        <p>For a developer machine. Details and environment variables are in <a href="#setup">Setup and deployment</a>.</p>
        <Code lang="bash" title="Terminal">{`
# 1. Owner portal (React + Vite) on http://localhost:3000
cd owner-portal && npm install && npm run dev

# 2. Hardware web3 service (Node.js) on :5000
cd hardware-web3-service && npm install && npm run dev

# 3. Public claim server (Node.js) on :5001
cd public-server && npm install && npm run dev

# 4. Optional AI services (Python)
cd ai-embedding-service && pip install -r requirements.txt   # /embed
cd ai-model && pip install -r requirements.txt               # /api/verify
`}</Code>
      </>
    ),
  },
]

export const CONCEPTS = [
  {
    id: 'how-it-works',
    title: 'How it works',
    keywords: 'pipeline capture hash sign ipfs filecoin mint claim qr edition flow',
    body: (
      <>
        <p className="vd-lead">
          From shutter to verifiable record, the pipeline has three stages: physical capture, cryptographic record, and
          public verification.
        </p>

        <H3>Stage 1: Physical capture</H3>
        <Steps>
          <li><strong>Register the device (once, at boot).</strong> The camera derives its identity from hardware identifiers and asks the backend to register it on the <code>DeviceRegistry</code> contract. If it is already registered but inactive, the backend reactivates it.</li>
          <li><strong>Capture.</strong> The shutter fires. The standalone unit takes a 1920×1080 JPEG with Picamera2.</li>
          <li><strong>Hash and sign.</strong> The device computes <code>image_hash = SHA-256(jpeg)</code> and signs it with its secp256k1 key.</li>
        </Steps>

        <H3>Stage 2: Cryptographic record</H3>
        <Steps>
          <li><strong>Upload.</strong> The device sends the image, its hash, the signature, the camera ID and device address to <code>POST /api/images/upload</code> on the hardware web3 service.</li>
          <li><strong>Store.</strong> The service uploads the image to IPFS/Filecoin through Lighthouse, receives an image CID, builds an ERC-1155 metadata JSON (image URI, device address, device ID, camera ID, image hash, signature, timestamp), and uploads that too for a metadata CID.</li>
          <li><strong>Create a claim.</strong> The service asks the public server to create a claim with a fresh <code>claim_id</code> (a UUID). The public server returns the claim URL that goes into the QR code.</li>
          <li><strong>Certify.</strong> The service calls <code>mintOriginal</code> on <code>VerisERC1155</code>. The contract checks that the calling device is registered and active, then mints a new token to the owner wallet and emits <code>TokenMinted</code>.</li>
          <li><strong>Enrich.</strong> In the background the public server computes perceptual hashes of the image and, when configured, an AI description and embedding. These power search and tamper detection. They are informational and not part of the proof.</li>
        </Steps>

        <H3>Stage 3: Public verification</H3>
        <Steps>
          <li><strong>Show the QR code.</strong> The camera displays a QR code that points at the claim page.</li>
          <li><strong>Verify.</strong> Anyone can open the claim page or upload a photo at <a href={VERIFY} target="_blank" rel="noopener noreferrer">veris.live/claim</a>. The checks are described in <a href="#verifying-photos">Verifying photos</a>.</li>
        </Steps>

        <H3>End-to-end sequence</H3>
        <Code lang="text" title="Shutter to wallet">{`
Photographer      Camera app        web3 service        Lighthouse     Public server     Sepolia
     |  press shutter  |                 |                  |               |              |
     |---------------->| JPEG            |                  |               |              |
     |                 | sha256 + sign   |                  |               |              |
     |                 |--- upload ----->|                  |               |              |
     |                 |                 |--- image ------->| CID           |              |
     |                 |                 |--- metadata ---->| CID           |              |
     |                 |                 |--- create-claim ------------->   | claim_id     |
     |                 |                 |--- mintOriginal ------------------------------->| tokenId
     |                 |                 |--- update-claim-status (open) -->|               |
     |                 |<-- claimUrl ----|                  |               |              |
     |  QR on screen   |                 |                  |               |              |
`}</Code>
        <p>The prototype completes this in under 60 seconds from shutter to minted claim. Most of that time is the upload and the blockchain confirmation.</p>

        <H3>Claiming editions</H3>
        <p>
          The original token stays with the owner wallet. Other people, such as someone in the photo, can claim an
          edition of it. The edition worker is a loop in the web3 service that runs every 10 seconds.
        </p>
        <Steps>
          <li>The recipient scans the QR code and opens <code>/claim/:claim_id</code> on the public server.</li>
          <li>The recipient submits a wallet address. The public server stores an edition request with status <code>pending</code>.</li>
          <li>The worker fetches pending requests (<code>GET /get-pending-edition-requests</code>), validates the address, marks the request <code>processing</code>, and calls <code>mintEdition(recipient, originalTokenId)</code>.</li>
          <li>On success the request becomes <code>completed</code> with the transaction hash and edition token ID. The claim page picks this up on its next poll and shows the minted state.</li>
        </Steps>
        <p>
          Editions copy the original's metadata (image CID, hash, signature, device) and point back to it through{' '}
          <code>originalTokenId</code>, so every edition carries the same proof. An original can set a maximum number of
          editions; <code>0</code> means unlimited.
        </p>

        <H3>Offline and retries</H3>
        <p>
          A claim can fail to be created if the camera's network connection is not up yet, for example while Bluetooth
          tethering is still coming online. The web3 service retries in the request, and a background sweep
          (<code>AUTO_RETRY_INTERVAL_MS</code>, default 60 seconds) picks up any image stuck short of the <code>minted</code> status.
          A late upload does not weaken the proof, because the hash and signature were fixed at capture.
        </p>
        <Badge kind="ok">Implemented</Badge>
      </>
    ),
  },
  {
    id: 'core-concepts',
    title: 'Core concepts',
    keywords: 'image hash signature device identity claim original edition secp256k1 keccak glossary',
    body: (
      <>
        <H3>Image hash</H3>
        <p>
          The image hash is the SHA-256 of the exact bytes of the JPEG. Change a single pixel and the hash changes
          completely. A byte-for-byte match with the recorded hash is the strongest possible evidence that a file is
          the one that left the camera.
        </p>

        <H3>Device identity</H3>
        <p>Each camera has a secp256k1 keypair derived from hardware identifiers:</p>
        <Code lang="text">{`
private_key = SHA256( cpu_serial || mac_address || machine_id || camera_id || salt )
address     = "0x" + last 20 bytes of keccak256(public_key)
salt        = /boot/.device_salt   (backup: ~/.veris/.device_salt_backup)
`}</Code>
        <p>
          The address is the device's identity on-chain. The key is derived on the device and is used to sign image
          hashes. See <a href="#threat-model">Threat model</a> for how this compares to storing keys in a secure element.
        </p>

        <H3>Signature</H3>
        <p>
          The device signs the image hash. Anyone can recover the signer address from the hash and the signature (the
          backend uses <code>ethers.verifyMessage</code>) and compare it with the registered device address. Only the device
          holding the private key can produce a signature that recovers to its address.
        </p>

        <H3>Device registry</H3>
        <p>
          <code>DeviceRegistry</code> is an on-chain list of devices allowed to mint. The photo contract only accepts
          <code> mintOriginal</code> from a registered, active device. This is what ties a token to genuine hardware rather
          than to any wallet.
        </p>

        <H3>Claim</H3>
        <p>
          A claim is the public server's record for one captured photo. It has a <code>claim_id</code> (UUID), the image and
          metadata CIDs, the hash and signature, the device and camera IDs, and a status that moves from <code>pending</code>
          to <code>open</code> once the original token is minted.
        </p>

        <H3>Original and edition</H3>
        <Table
          head={['', 'Original', 'Edition']}
          rows={[
            ['Minted by', 'The device, to the owner wallet', 'The device, to a recipient who claimed it'],
            ['Contract call', <code key="1">mintOriginal</code>, <code key="2">mintEdition / batchMintEditions</code>],
            ['Carries', 'Image CID, hash, signature, device, timestamp', 'A copy of the original\'s metadata plus originalTokenId'],
            ['Limit', 'maxEditions (0 = unlimited)', 'Counted against the original\'s limit'],
          ]}
        />

        <H3>Glossary</H3>
        <Table
          head={['Term', 'Meaning']}
          rows={[
            ['CID', 'Content identifier. An IPFS address derived from the content itself, so it cannot point at different bytes.'],
            ['ERC-1155', 'The Ethereum token standard Veris uses for originals and editions.'],
            ['Sepolia', 'An Ethereum test network. Everything in the prototype runs here.'],
            ['Lighthouse', 'The service used to pin files to IPFS and Filecoin.'],
            ['Privy', 'Authentication and embedded-wallet provider used by the owner portal.'],
            ['pHash / dHash / aHash', 'Perceptual hashes: short fingerprints that change a little when an image changes a little.'],
            ['SSIM', 'Structural similarity index, a measure of how alike two images look.'],
            ['Companion capture', 'A second image taken alongside the main one, used as an independent witness.'],
          ]}
        />
      </>
    ),
  },
]
