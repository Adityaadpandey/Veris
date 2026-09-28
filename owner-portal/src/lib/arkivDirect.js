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

// `fetchFn` lets the caller route the reads through Anon-RPC (see anonRpc.js)
export async function searchArkiv({ imageHash, deviceId }, fetchFn) {
  const client = createPublicClient({
    chain: rabdi({ accessKey: '' }),
    transport: http(undefined, fetchFn ? { fetchFn } : undefined),
  })
  const res = await client.select({ $key: true, status: true, record: true })
    .from(Claims).where(eq(imageHash ? 'imageHash' : 'deviceId', imageHash || deviceId)).limit(20).fetch()
  return res.entities.map((row) => {
    const rec = typeof row.record.value === 'string' ? fromHex(row.record.value) : JSON.parse(new TextDecoder().decode(row.record.value))
    return { key: row.$key, status: row.status.value, ...rec }
  })
}
