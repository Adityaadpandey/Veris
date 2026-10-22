import { Badge, Callout, Code, Endpoint, H3, Table } from './parts'

export const OPERATIONS = [
  {
    id: 'setup',
    title: 'Setup and deployment',
    keywords: 'install environment variables env npm pip foundry render ngrok systemd raspberry pi deploy',
    body: (
      <>
        <p className="vd-lead">
          Each service has its own environment file. Node.js services use ES modules, so use <code>import</code> and{' '}
          <code>export</code>, not <code>require</code>, in the web3 service and the portal. The public server is CommonJS.
        </p>

        <H3>Prerequisites</H3>
        <ul>
          <li>Node.js 18 or newer and npm (or pnpm).</li>
          <li>Python 3 for the camera app and AI services.</li>
          <li>Foundry (<code>forge</code>) for the contracts.</li>
          <li>A Sepolia RPC URL and a funded Sepolia account for the device.</li>
          <li>A Lighthouse API key, a Privy app, and a Postgres database for the public server.</li>
        </ul>

        <H3>1. Contracts</H3>
        <Code lang="bash">{`
cd contracts
forge build
forge test
forge test --match-test <testName>   # run a single test
`}</Code>
        <p>
          Deployment scripts are in <code>contracts/script/</code>: <code>Deploy.s.sol</code> deploys the registry and the token,{' '}
          <code>DeployAndVerify.s.sol</code> also verifies them, and <code>RegisterDevice.s.sol</code> registers a device. Solidity
          0.8.24 with the optimizer on. Record the deployed addresses for the web3 service.
        </p>

        <H3>2. Hardware web3 service</H3>
        <Code lang="bash">{`
cd hardware-web3-service
cp .env.example .env     # then fill in the values below
npm install
npm run dev              # nodemon; use "npm start" in production
`}</Code>
        <Table
          wide
          head={['Variable', 'Purpose']}
          rows={[
            [<code key="1">PORT</code>, 'Port to listen on. Default 5000.'],
            [<code key="2">SEPOLIA_RPC_URL / RPC_URL</code>, 'JSON-RPC endpoint for Ethereum Sepolia.'],
            [<code key="3">DEVICE_REGISTRY_ADDRESS</code>, 'Address of the deployed DeviceRegistry.'],
            [<code key="4">VERIS_ERC1155_ADDRESS</code>, 'Address of the deployed VerisERC1155.'],
            [<code key="5">DEPLOYMENT_JSON_PATH</code>, 'Optional path to a deployment.json holding the addresses.'],
            [<code key="6">DEVICE_PRIVATE_KEY</code>, 'Private key of the device account that sends transactions. If unset, the service reads the key from the Pi\'s hardware identity through export_key.py.'],
            [<code key="7">PYTHON_PATH</code>, 'Python executable used to run export_key.py. Default python3.'],
            [<code key="8">OWNER_WALLET_ADDRESS</code>, 'Wallet that receives each original token.'],
            [<code key="9">LIGHTHOUSE_API_KEY</code>, 'API key for Lighthouse uploads.'],
            [<code key="10">CLAIM_SERVER_URL</code>, 'Base URL of the public claim server.'],
            [<code key="11">CLAIM_CLIENT_TIMEOUT</code>, 'Timeout in ms for calls to the claim server. Default 30000.'],
            [<code key="12">DEVICE_API_URL</code>, 'Public URL of this service. The public server calls it back to verify claims, so it must be reachable (for example through ngrok).'],
            [<code key="13">PRIVY_APP_ID / PRIVY_APP_SECRET</code>, 'Privy credentials, needed for session-signer minting.'],
            [<code key="14">MIN_ETH_BALANCE</code>, 'Balance threshold below which /api/balance reports low funds. Default 0.01.'],
            [<code key="15">DATABASE_PATH</code>, 'Location of the SQLite database file.'],
            [<code key="16">CAPTURES_PATH</code>, 'Folder where captured images are stored.'],
            [<code key="17">AUTO_RETRY_INTERVAL_MS</code>, 'How often to sweep for images stuck before minted. Default 60000.'],
          ]}
        />
        <Callout kind="warn" title="Keep keys out of git">
          <code>DEVICE_PRIVATE_KEY</code>, <code>LIGHTHOUSE_API_KEY</code> and <code>PRIVY_APP_SECRET</code> are secrets. Keep them in{' '}
          <code>.env</code>, which must not be committed.
        </Callout>

        <H3>3. Public claim server</H3>
        <Code lang="bash">{`
cd public-server
cp .env.example .env
npm install
npm run dev        # or: npm start
npm test           # node --test
npm run backfill   # compute hashes and embeddings for existing claims
npm run calibrate  # calibrate the tamper thresholds
`}</Code>
        <Table
          wide
          head={['Variable', 'Purpose']}
          rows={[
            [<code key="1">PORT</code>, 'Port to listen on.'],
            [<code key="2">CLAIM_SERVER_URL / FRONTEND_URL</code>, 'Public URLs used to build claim links. Must not be localhost.'],
            [<code key="3">CORS_ORIGIN</code>, 'Allowed origin for browsers.'],
            [<code key="4">DATABASE_URL</code>, 'Postgres connection string, including sslmode=require.'],
            [<code key="5">LIGHTHOUSE_GATEWAY</code>, 'IPFS gateway used to fetch images.'],
            [<code key="6">OPENAI_API_KEY, OPENAI_VISION_MODEL, OPENAI_EMBED_MODEL, OPENAI_EMBED_DIM, OPENAI_TIMEOUT</code>, 'Optional AI descriptions and semantic embeddings.'],
            [<code key="7">SEARCH_MIN_SCORE, SEARCH_VISUAL_WEIGHT</code>, 'Similar-photo cutoff and the visual-versus-content blend (defaults 0.7 and 0.7).'],
            [<code key="8">PHASH_MAX_DISTANCE</code>, 'Fallback structural tolerance (0 to 64). Default 10.'],
            [<code key="9">TAMPER_RECOMPRESSED_MAX, TAMPER_STRUCTURAL_MAX, TAMPER_POSSIBLE_MAX</code>, 'Tamper tier thresholds. Defaults 0.05, 0.15625 and 0.24.'],
            [<code key="10">BACKFILL_DELAY_MS</code>, 'Delay between images during backfill. Default 1500.'],
            [<code key="11">ADMIN_TOKEN</code>, 'Shared secret for the backfill route (X-Admin-Token header). Unset disables the route.'],
            [<code key="12">CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_COMPANION_FOLDER</code>, 'Storage for companion photos.'],
            [<code key="13">ENABLE_CLIP, CLIP_MODEL_ID, CLIP_MATCH_MIN_SCORE</code>, 'Optional on-server CLIP matching.'],
          ]}
        />

        <H3>4. Owner portal</H3>
        <p>Create <code>owner-portal/.env</code> with at least the Privy app ID (see <a href="#owner-portal">Owner portal</a> for every variable), then run <code>npm run dev</code>.</p>
        <Code lang="env">{`
VITE_PRIVY_APP_ID=your-privy-app-id
VITE_BACKEND_URL=http://localhost:5000
VITE_CLAIM_SERVER_URL=http://localhost:5001
`}</Code>

        <H3>5. Camera (Raspberry Pi)</H3>
        <Code lang="bash">{`
cd hardware-camera-app
./install.sh               # installs dependencies and services (INSTALL_DIR defaults to /home/pi/veris)
./run_camera_app.sh        # start the Kivy app
`}</Code>
        <p>
          The Pi must be reachable from <code>DEVICE_API_URL</code>'s service. To expose the web3 service from a development
          machine, tunnel it:
        </p>
        <Code lang="bash">{`ngrok http 5000`}</Code>
        <p>
          For unattended use, systemd units are provided: <code>veris.service</code> (starts the app through pm2) and{' '}
          <code>headless-camera@.service</code> / <code>hardware-web3-service@.service</code> (instance units named by user).
        </p>

        <H3>6. AI services (optional)</H3>
        <Code lang="bash">{`
cd ai-embedding-service && pip install -r requirements.txt && uvicorn main:app --port 5002
cd ai-model             && pip install -r requirements.txt && uvicorn api:app --port 8000
`}</Code>

        <H3>Deploying</H3>
        <ul>
          <li><strong>Public server:</strong> deploy to Render (or similar) with a Postgres database and set <code>CLAIM_SERVER_URL</code> and <code>FRONTEND_URL</code> to its public address.</li>
          <li><strong>Owner portal:</strong> <code>npm run build</code> produces static files in <code>dist/</code>. Serve them from any static host with a fallback to <code>index.html</code> so client-side routes such as <code>/docs</code> work.</li>
          <li><strong>Web3 service and camera:</strong> run on the device or a host on the same network, with <code>DEVICE_API_URL</code> pointing at a public address.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'hardware-web3-service-api',
    title: 'Web3 service API',
    keywords: 'api endpoints rest upload register verify mint retry privy session signer express 5000',
    body: (
      <>
        <p className="vd-lead">
          The hardware web3 service (<code>hardware-web3-service/server.js</code>, default port 5000) is what the camera and the
          owner portal talk to. All bodies are JSON unless noted.
        </p>

        <Endpoint method="GET" path="/health">Liveness check. Also available at <code>/status</code>.</Endpoint>
        <Endpoint method="GET" path="/api/status">Service and device status, including registration state and balance.</Endpoint>
        <Endpoint method="GET" path="/api/balance">
          Balance of the device account on Sepolia. Takes an optional <code>address</code> query parameter. Compared against{' '}
          <code>MIN_ETH_BALANCE</code>.
        </Endpoint>

        <H3>Devices</H3>
        <Endpoint method="POST" path="/api/device/register">Registers a device on <code>DeviceRegistry</code>.</Endpoint>
        <Endpoint method="POST" path="/api/device/ensure-registered">
          Idempotent version used at camera boot. Registers the device if needed, or reactivates it if it was
          deactivated, and caches the result locally. The body carries <code>deviceAddress</code>, <code>publicKey</code>,{' '}
          <code>deviceId</code>, <code>cameraId</code>, <code>model</code> and <code>firmwareVersion</code>. The response reports{' '}
          <code>registered</code>, <code>activated</code> and the transaction hashes.
        </Endpoint>
        <Endpoint method="POST" path="/api/device/update">Updates a registered device's firmware version or active flag.</Endpoint>

        <H3>Images</H3>
        <Endpoint method="POST" path="/api/images/upload">
          <p>
            The main capture endpoint. Multipart form data with the file in <code>image</code> (JPEG, PNG or WebP, up to
            50 MB) and fields <code>imageHash</code>, <code>signature</code>, <code>cameraId</code>, <code>deviceAddress</code> and optional
            location fields.
          </p>
          <p>
            It saves the image, uploads it and its metadata to Lighthouse, creates the claim, mints the original token and
            returns the claim details, including <code>imageId</code>, <code>claimId</code>, <code>claimUrl</code>, <code>qrCodeUrl</code>,{' '}
            <code>filecoinCid</code> and <code>metadataCid</code>.
          </p>
        </Endpoint>
        <Endpoint method="GET" path="/api/images/list">Lists captured images. Optional <code>status</code> filter (<code>saved</code>, <code>uploaded</code> or <code>minted</code>).</Endpoint>
        <Endpoint method="GET" path="/api/images/:id">One image with its CIDs, claim and token details.</Endpoint>
        <Endpoint method="GET" path="/api/images/:id/photo">The image file itself.</Endpoint>

        <H3>Verification</H3>
        <Endpoint method="GET" path="/api/verify/:claimId">
          <p>Runs the four checks for a claim and returns the result. The public server calls this when a claim page is open.</p>
          <Code lang="json" title="Response">{`
{
  "success": true,
  "claimId": "762dc7c6-08c0-45ee-8400-453ea9dec149",
  "imageHash": "9f3a…c1b2",
  "deviceAddress": "0x…",
  "cameraId": "…",
  "timestamp": "…",
  "tokenId": 148,
  "txHash": "0x…",
  "checks": {
    "imageFound": true,
    "deviceRegistered": true,
    "signatureValid": true,
    "nftMinted": true
  },
  "verified": true
}
`}</Code>
          <p>Returns <code>404</code> if the claim is not on this device.</p>
        </Endpoint>
        <Endpoint method="GET" path="/api/claims/check">Checks the status of a claim with the <code>claim_id</code> query parameter.</Endpoint>

        <H3>Minting and retries</H3>
        <Endpoint method="POST" path="/api/mint-pending">Mints originals for images that were uploaded and have a claim but no token yet.</Endpoint>
        <Endpoint method="POST" path="/api/retry-pending">Retries any image stuck short of <code>minted</code>. The owner dashboard calls this from its retry button.</Endpoint>

        <H3>Privy</H3>
        <Endpoint method="POST" path="/api/privy/create-session-signer">Creates a Privy session signer for a wallet. Body: <code>walletAddress</code>, <code>userId</code>.</Endpoint>
        <Endpoint method="POST" path="/api/privy/mint-with-signer">
          Encodes the <code>mintOriginal</code> call and submits it through Privy's session-signer API with gas sponsorship, for
          owner flows that hold a session signer.
        </Endpoint>

        <Callout kind="note">
          Semantic image search is not served here. It moved to the public server (<code>POST /api/search</code>).
        </Callout>
      </>
    ),
  },
  {
    id: 'public-server-api',
    title: 'Public server API',
    keywords: 'claim server api create-claim edition request search similar companion enrich backfill metadata render 5001',
    body: (
      <>
        <p className="vd-lead">
          The public claim server (<code>public-server/server.js</code>) hosts the claim pages and the edition queue, and runs
          search and tamper checks.
        </p>

        <H3>Claims</H3>
        <Endpoint method="POST" path="/create-claim">
          Called by the web3 service. The body carries <code>claim_id</code>, the image <code>cid</code> and <code>metadata_cid</code>,{' '}
          <code>device_id</code>, <code>camera_id</code>, <code>image_hash</code>, <code>signature</code>, <code>device_address</code>, optional
          location and <code>device_api_url</code>. Returns the claim URL. Starts background enrichment.
        </Endpoint>
        <Endpoint method="POST" path="/update-claim-status">Body: <code>claim_id</code>, <code>status</code>, <code>token_id</code>, <code>tx_hash</code>. The web3 service sets the status to <code>open</code> after minting.</Endpoint>
        <Endpoint method="GET" path="/claim/:claim_id">The claim page, rendered server side. Shows the photo with IPFS gateway fallbacks and the verification badge.</Endpoint>
        <Endpoint method="GET" path="/check-claim">Status of a claim. Query: <code>claim_id</code>. The camera polls this about every 5 seconds.</Endpoint>
        <Endpoint method="GET" path="/verify-claim/:claim_id">Proxies the device's <code>/api/verify/:claimId</code> when the claim has a <code>device_api_url</code>.</Endpoint>
        <Endpoint method="GET" path="/claims/by-wallet/:address">Claims for a wallet.</Endpoint>
        <Endpoint method="GET" path="/claims/by-camera/:camera_id">Claims captured by a camera.</Endpoint>
        <Endpoint method="GET" path="/api/metadata/:claim_id">The ERC-1155 metadata JSON for a claim.</Endpoint>
        <Endpoint method="GET" path="/api/image/:cid">Serves an image by CID through the configured gateway.</Endpoint>
        <Endpoint method="POST" path="/complete-claim">Marks a claim complete with <code>claim_id</code>, <code>tx_hash</code> and <code>token_id</code>.</Endpoint>

        <H3>Editions</H3>
        <Endpoint method="POST" path="/claim/:claim_id/submit">A recipient submits their <code>wallet_address</code> to claim an edition. Creates an edition request.</Endpoint>
        <Endpoint method="POST" path="/create-edition-request">Body: <code>claim_id</code>, <code>wallet_address</code>.</Endpoint>
        <Endpoint method="GET" path="/get-pending-edition-requests">
          Pending requests for claims that are open and have a token. Takes <code>limit</code> (the worker asks for 50). The web3
          service's worker polls this every 10 seconds.
        </Endpoint>
        <Endpoint method="POST" path="/update-edition-request">Updates a request's status (<code>processing</code>, <code>completed</code>) with the transaction hash and token ID.</Endpoint>

        <H3>Search and similarity</H3>
        <Endpoint method="POST" path="/api/search">
          <p>Multipart with an <code>image</code> field (any image type). Returns a verdict.</p>
          <Code lang="json" title="Response (shape)">{`
{
  "success": true,
  "verdict": {
    "type": "authentic_original",   // or "altered_copy", "no_match"
    "claim_id": "…",
    "token_id": 148,
    "message": "Authentic original — byte-for-byte identical to the verified on-chain image.",
    "image_hash": "…",
    "claim_url": "https://…/claim/…"
  }
}
`}</Code>
          <p>The response may also include similar photos, forensic details and a non-authoritative AI hint.</p>
        </Endpoint>
        <Endpoint method="GET" path="/api/similar/:claim_id">Similar verified photos for a claim. Takes <code>limit</code> (default 4, maximum 12).</Endpoint>

        <H3>Companion capture</H3>
        <Endpoint method="POST" path="/api/companion/upload">Multipart upload of the phone's own photo (<code>mobile_image</code>) ahead of the claim existing.</Endpoint>
        <Endpoint method="POST" path="/api/claim/:claim_id/companion/link">Links an uploaded companion photo to its claim and scores it against the device image in the background.</Endpoint>

        <H3>Enrichment (admin)</H3>
        <Endpoint method="POST" path="/api/enrich/:claim_id">Computes hashes, description and embedding for one claim.</Endpoint>
        <Endpoint method="POST" path="/api/enrich/backfill">Enriches all claims. Requires the <code>X-Admin-Token</code> header matching <code>ADMIN_TOKEN</code>. <code>GET</code> on the same path reports progress.</Endpoint>
        <Endpoint method="GET" path="/health">Liveness check.</Endpoint>

        <H3>AI services</H3>
        <Endpoint method="POST" path="/embed">
          Embedding service (FastAPI). Multipart <code>image</code>. Returns <code>{'{ clip: [512 floats], phash: "…" }'}</code>: a normalised CLIP
          ViT-B/32 vector and an 8×8 perceptual hash. <code>GET /health</code> reports readiness.
        </Endpoint>
        <Endpoint method="POST" path="/api/verify">
          AI model service (FastAPI, default port 8000). Accepts an original and a suspect image and returns the per-signal
          scores and the fused verdict used by the authenticity-check page. <code>GET /health</code> reports readiness.
        </Endpoint>
      </>
    ),
  },
  {
    id: 'smart-contracts',
    title: 'Smart contracts',
    keywords: 'solidity DeviceRegistry VerisERC1155 mintOriginal mintEdition foundry sepolia events',
    body: (
      <>
        <p className="vd-lead">
          Two contracts in <code>contracts/src/</code>, built with Foundry on Solidity 0.8.24, deployed to Ethereum Sepolia.
        </p>

        <H3>DeviceRegistry</H3>
        <p>Keeps the list of devices permitted to mint.</p>
        <Table
          head={['Function', 'Description']}
          rows={[
            [<code key="1">registerDevice(...)</code>, 'Adds a device (address, public key, device ID, camera ID, model and firmware).'],
            [<code key="2">updateDevice(address, firmware, active)</code>, 'Updates the firmware version or the active flag.'],
            [<code key="3">deactivateDevice(address)</code>, 'Turns a device off, for example if it is lost or stolen.'],
            [<code key="4">isDeviceActive(address)</code>, 'Whether the device may mint.'],
            [<code key="5">getDevice(address)</code>, 'Returns the DeviceInfo struct.'],
            [<code key="6">getDeviceByDeviceId(id)</code>, 'Looks up an address by device ID.'],
            [<code key="7">getTotalDevices() / getAllDevices()</code>, 'Enumerates registered devices.'],
          ]}
        />
        <p>Events: <code>DeviceRegistered</code>, <code>DeviceUpdated</code>, <code>DeviceDeactivated</code>.</p>

        <H3>VerisERC1155</H3>
        <p>An ERC-1155 (with <code>Ownable</code>) that mints originals and editions and stores per-token metadata on-chain.</p>
        <Table
          head={['Function', 'Description']}
          rows={[
            [<code key="1">mintOriginal(to, ipfsHash, imageHash, signature, maxEditions)</code>, 'Callable only by an active registered device. Mints a new original token and stores its device, CIDs, hash, signature and timestamp. Returns the token ID.'],
            [<code key="2">mintEdition(to, originalTokenId)</code>, 'Mints an edition of an original. Fails if the token does not exist, is not an original, or has reached maxEditions.'],
            [<code key="3">batchMintEditions(to, originalTokenId, quantity)</code>, 'Mints several editions at once. Quantity must be greater than zero.'],
            [<code key="4">getTokenMetadata(tokenId)</code>, 'Returns the stored TokenMetadata struct.'],
            [<code key="5">getEditionCount(originalTokenId)</code>, 'Number of editions minted for an original (the original counts as one).'],
            [<code key="6">canDeviceMint(address)</code>, 'Convenience check against the registry.'],
            [<code key="7">setBaseURI(uri)</code>, 'Owner only. Changes the base URI.'],
            [<code key="8">uri(tokenId)</code>, 'Metadata URI for a token.'],
          ]}
        />
        <Code lang="solidity" title="TokenMetadata">{`
struct TokenMetadata {
    address deviceAddress;
    string  deviceId;
    string  ipfsHash;
    string  imageHash;
    string  signature;
    uint256 timestamp;
    uint256 maxEditions;      // 0 = unlimited
    bool    isOriginal;
    uint256 originalTokenId;
}
`}</Code>
        <p>Events: <code>TokenMinted(tokenId, deviceAddress, deviceId, ipfsHash, isOriginal)</code>, <code>EditionMinted(tokenId, originalTokenId, to)</code> and <code>BaseURIUpdated</code>.</p>
        <Callout kind="note">
          <code>mintEdition</code> does not itself check the registry. It only copies an existing original's metadata, so the
          proof an edition carries is the original's and is unchanged.
        </Callout>
      </>
    ),
  },
]

export const REFERENCE = [
  {
    id: 'security',
    title: 'Security and privacy',
    keywords: 'threat model attack tpm privacy zero-knowledge analog hole open problems keys',
    body: (
      <>
        <H3>What a verified result guarantees</H3>
        <ul>
          <li>The file is byte-identical to one hashed at capture. Editing it produces a different hash.</li>
          <li>The hash was signed by a key whose address is registered and active on <code>DeviceRegistry</code>.</li>
          <li>The record is public. Verifying needs only the photo and the public record, not Veris servers.</li>
        </ul>

        <H3 id="threat-model">Threat model</H3>
        <Table
          wide
          head={['Attack', 'What stops it', 'What remains']}
          rows={[
            ['Edit pixels after capture', 'The digest is on-chain, so any change fails the match.', 'Edits become new, unverified images.'],
            ['Forge a signature', 'Only the holder of the device key can sign. The signer must be a registered device.', 'Depends on how well the key is protected on the device (see below).'],
            ['Compromise the Veris servers', 'Servers cannot forge a device signature, and the signature check is repeatable by anyone.', 'Availability, not authenticity.'],
            ['Link a photo to its photographer', 'The design hides identity behind a zero-knowledge proof (planned).', 'Prototype claim pages still show GPS and device ID. Opt-in is planned.'],
            ['Photograph a screen showing a fake', 'Dual capture mitigates it.', 'The analog hole is open for every capture-side system.'],
          ]}
        />

        <H3>Key custody</H3>
        <Callout kind="warn" title="Today versus the target design">
          In the current code the device key is derived in software from hardware identifiers and a salt stored on the
          device. The target design keeps the signing key inside a TPM 2.0 chip so it never leaves the hardware. Until
          then, an attacker with root access to a device could extract the key. Treat prototype keys accordingly and
          revoke a device (<code>deactivateDevice</code>) if it is lost.
        </Callout>

        <H3>Privacy</H3>
        <ul>
          <li>Hashes and CIDs are public, as are the tokens. Anyone can see which device sealed a photo.</li>
          <li>Location, when sent, is IP-based and approximate.</li>
          <li>Planned: a zero-knowledge proof that a registered device signed the photo, so verifiers learn nothing about identity, GPS or the device serial.</li>
        </ul>

        <H3>AI output is informational</H3>
        <p>
          Descriptions, similarity scores and AI hints are clearly labelled and never part of the cryptographic proof. A
          detector that says "likely authentic" is a guess. A matching hash and valid signature are not.
        </p>
      </>
    ),
  },
  {
    id: 'status-and-roadmap',
    title: 'Status and roadmap',
    keywords: 'roadmap planned implemented limitations mainnet zk tpm synapse hotshoe esp32 courts section 63',
    body: (
      <>
        <p className="vd-lead">Everything on this page is stated against the code in this repository.</p>
        <Table
          wide
          head={['Capability', 'Status', 'Notes']}
          rows={[
            ['Standalone capture, hash and signature', <Badge key="1" kind="ok">Implemented</Badge>, 'Raspberry Pi with Picamera2 and a software secp256k1 key.'],
            ['Device registry and photo contract', <Badge key="2" kind="ok">Implemented</Badge>, 'On Ethereum Sepolia only.'],
            ['IPFS and Filecoin storage', <Badge key="3" kind="ok">Implemented</Badge>, 'Through Lighthouse.'],
            ['Claim pages, QR codes and edition claiming', <Badge key="4" kind="ok">Implemented</Badge>, 'Edition worker polls every 10 seconds.'],
            ['Upload check (original, altered copy, no match)', <Badge key="5" kind="ok">Implemented</Badge>, 'SHA-256 plus perceptual hashes.'],
            ['Companion capture', <Badge key="6" kind="ok">Demo quality</Badge>, 'Hash and SSIM consistency, not a proof.'],
            ['Reverse search and AI hints', <Badge key="7" kind="ok">Implemented</Badge>, 'Informational only.'],
            ['Hotshoe and Clip hardware', <Badge key="8" kind="plan">In design</Badge>, 'Spec and partial Bluetooth trigger code only.'],
            ['TPM 2.0 key custody', <Badge key="9" kind="plan">Planned</Badge>, 'Keys are software-derived today.'],
            ['Zero-knowledge proof of device signature', <Badge key="10" kind="plan">Planned</Badge>, 'vlayer and RISC Zero are the intended stack. No verifier contract is in the repository yet.'],
            ['Filecoin deals through Synapse SDK', <Badge key="11" kind="plan">Planned</Badge>, 'Lighthouse is used today.'],
            ['Multi-signal check wired into the pipeline', <Badge key="12" kind="plan">Planned</Badge>, 'ai-model exists and powers the authenticity-check page, but the capture pipeline does not call it.'],
            ['Mainnet or layer 2', <Badge key="13" kind="plan">Planned</Badge>, 'Cost and finality are still to be measured.'],
            ['Factory key provisioning and revocation registry', <Badge key="14" kind="plan">Planned</Badge>, 'Process and registry are not yet specified.'],
          ]}
        />
        <H3>Open problems</H3>
        <ul>
          <li><strong>The analog hole.</strong> Photographing a screen that shows a fake. Dual capture mitigates it but does not close it.</li>
          <li><strong>Testnet only.</strong> Everything runs on Ethereum Sepolia.</li>
          <li><strong>Key provisioning.</strong> The factory process, the device registry and the revocation path are not specified.</li>
          <li><strong>Legal acceptance.</strong> No court has yet ruled on a Veris claim under Section 63 of the Bharatiya Sakshya Adhiniyam, 2023. The design records the SHA-256 at capture so a certificate can start with the hash already in place.</li>
        </ul>
        <p>Adoption is planned in stages: pilots first, then institutions, then scale.</p>
      </>
    ),
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting and FAQ',
    keywords: 'faq problems errors stuck pending not minted claim fails balance ngrok ports',
    body: (
      <>
        <H3>A photo is stuck before "minted"</H3>
        <p>
          Check that the web3 service can reach the public server (<code>CLAIM_SERVER_URL</code>) and the RPC, and that the
          device account has enough Sepolia ETH (<code>GET /api/balance</code>). Then press retry in the owner dashboard, or call{' '}
          <code>POST /api/retry-pending</code>. The service also retries on its own every <code>AUTO_RETRY_INTERVAL_MS</code>.
        </p>

        <H3>The claim page says it cannot verify</H3>
        <p>
          The public server verifies by calling the device back at <code>DEVICE_API_URL</code>. If the device is offline, behind a
          NAT without a tunnel, or the URL changed (a new ngrok address), the call fails. Update the variable and the
          tunnel, then reload the page.
        </p>

        <H3>The device cannot mint</H3>
        <p>
          <code>mintOriginal</code> reverts with "Device not registered or inactive" if the signing account is not an active
          device. Run <code>POST /api/device/ensure-registered</code>, or register the device with the{' '}
          <code>RegisterDevice.s.sol</code> script.
        </p>

        <H3>Two services use the same port</H3>
        <p>
          The public server and the embedding service both default to 5001. Set <code>PORT</code> on one of them.
        </p>

        <H3>/docs or /claim shows a 404 after deploying</H3>
        <p>
          The portal is a single-page app. Configure the host to serve <code>index.html</code> for unknown paths.
        </p>

        <H3>Why does a screenshot or re-saved photo show no record?</H3>
        <p>
          The exact-match check compares bytes. Messaging apps and social platforms re-encode images, which changes the
          bytes. Those usually land in the "recompressed" or "altered copy" tier. Share the original file when exactness
          matters.
        </p>

        <H3>Is "no record" the same as fake?</H3>
        <p>
          No. It means Veris cannot vouch for the file. See <a href="#verification-verdicts">Verification verdicts</a>.
        </p>

        <H3>Where do I report a problem?</H3>
        <p>
          Veris is a prototype. Open an issue in the project repository with the service logs, the claim ID and the time
          it happened.
        </p>
      </>
    ),
  },
]
