import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import axios from 'axios'
import './ClaimPage.css'

// Use Vercel proxy in production to avoid mixed-content blocks.
// In dev, calls go directly to the claim server.
const CLAIM_API = import.meta.env.DEV
  ? (import.meta.env.VITE_CLAIM_API || 'http://localhost:5001')
  : '/api/claim-server'

function statusLabel(status) {
  const map = {
    pending: { text: 'Pending — waiting for original NFT to be minted…', color: '#f59e0b', icon: '⏳' },
    open:    { text: 'Open — ready to claim editions!', color: '#10b981', icon: '✅' },
    claimed: { text: 'Claimed', color: '#3b82f6', icon: '📦' },
    completed: { text: 'Completed — NFT minted!', color: '#8b5cf6', icon: '🎉' },
  }
  return map[status] || { text: status, color: '#6b7280', icon: '❔' }
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
  const [message, setMessage] = useState(null)
  const [manualAddress, setManualAddress] = useState('')
  const [useManual, setUseManual] = useState(false)
  const [mintedEdition, setMintedEdition] = useState(null) // { wallet, txHash }

  const walletAddress = address || wallets[0]?.address

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
    const interval = setInterval(fetchClaim, 5000)
    return () => clearInterval(interval)
  }, [fetchClaim])

  const submit = async () => {
    const recipient = useManual ? manualAddress.trim() : walletAddress
    if (!recipient) {
      setMessage({ type: 'error', text: 'No wallet address. Connect a wallet or enter one manually.' })
      return
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
      setMessage({ type: 'error', text: 'Invalid Ethereum address.' })
      return
    }

    setSubmitting(true)
    setMessage(null)
    try {
      const res = await axios.post(`${CLAIM_API}/claim/${claimId}/submit`, {
        wallet_address: recipient
      })
      if (res.data.success) {
        setMintedEdition({ wallet: recipient, editionRequestId: res.data.edition_request_id })
        setManualAddress('')
        fetchClaim()
      } else {
        setMessage({ type: 'error', text: res.data.error || 'Submission failed.' })
      }
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.error || e.message })
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="claim-splash">
        <div className="claim-spinner" />
        <p>Loading claim…</p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="claim-splash">
        <div className="claim-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 52 }}>❌</div>
          <h2>Claim Not Found</h2>
          <p style={{ color: '#64748b', marginTop: 8 }}>This claim ID doesn't exist or has expired.</p>
        </div>
      </div>
    )
  }

  const st = statusLabel(claim?.status)
  const canClaim = claim?.status === 'open'
  const ipfsUrl = claim?.cid
    ? `https://gateway.lighthouse.storage/ipfs/${claim.cid}`
    : null

  return (
    <div className="claim-splash">
      <div className="claim-card">
        {/* Header */}
        <div className="claim-header">
          <div className="claim-logo">📷</div>
          <h1>LensMint</h1>
          <p className="claim-sub">Claim your photo NFT edition</p>
        </div>

        {/* NFT Image */}
        {ipfsUrl && (
          <div className="claim-img-wrap">
            <img
              src={ipfsUrl}
              alt="NFT"
              className="claim-img"
              onError={e => { e.target.style.display = 'none' }}
            />
          </div>
        )}

        {/* Status */}
        <div className="claim-status" style={{ borderColor: st.color, background: st.color + '18' }}>
          <span>{st.icon}</span>
          <span style={{ color: st.color, fontWeight: 600 }}>{st.text}</span>
        </div>

        {/* Claim info */}
        <div className="claim-meta">
          {claim?.token_id && (
            <div className="claim-meta-row">
              <span>Original Token</span>
              <span className="mono">#{claim.token_id}</span>
            </div>
          )}
          <div className="claim-meta-row">
            <span>Claim ID</span>
            <span className="mono truncate">{claimId}</span>
          </div>
          {claim?.cid && (
            <div className="claim-meta-row">
              <span>IPFS</span>
              <a href={ipfsUrl} target="_blank" rel="noreferrer" className="claim-link">
                View image ↗
              </a>
            </div>
          )}
          {claim?.tx_hash && (
            <div className="claim-meta-row">
              <span>Mint TX</span>
              <a
                href={`https://sepolia.etherscan.io/tx/${claim.tx_hash}`}
                target="_blank" rel="noreferrer"
                className="claim-link"
              >
                Etherscan ↗
              </a>
            </div>
          )}
        </div>

        {/* Post-claim success state */}
        {mintedEdition ? (
          <div className="claim-success-block">
            <div className="claim-success-icon">🎉</div>
            <h3>Edition Claimed!</h3>
            <p>Your NFT is being minted on Sepolia. It usually arrives in your wallet within <strong>30–60 seconds</strong>.</p>
            <div className="claim-meta" style={{ marginTop: 12 }}>
              <div className="claim-meta-row">
                <span>Your wallet</span>
                <span className="mono">{mintedEdition.wallet.slice(0,8)}…{mintedEdition.wallet.slice(-6)}</span>
              </div>
              <div className="claim-meta-row">
                <span>Check wallet</span>
                <a
                  href={`https://sepolia.etherscan.io/address/${mintedEdition.wallet}`}
                  target="_blank" rel="noreferrer"
                  className="claim-link"
                >
                  Etherscan ↗
                </a>
              </div>
              <div className="claim-meta-row">
                <span>Contract</span>
                <a
                  href="https://sepolia.etherscan.io/address/0x35f5B3b5D6BF361169743cB13D66849C4C839c69"
                  target="_blank" rel="noreferrer"
                  className="claim-link"
                >
                  LensMint ↗
                </a>
              </div>
            </div>
            <button
              className="claim-btn claim-btn-ghost"
              style={{ marginTop: 8 }}
              onClick={() => setMintedEdition(null)}
            >
              Claim another edition
            </button>
          </div>
        ) : (
          <>
            {/* Claim form */}
            {canClaim && (
              <div className="claim-form">
                <h3>Mint Your Edition</h3>
                <p className="claim-form-sub">
                  Connect your wallet or enter your address to receive a free NFT edition.
                </p>

                {!useManual ? (
                  <>
                    {!authenticated ? (
                      <button className="claim-btn claim-btn-primary" onClick={login} disabled={!ready}>
                        {ready ? 'Connect Wallet' : 'Loading…'}
                      </button>
                    ) : walletAddress ? (
                      <>
                        <div className="claim-wallet-badge">
                          <span>📱</span>
                          <span className="mono">{walletAddress.slice(0, 8)}…{walletAddress.slice(-6)}</span>
                        </div>
                        <button
                          className="claim-btn claim-btn-primary"
                          onClick={submit}
                          disabled={submitting}
                        >
                          {submitting ? 'Minting…' : 'Claim Edition'}
                        </button>
                      </>
                    ) : (
                      <button className="claim-btn claim-btn-primary" onClick={login}>
                        Connect Wallet
                      </button>
                    )}
                    <button
                      className="claim-btn claim-btn-ghost"
                      onClick={() => setUseManual(true)}
                    >
                      Enter address manually instead
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      className="claim-input"
                      placeholder="0x..."
                      value={manualAddress}
                      onChange={e => setManualAddress(e.target.value)}
                    />
                    <button
                      className="claim-btn claim-btn-primary"
                      onClick={submit}
                      disabled={submitting}
                    >
                      {submitting ? 'Minting…' : 'Claim Edition'}
                    </button>
                    <button
                      className="claim-btn claim-btn-ghost"
                      onClick={() => { setUseManual(false); setManualAddress('') }}
                    >
                      Back to wallet connect
                    </button>
                  </>
                )}

                {message && (
                  <div className={`claim-message claim-message-${message.type}`}>
                    {message.text}
                  </div>
                )}
              </div>
            )}

            {!canClaim && claim?.status === 'pending' && (
              <div className="claim-pending-note">
                The camera is still processing this photo. This page will update automatically.
              </div>
            )}
          </>
        )}

        <div className="claim-footer">
          Powered by LensMint · Sepolia Testnet
        </div>
      </div>
    </div>
  )
}
