import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import { useState } from 'react'
import axios from 'axios'
import './OwnerDashboard.css'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'
const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || 'your-privy-app-id'

function OwnerDashboard() {
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const { address, isConnected } = useAccount()
  const [status, setStatus] = useState('')
  const [images, setImages] = useState([])
  const [loadingImages, setLoadingImages] = useState(false)

  const fetchImages = async () => {
    try {
      setLoadingImages(true)
      setStatus('Fetching captured images...')
      const response = await axios.get(`${BACKEND_URL}/api/images/list`)
      if (response.data.success) {
        setImages(response.data.images || [])
        setStatus(`✅ Found ${response.data.images?.length || 0} image(s)`)
      }
    } catch (error) {
      setStatus(`❌ Error: ${error.message}`)
    } finally {
      setLoadingImages(false)
    }
  }

  if (!ready) {
    return (
      <div className="container">
        <div className="card">
          <h1>Loading...</h1>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="container">
        <div className="card">
          <h1>🔐 LensMint Owner Portal</h1>
          <p>Login to manage your LensMint camera system</p>
          {PRIVY_APP_ID === 'your-privy-app-id' && (
            <div className="warning-message">
              ⚠️ Please configure VITE_PRIVY_APP_ID in .env file
            </div>
          )}
          <button onClick={login} className="login-button" disabled={PRIVY_APP_ID === 'your-privy-app-id'}>
            Login with Privy
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="card">
        <div className="header">
          <h1>📷 LensMint Owner Portal</h1>
          <button onClick={logout} className="logout-button">Logout</button>
        </div>

        <div className="section">
          <h2>Account</h2>
          <div className="info-grid">
            <div><strong>User ID:</strong> {user?.id || 'N/A'}</div>
            <div><strong>Wallet:</strong> {address || wallets[0]?.address || 'No wallet'}</div>
            <div><strong>Connected:</strong> {isConnected ? '✅' : '❌'}</div>
          </div>
        </div>

        <div className="section">
          <h2>Captured Photos</h2>
          <div className="actions">
            <button onClick={fetchImages} className="action-button" disabled={loadingImages}>
              {loadingImages ? 'Loading...' : 'Refresh Images'}
            </button>
          </div>
          {status && <div className="status-message">{status}</div>}
          {images.length > 0 && (
            <div className="images-grid">
              {images.map((img) => (
                <div key={img.id} className="image-card">
                  {img.filecoin_cid && (
                    <img
                      src={`https://ipfs.io/ipfs/${img.filecoin_cid}`}
                      alt="Captured"
                      style={{ width: '100%', borderRadius: 8 }}
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                  )}
                  <div style={{ fontSize: '0.8em', marginTop: 8 }}>
                    <div><strong>Status:</strong> {img.status}</div>
                    {img.token_id && <div><strong>Token ID:</strong> #{img.token_id}</div>}
                    {img.claim_id && <div><strong>Claim ID:</strong> {img.claim_id}</div>}
                    {img.tx_hash && (
                      <div>
                        <a
                          href={`https://sepolia.etherscan.io/tx/${img.tx_hash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View on Etherscan
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="section">
          <h2>How it works</h2>
          <p className="info-text">
            Photos are automatically captured and minted as NFTs by the LensMint camera.
            Users scan the QR code shown on the camera to claim their edition.
          </p>
        </div>
      </div>
    </div>
  )
}

export default OwnerDashboard
