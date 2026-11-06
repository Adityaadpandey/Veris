// Looks a photo up on Arkiv straight from the browser, so the check works without api.veris.live
// and our server never learns which photo someone is verifying. The public Arkiv endpoint needs no
// key (it is rate limited), which is fine for a lookup page.
import { createPublicClient } from '@arkiv-network/sdk'
import { rabdi } from '@arkiv-network/sdk/chains'
import { eq } from '@arkiv-network/sdk/query'
import { addr, bytes, defineSchema, str } from '@arkiv-network/sdk/schema'
import { http } from 'viem'

// Same shape public-server writes (see arkiv/schema.md)
const Claims = defineSchema('veris-claim', {
  claimId: str().indexed(),
  imageHash: str().indexed(),
  deviceId: str().indexed().optional(),
  owner: addr().indexed().optional(),
  status: str().indexed(),
  record: bytes(),
})

// Arkiv hands bytes back as 0x hex; the browser has no Buffer, so decode by hand
const fromHex = (hex) => JSON.parse(new TextDecoder().decode(Uint8Array.from(hex.replace(/^0x/, '').match(/../g) || [], (b) => parseInt(b, 16))))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// The keyless endpoint answers 429 ANON_COST_LIMITED now and then, and viem would wait out its
// Retry-After header (we saw a lookup take 2.5 minutes). So no built-in retries: we retry a few
// times with a short pause, and give up after DEADLINE_MS so the page can use the Veris server.
const DEADLINE_MS = 8000

// `fetchFn` lets the caller route the reads through Anon-RPC (see anonRpc.js)
export async function searchArkiv({ imageHash, deviceId }, fetchFn) {
  const client = createPublicClient({
    chain: rabdi({ accessKey: '' }),
    transport: http(undefined, { timeout: 4000, retryCount: 0, ...(fetchFn && { fetchFn }) }),
  })
  const run = async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await client.select({ $key: true, status: true, record: true })
          .from(Claims).where(eq(imageHash ? 'imageHash' : 'deviceId', imageHash || deviceId)).limit(20).fetch()
      } catch (err) {
        if (attempt >= 3) throw err
        await sleep(250 * (attempt + 1))
      }
    }
  }
  const res = await Promise.race([run(), sleep(DEADLINE_MS).then(() => { throw new Error('Arkiv took too long') })])
  return res.entities.map((row) => {
    const rec = typeof row.record.value === 'string' ? fromHex(row.record.value) : JSON.parse(new TextDecoder().decode(row.record.value))
    return { key: row.$key, status: row.status.value, ...rec }
  })
}

// SHA-256 of the file's bytes, computed on the user's device. Null where the browser has no
// crypto.subtle (plain http), and the caller then just uses the server like before.
export async function sha256OfFile(file) {
  if (!globalThis.crypto?.subtle) return null
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

// Exact-match check without sending the photo anywhere. Returns the same verdict the server
// builds for a byte-identical photo, or null when Arkiv has no minted claim for this hash.
// Altered copies still need the server's perceptual check, so null means "ask the server".
export async function verifyExactOnArkiv(file, fetchFn) {
  const hash = await sha256OfFile(file)
  if (!hash) return null
  const hit = (await searchArkiv({ imageHash: hash }, fetchFn)).find((r) => r.status === 'minted')
  if (!hit) return null
  return {
    type: 'authentic_original',
    claim_id: hit.claimId,
    token_id: hit.chains?.[0]?.tokenId || null,
    message: 'Authentic original — byte-for-byte identical to the verified on-chain image.',
    image_hash: hash,
    claim_url: `${location.origin}/claim/${hit.claimId}`,
  }
}
