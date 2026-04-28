import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Camera,
  Cpu,
  Images,
  RotateCcw,
  ExternalLink,
  Copy,
  Check,
  LogOut,
  CircleAlert,
  QrCode,
} from 'lucide-react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'
const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || 'your-privy-app-id'
const PORTAL_URL   = import.meta.env.VITE_PORTAL_URL   || window.location.origin

const IPFS_GATEWAYS = [
  import.meta.env.VITE_IPFS_GATEWAY || 'https://flexible-toucan-z8dgh.lighthouseweb3.xyz/ipfs',
  'https://w3s.link/ipfs',
  'https://ipfs.io/ipfs',
  'https://dweb.link/ipfs',
]
const ipfsUrl = (cid) => cid ? `${IPFS_GATEWAYS[0]}/${cid}` : null
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
function VerisLogoMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="12.5" stroke="#E85002" strokeWidth="1.5" />
      <path d="M8.5 10.5L14 17.5L19.5 10.5" stroke="#E85002" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function imageState(img) {
  if (img.status === 'minted') return 'minted'
  if (img.status === 'uploaded' && img.claimId && !img.tokenId) return 'minting'
  if (img.status === 'uploaded' && !img.claimId) return 'claim_failed'
  if (img.status === 'saved') return 'upload_failed'
  return img.status
}

function statusVariant(img) {
  const s = imageState(img)
  if (s === 'minted') return 'minted'
  if (s === 'minting') return 'uploaded'
  if (s === 'upload_failed' || s === 'claim_failed') return 'failed'
  return 'default'
}

/* ── QR Modal ── */
function QRModal({ url, onClose, open }) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}&bgcolor=0e0e0e&color=F9F9F9&margin=16`
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Claim QR Code</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-5 py-2">
          <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-[#0e0e0e] p-1">
            <img src={qrSrc} alt="QR Code" className="w-56 h-56" />
          </div>
          <p className="text-xs text-text-muted font-mono break-all text-center px-2">{url}</p>
          <div className="flex gap-3 w-full">
            <Button variant="secondary" size="sm" className="flex-1 gap-2" onClick={copy}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy Link'}
            </Button>
            <Button variant="primary" size="sm" className="flex-1 gap-2" asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink size={13} /> Open
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── Featured card (latest shot, spans 2 cols) ── */
function FeaturedCard({ img, claimServerUrl, onRetry }) {
  const [showQR, setShowQR]   = useState(false)
  const [copying, setCopying] = useState(false)
  const state    = imageState(img)
  const claimUrl = img.claimId     ? `${claimServerUrl}/claim/${img.claimId}` : null
  const imgSrc   = ipfsUrl(img.filecoinCid)
  const isLive   = state !== 'minted'

  const copyLink = () => {
    if (!claimUrl) return
    navigator.clipboard.writeText(claimUrl)
    setCopying(true)
    setTimeout(() => setCopying(false), 1500)
  }

  const time = (() => {
    if (!img.createdAt) return '—'
    const iso = img.createdAt.includes('T') || img.createdAt.endsWith('Z')
      ? img.createdAt
      : img.createdAt.replace(' ', 'T') + 'Z'
    const d = new Date(iso)
    if (isNaN(d)) return '—'
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
  })()

  const overlayText = {
    minting:      'Uploaded · minting NFT…',
    claim_failed: 'Uploaded · claim registration failed',
    upload_failed: 'Captured · uploading to Filecoin…',
  }[state]

  const badgeText = {
    minted:       'Minted',
    minting:      'Minting',
    claim_failed: 'Claim Failed',
    upload_failed: 'Upload Failed',
  }[state] || img.status

  const overlayColor = (state === 'claim_failed' || state === 'upload_failed')
    ? 'bg-[#fbbf24]/[0.07]'
    : 'bg-brand/[0.07]'
  const dotColor = (state === 'claim_failed' || state === 'upload_failed')
    ? 'bg-[#fbbf24]'
    : 'bg-brand'
  const textColor = (state === 'claim_failed' || state === 'upload_failed')
    ? 'text-[#fbbf24]'
    : 'text-brand'

  const statusMsg = {
    minting:       'Minting in progress…',
    claim_failed:  'Claim registration failed · retry to recover',
    upload_failed: 'Upload failed · retry to recover',
  }[state]

  return (
    <div className={`rounded-xl overflow-hidden col-span-2 border ${
      isLive ? 'border-brand/25 bg-[#0e0e0e]' : 'border-white/[0.07] bg-[#0e0e0e]'
    }`}>
      <div className="relative aspect-video bg-[#141414] overflow-hidden">
        {imgSrc && !isLive && (
          <img src={imgSrc} alt="Captured" className="w-full h-full object-cover"
            onError={ipfsOnError(img.filecoinCid)} />
        )}
        {isLive && (
          <div className={`absolute inset-0 flex items-center justify-center gap-3 ${overlayColor}`}>
            <div className={`w-2 h-2 rounded-full animate-pulse ${dotColor}`} />
            <span className={`text-sm font-semibold ${textColor}`}>{overlayText}</span>
          </div>
        )}
        <Badge variant={statusVariant(img)} className="absolute top-3 left-3 shadow-lg">
          {badgeText}
        </Badge>
        {state === 'minted' && img.ai_score != null && (
          <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-sm border border-[#34d399]/25 rounded-md px-2 py-1">
            <span className="text-[10px] font-bold text-[#34d399]">AI {img.ai_score}</span>
          </div>
        )}
        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm rounded-md px-2 py-1">
          <span className="text-[10px] text-text-muted">Latest shot · {time}</span>
        </div>
      </div>
      <div className="px-4 py-3 flex items-center gap-2">
        {isLive ? (
          <>
            <span className="text-xs text-text-muted flex-1">{statusMsg}</span>
            <Button size="sm" variant="secondary" className="gap-1.5 shrink-0" onClick={() => onRetry(img.id)}>
              <RotateCcw size={12} /> Retry
            </Button>
          </>
        ) : (
          <>
            <span className="font-mono text-xs text-text-muted mr-2">#{img.id}</span>
            {claimUrl && (
              <>
                <Button size="sm" variant="primary" onClick={() => setShowQR(true)} className="gap-1.5">
                  <QrCode size={12} /> QR Code
                </Button>
                <Button size="sm" variant="secondary" className="gap-1.5" onClick={copyLink}>
                  {copying ? <Check size={12} /> : <Copy size={12} />}
                  {copying ? 'Copied' : 'Copy Link'}
                </Button>
              </>
            )}
            {img.txHash && (
              <Button size="sm" variant="ghost" asChild className="ml-auto">
                <a href={`https://sepolia.etherscan.io/tx/${img.txHash}`} target="_blank" rel="noreferrer" className="gap-1.5">
                  <ExternalLink size={12} /> Etherscan
                </a>
              </Button>
            )}
          </>
        )}
      </div>
      {showQR && claimUrl && <QRModal url={claimUrl} onClose={() => setShowQR(false)} open={showQR} />}
    </div>
  )
}

/* ── Standard image card ── */
function ImageCard({ img, claimServerUrl, onRetry }) {
  const [showQR, setShowQR]   = useState(false)
  const [copying, setCopying] = useState(false)
  const state    = imageState(img)
  const claimUrl = img.claimId     ? `${claimServerUrl}/claim/${img.claimId}` : null
  const imgSrc   = ipfsUrl(img.filecoinCid)

  const copyLink = () => {
    if (!claimUrl) return
    navigator.clipboard.writeText(claimUrl)
    setCopying(true)
    setTimeout(() => setCopying(false), 1500)
  }

  const time = (() => {
    if (!img.createdAt) return '—'
    const iso = img.createdAt.includes('T') || img.createdAt.endsWith('Z')
      ? img.createdAt
      : img.createdAt.replace(' ', 'T') + 'Z'
    const d = new Date(iso)
    if (isNaN(d)) return '—'
    return d.toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
  })()

  const borderClass = state === 'upload_failed' || state === 'claim_failed'
    ? 'border-[#fbbf24]/15'
    : state === 'minting'
    ? 'border-[#60a5fa]/15'
    : 'border-white/[0.07] hover:border-white/15'

  const badgeLabel = {
    minted:       'Minted',
    minting:      'Minting',
    claim_failed: 'Claim Failed',
    upload_failed: 'Upload Failed',
  }[state] || img.status

  return (
    <div className={`rounded-xl overflow-hidden border bg-[#0e0e0e] group transition-all duration-200 hover:-translate-y-0.5 ${borderClass}`}>
      <div className="relative aspect-[4/3] bg-[#141414] overflow-hidden">
        {imgSrc ? (
          <img src={imgSrc} alt="Captured"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={ipfsOnError(img.filecoinCid)} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Camera size={22} className="text-white/15" strokeWidth={1} />
          </div>
        )}
        <Badge variant={statusVariant(img)} className="absolute top-2.5 left-2.5 shadow-lg text-[9px]">
          {badgeLabel}
        </Badge>
        {state === 'minted' && img.ai_score != null && (
          <div className="absolute bottom-2.5 right-2.5 bg-black/70 backdrop-blur-sm border border-[#34d399]/25 rounded-md px-1.5 py-0.5">
            <span className="text-[9px] font-bold text-[#34d399]">AI {img.ai_score}</span>
          </div>
        )}
      </div>

      <div className="px-3 py-2.5 space-y-1.5 text-xs">
        <div className="flex justify-between items-center">
          <span className="font-mono text-text-muted">#{img.id}</span>
          <span className="text-text-muted text-[10px]">{time}</span>
        </div>
        {img.filecoinCid && (
          <div className="font-mono text-[9px] text-text-muted/60 truncate">{img.filecoinCid.slice(0, 20)}…</div>
        )}
        {state === 'upload_failed' && (
          <p className="text-[9px] text-[#fbbf24]">Upload failed · needs retry</p>
        )}
        {state === 'claim_failed' && (
          <p className="text-[9px] text-[#fbbf24]">Claim registration failed · needs retry</p>
        )}
        {state === 'minting' && (
          <p className="text-[9px] text-[#60a5fa]">Minting NFT on-chain…</p>
        )}
      </div>

      <div className="px-3 pb-3 flex gap-1.5">
        {claimUrl && state === 'minted' && (
          <>
            <button
              onClick={() => setShowQR(true)}
              className="flex-1 flex items-center justify-center gap-1 bg-brand/[0.08] border border-brand/20 text-brand rounded-lg py-1.5 text-[10px] font-semibold hover:bg-brand/15 transition-colors"
            >
              <QrCode size={10} /> QR
            </button>
            <button
              onClick={copyLink}
              className="flex-1 flex items-center justify-center gap-1 bg-white/[0.04] border border-white/[0.07] text-text-muted rounded-lg py-1.5 text-[10px] hover:text-white hover:border-white/15 transition-colors"
            >
              {copying ? <Check size={10} className="text-[#34d399]" /> : <Copy size={10} />}
              {copying ? 'Copied' : 'Link'}
            </button>
          </>
        )}
        {img.txHash && (
          <a
            href={`https://sepolia.etherscan.io/tx/${img.txHash}`}
            target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-1 bg-white/[0.04] border border-white/[0.07] text-text-muted rounded-lg px-2 py-1.5 text-[10px] hover:text-white hover:border-white/15 transition-colors"
          >
            <ExternalLink size={10} />
          </a>
        )}
        {state === 'minting' && (
          <button
            onClick={() => onRetry(img.id)}
            className="flex-1 flex items-center justify-center gap-1 bg-[#60a5fa]/[0.06] border border-[#60a5fa]/20 text-[#60a5fa] rounded-lg py-1.5 text-[10px] font-semibold hover:bg-[#60a5fa]/10 transition-colors"
          >
            <RotateCcw size={10} /> Force Mint
          </button>
        )}
        {(state === 'upload_failed' || state === 'claim_failed') && (
          <button
            onClick={() => onRetry(img.id)}
            className="flex-1 flex items-center justify-center gap-1 bg-[#fbbf24]/[0.06] border border-[#fbbf24]/20 text-[#fbbf24] rounded-lg py-1.5 text-[10px] font-semibold hover:bg-[#fbbf24]/10 transition-colors"
          >
            <RotateCcw size={10} /> Retry
          </button>
        )}
      </div>

      {showQR && claimUrl && <QRModal url={claimUrl} onClose={() => setShowQR(false)} open={showQR} />}
    </div>
  )
}

/* ── Stat card ── */
function StatCard({ label, value, accent, icon, sub }) {
  return (
    <div
      className="rounded-xl border border-white/[0.07] bg-[#0e0e0e] p-4"
      style={{
        borderColor: accent ? `${accent}22` : undefined,
        background:  accent ? `${accent}08` : undefined,
      }}
    >
      <div className="text-xl mb-1" style={{ opacity: 0.7 }}>{icon}</div>
      <p className="text-3xl font-display font-bold" style={{ color: accent || '#F9F9F9' }}>{value}</p>
      <p className="text-xs text-text-secondary mt-1">{label}</p>
      {sub && <p className="text-[10px] text-[#fbbf24] mt-0.5">{sub}</p>}
    </div>
  )
}

/* ── Skeleton card ── */
function ImageCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0e0e0e] overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-white/[0.03]" />
      <div className="p-3 space-y-2">
        <div className="flex justify-between">
          <div className="h-2.5 w-10 rounded bg-white/[0.06]" />
          <div className="h-2.5 w-16 rounded bg-white/[0.06]" />
        </div>
        <div className="h-2 w-28 rounded bg-white/[0.04]" />
      </div>
      <div className="px-3 pb-3 flex gap-1.5">
        <div className="h-7 flex-1 rounded-lg bg-white/[0.06]" />
        <div className="h-7 flex-1 rounded-lg bg-white/[0.06]" />
      </div>
    </div>
  )
}

export default function OwnerDashboard() {
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const { address }  = useAccount()
  const navigate = useNavigate()

  const [images,      setImages]      = useState([])
  const [loading,     setLoading]     = useState(false)
  const [retrying,    setRetrying]    = useState(false)
  const [deviceStatus, setDeviceStatus] = useState(null)
  const [retryResult, setRetryResult] = useState(null)
  const [filter,      setFilter]      = useState('all')
  const [tab,         setTab]         = useState('photos')

  const walletAddress = address || wallets[0]?.address

  const fetchImages = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${BACKEND_URL}/api/images/list`)
      if (res.data.success) setImages(res.data.images || [])
    } catch (_) {}
    setLoading(false)
  }, [])

  const fetchDeviceStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/device/status`)
      setDeviceStatus(res.data)
    } catch (_) {
      setDeviceStatus(null)
    }
  }, [])

  useEffect(() => {
    if (authenticated) {
      fetchImages()
      fetchDeviceStatus()
    }
  }, [authenticated, fetchImages, fetchDeviceStatus])

  // Auto-refresh every 8 s while any image is still being processed
  useEffect(() => {
    const hasPending = images.some(i => i.status === 'uploaded' || i.status === 'saved')
    if (!authenticated || !hasPending) return
    const id = setInterval(fetchImages, 8000)
    return () => clearInterval(id)
  }, [authenticated, images, fetchImages])

  const retryPending = async () => {
    setRetrying(true)
    setRetryResult(null)
    try {
      const res = await axios.post(`${BACKEND_URL}/api/retry-pending`)
      setRetryResult(res.data)
      await fetchImages()
    } catch (e) {
      setRetryResult({ success: false, error: e.message })
    }
    setRetrying(false)
  }

  const retrySingle = async () => {
    try {
      await axios.post(`${BACKEND_URL}/api/retry-pending`)
      await fetchImages()
    } catch (_) {}
  }

  const stats = {
    total:      images.length,
    minted:     images.filter(i => i.status === 'minted').length,
    processing: images.filter(i => i.status === 'uploaded').length,
    failed:     images.filter(i => i.status === 'saved').length,
  }
  const retryableCount = images.filter(i => i.status !== 'minted').length

  const FILTER_TABS = [
    { key: 'all',      label: 'All',        color: null,      count: images.length  },
    { key: 'minted',   label: 'Minted',     color: '#34d399', count: stats.minted   },
    { key: 'uploaded', label: 'Processing', color: '#60a5fa', count: stats.processing },
    { key: 'saved',    label: 'Failed',     color: '#fbbf24', count: stats.failed   },
  ]

  // images[0] = latest shot (featured); rest go in the regular grid
  const [featuredImg, ...restImages] = images
  const filtered = filter === 'all'
    ? restImages
    : restImages.filter(i => i.status === filter)

  const isOnline = deviceStatus?.servicesInitialized
  const deviceId = deviceStatus?.device?.deviceId

  /* ── Loading splash ── */
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  /* ── Login screen ── */
  if (!authenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black p-6 gap-10">
        <button onClick={() => navigate('/')} className="flex items-center gap-2.5 group">
          <VerisLogoMark size={24} />
          <span className="font-display font-bold text-lg text-white tracking-tight group-hover:text-brand transition-colors">
            Veris
          </span>
        </button>
        <div className="w-full max-w-sm rounded-xl border border-white/[0.07] bg-[#0e0e0e] p-8 space-y-6">
          <div>
            <h2 className="text-xl font-display font-bold text-white">Owner Dashboard</h2>
            <p className="text-text-secondary mt-1 text-sm leading-relaxed">Sign in to manage your cameras and NFTs.</p>
          </div>
          {PRIVY_APP_ID === 'your-privy-app-id' && (
            <div className="bg-[#fbbf24]/10 text-[#fbbf24] text-xs px-4 py-2 rounded-lg border border-[#fbbf24]/20">
              Configure VITE_PRIVY_APP_ID in .env
            </div>
          )}
          <Button size="lg" variant="primary" className="w-full" onClick={login}
            disabled={PRIVY_APP_ID === 'your-privy-app-id'}>
            Connect Wallet
          </Button>
        </div>
      </div>
    )
  }

  /* ── Dashboard ── */
  return (
    <div className="flex h-screen bg-black overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className="w-52 shrink-0 flex flex-col border-r border-white/[0.07] bg-[#080808]">
        <button
          onClick={() => navigate('/')}
          className="px-5 h-[52px] flex items-center gap-2.5 hover:bg-white/[0.03] transition-colors border-b border-white/[0.07]"
        >
          <VerisLogoMark size={20} />
          <span className="font-display font-bold text-base text-white tracking-tight">Veris</span>
        </button>

        {/* Device status */}
        <div className={`mx-3 mt-3 mb-1 rounded-lg border px-3 py-2.5 flex items-center gap-2.5 ${
          isOnline
            ? 'border-[#34d399]/20 bg-[#34d399]/[0.06]'
            : 'border-white/[0.07] bg-white/[0.02]'
        }`}>
          <div
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOnline ? 'bg-[#34d399] animate-pulse' : 'bg-[#646464]'}`}
            style={isOnline ? { boxShadow: '0 0 6px #34d399' } : {}}
          />
          <div className="min-w-0">
            <p className={`text-[10px] font-semibold ${isOnline ? 'text-[#34d399]' : 'text-text-muted'}`}>
              {isOnline ? 'Camera Online' : deviceStatus === null ? 'Connecting…' : 'Camera Offline'}
            </p>
            {deviceId && <p className="text-[9px] text-text-muted truncate">{deviceId}</p>}
          </div>
        </div>

        <nav className="flex-1 p-2.5 space-y-0.5">
          {[
            { id: 'photos', label: 'Photos', icon: Images },
            { id: 'device', label: 'Device', icon: Cpu },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                tab === id
                  ? 'bg-brand/10 text-brand'
                  : 'text-text-secondary hover:bg-white/[0.04] hover:text-white'
              }`}
              onClick={() => { setTab(id); if (id === 'device') fetchDeviceStatus() }}
            >
              <Icon size={15} strokeWidth={1.75} />
              {label}
              {id === 'photos' && retryableCount > 0 && (
                <span className="ml-auto text-[9px] font-bold bg-[#fbbf24]/15 text-[#fbbf24] px-1.5 py-0.5 rounded-full">
                  {retryableCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="border-t border-white/[0.07] p-4 space-y-3">
          <div className="space-y-0.5">
            <p className="text-[9px] uppercase tracking-widest text-text-muted font-medium">Wallet</p>
            <p className="text-[10px] font-mono text-text-secondary truncate">
              {walletAddress
                ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
                : 'Not connected'}
            </p>
          </div>
          <button
            className="w-full flex items-center gap-2 text-[11px] text-text-muted hover:text-white transition-colors py-1"
            onClick={logout}
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto flex flex-col">

        {tab === 'photos' && (
          <div className="flex flex-col flex-1">
            {/* Top bar */}
            <div className="flex items-center justify-between px-8 h-[52px] border-b border-white/[0.07] shrink-0">
              <h1 className="text-base font-display font-bold text-white">Photos</h1>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={fetchImages} disabled={loading} className="gap-1.5 text-xs">
                  <RotateCcw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
                </Button>
                {retryableCount > 0 && (
                  <Button variant="primary" size="sm" onClick={retryPending} disabled={retrying} className="gap-1.5 text-xs">
                    <RotateCcw size={12} className={retrying ? 'animate-spin' : ''} />
                    Retry {retryableCount} pending
                  </Button>
                )}
              </div>
            </div>

            <div className="p-8 flex flex-col gap-6 max-w-7xl w-full mx-auto">

              {/* Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard label="Total shots"  value={stats.total}      icon="📷" />
                <StatCard label="Minted NFTs"  value={stats.minted}     icon="⛓" accent="#34d399" />
                <StatCard label="Processing"   value={stats.processing} icon="🗂" accent="#60a5fa" />
                <StatCard label="Failed"       value={stats.failed}     icon="⚠" accent="#fbbf24"
                  sub={stats.failed > 0 ? 'needs retry' : undefined} />
              </div>

              {/* Retry result banner */}
              {retryResult && (
                <div className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm border ${
                  retryResult.success
                    ? 'bg-[#34d399]/10 text-[#34d399] border-[#34d399]/20'
                    : 'bg-[#f87171]/10 text-[#f87171] border-[#f87171]/20'
                }`}>
                  <span>
                    {retryResult.success
                      ? `Processed ${retryResult.processed} image(s).`
                      : `Error: ${retryResult.error}`}
                  </span>
                  <button className="ml-4 opacity-60 hover:opacity-100 transition-opacity" onClick={() => setRetryResult(null)}>
                    ✕
                  </button>
                </div>
              )}

              {/* Filter tabs */}
              <div className="flex gap-1 p-1 rounded-xl border border-white/[0.07] bg-[#0a0a0a] w-fit">
                {FILTER_TABS.map(({ key, label, color, count }) => (
                  <button
                    key={key}
                    className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                      filter === key ? 'bg-white/[0.08] text-white shadow-sm' : 'text-text-muted hover:text-white'
                    }`}
                    onClick={() => setFilter(key)}
                  >
                    {label}
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-md tabular-nums"
                      style={{
                        background: color ? `${color}18` : 'rgba(255,255,255,0.06)',
                        color: color && (filter === key || count > 0) ? color : '#646464',
                      }}
                    >
                      {count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Grid */}
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  <div className="col-span-2 rounded-xl aspect-video bg-white/[0.03] animate-pulse" />
                  {Array.from({ length: 6 }).map((_, i) => <ImageCardSkeleton key={i} />)}
                </div>
              ) : images.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
                  <div className="w-14 h-14 rounded-2xl border border-white/[0.08] flex items-center justify-center">
                    <Camera size={24} className="text-white/20" strokeWidth={1} />
                  </div>
                  <div>
                    <p className="text-text-secondary font-medium">No images yet</p>
                    <p className="text-text-muted text-sm mt-1">Capture a photo on the camera to get started.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {featuredImg && (
                    <FeaturedCard img={featuredImg} claimServerUrl={PORTAL_URL} onRetry={retrySingle} />
                  )}
                  {filtered.map(img => (
                    <ImageCard key={img.id} img={img} claimServerUrl={PORTAL_URL} onRetry={retrySingle} />
                  ))}
                  {filtered.length === 0 && restImages.length > 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center py-16 gap-3 text-center">
                      <p className="text-text-secondary font-medium">No images with status "{filter}"</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'device' && (
          <div className="p-8 max-w-4xl mx-auto w-full">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-display font-bold text-white">Device Status</h1>
                <p className="text-sm text-text-secondary mt-0.5">Camera hardware and service health</p>
              </div>
              <Button variant="secondary" size="sm" onClick={fetchDeviceStatus} className="gap-1.5">
                <RotateCcw size={13} /> Refresh
              </Button>
            </div>

            {deviceStatus ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-text-secondary uppercase tracking-widest font-semibold">Camera Service</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pb-5">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-text-secondary">Status</span>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${deviceStatus.servicesInitialized ? 'bg-[#34d399]' : 'bg-[#f87171]'}`}
                          style={deviceStatus.servicesInitialized
                            ? { boxShadow: '0 0 6px #34d399' }
                            : { boxShadow: '0 0 6px #f87171' }} />
                        <Badge variant={deviceStatus.servicesInitialized ? 'minted' : 'failed'}>
                          {deviceStatus.servicesInitialized ? 'Online' : 'Offline'}
                        </Badge>
                      </div>
                    </div>
                    {deviceStatus.device && (
                      <>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-text-secondary">Device ID</span>
                          <span className="font-mono text-text-primary text-xs">{deviceStatus.device.deviceId || '—'}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-text-secondary">Registered</span>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${deviceStatus.device.isRegistered ? 'bg-[#34d399]' : 'bg-[#fbbf24]'}`} />
                            <Badge variant={deviceStatus.device.isRegistered ? 'minted' : 'saved'}>
                              {deviceStatus.device.isRegistered ? 'Yes' : 'No'}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-text-secondary">Address</span>
                          <span className="font-mono text-text-primary text-xs truncate max-w-[140px]">{deviceStatus.device.address || '—'}</span>
                        </div>
                      </>
                    )}
                    {deviceStatus.filecoin && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-text-secondary">Lighthouse</span>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${deviceStatus.filecoin.connected ? 'bg-[#34d399]' : 'bg-[#f87171]'}`} />
                          <Badge variant={deviceStatus.filecoin.connected ? 'minted' : 'failed'}>
                            {deviceStatus.filecoin.connected ? 'Ready' : 'Not configured'}
                          </Badge>
                        </div>
                      </div>
                    )}
                    {deviceStatus.blockchain !== undefined && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-text-secondary">Blockchain</span>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${deviceStatus.blockchain ? 'bg-[#34d399]' : 'bg-[#f87171]'}`} />
                          <Badge variant={deviceStatus.blockchain ? 'minted' : 'failed'}>
                            {deviceStatus.blockchain ? 'Connected' : 'Disconnected'}
                          </Badge>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-text-secondary uppercase tracking-widest font-semibold">Contracts</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pb-5">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-text-secondary">Network</span>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#60a5fa]" />
                        <Badge variant="uploaded">Sepolia</Badge>
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-text-secondary">ERC-1155</span>
                      <a href="https://sepolia.etherscan.io/address/0x35f5B3b5D6BF361169743cB13D66849C4C839c69"
                        target="_blank" rel="noreferrer"
                        className="font-mono text-brand text-xs hover:brightness-125 flex items-center gap-1">
                        0x35f5…9c69 <ExternalLink size={10} />
                      </a>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-text-secondary">Registry</span>
                      <a href="https://sepolia.etherscan.io/address/0x874709472d1cF830d7F78809E7D37692a27013A0"
                        target="_blank" rel="noreferrer"
                        className="font-mono text-brand text-xs hover:brightness-125 flex items-center gap-1">
                        0x8747…13A0 <ExternalLink size={10} />
                      </a>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-text-secondary uppercase tracking-widest font-semibold">Account</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pb-5">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-text-secondary">User ID</span>
                      <span className="font-mono text-text-primary text-xs truncate max-w-[140px]">{user?.id?.slice(0, 20)}…</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-text-secondary">Wallet</span>
                      <span className="font-mono text-text-primary text-xs">
                        {walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : 'Not connected'}
                      </span>
                    </div>
                    {walletAddress && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-text-secondary">Etherscan</span>
                        <a href={`https://sepolia.etherscan.io/address/${walletAddress}`} target="_blank" rel="noreferrer"
                          className="text-brand text-xs hover:brightness-125 flex items-center gap-1">
                          View <ExternalLink size={10} />
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
                <div className="w-14 h-14 rounded-2xl border border-white/[0.08] flex items-center justify-center">
                  <CircleAlert size={22} className="text-white/20" strokeWidth={1} />
                </div>
                <div>
                  <p className="text-text-secondary font-medium">Cannot reach camera service</p>
                  <p className="text-text-muted text-sm mt-1">
                    Make sure <code className="text-brand font-mono text-xs">{BACKEND_URL}</code> is running.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}