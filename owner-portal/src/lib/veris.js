import { PublicKey } from '@solana/web3.js'
import { AnchorProvider, Program, utils } from '@coral-xyz/anchor'
import idl from './idl/veris.json'

// ---- Constants -----------------------------------------------------------

export const PROGRAM_ID = new PublicKey(idl.address)
export const CLUSTER = 'devnet'
export const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com'

// ---- Program ---------------------------------------------------------------

// Minimal read-only "wallet" so an AnchorProvider (and therefore a Program)
// can be built even when no wallet is connected yet. Any attempt to sign
// will throw — callers that need to send transactions must pass the real
// wallet-adapter wallet instead.
const READONLY_WALLET = {
  publicKey: PublicKey.default,
  signTransaction: async () => {
    throw new Error('Read-only wallet cannot sign transactions')
  },
  signAllTransactions: async () => {
    throw new Error('Read-only wallet cannot sign transactions')
  },
}

export function getProgram(connection, wallet) {
  const provider = new AnchorProvider(connection, wallet || READONLY_WALLET, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  })
  return new Program(idl, provider)
}

// ---- PDA helpers -----------------------------------------------------------

function toBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes
  if (bytes instanceof Uint8Array) return Buffer.from(bytes)
  return Buffer.from(bytes)
}

export function photoPda(imageHashBytes) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('photo'), toBuffer(imageHashBytes)],
    PROGRAM_ID
  )
  return pda
}

export function editionPda(photoKey, numberBigInt) {
  const key = photoKey instanceof PublicKey ? photoKey : new PublicKey(photoKey)
  const numberBuf = Buffer.alloc(8)
  numberBuf.writeBigUInt64LE(BigInt(numberBigInt))
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('edition'), key.toBuffer(), numberBuf],
    PROGRAM_ID
  )
  return pda
}

// ---- Account fetch helpers --------------------------------------------------

export async function fetchPhotoRecord(connection, addressBase58) {
  try {
    const program = getProgram(connection)
    const address = addressBase58 instanceof PublicKey ? addressBase58 : new PublicKey(addressBase58)
    const account = await program.account.photoRecord.fetch(address)
    return { address, ...account }
  } catch {
    return null
  }
}

// IDL account discriminators (8-byte Anchor sighash prefixes) used to filter
// getProgramAccounts without decoding every account on the program.
const PHOTO_RECORD_DISCRIMINATOR = Buffer.from(
  idl.accounts.find((a) => a.name === 'PhotoRecord').discriminator
)
const EDITION_DISCRIMINATOR = Buffer.from(
  idl.accounts.find((a) => a.name === 'Edition').discriminator
)

// Edition has a fixed layout: 8 (discriminator) + 32 (photo) + 8 (number) = 48,
// so `owner` starts at byte offset 48 and can be matched server-side via memcmp.
const EDITION_OWNER_OFFSET = 48

/**
 * Returns everything the given owner holds on-chain: PhotoRecords they
 * originated/own, and Editions minted to them.
 *
 * PhotoRecord cannot be memcmp-filtered by owner because it has variable-
 * length strings (`device_id`, `cid`) *before* the `owner` field, so the byte
 * offset of `owner` differs per account. Instead we fetch all PhotoRecord
 * accounts by discriminator only, decode them, and filter by owner client-side.
 */
export async function fetchOwnedRecords(connection, ownerPubkey) {
  const program = getProgram(connection)
  const owner = ownerPubkey instanceof PublicKey ? ownerPubkey : new PublicKey(ownerPubkey)

  const photoAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 0, bytes: utils.bytes.bs58.encode(PHOTO_RECORD_DISCRIMINATOR) } },
    ],
  })
  const photos = photoAccounts
    .map(({ pubkey, account }) => {
      try {
        return { pubkey, account: program.coder.accounts.decode('photoRecord', account.data) }
      } catch {
        return null
      }
    })
    .filter((r) => r && r.account.owner.equals(owner))

  const editionAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 0, bytes: utils.bytes.bs58.encode(EDITION_DISCRIMINATOR) } },
      { memcmp: { offset: EDITION_OWNER_OFFSET, bytes: owner.toBase58() } },
    ],
  })
  const editions = editionAccounts
    .map(({ pubkey, account }) => {
      try {
        return { pubkey, account: program.coder.accounts.decode('edition', account.data) }
      } catch {
        return null
      }
    })
    .filter(Boolean)

  return { photos, editions }
}

// ---- Explorer / validation helpers ------------------------------------------

export function explorerUrl(value, type = 'address') {
  const kind = type === 'tx' ? 'tx' : 'address'
  return `https://explorer.solana.com/${kind}/${value}?cluster=${CLUSTER}`
}

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export function isValidSolanaAddress(str) {
  if (typeof str !== 'string' || !BASE58_RE.test(str)) return false
  try {
    new PublicKey(str)
    return true
  } catch {
    return false
  }
}
