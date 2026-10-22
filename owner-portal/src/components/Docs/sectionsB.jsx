import { Badge, Callout, Code, H3, Table } from './parts'

const VERIFY = 'https://veris.live/claim'

export const PRODUCTS = [
  {
    id: 'devices',
    title: 'Devices',
    keywords: 'standalone hotshoe clip raspberry pi camera hardware bluetooth x-sync usb-c',
    body: (
      <>
        <H3>Standalone</H3>
        <Badge kind="ok">Implemented</Badge>
        <p>
          The reference unit. It runs the whole pipeline on its own: capture, signature, upload, claim and QR code. The
          prototype cost about ₹10,000 to build.
        </p>
        <Table
          head={['Component', 'Minimum', 'Recommended']}
          rows={[
            ['Computer', 'Raspberry Pi 4 Model B, 2 GB', 'Raspberry Pi 4 Model B, 4 GB'],
            ['Camera', 'Pi Camera Module v1/v2/v3 or a USB camera', 'Pi Camera Module v3'],
            ['Display', '3.5" touchscreen, 320×240 or higher', 'Waveshare 3.5" HDMI LCD touchscreen'],
            ['Storage', 'microSD, 16 GB, Class 10', 'microSD, 32 GB+, Class 10, A1'],
            ['Power', '5 V 3 A USB-C', 'UPS HAT for battery backup'],
            ['Network', 'Wi-Fi or Ethernet', 'Wi-Fi, or Bluetooth tethering to a phone'],
          ]}
        />
        <p>The camera software lives in <code>hardware-camera-app/</code>:</p>
        <Table
          head={['File', 'Purpose']}
          rows={[
            [<code key="1">raspberry_pi_camera_app.py</code>, 'The Kivy touchscreen app: live preview, capture, gallery and QR display. Captures at 1920×1080 with Picamera2.'],
            [<code key="2">headless_camera_app.py</code>, 'A variant without a screen, triggered remotely.'],
            [<code key="3">hardware_identity.py</code>, 'Derives the device key and address, and signs image hashes.'],
            [<code key="4">capture_pipeline.py</code>, 'Capture and upload pipeline shared by the app variants.'],
            [<code key="5">bt_trigger_server.py</code>, 'Bluetooth RFCOMM/SPP server that accepts capture commands from a phone.'],
            [<code key="6">bt_tether.py</code>, 'Brings up Bluetooth PAN tethering so the Pi can reach the internet through a phone.'],
            [<code key="7">stream_server.py</code>, 'Optional MJPEG preview stream on port 8081.'],
            [<code key="8">export_key.py</code>, 'Exports the device key for the web3 service.'],
            [<code key="9">install.sh, install_dependencies.sh</code>, 'Installers for the Pi (Node.js, Python packages, services).'],
            [<code key="10">kiosk-start.sh, veris.service</code>, 'Start the app fullscreen at boot.'],
          ]}
        />
        <Callout kind="note">
          The standalone unit locates itself by IP geolocation, not by a GPS module. Location is best effort and
          optional.
        </Callout>

        <H3>Hotshoe</H3>
        <Badge kind="plan">In design</Badge>
        <p>
          The Hotshoe slides into the standard hot shoe of any DSLR or mirrorless camera and fires from the shoe's
          centre X-sync pin, with no cable and no menu. When the camera's shutter fires, the unit takes its own signed
          picture at the same instant. The design runs on a Raspberry Pi Zero with a two-layer carrier PCB made for it.
        </p>
        <p>
          The repository contains a design specification for an ESP32-based variant
          (<code>docs/superpowers/specs/2026-04-04-esp-dual-camera-verification-design.md</code>) but no Hotshoe firmware yet.
        </p>

        <H3>Clip-on</H3>
        <Badge kind="plan">In design</Badge>
        <p>
          The Clip grips the back of almost any phone like a case, using a spring clip. It is powered from the phone's
          USB-C port and paired over Bluetooth. Its own sensor shoots beside the phone camera, producing the second,
          independently signed image.
        </p>
        <p>
          Parts of the Clip workflow exist: the Pi-side Bluetooth trigger server (<code>bt_trigger_server.py</code>), which
          advertises as <code>Veris-Cam-&lt;DEVICE_ID&gt;</code>, and the public server's companion-capture endpoints.
        </p>

        <H3>Dual capture</H3>
        <p>
          Phone and camera firmware are outside Veris's control, so Veris takes a second, independently signed image at
          the same instant. The Clip is triggered by the app over Bluetooth, and the Hotshoe by the camera's X-sync pin.
          A scene-matching check confirms both frames show the same scene, and the main photo only inherits the proof if
          they match. Dual capture mitigates re-photographing a screen but does not close that gap entirely.
        </p>

        <H3>Companion capture</H3>
        <Badge kind="ok">Implemented, demo quality</Badge>
        <p>
          Companion capture compares a phone's own photo against the real, minted device photo from the same claim. It
          reuses the perceptual-hash and SSIM machinery built for tamper detection but reads it as a looser consistency
          signal. A phone and a device mounted together never see pixel-identical framing. The phone photo is uploaded
          first (<code>POST /api/companion/upload</code>) and linked once the claim exists
          (<code>POST /api/claim/:claim_id/companion/link</code>). It is stored on Cloudinary rather than Filecoin because
          it is not the source of truth, and the result is a consistency score, not a proof.
        </p>
      </>
    ),
  },
  {
    id: 'verifying-photos',
    title: 'Verifying photos',
    keywords: 'verify claim page search authenticity check altered copy no record tamper recompressed',
    body: (
      <>
        <p className="vd-lead">
          There are three ways to check a photo: the claim page for a specific photo, the upload check at{' '}
          <a href={VERIFY} target="_blank" rel="noopener noreferrer">veris.live/claim</a>, and the two-image authenticity check.
        </p>

        <H3>The claim page</H3>
        <p>
          Each captured photo has a page at <code>/claim/:claim_id</code>. It shows the photo, its on-chain details, and a
          live verification badge. Under the hood the public server calls the device's own
          <code> /api/verify/:claimId</code> endpoint, which runs four checks:
        </p>
        <Table
          head={['Check', 'What it confirms']}
          rows={[
            [<code key="1">imageFound</code>, 'The device has this image on record.'],
            [<code key="2">deviceRegistered</code>, 'The device address is registered and active on DeviceRegistry.'],
            [<code key="3">signatureValid</code>, 'The signature recovers to the device address for this image hash.'],
            [<code key="4">nftMinted</code>, 'A token has been minted for the photo.'],
          ]}
        />
        <p>
          A photo is <strong>verified</strong> when <code>deviceRegistered</code> and <code>signatureValid</code> are both true.
          The claim page also lists similar verified photos and lets a recipient claim an edition.
        </p>

        <H3 id="verification-verdicts">Verification verdicts</H3>
        <p>
          When you upload a file for checking (<code>POST /api/search</code>), the public server hashes it and returns one
          of three verdicts. Matching is layered: exact bytes first, then perceptual fingerprints.
        </p>
        <Table
          head={['Verdict', 'Meaning', 'How it is decided']}
          rows={[
            [<code key="1">authentic_original</code>, 'This is the file that left the camera.', 'The SHA-256 of the upload equals the recorded image hash. Byte for byte identical.'],
            [<code key="2">altered_copy</code>, 'A modified version of a verified photo.', 'No exact match, but the perceptual hashes are close to a verified photo. Reported with a tier (below).'],
            [<code key="3">no_match</code>, 'No record. Veris cannot vouch for this file.', 'Neither the exact hash nor the perceptual hashes match anything verified.'],
          ]}
        />
        <Callout kind="warn" title="No record is not the same as fake">
          <code>no_match</code> means Veris holds no proof for this file. The photo may be genuine but taken without a Veris
          device, or re-encoded by a platform. Treat it as "unverified", not as "forged".
        </Callout>

        <H3>Altered-copy tiers</H3>
        <p>
          The altered-copy check combines three perceptual hashes (dHash, pHash-DCT and aHash) into a normalised distance
          between 0 and 1. Lower means more similar. The default thresholds, tunable with environment variables, are:
        </p>
        <Table
          head={['Tier', 'Distance below', 'Reading']}
          rows={[
            ['Recompressed', '0.05', 'Re-saved or re-encoded, for example by a messaging app. Same picture.'],
            ['Structural edit', '0.15625', 'Visibly edited but from the same source photo.'],
            ['Possible match', '0.24', 'Probably the same source, low confidence.'],
            ['Not a match', '0.24 or more', 'Not treated as a hash match at all.'],
          ]}
        />
        <p>
          For altered copies the server can also compute a forensic pixel diff against the original and, when OpenAI is
          configured, a side-by-side AI comparison. Those are labelled non-authoritative.
        </p>

        <H3>Authenticity check (two images)</H3>
        <p>
          The page at <code>/authenticity-check</code> compares an original with a suspect image. It posts both to the AI
          model service (<code>POST /api/verify</code>, default <code>http://localhost:8000</code>, set with{' '}
          <code>VITE_VERIFY_API_URL</code>) and displays the individual signals:
        </p>
        <Table
          head={['Signal', 'What it measures']}
          rows={[
            ['Geometric (ORB)', 'Matching keypoints between the two images.'],
            ['Structural (edges)', 'Edge-based SSIM.'],
            ['Colour', 'HSV histogram similarity.'],
            ['Semantic (CLIP)', 'Cosine similarity of CLIP embeddings.'],
            ['Perceptual hash', 'Hamming distance between pHashes.'],
            ['Forensic vision', 'A vision-model check of the pair.'],
          ]}
        />
        <p>
          The fused result is a weighted sum of the signals with a per-signal floor: an image is only judged authentic
          if the total score clears the threshold and no single signal falls below its floor.
        </p>

        <H3>Reverse search</H3>
        <p>
          <code>/search</code> in the owner portal lets you upload an image and find the verified photos it resembles. Results
          blend visual similarity (perceptual hashes) with content similarity (an OpenAI embedding), weighted by
          <code> SEARCH_VISUAL_WEIGHT</code> (default 0.7 visual) and filtered by <code>SEARCH_MIN_SCORE</code> (default 0.7).
          Search results are fuzzy by design and never carry the weight of a verification.
        </p>
      </>
    ),
  },
  {
    id: 'owner-portal',
    title: 'Owner portal',
    keywords: 'dashboard privy wallet login routes react vite wagmi',
    body: (
      <>
        <p className="vd-lead">
          The owner portal is a React and Vite app. It signs people in with Privy, talks to the contracts with Wagmi and
          Viem, and reads from the web3 service and the public claim server.
        </p>
        <H3>Routes</H3>
        <Table
          head={['Path', 'Page', 'Purpose']}
          rows={[
            [<code key="1">/</code>, 'Landing page', 'Introduction, the Veris devices, the story behind Veris and the docs.'],
            [<code key="2">/dashboard</code>, 'Owner dashboard', 'Sign in and manage your device\'s captures. Retry photos stuck before minting.'],
            [<code key="3">/claim/:claimId</code>, 'Claim page', 'View one photo\'s verification, similar photos, and claim an edition.'],
            [<code key="4">/search</code>, 'Search', 'Upload an image to find matching verified photos and a tamper verdict.'],
            [<code key="5">/authenticity-check</code>, 'Authenticity check', 'Compare an original with a suspect image across several signals.'],
            [<code key="6">/docs</code>, 'Documentation', 'This site.'],
          ]}
        />
        <H3>Signing in</H3>
        <p>
          Privy offers wallet, email and SMS login. Users without a wallet get an embedded wallet created on login.
          Privy session signers also allow the backend to submit gas-sponsored transactions on behalf of the owner (see{' '}
          <a href="#hardware-web3-service-api">the web3 service API</a>).
        </p>
        <H3>Configuration</H3>
        <Table
          head={['Variable', 'Purpose', 'Default']}
          rows={[
            [<code key="1">VITE_PRIVY_APP_ID</code>, 'Your Privy application ID. Required.', 'None'],
            [<code key="2">VITE_BACKEND_URL</code>, 'Base URL of the hardware web3 service.', 'http://localhost:5000'],
            [<code key="3">VITE_CLAIM_SERVER_URL</code>, 'Base URL of the public claim server.', 'http://localhost:5001'],
            [<code key="4">VITE_VERIFY_API_URL</code>, 'Base URL of the AI model verification API.', 'http://localhost:8000'],
            [<code key="5">VITE_IPFS_GATEWAY</code>, 'Gateway used to load images by CID.', 'A Lighthouse gateway'],
            [<code key="6">VITE_PORTAL_URL</code>, 'Public URL of the portal.', 'The current origin'],
          ]}
        />
        <Code lang="bash">{`
cd owner-portal
npm install
npm run dev       # http://localhost:3000
npm run build     # production build in dist/
npm run preview   # serve the production build
`}</Code>
      </>
    ),
  },
  {
    id: 'architecture',
    title: 'Architecture',
    keywords: 'components services ports sqlite postgres lighthouse privy sepolia diagram',
    body: (
      <>
        <H3>Components</H3>
        <Table
          wide
          head={['Component', 'Directory', 'Runs on', 'Role']}
          rows={[
            ['Camera app', <code key="1">hardware-camera-app/</code>, 'Raspberry Pi', 'Capture, hash, sign, display QR. Python and Kivy.'],
            ['Hardware web3 service', <code key="2">hardware-web3-service/</code>, 'Pi or a nearby host, port 5000', 'Registers devices, uploads to Lighthouse, creates claims, mints tokens. Node.js, Express and SQLite.'],
            ['Public claim server', <code key="3">public-server/</code>, 'Render, port 5001', 'Hosts claim pages, edition requests, search and tamper checks. Node.js with Postgres.'],
            ['Owner portal', <code key="4">owner-portal/</code>, 'Static hosting, port 3000 in dev', 'Landing page, dashboard, claim, search and docs. React and Vite.'],
            ['Contracts', <code key="5">contracts/</code>, 'Ethereum Sepolia', 'DeviceRegistry and VerisERC1155. Solidity with Foundry.'],
            ['Embedding service', <code key="6">ai-embedding-service/</code>, 'Port 5001 by default (override it)', 'POST /embed returns a CLIP ViT-B/32 vector and a pHash. Python and FastAPI. Optional.'],
            ['AI model', <code key="7">ai-model/</code>, 'Port 8000', 'Multi-signal image comparison behind /api/verify. Python and FastAPI.'],
            ['Mobile app', <code key="8">mobile-app/</code>, 'Phone', 'An Expo demo app for the owner archive, a public registry and Clip capture. Much of the blockchain side is simulated.'],
          ]}
        />
        <Callout kind="note" title="Ports">
          The hardware web3 service defaults to 5000. The public server and the embedding service both default to 5001,
          so run them on different hosts or override one with the <code>PORT</code> environment variable.
        </Callout>

        <H3>Data stores</H3>
        <ul>
          <li><strong>Web3 service:</strong> a local SQLite database (<code>better-sqlite3</code>) with tables for images, claims, devices and embeddings.</li>
          <li><strong>Public server:</strong> Postgres through <code>DATABASE_URL</code>, because Render's disk is ephemeral. It holds claims and edition requests.</li>
          <li><strong>Files:</strong> images are pinned to IPFS and Filecoin through Lighthouse. Companion photos go to Cloudinary.</li>
        </ul>

        <H3>External services</H3>
        <Table
          head={['Service', 'Used for']}
          rows={[
            ['Lighthouse', 'IPFS and Filecoin storage, and the gateway used to read images back.'],
            ['Privy', 'Login, embedded wallets and session signers.'],
            ['An Ethereum Sepolia RPC', 'Reading and writing contracts.'],
            ['OpenAI (optional)', 'Photo descriptions, semantic embeddings and a vision comparison. Informational only.'],
            ['Cloudinary (optional)', 'Storage for companion-capture photos.'],
          ]}
        />

        <H3>Overview diagram</H3>
        <Code lang="text">{`
   Raspberry Pi                    web3 service                      Public server
 +---------------+  upload     +-----------------+  create-claim  +----------------+
 | Camera app    |------------>| Express :5000   |--------------->| Express :5001  |
 | hash + sign   |<--- QR -----| SQLite          |<-- editions ---| Postgres       |
 +---------------+             +--------+--------+                +-------+--------+
                                        |                                 ^
                    Lighthouse (IPFS) <-+-> Ethereum Sepolia              | scan QR
                                           DeviceRegistry                 |
                                           VerisERC1155          Recipient / verifier
`}</Code>
      </>
    ),
  },
]
