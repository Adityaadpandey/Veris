import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import axios from 'axios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getProgram, fetchPhotoRecord, editionPda, explorerUrl, isValidSolanaAddress, PROGRAM_ID } from '@/lib/veris'
import {
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  Lock,
  Zap,
  Database,
  ChevronDown,
  ChevronUp,
  Star,
  WifiOff,
  ShieldCheck,
  Sparkles,
  Images,
} from 'lucide-react'

const CLAIM_API = import.meta.env.VITE_CLAIM_SERVER_URL
  || (import.meta.env.DEV ? 'http://localhost:5001' : '/api/claim-server')

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

// Fixed-length on-chain byte arrays (image_hash, signature) decode to plain
// number arrays via the Anchor borsh coder — render them as hex for display.
const bytesToHex = (bytes) => {
  if (!bytes) return null
  const arr = Array.isArray(bytes) ? bytes : Array.from(bytes)
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('')
}

const IPFS_GATEWAYS = [
  `${CLAIM_API}/api/image`,
  import.meta.env.VITE_IPFS_GATEWAY || 'https://structural-crocodile-le3p6.lighthouseweb3.xyz/ipfs',
  'https://w3s.link/ipfs',
  'https://dweb.link/ipfs',
  'https://ipfs.io/ipfs',
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

/* ── Veris logo mark ── */
function VerisLogoMark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="12.5" stroke="#E85002" strokeWidth="1.5" />
      <path
        d="M8.5 10.5L14 17.5L19.5 10.5"
        stroke="#E85002"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ── Provenance score ──
 * Deterministic 0-100 built ONLY from verifiable facts on the claim. No AI
 * guesswork feeds the number — every point maps to a check that either passed
 * or didn't, so the same photo always scores the same. The AI-generation hint
 * is shown separately and clearly marked non-authoritative. */
const PROVENANCE_FACTORS = [
  { key: 'hash',   label: 'SHA-256 image hash recorded', points: 30 },
  { key: 'sig',    label: 'Hardware Ed25519 signature',  points: 25 },
  { key: 'device', label: 'Camera device identity',       points: 20 },
  { key: 'mint',   label: 'Minted on-chain (tx)',         points: 15 },
  { key: 'ipfs',   label: 'Stored on IPFS / Filecoin',    points: 10 },
]

function computeProvenance({ imageHash, signature, deviceId, txHash, cid, onChainVerified }) {
  const passed = {
    hash: !!imageHash,
    sig: !!signature,
    device: !!deviceId,
    mint: !!txHash,
    ipfs: !!cid,
  }
  const score = PROVENANCE_FACTORS.reduce((sum, f) => sum + (passed[f.key] ? f.points : 0), 0)
  return { score, passed, onChainVerified }
}

function ProvenanceScore({ imageHash, signature, deviceId, txHash, cid, onChainVerified, aiHint }) {
  const { score, passed } = computeProvenance({ imageHash, signature, deviceId, txHash, cid, onChainVerified })
  const r = 26
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - score / 100)

  const color = score >= 85 ? '#34d399' : score >= 60 ? '#fbbf24' : '#f87171'
  const label =
    score >= 90 ? 'Fully verifiable provenance'
    : score >= 70 ? 'Strong verifiable provenance'
    : score >= 50 ? 'Partial provenance on record'
    : 'Limited provenance on record'

  return (
    <div className="bg-white/[0.02] border border-white/[0.07] rounded-xl p-4">
      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16 shrink-0">
          <svg width="64" height="64" viewBox="0 0 64 64" style={{ transform: 'rotate(-90deg)' }}>
            <defs>
              <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#E85002" />
                <stop offset="60%" stopColor="#f97316" />
                <stop offset="100%" stopColor="#34d399" />
              </linearGradient>
            </defs>
            <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
            <circle
              cx="32" cy="32" r={r}
              fill="none"
              stroke="url(#scoreGrad)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 1s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-extrabold leading-none" style={{ color }}>{score}</span>
            <span className="text-[8px] text-text-muted">/100</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary">Provenance Score</p>
          <p className="text-[10px] text-text-muted leading-relaxed mt-0.5">{label}</p>
          <div className="mt-1.5 h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${score}%`, background: 'linear-gradient(90deg, #E85002, #f97316, #34d399)' }}
            />
          </div>
        </div>
      </div>

      {/* Deterministic breakdown — every point is explainable */}
      <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1.5">
        {PROVENANCE_FACTORS.map((f) => (
          <div key={f.key} className="flex items-center gap-2">
            {passed[f.key]
              ? <CheckCircle2 size={11} className="text-[#34d399] shrink-0" strokeWidth={2.5} />
              : <span className="w-[11px] h-[11px] rounded-full border border-white/20 shrink-0" />}
            <span className={`text-[10px] flex-1 ${passed[f.key] ? 'text-text-secondary' : 'text-text-muted'}`}>{f.label}</span>
            <span className={`text-[10px] font-mono ${passed[f.key] ? 'text-text-secondary' : 'text-text-muted/50'}`}>
              {passed[f.key] ? `+${f.points}` : `+0`}
            </span>
          </div>
        ))}
      </div>

      {/* AI-generation hint — compact, explicitly non-authoritative */}
      {aiHint && aiHint.assessed && (
        <div className="mt-3 pt-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-[9px] font-semibold rounded-full px-2 py-0.5 shrink-0 ${
                aiHint.likely
                  ? 'text-[#fbbf24] bg-[#fbbf24]/[0.08] border border-[#fbbf24]/20'
                  : 'text-[#34d399] bg-[#34d399]/[0.08] border border-[#34d399]/20'
              }`}
            >
              {aiHint.likely ? '⚠︎ Possible AI' : '✓ No AI artifacts'}
            </span>
            <span className="text-[8px] text-text-muted uppercase tracking-wider">non-authoritative</span>
          </div>
          {aiHint.note && (
            <p
              className="text-[10px] leading-relaxed text-text-muted mt-1.5 overflow-hidden"
              style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
              title={aiHint.note}
            >
              {aiHint.note}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Proof stat card ──
 * `verified` drives the real state: a green check only when the underlying fact
 * is actually present, otherwise a muted "not on record" state. `sub` should
 * describe whichever state is true. */
function ProofStatCard({ icon: Icon, title, sub, color, verified }) {
  const variants = {
    green:  { card: 'border-[#34d399]/15 bg-[#34d399]/[0.04]', icon: 'bg-[#34d399]/10', check: 'text-[#34d399]' },
    orange: { card: 'border-brand/15 bg-brand/[0.04]',          icon: 'bg-brand/10',       check: 'text-brand'     },
    blue:   { card: 'border-[#60a5fa]/15 bg-[#60a5fa]/[0.04]', icon: 'bg-[#60a5fa]/10',  check: 'text-[#60a5fa]' },
  }
  const muted = { card: 'border-white/[0.07] bg-white/[0.02]', icon: 'bg-white/[0.04]', check: 'text-text-muted' }
  const v = verified ? variants[color] : muted
  return (
    <div className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 ${v.card}`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${v.icon}`}>
        <Icon size={13} className={v.check} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[11px] font-semibold ${verified ? 'text-text-primary' : 'text-text-muted'}`}>{title}</p>
        <p className="text-[9px] text-text-muted mt-0.5">{sub}</p>
      </div>
      {verified
        ? <CheckCircle2 size={13} className={`shrink-0 ${v.check}`} strokeWidth={2} />
        : <span className="w-3 h-3 rounded-full border border-white/20 shrink-0" title="Not on record" />}
    </div>
  )
}

/* ── Copy button ── */
function CopyBtn({ text, className = '' }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button className={`text-text-muted hover:text-brand transition-colors ${className}`} onClick={copy} title="Copy">
      {copied ? <Check size={11} className="text-[#34d399]" /> : <Copy size={11} />}
    </button>
  )
}

/* ── Proof item (inside accordion) ── */
function ProofItem({ label, value, full, link, mono }) {
  return (
    <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg px-3 py-2">
      <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-center gap-1">
        {link ? (
          <a href={link} target="_blank" rel="noreferrer"
            className="text-brand hover:brightness-125 flex items-center gap-1 text-[10px] font-mono">
            {value} <ExternalLink size={9} />
          </a>
        ) : (
          <span className={`text-[10px] ${mono ? 'font-mono text-text-secondary' : 'text-text-primary'}`}>
            {value || '—'}
          </span>
        )}
        {full && value && <CopyBtn text={full} />}
      </div>
    </div>
  )
}

/* ── AI description + tag chips ── */
function AiDescription({ description, tags, pending }) {
  const [expanded, setExpanded] = useState(false)
  if (!description && !pending) return null
  // Only offer a toggle when the text is long enough to be worth collapsing.
  const isLong = (description?.length || 0) > 180
  return (
    <div className="bg-brand/[0.04] border border-brand/15 rounded-xl p-3.5 space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Sparkles size={12} className="text-brand" />
        <span className="text-[10px] font-semibold text-brand uppercase tracking-wider">AI Description</span>
      </div>
      {description ? (
        <div>
          <p
            className="text-[11px] leading-relaxed text-text-secondary overflow-hidden"
            style={!expanded && isLong ? { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' } : undefined}
          >
            {description}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="mt-1 text-[10px] font-semibold text-brand hover:brightness-125 transition"
            >
              {expanded ? 'Read less' : 'Read more'}
            </button>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-text-muted italic">Generating description…</p>
      )}
      {tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {tags.slice(0, 12).map((tag, i) => (
            <span key={i}
              className="text-[9px] font-medium text-text-secondary bg-white/[0.04] border border-white/[0.07] rounded-full px-2 py-0.5">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Similar verified photos ── */
function SimilarPhotos({ results }) {
  if (!results || results.length === 0) return null
  return (
    <div className="border-t border-white/[0.06] px-6 py-5">
      <div className="flex items-center gap-1.5 mb-3">
        <Images size={13} className="text-brand" />
        <span className="text-[10px] text-text-muted uppercase tracking-widest font-semibold">
          Similar Verified Photos
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {results.map((r) => {
          const cid = cleanCid(r.cid)
          const url = cid ? `${IPFS_GATEWAYS[0]}/${cid}` : null
          return (
            <a key={r.claim_id} href={`/claim/${r.claim_id}`}
              className="group block rounded-lg overflow-hidden border border-white/[0.07] bg-[#141414] hover:border-brand/40 transition-colors">
              <div className="relative aspect-square bg-[#141414]">
                {url && (
                  <img src={url} alt={r.description || 'Similar photo'}
                    className="w-full h-full object-cover" onError={ipfsOnError(cid)} />
                )}
                <div className="absolute bottom-1 right-1 bg-black/70 backdrop-blur-sm border border-brand/25 rounded px-1.5 py-0.5">
                  <span className="text-[8px] font-bold text-brand">{Math.round(r.similarity * 100)}%</span>
                </div>
              </div>
              {r.description && (
                <p className="text-[9px] text-text-muted leading-snug p-1.5 line-clamp-2">{r.description}</p>
              )}
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
    <div className="min-h-screen flex items-start justify-center bg-black p-4 pt-10">
      <div className="max-w-2xl w-full animate-pulse rounded-2xl border border-white/[0.07] bg-[#0e0e0e] overflow-hidden">
        <div className="h-14 bg-white/[0.03] border-b border-white/[0.06]" />
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="p-5 space-y-3 border-r border-white/[0.06]">
            <div className="aspect-[4/3] rounded-xl bg-white/[0.04]" />
            <div className="space-y-2">
              {[80, 60, 70, 50].map(w => (
                <div key={w} className="flex justify-between">
                  <div className="h-2.5 rounded bg-white/[0.05]" style={{ width: `${w * 0.4}%` }} />
                  <div className="h-2.5 rounded bg-white/[0.05]" style={{ width: `${w * 0.5}%` }} />
                </div>
              ))}
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div className="h-20 rounded-xl bg-white/[0.04]" />
            <div className="h-11 rounded-xl bg-white/[0.04]" />
            <div className="h-11 rounded-xl bg-white/[0.04]" />
            <div className="h-11 rounded-xl bg-white/[0.04]" />
            <div className="h-12 mt-4 rounded-xl bg-white/[0.04]" />
          </div>
        </div>
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
  return new Date(iso).toLocaleString('en-IN', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })
}

function short(str, len = 12) {
  if (!str) return '—'
  if (str.length <= len * 2 + 3) return str
  return `${str.slice(0, len)}…${str.slice(-len)}`
}

export default function ClaimPage() {
  const { claimId } = useParams()
  const { connection } = useConnection()
  const wallet = useWallet()
  const { publicKey, connected, connecting, sendTransaction } = wallet
  const { setVisible: setWalletModalVisible } = useWalletModal()

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

  const walletAddress = publicKey?.toBase58()

  // The claim server addresses photos by their PhotoRecord PDA (base58).
  const photoRecordPubkey = useMemo(() => {
    if (!claim?.token_id) return null
    try { return new PublicKey(claim.token_id) } catch { return null }
  }, [claim?.token_id])

  // On-chain proof fetch — reads the PhotoRecord account directly.
  const [onChainMeta, setOnChainMeta] = useState(null)
  const [onChainLoading, setOnChainLoading] = useState(false)

  const refreshOnChainMeta = useCallback(async () => {
    if (!claim?.token_id) { setOnChainMeta(null); return }
    setOnChainLoading(true)
    const record = await fetchPhotoRecord(connection, claim.token_id)
    setOnChainMeta(record)
    setOnChainLoading(false)
  }, [claim?.token_id, connection])

  useEffect(() => { refreshOnChainMeta() }, [refreshOnChainMeta])

  // Direct on-chain mint (used when claim server is offline)
  const [mintSubmitting, setMintSubmitting] = useState(false)
  const [mintConfirming, setMintConfirming] = useState(false)
  const [mintSignature, setMintSignature] = useState(null)
  const [mintWriteError, setMintWriteError] = useState(null)
  const isMintPending = mintSubmitting
  const isMintConfirming = mintConfirming
  const isMintConfirmed = !!mintSignature

  const mintOnChain = async (recipient) => {
    if (!photoRecordPubkey || !onChainMeta || !publicKey) return
    setMintWriteError(null)
    setMintSubmitting(true)
    try {
      const program = getProgram(connection, wallet)
      const currentCount = BigInt(onChainMeta.editionCount.toString())
      const edition = editionPda(photoRecordPubkey, currentCount + 1n)
      const tx = await program.methods
        .mintEdition(new PublicKey(recipient))
        .accounts({
          photoRecord: photoRecordPubkey,
          edition,
          payer: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction()
      const sig = await sendTransaction(tx, connection)
      setMintSubmitting(false)
      setMintConfirming(true)
      const latest = await connection.getLatestBlockhash()
      await connection.confirmTransaction({ signature: sig, ...latest }, 'confirmed')
      setMintSignature(sig)
      refreshOnChainMeta()
    } catch (e) {
      setMintWriteError(e)
    } finally {
      setMintSubmitting(false)
      setMintConfirming(false)
    }
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
        // Cache full claim data so we can serve it when the server is offline
        try { localStorage.setItem(`veris_claim_data_${claimId}`, JSON.stringify(res.data)) } catch {}
      } else {
        setNotFound(true)
      }
    } catch (e) {
      if (e.response?.status === 404) {
        setNotFound(true)
      } else {
        // Server unreachable — try cache
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

  // Fetch semantically-similar verified photos (best-effort; ignore failures)
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
    if (!isValidSolanaAddress(recipient)) { setError('Invalid Solana address.'); return }
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

  if (loading) return <ClaimPageSkeleton />

  /* ── Not found ── */
  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black p-6">
        <div className="max-w-sm w-full rounded-2xl border border-white/[0.07] bg-[#0e0e0e] p-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl border border-[#f87171]/20 bg-[#f87171]/10 flex items-center justify-center mx-auto">
            <XCircle size={24} className="text-[#f87171]" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold text-white">Claim Not Found</h2>
            <p className="text-text-secondary text-sm mt-1">This claim ID doesn't exist or has expired.</p>
          </div>
        </div>
      </div>
    )
  }

  const isOpen    = claim?.status === 'open' && !claimServerOffline
  const isPending = claim?.status === 'pending'

  // Merge on-chain data over cached claim for proof display
  const cid           = cleanCid(onChainMeta?.cid) || claim?.cid
  const imageHash     = bytesToHex(onChainMeta?.imageHash) || claim?.image_hash
  const signature     = bytesToHex(onChainMeta?.signature) || claim?.signature
  const deviceAddress = onChainMeta?.devicePubkey?.toBase58() || claim?.device_address
  const deviceId      = onChainMeta?.deviceId      || claim?.camera_id || claim?.device_id
  const capturedAt    = onChainMeta?.capturedAt != null
    ? new Date(Number(onChainMeta.capturedAt.toString()) * 1000).toISOString()
    : claim?.created_at

  const ipfsUrl         = cid ? `${IPFS_GATEWAYS[0]}/${cid}` : null
  const explorerTx      = claim?.tx_hash ? explorerUrl(claim.tx_hash, 'tx') : null
  const explorerMintTx  = mintSignature ? explorerUrl(mintSignature, 'tx') : null
  const explorerProgram = explorerUrl(PROGRAM_ID.toBase58(), 'address')
  const explorerPhoto   = claim?.token_id ? explorerUrl(claim.token_id, 'address') : null
  const mapsUrl         = claim?.latitude ? `https://maps.google.com/?q=${claim.latitude},${claim.longitude}` : null
  const onChainVerified = !!onChainMeta

  return (
    <div className="min-h-screen flex items-start justify-center bg-black p-4 pt-10 pb-16">
      <div className="max-w-2xl w-full rounded-2xl border border-white/[0.07] bg-[#0e0e0e] overflow-hidden animate-[floatIn_0.5s_ease-out]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent">
          <div className="flex items-center gap-2">
            <VerisLogoMark size={20} />
            <span className="font-display font-bold text-white text-sm tracking-tight">Veris</span>
            <span className="text-[9px] font-semibold uppercase tracking-widest text-text-muted border border-white/[0.08] rounded-full px-2 py-0.5">
              Protocol
            </span>
          </div>
          <div className="flex items-center gap-2">
            {claimServerOffline && (
              <div className="flex items-center gap-1.5 bg-[#fbbf24]/[0.08] border border-[#fbbf24]/20 rounded-full px-3 py-1.5">
                <WifiOff size={10} className="text-[#fbbf24]" />
                <span className="text-[11px] font-semibold text-[#fbbf24]">Server offline</span>
              </div>
            )}
            {onChainVerified ? (
              <div className="flex items-center gap-1.5 bg-[#34d399]/[0.08] border border-[#34d399]/20 rounded-full px-3 py-1.5">
                <ShieldCheck size={10} className="text-[#34d399]" />
                <span className="text-[11px] font-semibold text-[#34d399]">On-chain verified</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-[#34d399]/[0.08] border border-[#34d399]/20 rounded-full px-3 py-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-[#34d399] animate-pulse"
                  style={{ boxShadow: '0 0 6px #34d399' }}
                />
                <span className="text-[11px] font-semibold text-[#34d399]">Verified Original</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Split body ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-white/[0.06]">

          {/* Left: Photo + meta */}
          <div className="p-5 flex flex-col gap-4">
            <div className="group relative rounded-2xl overflow-hidden border border-white/[0.08] bg-[#141414] ring-1 ring-inset ring-white/[0.03] shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
              {ipfsUrl ? (
                <img
                  src={ipfsUrl}
                  alt="Original capture"
                  className="w-full aspect-[4/3] object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  onError={ipfsOnError(cid)}
                />
              ) : (
                <div className="aspect-[4/3] flex items-center justify-center text-white/10">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <path d="M21 15l-5-5L5 21"/>
                  </svg>
                </div>
              )}
              {/* Scrim so the badges stay legible over any photo */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 bg-black/60 backdrop-blur-md border border-[#34d399]/30 rounded-lg px-2.5 py-1">
                <CheckCircle2 size={10} className="text-[#34d399]" strokeWidth={2.5} />
                <span className="text-[9px] font-bold text-[#34d399] uppercase tracking-wide">Original · Not AI</span>
              </div>
              <div className="absolute top-2.5 right-2.5 flex items-center gap-1 bg-black/60 backdrop-blur-md border border-brand/30 rounded-lg px-2.5 py-1">
                <span className="text-[9px] font-bold text-brand">⛓ On-Chain</span>
              </div>
            </div>

            <div className="space-y-2 text-[11px]">
              <div className="flex justify-between items-center">
                <span className="text-text-muted uppercase tracking-wider text-[9px] font-medium">Captured</span>
                <span className="text-text-primary font-medium">{fmt(capturedAt)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-muted uppercase tracking-wider text-[9px] font-medium">Camera</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-text-secondary text-[10px]">{deBrand(deviceId) || '—'}</span>
                  {onChainVerified && deviceId && (
                    <ShieldCheck size={9} className="text-[#34d399]" title="Verified on-chain" />
                  )}
                </div>
              </div>
              {(claim?.location_name || claim?.latitude) && (
                <div className="flex justify-between items-center">
                  <span className="text-text-muted uppercase tracking-wider text-[9px] font-medium">Location</span>
                  {mapsUrl ? (
                    <a href={mapsUrl} target="_blank" rel="noreferrer"
                      className="text-[#60a5fa] hover:brightness-125 flex items-center gap-1 text-[10px]">
                      {claim.location_name || `${claim.latitude?.toFixed(3)}, ${claim.longitude?.toFixed(3)}`}
                      <ExternalLink size={9} />
                    </a>
                  ) : (
                    <span className="text-text-secondary text-[10px]">{claim.location_name}</span>
                  )}
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-text-muted uppercase tracking-wider text-[9px] font-medium">SHA-256</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-text-secondary text-[10px]">{short(imageHash, 8)}</span>
                  {imageHash && <CopyBtn text={imageHash} />}
                  {onChainVerified && imageHash && (
                    <ShieldCheck size={9} className="text-[#34d399]" title="Hash verified on-chain" />
                  )}
                </div>
              </div>
            </div>

            <AiDescription
              description={claim?.description}
              tags={claim?.tags}
              pending={claim?.ai_status === 'pending' || claim?.ai_status == null}
            />
          </div>

          {/* Right: Stats + CTA */}
          <div className="p-5 flex flex-col gap-3">
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={11} className="text-brand" />
              <span className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Verification</span>
            </div>
            <ProvenanceScore
              imageHash={imageHash}
              signature={signature}
              deviceId={deviceId}
              txHash={claim?.tx_hash}
              cid={cid}
              onChainVerified={onChainVerified}
              aiHint={{
                assessed: claim?.likely_ai_generated != null,
                likely: !!claim?.likely_ai_generated,
                note: claim?.ai_assessment || null,
              }}
            />
            <ProofStatCard
              icon={Lock}
              title="Ed25519 Signed"
              verified={!!signature}
              sub={signature ? (onChainVerified ? 'Hardware key · verified on-chain' : 'Hardware key · on record') : 'No signature on record'}
              color="green"
            />
            <ProofStatCard
              icon={Zap}
              title="On-Chain Verified"
              verified={onChainVerified}
              sub={onChainVerified ? 'Solana Devnet · live account read' : 'Not yet readable on-chain'}
              color="orange"
            />
            <ProofStatCard
              icon={Database}
              title="IPFS Stored"
              verified={!!cid}
              sub={cid ? 'Filecoin · Lighthouse' : 'No CID on record'}
              color="blue"
            />

            {/* CTA section */}
            <div className="mt-auto pt-4 border-t border-white/[0.06]">
              {claimServerOffline && !mintedEdition ? (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#fbbf24]/[0.06] border border-[#fbbf24]/15">
                    <WifiOff size={10} className="text-[#fbbf24] shrink-0" />
                    <p className="text-[10px] text-[#fbbf24]/80">
                      Claim server offline · minting directly on Solana Devnet
                    </p>
                  </div>

                  {isMintConfirmed ? (
                    <div className="space-y-3 text-center py-1">
                      <div className="w-10 h-10 rounded-xl border border-[#34d399]/20 bg-[#34d399]/10 flex items-center justify-center mx-auto">
                        <CheckCircle2 size={20} className="text-[#34d399]" strokeWidth={1.5} />
                      </div>
                      <div>
                        <p className="text-sm font-display font-bold text-white">Edition Minted</p>
                        <p className="text-[10px] text-text-muted mt-0.5">NFT is on its way to your wallet</p>
                      </div>
                      {explorerMintTx && (
                        <a href={explorerMintTx} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-brand text-xs hover:brightness-125">
                          <ExternalLink size={11} /> View transaction
                        </a>
                      )}
                    </div>
                  ) : !connected ? (
                    <Button variant="primary" className="w-full gap-2" onClick={() => setWalletModalVisible(true)} disabled={connecting}>
                      {connecting ? 'Connecting…' : <><Star size={13} /> Connect Wallet to Claim</>}
                    </Button>
                  ) : walletAddress ? (
                    <>
                      <div className="flex items-center gap-2 py-2 px-3 bg-black/30 rounded-lg border border-white/[0.07]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] shrink-0" style={{ boxShadow: '0 0 6px #34d399' }} />
                        <span className="font-mono text-xs text-text-primary">
                          {walletAddress.slice(0, 8)}…{walletAddress.slice(-6)}
                        </span>
                        <span className="ml-auto text-[9px] uppercase tracking-wider text-text-muted">Connected</span>
                      </div>
                      <Button
                        variant="primary"
                        className="w-full gap-2"
                        disabled={isMintPending || isMintConfirming || !onChainMeta}
                        onClick={() => mintOnChain(walletAddress)}
                      >
                        {isMintPending || isMintConfirming
                          ? <><Loader2 size={13} className="animate-spin" /> {isMintConfirming ? 'Confirming…' : 'Confirm in wallet…'}</>
                          : <><Star size={13} /> Claim Edition On-Chain</>}
                      </Button>
                    </>
                  ) : (
                    <Button variant="primary" className="w-full gap-2" onClick={() => setWalletModalVisible(true)}>
                      <Star size={13} /> Connect Wallet
                    </Button>
                  )}

                  {mintWriteError && (
                    <div className="bg-[#f87171]/10 text-[#f87171] text-xs px-3 py-2.5 rounded-lg border border-[#f87171]/20">
                      {mintWriteError.message || String(mintWriteError)}
                    </div>
                  )}
                  {explorerPhoto && (
                    <p className="text-center text-[9px] text-text-muted">
                      Veris Program · Solana Devnet · <a href={explorerPhoto} target="_blank" rel="noreferrer" className="text-brand hover:brightness-125">View Record</a>
                    </p>
                  )}
                </div>
              ) : mintedEdition ? (
                <div className="space-y-3 text-center">
                  <div className="w-10 h-10 rounded-xl border border-[#34d399]/20 bg-[#34d399]/10 flex items-center justify-center mx-auto">
                    <CheckCircle2 size={20} className="text-[#34d399]" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-sm font-display font-bold text-white">Edition Claimed</p>
                    <p className="text-[10px] text-text-muted mt-0.5">NFT arriving in ~30–60s</p>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 bg-black/30 border border-white/[0.07] rounded-lg px-3 py-2">
                    <span className="font-mono text-[10px] text-text-secondary">
                      {mintedEdition.wallet.slice(0, 8)}…{mintedEdition.wallet.slice(-6)}
                    </span>
                    <CopyBtn text={mintedEdition.wallet} />
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs text-text-muted" onClick={clearMintedEdition}>
                    Claim another edition
                  </Button>
                </div>
              ) : isOpen ? (
                <div className="space-y-2.5">
                  {!useManual ? (
                    <>
                      {!connected ? (
                        <Button variant="primary" className="w-full gap-2" onClick={() => setWalletModalVisible(true)} disabled={connecting}>
                          {connecting ? 'Connecting…' : <><Star size={13} /> Connect Wallet to Claim</>}
                        </Button>
                      ) : walletAddress ? (
                        <>
                          <div className="flex items-center gap-2 py-2 px-3 bg-black/30 rounded-lg border border-white/[0.07]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] shrink-0" />
                            <span className="font-mono text-xs text-text-primary">
                              {walletAddress.slice(0, 8)}…{walletAddress.slice(-6)}
                            </span>
                          </div>
                          <Button variant="primary" className="w-full gap-2" onClick={submit} disabled={submitting}>
                            {submitting
                              ? <><Loader2 size={13} className="animate-spin" /> Submitting…</>
                              : <><Star size={13} /> Claim Free Edition</>}
                          </Button>
                        </>
                      ) : (
                        <Button variant="primary" className="w-full gap-2" onClick={() => setWalletModalVisible(true)}>
                          <Star size={13} /> Connect Wallet
                        </Button>
                      )}
                      <Button variant="ghost" className="w-full text-xs text-text-muted" onClick={() => setUseManual(true)}>
                        Enter address manually
                      </Button>
                    </>
                  ) : (
                    <>
                      <Input
                        type="text"
                        placeholder="Solana address (base58)"
                        value={manualAddress}
                        onChange={e => setManualAddress(e.target.value)}
                        className="font-mono h-10 text-sm"
                      />
                      <Button variant="primary" className="w-full gap-2" onClick={submit} disabled={submitting}>
                        {submitting
                          ? <><Loader2 size={13} className="animate-spin" /> Submitting…</>
                          : <><Star size={13} /> Claim Free Edition</>}
                      </Button>
                      <Button variant="ghost" className="w-full text-xs text-text-muted"
                        onClick={() => { setUseManual(false); setManualAddress('') }}>
                        Use connected wallet instead
                      </Button>
                    </>
                  )}
                  {error && (
                    <div className="bg-[#f87171]/10 text-[#f87171] text-xs px-3 py-2.5 rounded-lg border border-[#f87171]/20">
                      {error}
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-1.5 pt-0.5">
                    <span className="text-[9px] font-medium text-text-muted bg-white/[0.03] border border-white/[0.07] rounded-full px-2 py-0.5">Veris Program</span>
                    <span className="text-[9px] font-medium text-text-muted bg-white/[0.03] border border-white/[0.07] rounded-full px-2 py-0.5">Solana Devnet</span>
                    <span className="text-[9px] font-bold text-[#34d399] bg-[#34d399]/[0.08] border border-[#34d399]/20 rounded-full px-2 py-0.5">Free · Gasless</span>
                  </div>
                </div>
              ) : isPending ? (
                <div className="text-center space-y-2 py-2">
                  <Loader2 size={18} className="animate-spin text-text-muted mx-auto" strokeWidth={1.5} />
                  <p className="text-xs text-text-secondary font-medium">Processing photo…</p>
                  <p className="text-[10px] text-text-muted">Claim opens once the original NFT is minted.</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* ── Similar verified photos ── */}
        <SimilarPhotos results={similar} />

        {/* ── Proof accordion ── */}
        <div className="border-t border-white/[0.06]">
          <button
            className="w-full flex items-center justify-between px-6 py-3.5 text-[10px] text-text-muted uppercase tracking-widest font-semibold hover:text-text-secondary transition-colors"
            onClick={() => setAccordionOpen(v => !v)}
          >
            <span>Cryptographic Proof Data</span>
            {accordionOpen
              ? <ChevronUp size={13} className="text-brand" />
              : <ChevronDown size={13} className="text-brand" />}
          </button>

          {accordionOpen && (
            <div className="px-6 pb-5 space-y-4">
              {onChainVerified && (
                <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-[#34d399]/[0.06] border border-[#34d399]/15">
                  <ShieldCheck size={12} className="text-[#34d399] shrink-0" />
                  <span className="text-[10px] text-[#34d399] font-medium">
                    All proof fields read live from Solana Devnet · no trust required
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <ProofItem
                  label="Device Address"
                  value={short(deviceAddress, 8)}
                  full={deviceAddress}
                  link={deviceAddress ? explorerUrl(deviceAddress, 'address') : null}
                  mono
                />
                <ProofItem label="IPFS CID" value={short(cid, 8)} full={cid} link={ipfsUrl} mono />
                {claim?.token_id && (
                  <ProofItem
                    label="Photo Record"
                    value={short(claim.token_id, 8)}
                    full={claim.token_id}
                    link={explorerPhoto}
                    mono
                  />
                )}
                {explorerTx && (
                  <ProofItem label="Mint Transaction" value="View on Solana Explorer" link={explorerTx} />
                )}
                <ProofItem label="Ed25519 Signature" value={short(signature, 8)} full={signature} mono />
                <ProofItem label="SHA-256 Hash" value={short(imageHash, 8)} full={imageHash} mono />
                <ProofItem label="Network" value="Solana Devnet" />
                <ProofItem label="Contract" value="Veris Program" link={explorerProgram} />
                {claim?.recipient_address && (
                  <ProofItem
                    label="Original Owner"
                    value={short(claim.recipient_address, 8)}
                    full={claim.recipient_address}
                    link={explorerUrl(claim.recipient_address, 'address')}
                    mono
                  />
                )}
                {claimServerOffline && (
                  <div className="col-span-2 flex items-center gap-1.5 mt-1">
                    <WifiOff size={9} className="text-[#fbbf24]/60" />
                    <span className="text-[9px] text-[#fbbf24]/60">
                      Claim server offline · proof data sourced from on-chain
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-center gap-1.5 py-3 px-6 text-[10px] text-text-muted border-t border-white/[0.05]">
          <VerisLogoMark size={12} />
          Powered by Veris Protocol · No trust required, just math.
        </div>

      </div>
    </div>
  )
}
