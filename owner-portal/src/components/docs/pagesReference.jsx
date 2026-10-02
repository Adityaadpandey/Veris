import { Link } from 'react-router-dom'
import { H2, H3, Code, Table, Note, C } from './parts'

const API = 'https://api.veris.live'

export const reference = [
  {
    slug: 'api',
    group: 'Reference',
    title: 'Public API',
    summary: 'HTTP endpoints for verifying photos and reading claims.',
    body: (
      <>
        <p>The public API is served at <C>{API}</C>. The endpoints below need no authentication. Responses are JSON.</p>
        <Note kind="warn" title="Prototype API">The API is not versioned and may change while Veris is on test networks.</Note>

        <H2>Look up claims by hash or device</H2>
        <Code>{`GET ${API}/api/arkiv/search?imageHash=<sha256>
GET ${API}/api/arkiv/search?deviceId=<device id>`}</Code>
        <p>Returns claims matching a 64 character SHA-256 hash, or all claims from a device. Arkiv is queried first and the database is used as a fallback; <C>source</C> says which answered.</p>
        <Code>{`curl "${API}/api/arkiv/search?imageHash=940d4b013da66f9d767e04e0fe516222c6193b3c4b476bdf022e8fd24e7986f3"`}</Code>
        <Code>{`{
  "success": true,
  "source": "arkiv",
  "results": [
    { "claimId": "…", "status": "minted" }
  ]
}`}</Code>

        <H2>Check a photo</H2>
        <Code>{`POST ${API}/api/search
Content-Type: multipart/form-data
  image: <file>`}</Code>
        <p>Uploads a photo and returns a verdict. Use this for photos that are not an exact copy; an exact match can be checked with the endpoint above.</p>
        <Code>{`{
  "success": true,
  "verdict": {
    "type": "altered_copy",            // authentic_original | altered_copy | no_match
    "claim_id": "…",
    "token_id": "12",
    "visual_match": 94,                 // percent
    "tier": "structural_edit",
    "message": "…",
    "changes": {
      "summary": "A person in the background was removed.",
      "items": ["A person at the far left edge was removed"],
      "regions": [{ "x": 0.04, "y": 0.52, "width": 0.05, "height": 0.12, "position": "left" }],
      "change_type": "content_edited"
    }
  },
  "ai_hint": { "likely_ai_generated": false, "note": null },
  "query_description": "…",
  "similar": [ { "claim_id": "…", "similarity": 0.82 } ]
}`}</Code>
        <Table
          head={['Field', 'Description']}
          rows={[
            ['verdict.type', 'One of authentic_original, altered_copy, no_match.'],
            ['verdict.visual_match', 'How closely an altered copy matches its original, as a percentage.'],
            ['verdict.tier', 'recompressed, structural_edit, possible_match or possible_match_semantic.'],
            ['verdict.changes', 'Present for altered copies: a summary, a list of changes, the regions where differences were found (normalised 0 to 1) and a change type.'],
            ['ai_hint', 'A non-authoritative note on whether the photo looks AI-generated or manipulated.'],
            ['similar', 'Sealed photos that look similar, for browsing only.'],
          ]}
        />
        <Note>Uploaded photos are sent on to an AI provider for the description and comparison. See <Link to="/docs/privacy-data">Data, privacy and retention</Link>.</Note>

        <H2>Read a claim</H2>
        <Table
          head={['Request', 'Returns']}
          rows={[
            [<C key="1">GET /check-claim?claim_id=&lt;id&gt;</C>, 'The claim record and its status.'],
            [<C key="2">GET /verify-claim/&lt;id&gt;</C>, 'Verification data for a claim.'],
            [<C key="3">GET /api/provenance/&lt;id&gt;</C>, 'The full capture record for a claim.'],
            [<C key="4">GET /api/metadata/&lt;id&gt;</C>, 'Token metadata for a claim.'],
            [<C key="5">GET /api/similar/&lt;id&gt;</C>, 'Sealed photos similar to a claim.'],
            [<C key="6">GET /claims/by-wallet/&lt;address&gt;</C>, 'Claims owned by a wallet.'],
            [<C key="7">GET /claims/by-camera/&lt;camera id&gt;</C>, 'Claims captured by a camera.'],
            [<C key="8">GET /api/image/&lt;cid&gt;</C>, 'The photo, proxied from storage.'],
            [<C key="9">GET /health</C>, 'Liveness check for the service.'],
          ]}
        />

        <H3>Claim status</H3>
        <Table
          head={['Status', 'Meaning']}
          rows={[
            ['pending', 'Created by the camera, not yet claimed.'],
            ['claimed', 'An owner has supplied a wallet.'],
            ['completed', 'The token has been minted to the owner.'],
          ]}
        />

        <H2>Errors</H2>
        <p>Failures return <C>{`{ "success": false, "error": "…" }`}</C> with an HTTP status. Camera-facing routes can return <C>401</C> when a shared secret is required, <C>403</C> when a packet is too old or its signature is invalid, and <C>409</C> when a nonce was already used.</p>
      </>
    ),
  },
  {
    slug: 'contracts',
    group: 'Reference',
    title: 'Smart contracts',
    summary: 'The three contracts, their functions and their guarantees.',
    body: (
      <>
        <p>The contracts are written in Solidity 0.8.24 with Foundry and OpenZeppelin. Only a hash of the metadata is stored on chain, which keeps gas costs low.</p>

        <H2>DeviceRegistry</H2>
        <p>The list of cameras trusted to mint. Only the owner (registrar) can add or change a device.</p>
        <Table
          head={['Function', 'Who can call', 'Description']}
          rows={[
            [<C key="a">registerDevice</C>, 'Owner', 'Adds a camera with its address, id and model.'],
            [<C key="b">updateDevice</C>, 'See source', 'Edits a camera’s details.'],
            [<C key="c">deactivateDevice</C>, 'See source', 'Disables a camera so it can no longer mint.'],
            [<C key="d">getDevice, isDeviceActive, getAllDevices</C>, 'Anyone', 'Reads camera information.'],
            [<C key="e">transferOwnership</C>, 'Owner', 'Hands the registrar role to another address.'],
          ]}
        />

        <H2>VerisERC1155</H2>
        <p>Mints one original token per photo and optional editions that point back to it.</p>
        <Table
          head={['Function', 'Who can call', 'Description']}
          rows={[
            [<C key="a">mintOriginal(to, metadataHash, maxEditions)</C>, 'Active camera', 'Mints the original. Reverts unless the caller is active in the registry.'],
            [<C key="b">mintEdition(to, originalId)</C>, 'Anyone', 'Mints an edition up to the limit set at the original.'],
            [<C key="c">batchMintEditions</C>, 'Anyone', 'Mints many editions at once.'],
            [<C key="d">setCompanionHash(id, hash)</C>, 'Minting camera, once', 'Anchors the companion photo hash. Cannot be changed afterwards.'],
            [<C key="e">setBaseURI</C>, 'Owner', 'Changes the metadata base address.'],
          ]}
        />

        <H2>VerisLicense</H2>
        <p>Sells a time-limited license for a photo on Arc.</p>
        <Table
          head={['Function', 'Who can call', 'Description']}
          rows={[
            [<C key="a">buyLicense(tokenId, photographer)</C>, 'Anyone with USDC', 'Pays 5 USDC to the photographer for a 30 day license. Reverts unless the photographer holds the original.'],
            [<C key="b">isLicensed(tokenId, licensee)</C>, 'Anyone', 'Checks whether a license is currently valid.'],
          ]}
        />

        <H3>Events</H3>
        <p><C>DeviceRegistered</C>, <C>TokenMinted</C>, <C>EditionMinted</C>, <C>CompanionHashSet</C>, <C>Licensed</C>.</p>

        <H2>Deployments</H2>
        <p>All deployments are on test networks.</p>
        <Table
          head={['Contract', 'Sepolia (11155111)', 'Arc testnet (5042002)']}
          rows={[
            ['DeviceRegistry', <C key="1">0x7e6bd8193E9762430ff6E494764D74036E333c14</C>, <C key="2">0x7e6bd8193E9762430ff6E494764D74036E333c14</C>],
            ['VerisERC1155', <C key="3">0xA1B6ea0133da15dCFB5A5b4704022e4041f3Edb9</C>, <C key="4">0xB7909d4bba142AfF48aF7509B070e64eC1c6AdAc</C>],
            ['VerisLicense', 'Not deployed', <C key="5">0xA1B6ea0133da15dCFB5A5b4704022e4041f3Edb9</C>],
          ]}
        />
        <p>USDC on Arc uses the ERC-20 interface at <C>0x3600000000000000000000000000000000000000</C>. The Arkiv records are written by the wallet <C>0xC15aF2A372D01B5223819bB328400DB8b14d1894</C> on Arkiv chain id 7794095.</p>
      </>
    ),
  },
  {
    slug: 'arkiv',
    group: 'Reference',
    title: 'Public records (Arkiv)',
    summary: 'The schema of the queryable public records.',
    body: (
      <>
        <p>Arkiv holds the public, queryable copy of claims and licenses. The Veris database remains the permanent record; Arkiv is the copy anyone can query without going through Veris.</p>

        <H2>veris-claim</H2>
        <p>One entity per captured photo.</p>
        <Table
          head={['Field', 'Indexed', 'Description']}
          rows={[
            ['claimId', 'Yes', 'The claim the QR code points to.'],
            ['imageHash', 'Yes', 'The photo’s SHA-256 hash. Verification searches by it.'],
            ['deviceId', 'Yes', 'The camera that took the photo.'],
            ['owner', 'Yes', 'The owner’s wallet once claimed.'],
            ['status', 'Yes', 'pending or minted.'],
            ['record', 'No', 'The full provenance record: storage references and transaction hashes per chain.'],
          ]}
        />

        <H2>veris-license</H2>
        <p>One entity per license bought on Arc. It expires exactly when the license ends.</p>
        <Table
          head={['Field', 'Indexed', 'Description']}
          rows={[
            ['tokenId', 'Yes', 'The licensed photo’s token.'],
            ['licensee', 'Yes', 'The editor’s wallet, lowercase.'],
            ['chain', 'No', 'Where the payment happened.'],
            ['txHash', 'No', 'The purchase transaction.'],
            ['record', 'No', 'The full license record.'],
          ]}
        />

        <H2>Example query</H2>
        <Code lang="js">{`import { createPublicClient } from '@arkiv-network/sdk'
import { rabdi } from '@arkiv-network/sdk/chains'
import { eq } from '@arkiv-network/sdk/query'
import { http } from 'viem'

const client = createPublicClient({
  chain: rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY }),
  transport: http(),
})
const minted = await client
  .select({ $key: true, status: true })
  .from(Claims)            // the veris-claim schema
  .where(eq('status', 'minted'))
  .limit(5)
  .fetch()`}</Code>
        <Note>Reads without an access key are rate limited. The Veris portal retries and then falls back to the Veris server.</Note>
      </>
    ),
  },
  {
    slug: 'self-hosting',
    group: 'Reference',
    title: 'Running Veris yourself',
    summary: 'Components to run and the order to start them.',
    body: (
      <>
        <p>Veris is open source under the MIT license. Each service ships an example environment file; copy it to <C>.env</C> and fill in the values for your setup.</p>

        <H2>Order of setup</H2>
        <ol>
          <li><b>Contracts.</b> <C>cd contracts &amp;&amp; forge build &amp;&amp; forge test</C>, then deploy with <C>script/Deploy.s.sol</C> to a supported testnet. It writes a <C>deployment-&lt;chainId&gt;.json</C> file the services read.</li>
          <li><b>Public server.</b> <C>cd public-server &amp;&amp; npm install &amp;&amp; npm run dev</C>. Requires a Postgres <C>DATABASE_URL</C>. Tables are created on first start.</li>
          <li><b>Embedding service (optional).</b> <C>uvicorn main:app</C> inside <C>ai-embedding-service</C>.</li>
          <li><b>Web3 service.</b> <C>cd hardware-web3-service &amp;&amp; npm install &amp;&amp; npm run dev</C>.</li>
          <li><b>Portal.</b> <C>cd owner-portal &amp;&amp; npm install --legacy-peer-deps &amp;&amp; npm run dev</C>.</li>
          <li><b>Camera.</b> On a Raspberry Pi, <C>python3 raspberry_pi_camera_app.py</C> (or the headless entry point).</li>
          <li><b>Register the camera</b> in the device registry so it can mint.</li>
        </ol>

        <H2>Important settings</H2>
        <Table
          head={['Setting', 'Service', 'Purpose']}
          rows={[
            ['DATABASE_URL', 'Public server', 'Postgres connection (required).'],
            ['FRONTEND_URL', 'Public server', 'Base for claim links. Must be the public address, not localhost.'],
            ['DEVICE_API_SECRET', 'Public server, web3 service', 'Shared secret for camera-facing routes (x-device-secret).'],
            ['OPENAI_API_KEY', 'Public server', 'Descriptions, comparison and liveness fallback.'],
            ['ARKIV_ENABLED, ARKIV_PRIVATE_KEY', 'Public server', 'Mirror claims to Arkiv.'],
            ['CHAINS', 'Web3 service', 'Chains to mint on, for example sepolia,arc.'],
            ['STORAGE_PROVIDER', 'Web3 service', 'lighthouse (default) or 0g.'],
            ['LIGHTHOUSE_API_KEY', 'Web3 service', 'Upload key for Lighthouse.'],
            ['ENFORCE_PACKET', 'Web3 service', 'Set false only for testing with unsigned cameras.'],
            ['PACKET_MAX_AGE_HOURS', 'Web3 service', 'Maximum age of a signed packet. Default 24.'],
            ['ZEROG_ENABLED, ZEROG_API_KEY', 'Camera', 'Use the 0G Router for the liveness check.'],
          ]}
        />
        <Note kind="warn" title="Keep keys private">Never commit private keys or API secrets. The registrar key, device key and storage keys each control real capabilities.</Note>
      </>
    ),
  },
  {
    slug: 'faq',
    group: 'Resources',
    title: 'FAQ and troubleshooting',
    summary: 'Common questions and what to do when something looks wrong.',
    body: (
      <>
        <H2>Questions</H2>
        <H3>Do I need a Veris camera to verify a photo?</H3>
        <p>No. Anyone can verify a photo. You only need a Veris camera to create sealed photos.</p>
        <H3>Why does my photo show as an altered copy when I did not edit it?</H3>
        <p>Messaging apps, social platforms and screenshots re-encode images. The bytes change even though the picture looks the same. The result will say no visible content changes were found. Use the original file where you can.</p>
        <H3>Does “no match” mean the photo is fake?</H3>
        <p>No. It means no sealed photo resembles it. Most real photos were not taken with a Veris camera.</p>
        <H3>Does Veris prove a photo is true?</H3>
        <p>No. It proves a registered device captured those pixels at that time and that they have not changed. It cannot prove the scene was honest.</p>
        <H3>Are my uploads stored?</H3>
        <p>An exact-copy check never leaves your browser. For other checks the photo is processed by the Veris server and an AI provider. See <Link to="/docs/privacy-data">Data, privacy and retention</Link>.</p>
        <H3>Is this on a real blockchain with real money?</H3>
        <p>It runs on the Sepolia and Arc test networks. USDC on Arc testnet and test ETH have no monetary value.</p>

        <H2>Troubleshooting</H2>
        <Table
          head={['Problem', 'What to try']}
          rows={[
            ['“The check didn’t finish”', 'Check your connection and try again. Exact copies are still checked in the browser.'],
            ['HEIC photo cannot be compared', 'Export or share the photo as JPEG or PNG, then check it again.'],
            ['Camera upload says “Packet is too old”', 'Fix the camera’s clock or raise the allowed packet age on the backend.'],
            ['Camera upload says “Nonce already used”', 'That capture was already sent.'],
            ['Capture stuck as pending', 'The liveness engine did not answer. Check the camera’s 0G settings or the connection to the public server.'],
            ['Claim links point to localhost', 'Set FRONTEND_URL on the public server to its public address.'],
            ['Mint fails', 'The device wallet may be out of gas. Check the device balance on each chain.'],
            ['License purchase reverts', 'Approve USDC to the license contract first, and make sure the photographer holds the original token.'],
          ]}
        />
      </>
    ),
  },
  {
    slug: 'roadmap',
    group: 'Resources',
    title: 'Limitations and roadmap',
    summary: 'What Veris does not yet do and what is planned.',
    body: (
      <>
        <H2>Current limitations</H2>
        <ul>
          <li>Runs on test networks only.</li>
          <li>Only photos captured with a Veris camera can be sealed. Phone and DSLR attachments are in development.</li>
          <li>Heavy edits, strong filters or noise can hide a match.</li>
          <li>Records on Arkiv expire after about 180 days; older photos need the Veris server to verify.</li>
          <li>The device key is derived from hardware identifiers and stored on the camera; it is not held in a dedicated secure element.</li>
          <li>The 0G Router API key is held on the device for the liveness check.</li>
          <li>Verifying an exact copy hides the file from Veris, but not the visitor’s IP address from Arkiv’s endpoint.</li>
          <li>Most services have limited automated test coverage.</li>
        </ul>

        <H2>Planned</H2>
        <ul>
          <li>A hotshoe module for DSLR and mirrorless cameras, and a clip-on for phones. Both are simulated in the mobile app today.</li>
          <li>Wiring a dedicated image verifier into the verification pipeline.</li>
          <li>Zero-knowledge proofs of authenticity. These are not in the current release.</li>
          <li>Hiding the visitor’s IP address from the record lookup with an anonymizing RPC.</li>
        </ul>

        <H2>License</H2>
        <p>Veris is released under the MIT License.</p>
      </>
    ),
  },
]
