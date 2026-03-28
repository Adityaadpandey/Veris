import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import axios from 'axios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ShieldCheck,
  Award,
  CheckCircle2,
  XCircle,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  MapPin,
} from 'lucide-react'

const CLAIM_API = import.meta.env.DEV
  ? (import.meta.env.VITE_CLAIM_SERVER_URL || 'http://localhost:5001')
  : '/api/claim-server'

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

function fmt(dateStr) {
  if (!dateStr) return '—'
  const iso = dateStr.includes('T') || dateStr.endsWith('Z')
    ? dateStr
    : dateStr.replace(' ', 'T') + 'Z'
  return new Date(iso).toLocaleString('en-IN', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })
}

function short(str, len = 12) {
  if (!str) return '—'
  if (str.length <= len * 2 + 3) return str
  return `${str.slice(0, len)}…${str.slice(-len)}`
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      className="ml-2 text-text-muted hover:text-brand transition-colors"
      onClick={copy}
      title="Copy"
    >
      {copied
        ? <Check size={12} className="text-[#34d399]" />
        : <Copy size={12} />}
    </button>
  )
}

function ProofRow({ label, value, full, link, mono }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/[0.06] last:border-0">
      <span className="text-[11px] text-text-muted font-medium uppercase tracking-wider shrink-0 mr-4">{label}</span>
      <span className="flex items-center gap-1 text-sm text-text-primary text-right">
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:brightness-125 transition-all flex items-center gap-1"
          >
            {value} <ExternalLink size={11} />
          </a>
        ) : (
          <span className={mono ? 'font-mono text-xs text-text-secondary' : ''}>{value || '—'}</span>
        )}
        {full && value && <CopyBtn text={full} />}
      </span>
    </div>
  )
}

/* ── Skeleton ── */
function ClaimPageSkeleton() {
  return (
    <div className="min-h-screen flex items-start justify-center bg-black p-6 pt-12">
      <div className="max-w-xl w-full animate-pulse space-y-0 rounded-2xl border border-white/[0.07] bg-[#0e0e0e] overflow-hidden">
        {/* Header skeleton */}
        <div className="p-8 pb-0 flex flex-col items-center gap-3">
          <div className="h-5 w-24 rounded-full bg-white/[0.06]" />
          <div className="h-8 w-64 rounded-lg bg-white/[0.06]" />
          <div className="h-4 w-80 rounded bg-white/[0.04]" />
          <div className="h-4 w-64 rounded bg-white/[0.04]" />
        </div>
        {/* Image skeleton */}
        <div className="mx-6 mt-6 aspect-video rounded-xl bg-white/[0.04]" />
        {/* Proof rows skeleton */}
        <div className="mx-6 mt-6 space-y-2">
          <div className="h-4 w-32 rounded bg-white/[0.06]" />
          <div className="rounded-xl border border-white/[0.06] p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <div className="h-3 w-20 rounded bg-white/[0.05]" />
                <div className="h-3 w-32 rounded bg-white/[0.05]" />
              </div>
            ))}
          </div>
        </div>
        {/* Ownership rows skeleton */}
        <div className="mx-6 mt-6 mb-8 space-y-2">
          <div className="h-4 w-24 rounded bg-white/[0.06]" />
          <div className="rounded-xl border border-white/[0.06] p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <div className="h-3 w-24 rounded bg-white/[0.05]" />
                <div className="h-3 w-28 rounded bg-white/[0.05]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
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
      if (res.data.success) {
        setClaim(res.data)
        setNotFound(false)
      } else {
        setNotFound(true)
      }
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
      if (res.data.success) {
        saveMintedEdition({ wallet: recipient })
        setManualAddress('')
      } else {
        setError(res.data.error || 'Submission failed.')
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    }
    setSubmitting(false)
  }

  /* ── Loading ── */
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

  const isOpen = claim?.status === 'open'
  const isPending = claim?.status === 'pending'
  const ipfsUrl = claim?.cid ? `https://gateway.lighthouse.storage/ipfs/${claim.cid}` : null
  const etherscanTx = claim?.tx_hash ? `https://sepolia.etherscan.io/tx/${claim.tx_hash}` : null
  const etherscanToken = `https://sepolia.etherscan.io/address/0x35f5B3b5D6BF361169743cB13D66849C4C839c69`

  return (
    <div className="min-h-screen flex items-start justify-center bg-black p-6 pt-12 pb-16">
      <div className="max-w-xl w-full rounded-2xl border border-white/[0.07] bg-[#0e0e0e] overflow-hidden animate-[floatIn_0.5s_ease-out]">

        {/* ── Header ── */}
        <div className="p-8 pb-0 text-center space-y-3">
          <div className="flex items-center justify-center gap-2 mb-2">
            <VerisLogoMark size={18} />
            <span className="text-xs font-semibold text-text-muted uppercase tracking-widest">Veris Protocol</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-white">
            Certificate of Authenticity
          </h1>
          <p className="text-text-secondary text-sm leading-relaxed max-w-md mx-auto">
            This media was captured and cryptographically signed by a Veris-enabled hardware device. Its origin and integrity are verifiable on the blockchain.
          </p>
        </div>

        {/* ── Photo ── */}
        {ipfsUrl && (
          <div className="relative mx-6 mt-6 rounded-xl overflow-hidden border border-white/[0.07]">
            <img
              src={ipfsUrl}
              alt="Original capture"
              className="w-full max-h-[360px] object-cover"
              onError={e => { e.target.style.display = 'none' }}
            />
            <div className="absolute bottom-3 right-3">
              <Badge variant="minted" className="shadow-lg backdrop-blur-sm">
                <CheckCircle2 size={11} className="mr-1" /> Verified Original
              </Badge>
            </div>
          </div>
        )}

        {/* ── Proof of authenticity ── */}
        <div className="mx-6 mt-6">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-widest flex items-center gap-2 mb-3">
            <ShieldCheck size={13} className="text-brand" />
            Proof of Authenticity
          </h3>
          <div className="rounded-xl border border-white/[0.07] bg-black/30 px-4">
            <ProofRow label="Captured" value={fmt(claim?.created_at)} />
            {(claim?.location_name || claim?.latitude) && (
              <ProofRow
                label="Location"
                value={claim.location_name || `${claim.latitude?.toFixed(4)}, ${claim.longitude?.toFixed(4)}`}
                link={claim.latitude ? `https://maps.google.com/?q=${claim.latitude},${claim.longitude}` : null}
              />
            )}
            <ProofRow label="Camera" value={claim?.camera_id || claim?.device_id || '—'} mono />
            <ProofRow
              label="Device Address"
              value={short(claim?.device_address, 8)}
              full={claim?.device_address}
              link={claim?.device_address ? `https://sepolia.etherscan.io/address/${claim.device_address}` : null}
              mono
            />
            <ProofRow label="SHA-256 Hash" value={short(claim?.image_hash, 10)} full={claim?.image_hash} mono />
            <ProofRow label="ECDSA Signature" value={short(claim?.signature, 10)} full={claim?.signature} mono />
            <ProofRow
              label="IPFS CID"
              value={short(claim?.cid, 10)}
              full={claim?.cid}
              link={ipfsUrl}
              mono
            />
          </div>
        </div>

        {/* ── Ownership ── */}
        <div className="mx-6 mt-5">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-widest flex items-center gap-2 mb-3">
            <Award size={13} className="text-brand" />
            Ownership
          </h3>
          <div className="rounded-xl border border-white/[0.07] bg-black/30 px-4">
            <ProofRow
              label="Original owner"
              value={claim?.recipient_address ? short(claim.recipient_address, 8) : 'Minting…'}
              full={claim?.recipient_address}
              link={claim?.recipient_address ? `https://sepolia.etherscan.io/address/${claim.recipient_address}` : null}
              mono
            />
            {claim?.token_id && (
              <ProofRow label="Token ID" value={`#${claim.token_id}`} link={etherscanToken} />
            )}
            {etherscanTx && (
              <ProofRow label="Mint transaction" value="View on Etherscan" link={etherscanTx} />
            )}
            <ProofRow label="Network" value="Sepolia Testnet" />
            <ProofRow label="Contract" value="LensMintERC1155" link={etherscanToken} />
          </div>
        </div>

        <Separator className="my-6 mx-6 bg-white/[0.06]" />

        {/* ── Claim / Success ── */}
        <div className="px-6 pb-8">
          {mintedEdition ? (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl border border-[#34d399]/20 bg-[#34d399]/10 flex items-center justify-center mx-auto">
                <CheckCircle2 size={24} className="text-[#34d399]" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="text-lg font-display font-bold text-white">Edition Claimed</h3>
                <p className="text-text-secondary text-sm mt-1">Your NFT edition is being minted — arrives in ~30–60s.</p>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-black/30 px-4">
                <ProofRow
                  label="Your wallet"
                  value={short(mintedEdition.wallet, 8)}
                  full={mintedEdition.wallet}
                  link={`https://sepolia.etherscan.io/address/${mintedEdition.wallet}`}
                  mono
                />
              </div>
              <Button variant="ghost" size="sm" onClick={clearMintedEdition}>Claim another edition</Button>
            </div>
          ) : isOpen ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Sparkles size={14} className="text-brand" />
                  Claim Your Edition
                </h3>
                <p className="text-text-secondary text-sm leading-relaxed mt-1">
                  Submit your wallet address to receive a free NFT edition of this photo.
                </p>
              </div>

              {!useManual ? (
                <>
                  {!authenticated ? (
                    <Button variant="primary" className="w-full" onClick={login} disabled={!ready}>
                      {ready ? 'Connect Wallet to Claim' : 'Loading…'}
                    </Button>
                  ) : walletAddress ? (
                    <>
                      <div className="flex items-center gap-2.5 py-2.5 px-4 bg-black/30 rounded-xl border border-white/[0.07]">
                        <span className="w-2 h-2 rounded-full bg-[#34d399] shrink-0" />
                        <span className="font-mono text-sm text-text-primary">
                          {walletAddress.slice(0, 8)}…{walletAddress.slice(-6)}
                        </span>
                      </div>
                      <Button variant="primary" className="w-full" onClick={submit} disabled={submitting}>
                        {submitting ? (
                          <><Loader2 size={14} className="animate-spin mr-2" /> Submitting…</>
                        ) : 'Claim Free Edition'}
                      </Button>
                    </>
                  ) : (
                    <Button variant="primary" className="w-full" onClick={login}>Connect Wallet</Button>
                  )}
                  <Button variant="ghost" className="w-full text-text-muted text-sm" onClick={() => setUseManual(true)}>
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
                    className="font-mono h-11"
                  />
                  <Button variant="primary" className="w-full" onClick={submit} disabled={submitting}>
                    {submitting ? (
                      <><Loader2 size={14} className="animate-spin mr-2" /> Submitting…</>
                    ) : 'Claim Free Edition'}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full text-text-muted text-sm"
                    onClick={() => { setUseManual(false); setManualAddress('') }}
                  >
                    Use connected wallet instead
                  </Button>
                </>
              )}

              {error && (
                <div className="bg-[#f87171]/10 text-[#f87171] text-sm px-4 py-3 rounded-xl border border-[#f87171]/20">
                  {error}
                </div>
              )}
            </div>
          ) : isPending ? (
            <div className="text-center space-y-3 py-4">
              <div className="w-10 h-10 rounded-2xl border border-white/8 flex items-center justify-center mx-auto">
                <Loader2 size={18} className="animate-spin text-text-muted" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-text-secondary text-sm font-medium">Processing photo…</p>
                <p className="text-text-muted text-xs mt-1">The claim will open once the original NFT is minted.</p>
              </div>
            </div>
          ) : null}
        </div>

        {/* ── Footer ── */}
        <div className="text-center py-4 px-6 text-[11px] text-text-muted border-t border-white/[0.06] flex items-center justify-center gap-1.5">
          <VerisLogoMark size={14} />
          Powered by Veris · Sepolia Testnet
        </div>

      </div>
    </div>
  )
}
