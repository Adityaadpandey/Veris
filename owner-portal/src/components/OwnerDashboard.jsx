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
import { Separator } from '@/components/ui/separator'
import {
  Camera,
  Cpu,
  Images,
  RotateCcw,
  ExternalLink,
  Copy,
  Check,
  LogOut,
  Wifi,
  WifiOff,
  CircleAlert,
} from 'lucide-react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'
const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || 'your-privy-app-id'
const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || window.location.origin

/* ── Veris logo mark ── */
function VerisLogoMark({ size = 28 }) {
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

function statusVariant(status) {
  const map = { saved: 'saved', uploaded: 'uploaded', minted: 'minted', failed: 'failed' }
  return map[status] || 'default'
}

function QRModal({ url, onClose, open }) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}&bgcolor=0e0e0e&color=F9F9F9&margin=16`
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
          <div className="rounded-xl overflow-hidden border border-white/8 bg-[#0e0e0e]">
            <img src={qrSrc} alt="QR Code" className="w-52 h-52" />
          </div>
          <p className="text-xs text-text-muted font-mono break-all text-center px-2">{url}</p>
          <div className="flex gap-3 w-full">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 gap-2"
              onClick={copy}
            >
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

function ImageCard({ img, claimServerUrl, onRetry }) {
  const [showQR, setShowQR] = useState(false)
  const [copying, setCopying] = useState(false)
  const claimUrl = img.claimId ? `${claimServerUrl}/claim/${img.claimId}` : null
  const ipfsUrl = img.filecoinCid ? `https://gateway.lighthouse.storage/ipfs/${img.filecoinCid}` : null

  const copyLink = () => {
    if (!claimUrl) return
    navigator.clipboard.writeText(claimUrl)
    setCopying(true)
    setTimeout(() => setCopying(false), 1500)
  }

  return (
    <Card className="overflow-hidden group">
      {/* Thumbnail */}
      <div className="relative aspect-[4/3] bg-[#0e0e0e] overflow-hidden">
        {ipfsUrl ? (
          <img
            src={ipfsUrl}
            alt="Captured"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
          />
        ) : null}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ display: ipfsUrl ? 'none' : 'flex' }}
        >
          <Camera size={28} className="text-white/20" strokeWidth={1} />
        </div>
        <Badge variant={statusVariant(img.status)} className="absolute top-3 right-3 shadow-lg">
          {img.status?.charAt(0).toUpperCase() + img.status?.slice(1)}
        </Badge>
      </div>

      {/* Meta */}
      <CardContent className="p-4 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-text-muted">ID</span>
          <span className="text-text-primary font-medium">#{img.id}</span>
        </div>
        {img.tokenId && (
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Token</span>
            <span className="text-text-primary font-medium">#{img.tokenId}</span>
          </div>
        )}
        {img.filecoinCid && (
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">CID</span>
            <span className="text-text-primary font-mono truncate max-w-[120px]">{img.filecoinCid.slice(0, 16)}…</span>
          </div>
        )}
        <div className="flex justify-between text-xs">
          <span className="text-text-muted">Captured</span>
          <span className="text-text-primary">
            {(() => {
              const iso = img.createdAt?.includes('T') || img.createdAt?.endsWith('Z')
                ? img.createdAt
                : (img.createdAt || '').replace(' ', 'T') + 'Z'
              return new Date(iso).toLocaleString('en-IN', { hour12: false })
            })()}
          </span>
        </div>
      </CardContent>

      {/* Actions */}
      <div className="px-4 pb-4 flex flex-wrap gap-2">
        {claimUrl && (
          <>
            <Button size="sm" variant="primary" onClick={() => setShowQR(true)}>QR Code</Button>
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={copyLink}>
              {copying ? <Check size={12} /> : <Copy size={12} />}
              {copying ? 'Copied' : 'Copy Link'}
            </Button>
          </>
        )}
        {img.txHash && (
          <Button size="sm" variant="ghost" asChild>
            <a href={`https://sepolia.etherscan.io/tx/${img.txHash}`} target="_blank" rel="noreferrer" className="gap-1.5">
              <ExternalLink size={12} /> Etherscan
            </a>
          </Button>
        )}
        {img.status === 'saved' && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onRetry(img.id)}>
            <RotateCcw size={12} /> Retry
          </Button>
        )}
      </div>

      {showQR && claimUrl && <QRModal url={claimUrl} onClose={() => setShowQR(false)} open={showQR} />}
    </Card>
  )
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0e0e0e] p-5">
      <p className="text-3xl font-display font-bold" style={{ color: accent || '#F9F9F9' }}>{value}</p>
      <p className="text-sm text-text-secondary mt-1">{label}</p>
      {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

function ImageCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#0e0e0e] overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-white/[0.03]" />
      <div className="p-4 space-y-3">
        <div className="flex justify-between">
          <div className="h-3 w-8 rounded bg-white/[0.06]" />
          <div className="h-3 w-12 rounded bg-white/[0.06]" />
        </div>
        <div className="flex justify-between">
          <div className="h-3 w-14 rounded bg-white/[0.06]" />
          <div className="h-3 w-24 rounded bg-white/[0.06]" />
        </div>
      </div>
      <div className="px-4 pb-4 flex gap-2">
        <div className="h-7 flex-1 rounded-lg bg-white/[0.06]" />
        <div className="h-7 flex-1 rounded-lg bg-white/[0.06]" />
      </div>
    </div>
  )
}

export default function OwnerDashboard() {
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const { address } = useAccount()
  const navigate = useNavigate()

  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [deviceStatus, setDeviceStatus] = useState(null)
  const [retryResult, setRetryResult] = useState(null)
  const [filter, setFilter] = useState('all')
  const [tab, setTab] = useState('photos')

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
    total: images.length,
    minted: images.filter(i => i.status === 'minted').length,
    uploaded: images.filter(i => i.status === 'uploaded').length,
    pending: images.filter(i => i.status === 'saved').length,
  }

  const filtered = filter === 'all' ? images : images.filter(i => i.status === filter)

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
            <p className="text-text-secondary mt-1 text-sm leading-relaxed">
              Sign in to manage your cameras and NFTs.
            </p>
          </div>
          {PRIVY_APP_ID === 'your-privy-app-id' && (
            <div className="bg-[#fbbf24]/10 text-[#fbbf24] text-xs px-4 py-2 rounded-lg border border-[#fbbf24]/20">
              Configure VITE_PRIVY_APP_ID in .env
            </div>
          )}
          <Button
            size="lg"
            variant="primary"
            className="w-full"
            onClick={login}
            disabled={PRIVY_APP_ID === 'your-privy-app-id'}
          >
            Connect Wallet
          </Button>
        </div>
      </div>
    )
  }

  /* ── Dashboard ── */
  const NAV_ITEMS = [
    { id: 'photos', label: 'Photos', icon: Images },
    { id: 'device', label: 'Device', icon: Cpu },
  ]

  return (
    <div className="flex h-screen bg-black overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-56 shrink-0 flex flex-col border-r border-white/[0.07] bg-[#080808]">
        {/* Logo */}
        <button
          onClick={() => navigate('/')}
          className="px-5 h-14 flex items-center gap-2.5 hover:bg-white/[0.03] transition-colors border-b border-white/[0.07]"
        >
          <VerisLogoMark size={22} />
          <span className="font-display font-bold text-base text-white tracking-tight">Veris</span>
        </button>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
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
            </button>
          ))}
        </nav>

        {/* User */}
        <div className="border-t border-white/[0.07] p-4 space-y-3">
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium">Wallet</p>
            <p className="text-xs font-mono text-text-secondary truncate">
              {walletAddress
                ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
                : 'Not connected'}
            </p>
          </div>
          <button
            className="w-full flex items-center gap-2 text-xs text-text-muted hover:text-white transition-colors py-1"
            onClick={logout}
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto">
        {tab === 'photos' && (
          <div className="p-8 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-display font-bold text-white">Photos</h1>
                <p className="text-sm text-text-secondary mt-0.5">All captured images and their NFT status</p>
              </div>
              <div className="flex gap-2.5">
                <Button variant="secondary" size="sm" onClick={fetchImages} disabled={loading} className="gap-1.5">
                  <RotateCcw size={13} className={loading ? 'animate-spin' : ''} />
                  Refresh
                </Button>
                {stats.pending > 0 && (
                  <Button variant="primary" size="sm" onClick={retryPending} disabled={retrying} className="gap-1.5">
                    <RotateCcw size={13} className={retrying ? 'animate-spin' : ''} />
                    Retry {stats.pending} pending
                  </Button>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
              <StatCard label="Total" value={stats.total} accent="#F9F9F9" />
              <StatCard label="Minted" value={stats.minted} accent="#34d399" />
              <StatCard label="Uploaded" value={stats.uploaded} accent="#60a5fa" />
              <StatCard label="Pending" value={stats.pending} accent="#fbbf24" sub={stats.pending > 0 ? 'needs retry' : ''} />
            </div>

            {/* Retry result */}
            {retryResult && (
              <div className={`flex items-center justify-between mb-6 px-4 py-3 rounded-xl text-sm border ${
                retryResult.success
                  ? 'bg-[#34d399]/10 text-[#34d399] border-[#34d399]/20'
                  : 'bg-[#f87171]/10 text-[#f87171] border-[#f87171]/20'
              }`}>
                <span>
                  {retryResult.success
                    ? `Processed ${retryResult.processed} image(s).`
                    : `Error: ${retryResult.error}`}
                </span>
                <button className="ml-4 opacity-60 hover:opacity-100 transition-opacity" onClick={() => setRetryResult(null)}>✕</button>
              </div>
            )}

            {/* Filter tabs */}
            <div className="flex gap-1.5 mb-8 p-1 rounded-xl border border-white/[0.07] bg-[#0a0a0a] w-fit">
              {['all', 'minted', 'uploaded', 'saved'].map(f => (
                <button
                  key={f}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                    filter === f
                      ? 'bg-white/[0.08] text-white shadow-sm'
                      : 'text-text-muted hover:text-white'
                  }`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                  <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-white/[0.06] text-text-muted tabular-nums">
                    {f === 'all' ? images.length : images.filter(i => i.status === f).length}
                  </span>
                </button>
              ))}
            </div>

            {/* Grid */}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {Array.from({ length: 8 }).map((_, i) => <ImageCardSkeleton key={i} />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
                <div className="w-14 h-14 rounded-2xl border border-white/8 flex items-center justify-center">
                  <Camera size={24} className="text-white/20" strokeWidth={1} />
                </div>
                <div>
                  <p className="text-text-secondary font-medium">No images {filter !== 'all' ? `with status "${filter}"` : 'yet'}</p>
                  {images.length === 0 && (
                    <p className="text-text-muted text-sm mt-1">Capture a photo on the camera to get started.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {filtered.map(img => (
                  <ImageCard
                    key={img.id}
                    img={img}
                    claimServerUrl={PORTAL_URL}
                    onRetry={retrySingle}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'device' && (
          <div className="p-8 max-w-4xl mx-auto">
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
                {/* Camera Service */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-text-secondary uppercase tracking-widest font-semibold">Camera Service</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pb-5">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-text-secondary">Status</span>
                      <div className="flex items-center gap-1.5">
                        {deviceStatus.servicesInitialized
                          ? <Wifi size={13} className="text-[#34d399]" />
                          : <WifiOff size={13} className="text-[#f87171]" />}
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
                          <Badge variant={deviceStatus.device.isRegistered ? 'minted' : 'saved'}>
                            {deviceStatus.device.isRegistered ? 'Yes' : 'No'}
                          </Badge>
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
                        <Badge variant={deviceStatus.filecoin.connected ? 'minted' : 'failed'}>
                          {deviceStatus.filecoin.connected ? 'Ready' : 'Not configured'}
                        </Badge>
                      </div>
                    )}
                    {deviceStatus.blockchain !== undefined && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-text-secondary">Blockchain</span>
                        <Badge variant={deviceStatus.blockchain ? 'minted' : 'failed'}>
                          {deviceStatus.blockchain ? 'Connected' : 'Disconnected'}
                        </Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Contracts */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-text-secondary uppercase tracking-widest font-semibold">Contracts</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pb-5">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-text-secondary">Network</span>
                      <Badge variant="uploaded">Sepolia</Badge>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-text-secondary">ERC-1155</span>
                      <a
                        href="https://sepolia.etherscan.io/address/0x35f5B3b5D6BF361169743cB13D66849C4C839c69"
                        target="_blank" rel="noreferrer"
                        className="font-mono text-brand text-xs hover:brightness-125 flex items-center gap-1"
                      >
                        0x35f5…9c69 <ExternalLink size={10} />
                      </a>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-text-secondary">Registry</span>
                      <a
                        href="https://sepolia.etherscan.io/address/0x874709472d1cF830d7F78809E7D37692a27013A0"
                        target="_blank" rel="noreferrer"
                        className="font-mono text-brand text-xs hover:brightness-125 flex items-center gap-1"
                      >
                        0x8747…13A0 <ExternalLink size={10} />
                      </a>
                    </div>
                  </CardContent>
                </Card>

                {/* Account */}
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
                        {walletAddress
                          ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
                          : 'Not connected'}
                      </span>
                    </div>
                    {walletAddress && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-text-secondary">Etherscan</span>
                        <a
                          href={`https://sepolia.etherscan.io/address/${walletAddress}`}
                          target="_blank" rel="noreferrer"
                          className="text-brand text-xs hover:brightness-125 flex items-center gap-1"
                        >
                          View <ExternalLink size={10} />
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
                <div className="w-14 h-14 rounded-2xl border border-white/8 flex items-center justify-center">
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
