import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import './OwnerDashboard.css'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'
const CLAIM_SERVER_URL = import.meta.env.VITE_CLAIM_SERVER_URL || 'http://localhost:5001'
const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || 'your-privy-app-id'

function statusBadge(status) {
  const map = {
    saved: { label: 'Saved', color: '#f59e0b' },
    uploaded: { label: 'Uploaded', color: '#3b82f6' },
    minted: { label: 'Minted', color: '#10b981' },
    failed: { label: 'Failed', color: '#ef4444' },
  }
  return map[status] || { label: status, color: '#6b7280' }
}

function QRModal({ url, onClose }) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Claim QR Code</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <img src={qrSrc} alt="QR Code" className="qr-image" />
        <p className="qr-url">{url}</p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            onClick={() => { navigator.clipboard.writeText(url) }}
          >
            Copy Link
          </button>
          <a href={url} target="_blank" rel="noreferrer" className="btn btn-primary">
            Open Page
          </a>
        </div>
      </div>
    </div>
  )
}

function ImageCard({ img, claimServerUrl, onRetry }) {
  const [showQR, setShowQR] = useState(false)
  const [copying, setCopying] = useState(false)
  const badge = statusBadge(img.status)
  const claimUrl = img.claimId ? `${claimServerUrl}/claim/${img.claimId}` : null
  const ipfsUrl = img.filecoinCid ? `https://gateway.lighthouse.storage/ipfs/${img.filecoinCid}` : null

  const copyLink = () => {
    if (!claimUrl) return
    navigator.clipboard.writeText(claimUrl)
    setCopying(true)
    setTimeout(() => setCopying(false), 1500)
  }

  return (
    <div className="image-card">
      <div className="image-thumb">
        {ipfsUrl ? (
          <img
            src={ipfsUrl}
            alt="Captured"
            onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
          />
        ) : null}
        <div className="thumb-placeholder" style={{ display: ipfsUrl ? 'none' : 'flex' }}>
          📷
        </div>
        <span className="status-badge" style={{ background: badge.color }}>{badge.label}</span>
      </div>

      <div className="image-meta">
        <div className="meta-row">
          <span className="meta-label">ID</span>
          <span className="meta-value">#{img.id}</span>
        </div>
        {img.tokenId && (
          <div className="meta-row">
            <span className="meta-label">Token</span>
            <span className="meta-value">#{img.tokenId}</span>
          </div>
        )}
        {img.filecoinCid && (
          <div className="meta-row">
            <span className="meta-label">CID</span>
            <span className="meta-value mono truncate">{img.filecoinCid.slice(0, 16)}…</span>
          </div>
        )}
        <div className="meta-row">
          <span className="meta-label">Time</span>
          <span className="meta-value">{new Date(img.createdAt).toLocaleString()}</span>
        </div>
      </div>

      <div className="image-actions">
        {claimUrl && (
          <>
            <button className="btn btn-sm btn-primary" onClick={() => setShowQR(true)}>
              QR Code
            </button>
            <button className="btn btn-sm btn-secondary" onClick={copyLink}>
              {copying ? 'Copied!' : 'Copy Link'}
            </button>
          </>
        )}
        {img.txHash && (
          <a
            href={`https://sepolia.etherscan.io/tx/${img.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-sm btn-ghost"
          >
            Etherscan ↗
          </a>
        )}
        {img.filecoinCid && (
          <a
            href={`https://gateway.lighthouse.storage/ipfs/${img.filecoinCid}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-sm btn-ghost"
          >
            IPFS ↗
          </a>
        )}
        {img.status === 'saved' && (
          <button className="btn btn-sm btn-warn" onClick={() => onRetry(img.id)}>
            Retry Upload
          </button>
        )}
      </div>

      {showQR && claimUrl && <QRModal url={claimUrl} onClose={() => setShowQR(false)} />}
    </div>
  )
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="stat-card" style={{ borderTop: `3px solid ${color || '#667eea'}` }}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export default function OwnerDashboard() {
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const { address } = useAccount()

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

  const retrySingle = async (imageId) => {
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

  if (!ready) {
    return (
      <div className="splash">
        <div className="spinner" />
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="splash">
        <div className="login-card">
          <div className="login-logo">📷</div>
          <h1>LensMint</h1>
          <p>Owner Portal — manage your camera NFTs</p>
          {PRIVY_APP_ID === 'your-privy-app-id' && (
            <div className="alert alert-warn">Configure VITE_PRIVY_APP_ID in .env</div>
          )}
          <button
            className="btn btn-primary btn-lg"
            onClick={login}
            disabled={PRIVY_APP_ID === 'your-privy-app-id'}
          >
            Connect Wallet
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">📷 LensMint</div>
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${tab === 'photos' ? 'active' : ''}`}
            onClick={() => setTab('photos')}
          >
            <span>🖼</span> Photos
          </button>
          <button
            className={`nav-item ${tab === 'device' ? 'active' : ''}`}
            onClick={() => { setTab('device'); fetchDeviceStatus() }}
          >
            <span>📡</span> Device
          </button>
        </nav>
        <div className="sidebar-account">
          <div className="account-info">
            <div className="account-label">Wallet</div>
            <div className="account-addr">{walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : 'Not connected'}</div>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={logout}>Logout</button>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        {tab === 'photos' && (
          <>
            <div className="page-header">
              <div>
                <h2>Photos</h2>
                <p className="page-sub">All captured images and their NFT status</p>
              </div>
              <div className="header-actions">
                <button className="btn btn-secondary" onClick={fetchImages} disabled={loading}>
                  {loading ? 'Loading…' : 'Refresh'}
                </button>
                {stats.pending > 0 && (
                  <button className="btn btn-primary" onClick={retryPending} disabled={retrying}>
                    {retrying ? 'Retrying…' : `Retry ${stats.pending} Pending`}
                  </button>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="stats-row">
              <StatCard label="Total Photos" value={stats.total} color="#667eea" />
              <StatCard label="Minted NFTs" value={stats.minted} color="#10b981" />
              <StatCard label="Uploaded" value={stats.uploaded} color="#3b82f6" />
              <StatCard label="Pending" value={stats.pending} color="#f59e0b" sub={stats.pending > 0 ? 'needs retry' : ''} />
            </div>

            {/* Retry result */}
            {retryResult && (
              <div className={`alert ${retryResult.success ? 'alert-success' : 'alert-error'}`}>
                {retryResult.success
                  ? `Processed ${retryResult.processed} image(s). ${retryResult.results?.map(r => r.status === 'processed' ? `#${r.id} uploaded` : `#${r.id} failed: ${r.error}`).join(' | ')}`
                  : `Error: ${retryResult.error}`}
                <button className="alert-close" onClick={() => setRetryResult(null)}>✕</button>
              </div>
            )}

            {/* Filter */}
            <div className="filter-bar">
              {['all', 'minted', 'uploaded', 'saved'].map(f => (
                <button
                  key={f}
                  className={`filter-btn ${filter === f ? 'active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                  <span className="filter-count">
                    {f === 'all' ? images.length : images.filter(i => i.status === f).length}
                  </span>
                </button>
              ))}
            </div>

            {/* Grid */}
            {loading ? (
              <div className="empty-state">
                <div className="spinner" />
                <p>Loading images…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📷</div>
                <p>No images {filter !== 'all' ? `with status "${filter}"` : 'yet'}.</p>
                {images.length === 0 && <p className="empty-sub">Capture a photo on the camera to get started.</p>}
              </div>
            ) : (
              <div className="image-grid">
                {filtered.map(img => (
                  <ImageCard
                    key={img.id}
                    img={img}
                    claimServerUrl={CLAIM_SERVER_URL}
                    onRetry={retrySingle}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'device' && (
          <>
            <div className="page-header">
              <div>
                <h2>Device Status</h2>
                <p className="page-sub">Camera and service health</p>
              </div>
              <button className="btn btn-secondary" onClick={fetchDeviceStatus}>Refresh</button>
            </div>

            {deviceStatus ? (
              <div className="device-grid">
                <div className="device-card">
                  <h4>Camera Service</h4>
                  <div className="device-rows">
                    <div className="device-row">
                      <span>Status</span>
                      <span className={`pill ${deviceStatus.servicesInitialized ? 'pill-green' : 'pill-red'}`}>
                        {deviceStatus.servicesInitialized ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    {deviceStatus.device && (
                      <>
                        <div className="device-row">
                          <span>Device ID</span>
                          <span className="mono">{deviceStatus.device.deviceId || '—'}</span>
                        </div>
                        <div className="device-row">
                          <span>Registered</span>
                          <span className={`pill ${deviceStatus.device.isRegistered ? 'pill-green' : 'pill-yellow'}`}>
                            {deviceStatus.device.isRegistered ? 'Yes' : 'No'}
                          </span>
                        </div>
                        <div className="device-row">
                          <span>Address</span>
                          <span className="mono truncate">{deviceStatus.device.address || '—'}</span>
                        </div>
                      </>
                    )}
                    {deviceStatus.filecoin && (
                      <div className="device-row">
                        <span>Lighthouse</span>
                        <span className={`pill ${deviceStatus.filecoin.connected ? 'pill-green' : 'pill-red'}`}>
                          {deviceStatus.filecoin.connected ? 'Ready' : 'Not configured'}
                        </span>
                      </div>
                    )}
                    {deviceStatus.blockchain && (
                      <div className="device-row">
                        <span>Blockchain</span>
                        <span className={`pill ${deviceStatus.blockchain ? 'pill-green' : 'pill-red'}`}>
                          {deviceStatus.blockchain ? 'Connected' : 'Disconnected'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="device-card">
                  <h4>Contracts (Sepolia)</h4>
                  <div className="device-rows">
                    <div className="device-row">
                      <span>LensMintERC1155</span>
                      <a
                        href="https://sepolia.etherscan.io/address/0x35f5B3b5D6BF361169743cB13D66849C4C839c69"
                        target="_blank" rel="noreferrer"
                        className="mono link"
                      >
                        0x35f5…9c69 ↗
                      </a>
                    </div>
                    <div className="device-row">
                      <span>DeviceRegistry</span>
                      <a
                        href="https://sepolia.etherscan.io/address/0x874709472d1cF830d7F78809E7D37692a27013A0"
                        target="_blank" rel="noreferrer"
                        className="mono link"
                      >
                        0x8747…13A0 ↗
                      </a>
                    </div>
                    <div className="device-row">
                      <span>Network</span>
                      <span className="pill pill-blue">Sepolia</span>
                    </div>
                  </div>
                </div>

                <div className="device-card">
                  <h4>Your Account</h4>
                  <div className="device-rows">
                    <div className="device-row">
                      <span>Privy User</span>
                      <span className="mono truncate">{user?.id?.slice(0, 20)}…</span>
                    </div>
                    <div className="device-row">
                      <span>Wallet</span>
                      <span className="mono">{walletAddress || 'Not connected'}</span>
                    </div>
                    {walletAddress && (
                      <div className="device-row">
                        <span>View on Etherscan</span>
                        <a
                          href={`https://sepolia.etherscan.io/address/${walletAddress}`}
                          target="_blank" rel="noreferrer"
                          className="link"
                        >
                          Open ↗
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📡</div>
                <p>Could not reach the camera service.</p>
                <p className="empty-sub">Make sure the hardware-web3-service is running at <code>{BACKEND_URL}</code></p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
