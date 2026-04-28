import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import axios from 'axios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
} from 'lucide-react'

const CLAIM_API = import.meta.env.DEV
  ? (import.meta.env.VITE_CLAIM_SERVER_URL || 'http://localhost:5001')
  : '/api/claim-server'

const IPFS_GATEWAYS = [
  import.meta.env.VITE_IPFS_GATEWAY || 'https://flexible-toucan-z8dgh.lighthouseweb3.xyz/ipfs',
  'https://w3s.link/ipfs',
  'https://ipfs.io/ipfs',
  'https://dweb.link/ipfs',
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

/* ── AI Score ring ── */
function AiScoreRing({ score }) {
  const r = 26
  const circ = 2 * Math.PI * r // ≈ 163.4
  const offset = score != null ? circ * (1 - score / 100) : circ

  const color =
    score == null ? '#646464'
    : score >= 85 ? '#34d399'
    : score >= 60 ? '#fbbf24'
    : '#f87171'

  const label =
    score == null ? 'Authenticity analysis pending…'
    : score >= 90 ? 'Extremely unlikely to be AI-generated'
    : score >= 70 ? 'Likely an authentic photograph'
    : score >= 50 ? 'Some AI indicators present — review advised'
    : 'High probability of AI generation'

  return (
    <div className="flex items-center gap-4 bg-white/[0.02] border border-white/[0.07] rounded-xl p-4">
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
            stroke={score != null ? 'url(#scoreGrad)' : 'rgba(255,255,255,0.06)'}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-extrabold leading-none" style={{ color }}>
            {score ?? '—'}
          </span>
          <span className="text-[8px] text-text-muted">/100</span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-primary">AI Authenticity</p>
        <p className="text-[10px] text-text-muted leading-relaxed mt-0.5">{label}</p>
        <div className="mt-1.5 h-1 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${score ?? 0}%`,
              background: 'linear-gradient(90deg, #E85002, #f97316, #34d399)',
            }}
          />
        </div>
      </div>
    </div>
  )
}

/* ── Proof stat card ── */
function ProofStatCard({ icon: Icon, title, sub, color }) {
  const variants = {
    green:  { card: 'border-[#34d399]/15 bg-[#34d399]/[0.04]', icon: 'bg-[#34d399]/10', check: 'text-[#34d399]' },
    orange: { card: 'border-brand/15 bg-brand/[0.04]',          icon: 'bg-brand/10',       check: 'text-brand'     },
    blue:   { card: 'border-[#60a5fa]/15 bg-[#60a5fa]/[0.04]', icon: 'bg-[#60a5fa]/10',  check: 'text-[#60a5fa]' },
  }
  const v = variants[color]
  return (
    <div className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 ${v.card}`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${v.icon}`}>
        <Icon size={13} className={v.check} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-text-primary">{title}</p>
        <p className="text-[9px] text-text-muted mt-0.5">{sub}</p>
      </div>
      <CheckCircle2 size={13} className={`shrink-0 ${v.check}`} strokeWidth={2} />
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

  const walletAddress = address || wallets[0]?.address

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
      const res = await axios.get(`${CLAIM_API}/check-claim?claim_id=${claimId}`)
      if (res.data.success) { setClaim(res.data); setNotFound(false) }
      else setNotFound(true)
    } catch (e) {
      if (e.response?.status === 404) setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [claimId])

  useEffect(() => {
    fetchClaim()
    const interval = setInterval(fetchClaim, 6000)
    return () => clearInterval(interval)
  }, [fetchClaim])

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

  const isOpen    = claim?.status === 'open'
  const isPending = claim?.status === 'pending'
  const ipfsUrl   = claim?.cid ? `${IPFS_GATEWAYS[0]}/${claim.cid}` : null
  const etherscanTx    = claim?.tx_hash ? `https://sepolia.etherscan.io/tx/${claim.tx_hash}` : null
  const etherscanToken = `https://sepolia.etherscan.io/address/0x35f5B3b5D6BF361169743cB13D66849C4C839c69`
  const mapsUrl = claim?.latitude ? `https://maps.google.com/?q=${claim.latitude},${claim.longitude}` : null

  return (
    <div className="min-h-screen flex items-start justify-center bg-black p-4 pt-10 pb-16">
      <div className="max-w-2xl w-full rounded-2xl border border-white/[0.07] bg-[#0e0e0e] overflow-hidden animate-[floatIn_0.5s_ease-out]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <VerisLogoMark size={20} />
            <span className="font-display font-bold text-white text-sm tracking-tight">Veris</span>
            <span className="text-text-muted text-xs">Protocol</span>
          </div>
          <div className="flex items-center gap-1.5 bg-[#34d399]/[0.08] border border-[#34d399]/20 rounded-full px-3 py-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full bg-[#34d399] animate-pulse"
              style={{ boxShadow: '0 0 6px #34d399' }}
            />
            <span className="text-[11px] font-semibold text-[#34d399]">Verified Original</span>
          </div>
        </div>

        {/* ── Split body ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-white/[0.06]">

          {/* Left: Photo + meta */}
          <div className="p-5 flex flex-col gap-4">
            <div className="relative rounded-xl overflow-hidden border border-white/[0.07] bg-[#141414]">
              {ipfsUrl ? (
                <img
                  src={ipfsUrl}
                  alt="Original capture"
                  className="w-full aspect-[4/3] object-cover"
                  onError={ipfsOnError(claim.cid)}
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
              <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm border border-[#34d399]/25 rounded-md px-2 py-1">
                <CheckCircle2 size={9} className="text-[#34d399]" />
                <span className="text-[9px] font-bold text-[#34d399] uppercase tracking-wide">Original · Not AI</span>
              </div>
              <div className="absolute top-2.5 right-2.5 bg-black/70 backdrop-blur-sm border border-brand/25 rounded-md px-2 py-1">
                <span className="text-[9px] font-bold text-brand">⛓ On-Chain</span>
              </div>
            </div>

            <div className="space-y-2 text-[11px]">
              <div className="flex justify-between items-center">
                <span className="text-text-muted uppercase tracking-wider text-[9px] font-medium">Captured</span>
                <span className="text-text-primary font-medium">{fmt(claim?.created_at)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-muted uppercase tracking-wider text-[9px] font-medium">Camera</span>
                <span className="font-mono text-text-secondary text-[10px]">{claim?.camera_id || claim?.device_id || '—'}</span>
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
                  <span className="font-mono text-text-secondary text-[10px]">{short(claim?.image_hash, 8)}</span>
                  {claim?.image_hash && <CopyBtn text={claim.image_hash} />}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Stats + CTA */}
          <div className="p-5 flex flex-col gap-3">
            <AiScoreRing score={claim?.ai_score ?? null} />
            <ProofStatCard icon={Lock}     title="ECDSA Signed"       sub="Hardware key · TPM 2.0" color="green"  />
            <ProofStatCard icon={Zap}      title="ZK Proof Verified"  sub="Groth16 · vlayer"        color="orange" />
            <ProofStatCard icon={Database} title="IPFS Stored"        sub="Filecoin · Lighthouse"   color="blue"   />

            {/* CTA section */}
            <div className="mt-auto pt-2">
              {mintedEdition ? (
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
                      {!authenticated ? (
                        <Button variant="primary" className="w-full gap-2" onClick={login} disabled={!ready}>
                          {ready ? <><Star size={13} /> Connect Wallet to Claim</> : 'Loading…'}
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
                        <Button variant="primary" className="w-full gap-2" onClick={login}>
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
                        placeholder="0x..."
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
                  <p className="text-center text-[9px] text-text-muted">ERC-1155 · Sepolia Testnet · Free</p>
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
            <div className="px-6 pb-5 grid grid-cols-2 gap-2">
              <ProofItem
                label="Device Address"
                value={short(claim?.device_address, 8)}
                full={claim?.device_address}
                link={claim?.device_address ? `https://sepolia.etherscan.io/address/${claim.device_address}` : null}
                mono
              />
              <ProofItem label="IPFS CID" value={short(claim?.cid, 8)} full={claim?.cid} link={ipfsUrl} mono />
              {claim?.token_id && (
                <ProofItem label="Token ID" value={`#${claim.token_id}`} link={etherscanToken} />
              )}
              {etherscanTx && (
                <ProofItem label="Mint Transaction" value="View on Etherscan" link={etherscanTx} />
              )}
              <ProofItem label="ECDSA Signature" value={short(claim?.signature, 8)} full={claim?.signature} mono />
              <ProofItem label="Network" value="Sepolia Testnet" />
              <ProofItem label="Contract" value="LensMintERC1155" link={etherscanToken} />
              {claim?.recipient_address && (
                <ProofItem
                  label="Original Owner"
                  value={short(claim.recipient_address, 8)}
                  full={claim.recipient_address}
                  link={`https://sepolia.etherscan.io/address/${claim.recipient_address}`}
                  mono
                />
              )}
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