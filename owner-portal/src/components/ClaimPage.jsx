import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import axios from 'axios'
import { Input } from '@/components/ui/input'
import { Palette, Brutal, Pill, SectionHead, short } from '@/components/brutal'
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

const CLAIM_API = import.meta.env.VITE_CLAIM_SERVER_URL
  || (import.meta.env.DEV ? 'http://localhost:5001' : '/api/claim-server')

const LENS_MINT_ADDRESS = '0x35f5B3b5D6BF361169743cB13D66849C4C839c69'
const LENS_MINT_ABI = [
  {
    name: 'mintEdition',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_to',              type: 'address' },
      { name: '_originalTokenId', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'getTokenMetadata',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_tokenId', type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'deviceAddress',   type: 'address' },
        { name: 'deviceId',        type: 'string'  },
        { name: 'ipfsHash',        type: 'string'  },
        { name: 'imageHash',       type: 'string'  },
        { name: 'signature',       type: 'string'  },
        { name: 'timestamp',       type: 'uint256' },
        { name: 'maxEditions',     type: 'uint256' },
        { name: 'isOriginal',      type: 'bool'    },
        { name: 'originalTokenId', type: 'uint256' },
      ],
    }],
  },
]

const cleanCid = (hash) => {
  if (!hash) return null
  if (hash.startsWith('ipfs://')) return hash.slice(7)
  if (hash.startsWith('https://') || hash.startsWith('http://')) return null
  return hash
}

// Display-only branding: rewrite legacy "lensmint" naming to "veris" for UI
// text. Note: this is cosmetic and may not match the raw on-chain value.
const deBrand = (v) =>
  typeof v === 'string'
    ? v.replace(/lensmint/gi, (m) => (m[0] === m[0].toUpperCase() ? 'Veris' : 'veris'))
    : v

// Older claims were uploaded under a previous Lighthouse API key, so they only resolve on that
// key's dedicated gateway, not the current one — public IPFS gateways never have these CIDs at all.
const IPFS_GATEWAYS = [
  `${CLAIM_API}/api/image`,
  import.meta.env.VITE_IPFS_GATEWAY || 'https://unemployed-tyrannosaurus-wprec.lighthouseweb3.xyz/ipfs',
  'https://structural-crocodile-le3p6.lighthouseweb3.xyz/ipfs',
  'https://flexible-toucan-z8dgh.lighthouseweb3.xyz/ipfs',
]
const ipfsOnError = (cid) => (e) => {
  const idx = IPFS_GATEWAYS.findIndex(g => e.target.src.startsWith(g))
  const next = idx + 1
  if (next < IPFS_GATEWAYS.length) {
    e.target.src = `${IPFS_GATEWAYS[next]}/${cid}`
  } else {
    e.target.style.display = 'none'
  }
}

/* ── Provenance score ──
 * Deterministic 0-100 built ONLY from verifiable facts on the claim — mirrors mobile-app's
 * ProvenanceScore exactly (same five factors/points), styled with the same cream/ink block. */
const PROVENANCE_FACTORS = [
  { key: 'hash',   label: 'SHA-256 image hash recorded', points: 30 },
  { key: 'sig',    label: 'Hardware ECDSA signature',     points: 25 },
  { key: 'device', label: 'Camera device identity',       points: 20 },
  { key: 'mint',   label: 'Minted on-chain',               points: 15 },
  { key: 'ipfs',   label: 'Stored on IPFS / Filecoin',    points: 10 },
]

function ProvenanceScore({ imageHash, signature, deviceId, txHash, cid }) {
  const passed = {
    hash: !!imageHash,
    sig: !!signature,
    device: !!deviceId,
    mint: !!txHash,
    ipfs: !!cid,
  }
  const score = PROVENANCE_FACTORS.reduce((sum, f) => sum + (passed[f.key] ? f.points : 0), 0)
  const r = 24
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - score / 100)
  const color = score >= 85 ? Palette.green : score >= 60 ? Palette.orange : 'rgba(16,14,12,.4)'
  const label = score >= 85 ? 'Fully verifiable' : score >= 60 ? 'Strong provenance' : 'Limited provenance on record'

  return (
    <Brutal offset={3} radius={16} contentClassName="p-3.5">
      <div className="flex items-center gap-3.5">
        <div className="relative w-14 h-14 shrink-0">
          <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(16,14,12,.1)" strokeWidth="5" />
            <circle
              cx="28" cy="28" r={r} fill="none"
              stroke={color} strokeWidth="5" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 1s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-brutal-display text-base leading-none" style={{ color: Palette.ink }}>{score}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-brutal-body font-semibold text-[13px]" style={{ color: Palette.ink }}>Provenance Score</p>
          <p className="font-brutal-mono text-[9px] tracking-[0.08em] mt-0.5" style={{ color: 'rgba(16,14,12,.5)' }}>{label}</p>
        </div>
      </div>
      <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: '1px solid rgba(16,14,12,.1)' }}>
        {PROVENANCE_FACTORS.map((f) => (
          <div key={f.key} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 flex items-center justify-center"
              style={{ border: `1.5px solid ${passed[f.key] ? Palette.green : 'rgba(16,14,12,.25)'}` }}
            >
              {passed[f.key] && <span className="w-1 h-1 rounded-full" style={{ background: Palette.green }} />}
            </span>
            <span className="font-brutal-mono text-[9.5px] flex-1" style={{ color: passed[f.key] ? 'rgba(16,14,12,.7)' : 'rgba(16,14,12,.4)' }}>{f.label}</span>
            <span className="font-brutal-mono text-[9.5px]" style={{ color: passed[f.key] ? Palette.green : 'rgba(16,14,12,.3)' }}>
              {passed[f.key] ? `+${f.points}` : '+0'}
            </span>
          </div>
        ))}
      </div>
    </Brutal>
  )
}

/* ── Proof stat card — dot indicator + checkmark, mirrors mobile-app's ProofStatCard. ── */
function ProofStatCard({ title, sub, verified }) {
  return (
    <Brutal
      bg={verified ? Palette.cream : 'rgba(16,14,12,.04)'}
      border={verified ? Palette.ink : 'rgba(16,14,12,.2)'}
      borderWidth={1.5}
      offset={2}
      radius={12}
      contentClassName="flex items-center gap-2.5 px-3 py-3"
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: verified ? Palette.green : 'rgba(16,14,12,.25)' }} />
      <div className="flex-1 min-w-0">
        <p className="font-brutal-body font-semibold text-[12.5px]" style={{ color: verified ? Palette.ink : 'rgba(16,14,12,.5)' }}>{title}</p>
        <p className="font-brutal-mono text-[9px] mt-0.5" style={{ color: 'rgba(16,14,12,.5)' }}>{sub}</p>
      </div>
      {verified && <span className="font-bold text-sm" style={{ color: Palette.green }}>✓</span>}
    </Brutal>
  )
}

/* ── Copy button ── */
function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button className="opacity-50 hover:opacity-100 transition-opacity" onClick={copy} title="Copy" style={{ color: Palette.ink }}>
      {copied ? <Check size={11} style={{ color: Palette.green }} /> : <Copy size={11} />}
    </button>
  )
}

/* ── Proof item (inside accordion) — mono label/value grid cell. ── */
function ProofItem({ label, value, full, link }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(16,14,12,.04)' }}>
      <p className="font-brutal-mono text-[8.5px] tracking-[0.14em] uppercase mb-1" style={{ color: 'rgba(16,14,12,.45)' }}>{label}</p>
      <div className="flex items-center gap-1.5">
        {link ? (
          <a href={link} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 font-brutal-mono text-[10.5px] hover:brightness-125" style={{ color: Palette.orange }}>
            {value} <ExternalLink size={9} />
          </a>
        ) : (
          <span className="font-brutal-mono text-[10.5px]" style={{ color: Palette.ink }}>{value || '—'}</span>
        )}
        {full && value && <CopyBtn text={full} />}
      </div>
    </div>
  )
}

/* ── AI description ── */
function AiDescription({ description, tags, pending }) {
  const [expanded, setExpanded] = useState(false)
  if (!description && !pending) return null
  const isLong = (description?.length || 0) > 180
  return (
    <Brutal offset={4} radius={16} contentClassName="p-3.5">
      <span className="font-brutal-mono font-semibold text-[9.5px] tracking-[0.16em] uppercase" style={{ color: Palette.orange }}>AI Description</span>
      {description ? (
        <div className="mt-2">
          <p
            className="font-brutal-body text-[12.5px] leading-relaxed overflow-hidden"
            style={{ color: 'rgba(16,14,12,.7)', ...(!expanded && isLong ? { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' } : {}) }}
          >
            {description}
          </p>
          {isLong && (
            <button onClick={() => setExpanded(v => !v)} className="mt-1 font-brutal-mono text-[10px] font-semibold hover:brightness-125" style={{ color: Palette.orange }}>
              {expanded ? 'Read less' : 'Read more'}
            </button>
          )}
        </div>
      ) : (
        <p className="mt-2 font-brutal-body text-[12.5px] italic" style={{ color: 'rgba(16,14,12,.5)' }}>Generating description…</p>
      )}
      {tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-2.5 mt-2.5" style={{ borderTop: '1px solid rgba(16,14,12,.08)' }}>
          {tags.slice(0, 12).map((tag, i) => (
            <span key={i} className="font-brutal-mono text-[9px] rounded-full px-2 py-0.5" style={{ color: 'rgba(16,14,12,.6)', background: 'rgba(16,14,12,.05)', border: '1px solid rgba(16,14,12,.1)' }}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </Brutal>
  )
}

const CHANGE_TYPE_COPY = {
  recompression: 'Near-identical framing and detail — a strong pairing.',
  crop: 'Framed a little differently — expected from two separate cameras.',
  global_adjustment: 'Overall look differs slightly — likely different exposure/processing between cameras.',
  localized_edit: 'One part of the frame differs more than the rest.',
}

function scoreColor(score) {
  if (score == null) return 'rgba(16,14,12,.4)'
  if (score >= 0.85) return Palette.green
  if (score >= 0.6) return Palette.orange
  return 'rgba(16,14,12,.4)'
}

function AiFlagChip({ label, hint }) {
  if (!hint || hint.likely_ai_generated == null) return null
  const flagged = hint.likely_ai_generated
  return (
    <div className="flex items-center gap-1.5 rounded-full px-2 py-1" style={{ border: `1px solid ${flagged ? Palette.orange : 'rgba(16,14,12,.2)'}` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: flagged ? Palette.orange : Palette.green }} />
      <span className="font-brutal-mono text-[8.5px]" style={{ color: flagged ? Palette.orange : 'rgba(16,14,12,.55)' }}>
        {label} {flagged ? 'FLAGGED' : 'CLEAR'}
      </span>
    </div>
  )
}

/* ── Companion capture — the phone's own photo alongside the real, minted device capture.
   Mirrors mobile-app's CompanionCaptureCard (size="featured") exactly. ── */
function CompanionCaptureCard({ companion, deviceAiHint }) {
  if (!companion) return null
  const isPending = !companion.consistency || !companion.forensic

  if (isPending) {
    return (
      <Brutal offset={4} radius={16} contentClassName="p-4 text-center">
        <Loader2 size={18} className="animate-spin mx-auto" style={{ color: Palette.ink }} strokeWidth={1.5} />
        <p className="font-brutal-body font-semibold text-[12.5px] mt-2" style={{ color: Palette.ink }}>Pairing companion photo…</p>
        <p className="font-brutal-mono text-[9px] mt-1" style={{ color: 'rgba(16,14,12,.5)' }}>Comparing against the device capture</p>
      </Brutal>
    )
  }

  const { consistency, forensic } = companion
  const explanation = CHANGE_TYPE_COPY[forensic.change_type] || 'Compared against the device capture.'
  const color = scoreColor(consistency.score)

  return (
    <Brutal offset={4} radius={16} contentClassName="p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
          <span className="font-brutal-mono font-semibold text-[10px] tracking-[0.14em]" style={{ color: Palette.ink }}>
            {Math.round(consistency.score * 100)}% CONSISTENT
          </span>
        </div>
        <div className="rounded-lg px-2.5 py-1.5" style={{ background: 'rgba(255,255,255,.38)', border: '1px solid rgba(16,14,12,.14)', backdropFilter: 'blur(12px)' }}>
          <span className="font-brutal-mono text-[8.5px]" style={{ color: 'rgba(16,14,12,.55)' }}>
            PAIRED · {short(companion.mock_chain_ref, 6)} · OFF-CHAIN
          </span>
        </div>
      </div>

      <div className="aspect-[4/3] rounded-xl overflow-hidden" style={{ background: Palette.ink }}>
        <img src={companion.mobile_image_url} alt="Companion phone capture" className="w-full h-full object-cover" />
      </div>

      <p className="font-brutal-body text-[12.5px] leading-relaxed" style={{ color: 'rgba(16,14,12,.7)' }}>
        {explanation}
        {companion.timestamp_delta_seconds != null ? ` Captured ${companion.timestamp_delta_seconds.toFixed(1)}s apart.` : ''}
      </p>

      <div className="flex gap-px rounded-lg overflow-hidden" style={{ background: 'rgba(16,14,12,.14)' }}>
        {[
          ['VISUAL', consistency.visual],
          ['CONTENT', consistency.content],
          ['SSIM', forensic.ssim],
        ].map(([label, value]) => (
          <div key={label} className="flex-1 p-2.5" style={{ background: Palette.cream }}>
            <p className="font-brutal-mono text-[8.5px]" style={{ color: 'rgba(16,14,12,.45)' }}>{label}</p>
            <p className="font-brutal-body font-semibold text-[12.5px] mt-0.5" style={{ color: Palette.ink }}>{value != null ? `${Math.round(value * 100)}%` : '—'}</p>
          </div>
        ))}
      </div>

      {(deviceAiHint?.likely_ai_generated != null || companion.mobile_ai_hint?.likely_ai_generated != null) && (
        <div className="flex gap-2">
          <AiFlagChip label="DEVICE" hint={deviceAiHint} />
          <AiFlagChip label="PHONE" hint={companion.mobile_ai_hint} />
        </div>
      )}
    </Brutal>
  )
}

/* ── Similar verified photos ── */
function SimilarPhotos({ results }) {
  if (!results || results.length === 0) return null
  return (
    <div className="mt-6">
      <SectionHead label="SIMILAR VERIFIED PHOTOS" />
      <div className="grid grid-cols-2 gap-2.5 mt-2.5">
        {results.map((r) => {
          const cid = cleanCid(r.cid)
          const url = cid ? `${IPFS_GATEWAYS[0]}/${cid}` : null
          return (
            <a key={r.claim_id} href={`/claim/${r.claim_id}`}
              className="group block rounded-xl overflow-hidden"
              style={{ border: '1.5px solid rgba(16,14,12,.15)', background: Palette.onyx }}>
              <div className="relative aspect-square">
                {url && (
                  <img src={url} alt={r.description || 'Similar photo'}
                    className="w-full h-full object-cover" onError={ipfsOnError(cid)} />
                )}
                <div className="absolute bottom-1.5 right-1.5 rounded px-1.5 py-0.5" style={{ background: 'rgba(16,14,12,.75)', border: `1px solid ${Palette.orange}55` }}>
                  <span className="font-brutal-mono text-[8px] font-bold" style={{ color: Palette.orange }}>{Math.round(r.similarity * 100)}%</span>
                </div>
              </div>
            </a>
          )
        })}
      </div>
    </div>
  )
}

/* ── Skeleton ── */
function ClaimPageSkeleton() {
  return (
    <div className="min-h-screen flex justify-center px-5 pt-10 pb-16" style={{ background: Palette.cream }}>
      <div className="max-w-[440px] w-full animate-pulse space-y-4">
        <div className="aspect-[4/3] rounded-[22px]" style={{ background: 'rgba(16,14,12,.08)' }} />
        <div className="space-y-2.5">
          {[80, 60, 70, 50].map(w => (
            <div key={w} className="flex justify-between">
              <div className="h-2.5 rounded" style={{ width: `${w * 0.4}%`, background: 'rgba(16,14,12,.08)' }} />
              <div className="h-2.5 rounded" style={{ width: `${w * 0.5}%`, background: 'rgba(16,14,12,.08)' }} />
            </div>
          ))}
        </div>
        <div className="h-20 rounded-2xl" style={{ background: 'rgba(16,14,12,.06)' }} />
        <div className="h-12 rounded-2xl" style={{ background: 'rgba(16,14,12,.06)' }} />
        <div className="h-12 rounded-2xl" style={{ background: 'rgba(16,14,12,.06)' }} />
      </div>
    </div>
  )
}

/* ── Helpers ── */
function fmt(dateStr) {
  if (!dateStr) return '—'
  const iso = dateStr.includes('T') || dateStr.endsWith('Z')
    ? dateStr
    : dateStr.replace(' ', 'T') + 'Z'
  const d = new Date(iso)
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  if (Number.isNaN(d.getTime())) return dateStr
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${hh}:${mm}`
}

export default function ClaimPage() {
  const { claimId } = useParams()
  const { ready, authenticated, login } = usePrivy()
  const { wallets } = useWallets()
  const { address } = useAccount()

  const [claim, setClaim] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [manualAddress, setManualAddress] = useState('')
  const [useManual, setUseManual] = useState(false)
  const [mintedEdition, setMintedEdition] = useState(null)
  const [accordionOpen, setAccordionOpen] = useState(false)
  const [claimServerOffline, setClaimServerOffline] = useState(false)
  const [similar, setSimilar] = useState([])
  const [sharing, setSharing] = useState(false)

  const walletAddress = address || wallets[0]?.address

  // On-chain proof fetch — enabled once we have a token_id (from cache or live data)
  const onChainTokenId = claim?.token_id ? BigInt(claim.token_id) : undefined
  const { data: onChainMeta } = useReadContract({
    address: LENS_MINT_ADDRESS,
    abi: LENS_MINT_ABI,
    functionName: 'getTokenMetadata',
    args: onChainTokenId !== undefined ? [onChainTokenId] : undefined,
    query: { enabled: onChainTokenId !== undefined },
  })

  // Direct on-chain mint (used when claim server is offline)
  const { data: mintTxHash, writeContract, isPending: isMintPending, error: mintWriteError } = useWriteContract()
  const { isLoading: isMintConfirming, isSuccess: isMintConfirmed } = useWaitForTransactionReceipt({ hash: mintTxHash })

  const mintOnChain = async (recipient) => {
    if (!onChainTokenId) return
    writeContract({
      address: LENS_MINT_ADDRESS,
      abi: LENS_MINT_ABI,
      functionName: 'mintEdition',
      args: [recipient, onChainTokenId],
    })
  }

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`lensmint_claim_${claimId}`)
      if (stored) setMintedEdition(JSON.parse(stored))
    } catch {}
  }, [claimId])

  const saveMintedEdition = (data) => {
    setMintedEdition(data)
    try { localStorage.setItem(`lensmint_claim_${claimId}`, JSON.stringify(data)) } catch {}
  }

  const clearMintedEdition = () => {
    setMintedEdition(null)
    try { localStorage.removeItem(`lensmint_claim_${claimId}`) } catch {}
  }

  const fetchClaim = useCallback(async () => {
    try {
      const res = await axios.get(`${CLAIM_API}/check-claim?claim_id=${claimId}`, { timeout: 6000 })
      if (res.data.success) {
        setClaim(res.data)
        setNotFound(false)
        setClaimServerOffline(false)
        try { localStorage.setItem(`veris_claim_data_${claimId}`, JSON.stringify(res.data)) } catch {}
      } else {
        setNotFound(true)
      }
    } catch (e) {
      if (e.response?.status === 404) {
        setNotFound(true)
      } else {
        try {
          const cached = localStorage.getItem(`veris_claim_data_${claimId}`)
          if (cached) {
            setClaim(JSON.parse(cached))
            setClaimServerOffline(true)
          } else {
            setNotFound(true)
          }
        } catch {
          setNotFound(true)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [claimId])

  useEffect(() => {
    fetchClaim()
    const interval = setInterval(fetchClaim, 6000)
    return () => clearInterval(interval)
  }, [fetchClaim])

  useEffect(() => {
    let cancelled = false
    axios.get(`${CLAIM_API}/api/similar/${claimId}?limit=4`, { timeout: 8000 })
      .then(res => { if (!cancelled && res.data?.success) setSimilar(res.data.results || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [claimId, claim?.ai_status])

  const submit = async () => {
    const recipient = useManual ? manualAddress.trim() : walletAddress
    if (!recipient) { setError('No wallet address. Connect a wallet or enter one manually.'); return }
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) { setError('Invalid Ethereum address.'); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await axios.post(`${CLAIM_API}/claim/${claimId}/submit`, { wallet_address: recipient })
      if (res.data.success) { saveMintedEdition({ wallet: recipient }); setManualAddress('') }
      else setError(res.data.error || 'Submission failed.')
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    }
    setSubmitting(false)
  }

  const handleShare = async () => {
    if (sharing) return
    setSharing(true)
    const link = window.location.href
    const lines = [
      `Veris claim ${short(claimId, 6)} — sealed ${fmt(claim?.created_at)}.`,
      claim?.token_id ? `Token #${claim.token_id}` : null,
      `View & verify: ${link}`,
    ].filter(Boolean)
    const message = lines.join('\n')
    try {
      if (navigator.share) await navigator.share({ text: message, url: link })
      else await navigator.clipboard.writeText(message)
    } catch {}
    setSharing(false)
  }

  if (loading) return <ClaimPageSkeleton />

  /* ── Not found ── */
  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8" style={{ background: Palette.cream }}>
        <span className="font-brutal-mono text-[10px] tracking-[0.18em]" style={{ color: Palette.orange }}>CLAIM NOT FOUND</span>
        <p className="font-brutal-body text-[13px] leading-relaxed mt-2 text-center max-w-[260px]" style={{ color: 'rgba(16,14,12,.55)' }}>
          This claim doesn't exist yet, or the claim server can't be reached right now.
        </p>
      </div>
    )
  }

  const isOpen    = claim?.status === 'open' && !claimServerOffline
  const isPending = claim?.status === 'pending'

  const cid           = cleanCid(onChainMeta?.ipfsHash) || claim?.cid
  const imageHash     = onChainMeta?.imageHash     || claim?.image_hash
  const signature     = onChainMeta?.signature     || claim?.signature
  const deviceAddress = onChainMeta?.deviceAddress || claim?.device_address
  const deviceId      = onChainMeta?.deviceId      || claim?.camera_id || claim?.device_id
  const capturedAt    = onChainMeta?.timestamp
    ? new Date(Number(onChainMeta.timestamp) * 1000).toISOString()
    : claim?.created_at

  const ipfsUrl        = cid ? `${IPFS_GATEWAYS[0]}/${cid}` : null
  const etherscanTx    = claim?.tx_hash ? `https://sepolia.etherscan.io/tx/${claim.tx_hash}` : null
  const etherscanToken = `https://sepolia.etherscan.io/address/0x35f5B3b5D6BF361169743cB13D66849C4C839c69`
  const etherscanNft   = claim?.token_id ? `https://sepolia.etherscan.io/nft/${LENS_MINT_ADDRESS}/${claim.token_id}` : null
  const mapsUrl        = claim?.latitude ? `https://maps.google.com/?q=${claim.latitude},${claim.longitude}` : null
  const onChainVerified = !!onChainMeta
  const isMinted = onChainVerified || !!claim?.token_id

  return (
    <div className="min-h-screen flex justify-center px-5 pt-8 pb-16" style={{ background: Palette.cream }}>
      <div className="max-w-[440px] w-full">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5">
            <svg width="20" height="20" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <circle cx="14" cy="14" r="12.5" stroke={Palette.orange} strokeWidth="1.5" />
              <path d="M8.5 10.5L14 17.5L19.5 10.5" stroke={Palette.orange} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-brutal-display text-xs tracking-tight" style={{ color: Palette.ink }}>Veris</span>
          </div>
          <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,.38)', border: '1px solid rgba(16,14,12,.14)', backdropFilter: 'blur(12px)' }}>
            <span className="font-brutal-mono text-[10px] tracking-[0.16em]" style={{ color: 'rgba(16,14,12,.55)' }}>CLAIM / {short(claimId, 6)}</span>
          </div>
        </div>

        {/* ── Hero ── */}
        <Brutal offset={5} radius={22} borderWidth={2.5}>
          <div className="relative">
            {ipfsUrl ? (
              <img
                src={ipfsUrl}
                alt="Original capture"
                className="w-full aspect-[4/3] object-cover"
                onError={ipfsOnError(cid)}
              />
            ) : (
              <div className="aspect-[4/3] flex items-center justify-center" style={{ background: Palette.onyx }}>
                <span className="font-brutal-mono text-[9.5px] tracking-[0.14em]" style={{ color: 'rgba(237,231,218,.4)' }}>
                  {cid ? 'IMAGE UNAVAILABLE' : 'AWAITING UPLOAD'}
                </span>
              </div>
            )}
            <div
              className="absolute left-3 top-3 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
              style={{ background: 'rgba(16,14,12,.5)', border: '1px solid rgba(237,231,218,.3)', backdropFilter: 'blur(12px)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: isPending ? Palette.orange : Palette.green }} />
              <span className="font-brutal-mono text-[9.5px] tracking-[0.14em]" style={{ color: Palette.bone }}>
                {isPending ? 'PROCESSING' : 'HARDWARE VERIFIED'}
              </span>
            </div>
          </div>
        </Brutal>

        {/* ── Companion capture ── */}
        {claim?.companion_capture?.mobile_image_url && (
          <>
            <SectionHead label="COMPANION CAPTURE" />
            <CompanionCaptureCard
              companion={claim.companion_capture}
              deviceAiHint={{ likely_ai_generated: claim.likely_ai_generated ?? null, note: claim.ai_assessment }}
            />
          </>
        )}

        {/* ── Share ── */}
        <div className="mt-3.5">
          <Pill
            label={sharing ? 'OPENING…' : 'SHARE PROOF'}
            onPress={handleShare}
            disabled={sharing}
            bg={Palette.cream}
            color={Palette.ink}
            fullWidth
          />
        </div>

        {/* ── Meta ── */}
        <div className="mt-5 space-y-2.5">
          <MetaRow label="CAPTURED" value={fmt(capturedAt)} />
          <MetaRow label="DEVICE" value={deBrand(deviceId) || '—'} />
          {(claim?.location_name || claim?.latitude) && (
            <MetaRow
              label="LOCATION"
              value={claim.location_name || `${claim.latitude?.toFixed(3)}, ${claim.longitude?.toFixed(3)}`}
              href={mapsUrl}
            />
          )}
          <MetaRow label="SHA-256" value={short(imageHash, 10)} />
        </div>

        {claim?.description || claim?.ai_status === 'pending' || claim?.ai_status == null ? (
          <div className="mt-5">
            <AiDescription
              description={claim?.description}
              tags={claim?.tags}
              pending={claim?.ai_status === 'pending' || claim?.ai_status == null}
            />
          </div>
        ) : null}

        {/* ── Verification ── */}
        <SectionHead label="VERIFICATION" />
        <div className="space-y-2">
          <ProvenanceScore imageHash={imageHash} signature={signature} deviceId={deviceId} txHash={claim?.tx_hash} cid={cid} />
          <ProofStatCard
            title="ECDSA Signed"
            verified={!!signature}
            sub={signature ? (onChainVerified ? 'Hardware key · verified on-chain' : 'Hardware key · on record') : 'No signature on record'}
          />
          <ProofStatCard
            title="Minted On-Chain"
            verified={isMinted}
            sub={claim?.token_id ? `Token #${claim.token_id}` : 'Not minted yet'}
          />
          <ProofStatCard
            title="IPFS Stored"
            verified={!!cid}
            sub={cid ? 'Filecoin · Lighthouse' : 'No CID on record'}
          />
        </div>

        {/* ── Mint / claim CTA ── */}
        <div className="mt-5">
          {claimServerOffline && !mintedEdition ? (
            <Brutal offset={3} radius={16} contentClassName="p-4">
              {isMintConfirmed ? (
                <div className="text-center space-y-1.5">
                  <span className="font-brutal-mono text-[10.5px] font-semibold tracking-[0.14em]" style={{ color: Palette.green }}>✓ EDITION MINTED</span>
                  {mintTxHash && (
                    <a href={`https://sepolia.etherscan.io/tx/${mintTxHash}`} target="_blank" rel="noreferrer"
                      className="flex items-center justify-center gap-1.5 font-brutal-mono text-[10px] hover:brightness-125" style={{ color: Palette.orange }}>
                      <ExternalLink size={11} /> View transaction
                    </a>
                  )}
                </div>
              ) : !authenticated ? (
                <Pill label={ready ? 'CONNECT WALLET TO CLAIM' : 'LOADING…'} onPress={login} disabled={!ready} bg={Palette.ink} color={Palette.cream} arrow fullWidth />
              ) : walletAddress ? (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 py-2 px-3 rounded-lg" style={{ background: 'rgba(16,14,12,.05)', border: '1px solid rgba(16,14,12,.1)' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: Palette.green }} />
                    <span className="font-brutal-mono text-[11px]" style={{ color: Palette.ink }}>{walletAddress.slice(0, 8)}…{walletAddress.slice(-6)}</span>
                  </div>
                  <Pill
                    label={isMintPending || isMintConfirming ? (isMintConfirming ? 'CONFIRMING…' : 'CONFIRM IN WALLET…') : 'CLAIM EDITION ON-CHAIN'}
                    onPress={() => mintOnChain(walletAddress)}
                    disabled={isMintPending || isMintConfirming || !onChainTokenId}
                    bg={Palette.ink} color={Palette.cream} arrow fullWidth
                  />
                </div>
              ) : (
                <Pill label="CONNECT WALLET" onPress={login} bg={Palette.ink} color={Palette.cream} arrow fullWidth />
              )}
              {mintWriteError && (
                <p className="font-brutal-mono text-[9.5px] mt-2.5" style={{ color: Palette.orange }}>{mintWriteError.shortMessage || mintWriteError.message}</p>
              )}
            </Brutal>
          ) : mintedEdition ? (
            <Brutal bg={Palette.green} offset={3} radius={16} contentClassName="p-4 text-center">
              <span className="font-brutal-mono font-semibold text-[10.5px] tracking-[0.14em]" style={{ color: Palette.bone }}>✓ EDITION CLAIMED</span>
              <p className="font-brutal-mono text-[9px] mt-1.5" style={{ color: 'rgba(237,231,218,.8)' }}>
                Sent to {short(mintedEdition.wallet, 8)} · arrives in ~30–60s
              </p>
              <button onClick={clearMintedEdition} className="font-brutal-mono text-[9px] mt-2.5 underline" style={{ color: 'rgba(237,231,218,.7)' }}>
                Claim another edition
              </button>
            </Brutal>
          ) : isOpen ? (
            <Brutal offset={3} radius={16} contentClassName="p-4">
              <span className="font-brutal-mono font-semibold text-[10px] tracking-[0.16em] uppercase" style={{ color: Palette.orange }}>Claim Free Edition</span>
              <div className="mt-2.5 space-y-2.5">
                {!useManual ? (
                  <>
                    {!authenticated ? (
                      <Pill label={ready ? 'CONNECT WALLET TO CLAIM' : 'LOADING…'} onPress={login} disabled={!ready} bg={Palette.ink} color={Palette.cream} arrow fullWidth />
                    ) : walletAddress ? (
                      <>
                        <div className="flex items-center gap-2 py-2 px-3 rounded-lg" style={{ background: 'rgba(16,14,12,.05)', border: '1px solid rgba(16,14,12,.1)' }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: Palette.green }} />
                          <span className="font-brutal-mono text-[11px]" style={{ color: Palette.ink }}>{walletAddress.slice(0, 8)}…{walletAddress.slice(-6)}</span>
                        </div>
                        <Pill label={submitting ? 'SUBMITTING…' : 'CLAIM FREE EDITION'} onPress={submit} disabled={submitting} bg={Palette.ink} color={Palette.cream} arrow fullWidth />
                      </>
                    ) : (
                      <Pill label="CONNECT WALLET" onPress={login} bg={Palette.ink} color={Palette.cream} arrow fullWidth />
                    )}
                    <button onClick={() => setUseManual(true)} className="w-full font-brutal-mono text-[9.5px] text-center" style={{ color: 'rgba(16,14,12,.45)' }}>
                      Enter address manually
                    </button>
                  </>
                ) : (
                  <>
                    <Input
                      type="text"
                      placeholder="0x..."
                      value={manualAddress}
                      onChange={e => setManualAddress(e.target.value)}
                      className="font-mono h-10 text-sm"
                      style={{ background: 'rgba(16,14,12,.03)', borderColor: 'rgba(16,14,12,.15)', color: Palette.ink }}
                    />
                    <Pill label={submitting ? 'SUBMITTING…' : 'CLAIM FREE EDITION'} onPress={submit} disabled={submitting} bg={Palette.ink} color={Palette.cream} arrow fullWidth />
                    <button onClick={() => { setUseManual(false); setManualAddress('') }} className="w-full font-brutal-mono text-[9.5px] text-center" style={{ color: 'rgba(16,14,12,.45)' }}>
                      Use connected wallet instead
                    </button>
                  </>
                )}
                {error && (
                  <p className="font-brutal-mono text-[9.5px] mt-1" style={{ color: Palette.orange }}>{error}</p>
                )}
                <div className="flex items-center justify-center gap-1.5 pt-1">
                  <span className="font-brutal-mono text-[9px] rounded-full px-2 py-0.5" style={{ color: 'rgba(16,14,12,.45)', background: 'rgba(16,14,12,.04)', border: '1px solid rgba(16,14,12,.1)' }}>ERC-1155</span>
                  <span className="font-brutal-mono text-[9px] rounded-full px-2 py-0.5" style={{ color: 'rgba(16,14,12,.45)', background: 'rgba(16,14,12,.04)', border: '1px solid rgba(16,14,12,.1)' }}>Sepolia</span>
                  <span className="font-brutal-mono text-[9px] font-bold rounded-full px-2 py-0.5" style={{ color: Palette.green, background: 'rgba(30,122,76,.08)', border: `1px solid ${Palette.green}33` }}>Free · Gasless</span>
                </div>
              </div>
            </Brutal>
          ) : isPending ? (
            <Brutal offset={3} radius={16} contentClassName="p-4 text-center">
              <Loader2 size={18} className="animate-spin mx-auto" style={{ color: Palette.ink }} strokeWidth={1.5} />
              <p className="font-brutal-body font-semibold text-[12.5px] mt-2" style={{ color: Palette.ink }}>Processing photo…</p>
              <p className="font-brutal-mono text-[9.5px] mt-1" style={{ color: 'rgba(16,14,12,.5)' }}>Claim opens once the original NFT is minted.</p>
            </Brutal>
          ) : null}
        </div>

        {/* ── Similar verified photos ── */}
        <SimilarPhotos results={similar} />

        {/* ── Proof accordion ── */}
        <div className="mt-5">
          <button
            onClick={() => setAccordionOpen(v => !v)}
            className="w-full flex items-center justify-between py-2.5"
            style={{ borderTop: '1px solid rgba(16,14,12,.14)' }}
          >
            <span className="font-brutal-mono text-[10px] tracking-[0.18em]" style={{ color: 'rgba(16,14,12,.5)' }}>CRYPTOGRAPHIC PROOF DATA</span>
            {accordionOpen
              ? <ChevronUp size={13} style={{ color: Palette.orange }} />
              : <ChevronDown size={13} style={{ color: Palette.orange }} />}
          </button>

          {accordionOpen && (
            <div className="grid grid-cols-2 gap-2 pt-1.5 pb-2">
              <ProofItem label="Device Address" value={short(deviceAddress, 8)} full={deviceAddress} link={deviceAddress ? `https://sepolia.etherscan.io/address/${deviceAddress}` : null} />
              <ProofItem label="IPFS CID" value={short(cid, 8)} full={cid} link={ipfsUrl} />
              {claim?.token_id && (
                <ProofItem label="Token ID" value={`#${claim.token_id}`} link={etherscanNft || etherscanToken} />
              )}
              {etherscanTx && (
                <ProofItem label="Mint Transaction" value="View on Etherscan" link={etherscanTx} />
              )}
              <ProofItem label="ECDSA Signature" value={short(signature, 8)} full={signature} />
              <ProofItem label="SHA-256 Hash" value={short(imageHash, 8)} full={imageHash} />
              <ProofItem label="Network" value="Sepolia Testnet" />
              <ProofItem label="Contract" value="Veris ERC-1155" link={etherscanToken} />
              {claim?.recipient_address && (
                <ProofItem label="Original Owner" value={short(claim.recipient_address, 8)} full={claim.recipient_address} link={`https://sepolia.etherscan.io/address/${claim.recipient_address}`} />
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <p className="text-center font-brutal-mono text-[9.5px] mt-6" style={{ color: 'rgba(16,14,12,.4)' }}>
          Powered by Veris Protocol · No trust required, just math.
        </p>
      </div>
    </div>
  )
}

function MetaRow({ label, value, href }) {
  const content = <span className="font-brutal-body font-medium text-[12.5px]" style={{ color: Palette.ink }}>{value}</span>
  return (
    <div className="flex items-center justify-between">
      <span className="font-brutal-mono text-[9px] tracking-[0.16em]" style={{ color: 'rgba(16,14,12,.48)' }}>{label}</span>
      {href ? <a href={href} target="_blank" rel="noreferrer">{content}</a> : content}
    </div>
  )
}
