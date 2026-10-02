import { Link } from 'react-router-dom'
import { H2, H3, Code, Table, Note, C } from './parts'

export const guides = [
  {
    slug: 'overview',
    group: 'Getting started',
    title: 'Introduction',
    summary: 'What Veris is, the problem it addresses, and how the pieces fit together.',
    body: (
      <>
        <p>Veris is a system for proving that a photograph was captured by a real camera at a particular moment, and for checking later whether a photo you are looking at is that original, an edited copy of it, or something unrelated.</p>

        <H2>The problem</H2>
        <p>Generated and manipulated images now look like photographs. A viewer cannot tell by eye whether an image shows something that happened, and a photographer has no simple way to show that a shot is theirs and has not been altered. Metadata such as EXIF can be rewritten by anyone, and a platform’s word that a photo is genuine is only as good as the platform.</p>

        <H2>How Veris approaches it</H2>
        <ul>
          <li><b>Sign at capture.</b> A Veris camera signs each photo with a key that is derived from, and stays on, the device. The signature covers the image hash, a timestamp, a one-time number and the result of a liveness check.</li>
          <li><b>Record publicly.</b> The photo is stored on decentralized storage and minted as a token. A public, queryable copy of the record is kept so that proof does not depend on Veris servers staying online.</li>
          <li><b>Verify by anyone.</b> Anyone can drop a photo into the <Link to="/search">Verify</Link> page. An identical file is confirmed directly. An edited version is matched to its original and the differences are listed.</li>
          <li><b>License.</b> The photographer can license a photo to an editor for a fixed fee, paid in USDC.</li>
        </ul>

        <H2>The parts of Veris</H2>
        <Table
          head={['Part', 'What it is']}
          rows={[
            ['Camera', 'A Raspberry Pi based camera that captures, runs a liveness check, signs and uploads photos.'],
            ['Backend services', 'Verify the signed packet, store the photo, mint the token and create a claim.'],
            ['Smart contracts', 'A registry of trusted cameras, the photo token, and the license contract.'],
            ['Owner portal', 'The website where photographers claim, view and license photos, and where anyone can verify a photo.'],
            ['Mobile app', 'A phone app to trigger the camera, browse sealed photos and verify images.'],
          ]}
        />

        <Note kind="warn" title="Status: prototype">
          Veris currently runs on the Ethereum Sepolia and Arc test networks. Tokens on test networks have no monetary value, and records on them are not permanent. Treat Veris as a working prototype, not a production notary.
        </Note>

        <H2>Where to go next</H2>
        <ul>
          <li><Link to="/docs/quickstart">Quickstart</Link> to verify a photo or follow one from capture to claim.</li>
          <li><Link to="/docs/concepts">Core concepts</Link> for the terms used throughout these docs.</li>
          <li><Link to="/docs/architecture">System architecture</Link> for how the services connect.</li>
        </ul>
      </>
    ),
  },
  {
    slug: 'quickstart',
    group: 'Getting started',
    title: 'Quickstart',
    summary: 'Verify a photo in under a minute, or follow a photo from capture to claim.',
    body: (
      <>
        <H2>Verify a photo</H2>
        <p>You do not need an account, a wallet or a Veris device to check a photo.</p>
        <ol>
          <li>Open the <Link to="/search">Verify</Link> page.</li>
          <li>Drop the image onto the page, choose a file, or select <b>Use the camera</b> on a phone.</li>
          <li>Wait for the check to finish. The result is one of three verdicts: <b>Authentic original</b>, <b>Altered copy</b> or <b>No match on the chain</b>.</li>
          <li>If a sealed photo was matched, select <b>View the on-chain claim</b> to see the device, time, chain and storage records.</li>
        </ol>
        <Note>
          Use the original file where you can. Screenshots, messaging apps and social platforms often re-encode images, which turns an exact match into an altered copy.
        </Note>

        <H2>Look up by hash or device</H2>
        <p>If you do not have the file, expand <b>No file? Search by image hash or device ID</b> under the picker and enter either a 64 character SHA-256 hash or a device ID. See <Link to="/docs/api">the API reference</Link> for the equivalent request.</p>

        <H2>Follow a photo from capture to claim</H2>
        <ol>
          <li><b>Capture.</b> Press the shutter on a Veris camera. The screen shows progress: captured, checked, signed, uploading.</li>
          <li><b>Scan.</b> When the upload completes the camera displays a QR code. Scan it with a phone.</li>
          <li><b>Claim.</b> The claim page shows the photo and its proof. Enter a wallet address, or sign in to the <Link to="/dashboard">owner portal</Link>, to claim ownership.</li>
          <li><b>Share.</b> The claim page has a stable address you can share as proof that the photo is sealed.</li>
        </ol>
      </>
    ),
  },
  {
    slug: 'concepts',
    group: 'Getting started',
    title: 'Core concepts',
    summary: 'Definitions of the terms used across Veris.',
    body: (
      <>
        <H2>Glossary</H2>
        <Table
          head={['Term', 'Definition']}
          rows={[
            ['Capture', 'A single photo taken by a Veris camera and signed on the device.'],
            ['Packet', 'The signed statement a camera produces for a capture. It contains the image hash, the companion hash, the liveness verdict, a timestamp, a nonce and the device address.'],
            ['Image hash', 'The SHA-256 fingerprint of the exact bytes of a photo. Changing a single byte changes the hash.'],
            ['Perceptual hash', 'A fingerprint of what a photo looks like rather than its exact bytes. Similar images have similar perceptual hashes, which is how edited copies are found.'],
            ['Nonce', 'A one-time number in each packet. A packet whose nonce has been seen before is rejected, so a capture cannot be replayed.'],
            ['Liveness check', 'A vision check at capture time that decides whether the camera is looking at a real scene rather than a screen, a print or a generated image.'],
            ['Companion photo', 'An optional second photo of the same scene taken by a phone next to the camera, used to cross-check the scene.'],
            ['Claim', 'The record created for a capture. It is what the QR code points to and what the owner claims.'],
            ['Original', 'The first token minted for a capture. It represents the photo itself.'],
            ['Edition', 'A further token that points back to an original, up to a limit set when the original was minted.'],
            ['Device registry', 'The on-chain list of cameras that are trusted to mint originals.'],
            ['License', 'Time-limited permission to use a photo, bought on Arc for 5 USDC and valid for 30 days.'],
            ['Arkiv', 'A public, queryable record store used for the public copy of claims and licenses.'],
          ]}
        />

        <H2>Original, copy and edit</H2>
        <p>Veris separates three situations when you check a file.</p>
        <ul>
          <li><b>Identical.</b> The file’s SHA-256 hash equals the hash of a sealed photo. It is the original, byte for byte.</li>
          <li><b>Derived.</b> The file looks like a sealed photo but its bytes differ. It may have been re-saved, resized, filtered or edited. Veris reports it as an altered copy and describes what changed.</li>
          <li><b>Unknown.</b> Nothing sealed resembles the file. This says only that the photo was not captured with Veris.</li>
        </ul>

        <H2>What “verified” means</H2>
        <p>A verified result means a registered Veris device signed that exact content, the signature was valid and fresh when it was received, and the record has been written publicly. It does not mean the scene in front of the camera was truthful or unstaged. Veris proves the photo was captured and has not been changed since; it does not judge what was photographed.</p>
      </>
    ),
  },
  {
    slug: 'how-it-works',
    group: 'Guides',
    title: 'How a photo is sealed',
    summary: 'The path of a photo from the shutter to a public record.',
    body: (
      <>
        <p>Sealing happens automatically each time the shutter is pressed. The whole flow is built so that a failure in any outside service never loses a capture.</p>

        <H2>1. Capture and liveness</H2>
        <p>The camera takes the photo and checks that it shows a real scene. The check asks a vision model whether the image is a direct photograph of a scene, as opposed to a photo of a screen, a printed photo or a generated image. If a companion phone photo is present, the check also asks whether both show the same scene.</p>
        <p>The outcome is recorded as <C>real</C>, <C>fake</C> or <C>pending</C>. When no engine can answer, the capture is marked pending and parked on the device. Veris never guesses a verdict.</p>

        <H2>2. Signing</H2>
        <p>The camera signs a packet with its device key. The signed text is exactly:</p>
        <Code>{`veris-capture-v1
image:<sha256 of the photo>
companion:<sha256 of the companion photo, or ->
verdict:<real | fake | pending>
ts:<unix timestamp>
nonce:<one-time value>
device:<device address, lowercase>`}</Code>

        <H2>3. Upload and checks</H2>
        <p>The photo and signature are uploaded to the backend, which checks that:</p>
        <ul>
          <li>the SHA-256 of the uploaded bytes equals the signed image hash;</li>
          <li>the signature recovers to the stated device address;</li>
          <li>the timestamp is neither too old (24 hours by default) nor in the future;</li>
          <li>the nonce has not been used before;</li>
          <li>the device is active in the device registry.</li>
        </ul>
        <p>A failure in any step rejects the upload with a specific error.</p>

        <H2>4. Storage</H2>
        <p>The photo and its metadata are stored on decentralized storage. Lighthouse (IPFS and Filecoin) is the default and 0G Storage is the alternative. If the chosen provider fails, the other is used.</p>

        <H2>5. Minting</H2>
        <p>The backend mints an original token for the photo from the camera’s own wallet. It is minted on the primary chain and, when enabled, also on Arc. If one chain is unavailable the other still completes, and the failed mint is queued and retried.</p>

        <H2>6. Claim and public record</H2>
        <p>The public server creates a claim and returns its address to the camera, which shows it as a QR code. The claim is saved in a database and a public copy is written to Arkiv: first as <C>pending</C> for 24 hours, then as <C>minted</C> once the token exists.</p>

        <Note>
          Capture never waits on a third party. Signing and queueing always succeed locally, and anything that could not be sent is retried automatically.
        </Note>
      </>
    ),
  },
  {
    slug: 'verifying',
    group: 'Guides',
    title: 'Verifying a photo',
    summary: 'What happens when you check a file, and how to read the result.',
    body: (
      <>
        <p>The <Link to="/search">Verify</Link> page answers one question: was this photo ever sealed by a Veris device?</p>

        <H2>The two stages</H2>
        <H3>Stage 1: exact match, on your device</H3>
        <p>The page computes the SHA-256 hash of your file in the browser and asks Arkiv’s public endpoint whether a sealed photo has that hash. Nothing is uploaded to Veris. If there is a match you immediately get the verdict <b>Authentic original</b>.</p>

        <H3>Stage 2: edited copies, on the Veris server</H3>
        <p>If there is no exact match, or the lookup fails, the photo is sent to the Veris server. The server runs several layers in order:</p>
        <ol>
          <li><b>Exact hash.</b> A second exact check against the claim database, including the companion phone photo.</li>
          <li><b>Perceptual hashing.</b> Three hash families (difference, perceptual and average hash) are compared across all stored photos, including rotated and mirrored versions. The closest photo is scored by a weighted vote.</li>
          <li><b>Semantic recovery.</b> When hashing finds nothing, an image embedding model looks for a photo that is semantically very similar. This catches heavy edits such as strong filters or noise, and is marked as a softer signal.</li>
          <li><b>Comparison with the original.</b> For an altered copy the server fetches the original, aligns it with your copy, and compares them to describe what changed (see below).</li>
        </ol>

        <H2>How the changes are found</H2>
        <p>Veris does not rely on a single method, because each has blind spots.</p>
        <ul>
          <li><b>Block comparison.</b> Both images are scaled to the same size and compared block by block using structural similarity. This detects a large edit, a crop or a global adjustment.</li>
          <li><b>Fine comparison.</b> A higher resolution pass compares lightly blurred colour values after removing any overall brightness shift. It finds small local differences, such as a distant person or a small object that was removed, while ignoring ordinary recompression noise.</li>
          <li><b>Close-up review.</b> Each region found is cropped from both images and shown, side by side, to a vision model. It describes what was added, removed or altered in that region.</li>
        </ul>
        <p>The result is a list of specific changes, each with its position in the photo, for example “A person at the far left edge was removed” or “The sky is darker and the colors are more saturated”.</p>

        <Note>
          The list of changes is a best-effort comparison and a guide. It does not by itself decide authenticity, and a very small or subtle edit can be described imprecisely.
        </Note>

        <H2>Other information shown with a result</H2>
        <ul>
          <li><b>AI note.</b> When a photo is flagged as possibly AI-generated or manipulated, a note says why. If the comparison with the original finds an AI edit, the note names which part of the photo was affected.</li>
          <li><b>What we see in your photo.</b> A short description of the photo produced by a vision model.</li>
          <li><b>Verified photos that look similar.</b> Sealed photos that resemble yours, for browsing only. This list does not check authenticity.</li>
        </ul>

        <H2>Unsupported files</H2>
        <p>HEIC files taken directly from an iPhone cannot always be decoded for visual comparison. Export or share the photo as JPEG or PNG first. When a file cannot be decoded only the exact byte-for-byte check runs, and the result says so.</p>
      </>
    ),
  },
  {
    slug: 'results',
    group: 'Guides',
    title: 'Understanding results',
    summary: 'What each verdict means and what it does not.',
    body: (
      <>
        <H2>Authentic original</H2>
        <p>The file is byte-for-byte identical to a photo sealed by a Veris device. The result shows the token number and a link to the on-chain claim. This is the strongest result and is deterministic: either the hashes are equal or they are not.</p>

        <H2>Altered copy</H2>
        <p>The file matches a sealed photo but is not identical. The result shows how closely it matches (the visual match percentage), the token it came from, and a bulleted list of what changed from the original.</p>
        <Table
          head={['Match tier', 'Meaning']}
          rows={[
            ['Recompressed', 'Very close match. Usually the same picture re-saved or compressed. Often no visible content change.'],
            ['Structural edit', 'The picture is recognisably the same but visibly altered, for example a crop, a resize, or objects added or removed.'],
            ['Possible match', 'A looser match. The photo shares a lot with a sealed original but has been changed substantially.'],
            ['Possible match (semantic)', 'No hash matched, but the photo is semantically very similar to a sealed one. Likely heavy editing. This is a best-effort signal.'],
          ]}
        />
        <p>A re-save or compression alone is not reported as an edit. In that case the result says no visible content changes were found.</p>

        <H2>No match on the chain</H2>
        <p>Nothing sealed resembles the file. This does <b>not</b> mean the photo is fake. It means only that it was not captured with a Veris device, or that its record has expired (see <Link to="/docs/privacy-data">Data and retention</Link>).</p>

        <H2>Common situations</H2>
        <Table
          head={['You see', 'Likely reason']}
          rows={[
            ['Altered copy, no visible changes', 'The file was re-saved, resized slightly or recompressed by an app or website.'],
            ['Altered copy, changes listed', 'The photo was edited. Read the bullets for what changed.'],
            ['No match for a photo you believe is sealed', 'You are checking a screenshot or a heavily filtered version, or the record is older than the retention period.'],
            ['The check didn’t finish', 'The server could not be reached or a photo could not be processed. Try again; an exact match is still checked in your browser.'],
          ]}
        />
      </>
    ),
  },
  {
    slug: 'portal',
    group: 'Guides',
    title: 'Owner portal',
    summary: 'Claim, view and manage your sealed photos.',
    body: (
      <>
        <p>The <Link to="/dashboard">owner portal</Link> is for photographers and owners.</p>

        <H2>Signing in</H2>
        <p>Sign in with an email address, SMS or an existing wallet. Signing in with email or SMS creates an embedded wallet for you, so you do not need to bring one. The wallet holds your photo tokens.</p>

        <H2>Claiming a photo</H2>
        <ol>
          <li>Scan the QR code on the camera, or open the claim link.</li>
          <li>The claim page shows the photo, the device, the time and the chain and storage records.</li>
          <li>Provide your wallet address to claim it. The claim moves from <C>pending</C> to <C>claimed</C> and, once the token is minted to you, to <C>completed</C>.</li>
        </ol>

        <H2>The dashboard</H2>
        <p>The dashboard lists the photos your wallet owns, their status, any editions, and licenses bought for them with the earnings you have received.</p>

        <H2>The claim page</H2>
        <p>Every capture has a public claim page at <C>/claim/&lt;claim id&gt;</C>. It shows:</p>
        <ul>
          <li>the photo and its status;</li>
          <li>the capture record: device, time, location where available and the liveness result;</li>
          <li>the companion phone photo, when there is one;</li>
          <li>links to the transactions and the storage record;</li>
          <li>similar sealed photos, the license panel and a share control.</li>
        </ul>
      </>
    ),
  },
  {
    slug: 'licensing',
    group: 'Guides',
    title: 'Licensing photos',
    summary: 'How an editor pays a photographer for use of a photo.',
    body: (
      <>
        <p>Licensing is handled by the <C>VerisLicense</C> contract on the Arc network, where USDC is the gas token.</p>

        <H2>Terms</H2>
        <Table
          head={['Item', 'Value']}
          rows={[
            ['Price', '5 USDC per license'],
            ['Term', '30 days from purchase'],
            ['Payment', 'Goes directly to the photographer in a single transaction'],
            ['Renewing', 'Buying again while a license is active adds a full term on top of the remaining time'],
          ]}
        />

        <H2>Buying a license</H2>
        <ol>
          <li>Open the claim page of the photo and select <b>License</b>.</li>
          <li>Connect a wallet that holds USDC on Arc.</li>
          <li>Approve the USDC spend, then confirm the license purchase. The two steps are separate wallet prompts.</li>
          <li>The portal records the purchase with the server, which confirms it against the chain before it is shown.</li>
        </ol>

        <H2>Safeguards</H2>
        <ul>
          <li>The contract only pays a wallet that actually holds the original token, so money cannot be directed to an unrelated address.</li>
          <li>The public record of a license expires at the end of its term, so “is this photo still licensed to this wallet” is the same as “does the record still exist”.</li>
        </ul>
        <Note>This applies to Arc testnet USDC with no real value. The license terms are a prototype of the mechanism, not a legal contract.</Note>
      </>
    ),
  },
  {
    slug: 'mobile',
    group: 'Guides',
    title: 'Mobile app',
    summary: 'Trigger the camera, browse your photos and verify images from a phone.',
    body: (
      <>
        <p>The mobile app (Hotshoe) is built with Expo and React Native.</p>

        <H2>What it does</H2>
        <ul>
          <li><b>Remote shutter.</b> Connects to the camera over classic Bluetooth and sends a capture command. This works on Android.</li>
          <li><b>Live status.</b> Shows each step of the pipeline: captured, signed, uploading, uploaded, queued or failed.</li>
          <li><b>Archive.</b> Lists every photo your wallet owns, each with its provenance, chain proof and license history.</li>
          <li><b>Verify.</b> Checks any image against sealed photos without needing a wallet.</li>
        </ul>

        <H2>Status messages from the camera</H2>
        <Table
          head={['Message', 'Meaning']}
          rows={[
            ['CAPTURING, CAPTURED', 'The shutter fired and the photo was taken.'],
            ['SIGNED', 'The photo was signed with the device key.'],
            ['UPLOADING', 'The photo is being sent to the backend.'],
            ['UPLOADED:<claim url>', 'Done. The address of the claim is included.'],
            ['QUEUED:offline', 'No connection. The photo will be sent when one is available.'],
            ['QUEUED:pending', 'The liveness check could not be completed yet; the capture is held.'],
            ['FAILED:<step>', 'A step failed; the message names which.'],
          ]}
        />
      </>
    ),
  },
]
