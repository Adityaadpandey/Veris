import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import axios from 'axios'
import './ClaimPage.css'

const CLAIM_API = import.meta.env.DEV
  ? (import.meta.env.VITE_CLAIM_SERVER_URL || 'http://localhost:5001')
  : '/api/claim-server'

function fmt(dateStr) {
  if (!dateStr) return '—'
  // SQLite stores UTC without 'Z' — append it so JS parses as UTC, not local
  const iso = dateStr.includes('T') || dateStr.endsWith('Z') ? dateStr : dateStr.replace(' ', 'T') + 'Z'
  return new Date(iso).toLocaleString('en-IN', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
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
    <button className="copy-btn" onClick={copy} title="Copy">
      {copied ? '✓' : '⎘'}
    </button>
  )
}

function ProofRow({ label, value, full, link, mono }) {
  return (
    <div className="proof-row">
      <span className="proof-label">{label}</span>
      <span className="proof-val">
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="proof-link">{value} ↗</a>
        ) : (
          <span className={mono ? 'mono' : ''}>{value || '—'}</span>
        )}
        {full && value && <CopyBtn text={full} />}
      </span>
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

  if (loading) {
    return (
      <div className="claim-bg">
        <div className="claim-spinner" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="claim-bg">
        <div className="claim-card">
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48 }}>❌</div>
            <h2 style={{ marginTop: 12, color: '#1e293b' }}>Claim Not Found</h2>
            <p style={{ color: '#64748b', marginTop: 8 }}>This claim ID doesn't exist.</p>
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
    <div className="claim-bg">
      <div className="claim-card">

        {/* ── Header ── */}
        <div className="claim-header">
          <span className="claim-badge">📷 LensMint</span>
          <h1>Certificate of Authenticity</h1>
          <p className="claim-sub">This photo was captured and cryptographically signed by a LensMint camera. Its origin is verifiable on the blockchain.</p>
        </div>

        {/* ── Photo ── */}
        {ipfsUrl && (
          <div className="claim-photo-wrap">
            <img
              src={ipfsUrl}
              alt="Original capture"
              className="claim-photo"
              onError={e => { e.target.style.display = 'none' }}
            />
            <div className="claim-photo-overlay">
              <span className="verified-tag">✓ Verified Original</span>
            </div>
          </div>
        )}

        {/* ── Proof of authenticity ── */}
        <div className="proof-section">
          <div className="proof-section-title">
            <span>🔐</span> Proof of Authenticity
          </div>

          <ProofRow
            label="Captured at"
            value={fmt(claim?.created_at)}
          />
          {(claim?.location_name || claim?.latitude) && (
            <ProofRow
              label="Location"
              value={claim.location_name || `${claim.latitude?.toFixed(4)}, ${claim.longitude?.toFixed(4)}`}
              link={claim.latitude ? `https://maps.google.com/?q=${claim.latitude},${claim.longitude}` : null}
            />
          )}
          <ProofRow
            label="Camera Device"
            value={claim?.camera_id || claim?.device_id || '—'}
            mono
          />
          <ProofRow
            label="Device Address"
            value={short(claim?.device_address, 8)}
            full={claim?.device_address}
            link={claim?.device_address ? `https://sepolia.etherscan.io/address/${claim.device_address}` : null}
            mono
          />
          <ProofRow
            label="Image Hash (SHA-256)"
            value={short(claim?.image_hash, 10)}
            full={claim?.image_hash}
            mono
          />
          <ProofRow
            label="Hardware Signature"
            value={short(claim?.signature, 10)}
            full={claim?.signature}
            mono
          />
          <ProofRow
            label="IPFS Content ID"
            value={short(claim?.cid, 10)}
            full={claim?.cid}
            link={ipfsUrl}
            mono
          />
        </div>

        {/* ── Ownership ── */}
        <div className="proof-section">
          <div className="proof-section-title">
            <span>🏆</span> Ownership
          </div>
          <ProofRow
            label="Original owner"
            value={claim?.recipient_address ? short(claim.recipient_address, 8) : 'Minting…'}
            full={claim?.recipient_address}
            link={claim?.recipient_address ? `https://sepolia.etherscan.io/address/${claim.recipient_address}` : null}
            mono
          />
          {claim?.token_id && (
            <ProofRow
              label="Token ID"
              value={`#${claim.token_id}`}
              link={etherscanToken}
            />
          )}
          {etherscanTx && (
            <ProofRow
              label="Mint transaction"
              value="View on Etherscan"
              link={etherscanTx}
            />
          )}
          <ProofRow
            label="Network"
            value="Sepolia Testnet"
          />
          <ProofRow
            label="Contract"
            value="LensMintERC1155"
            link={etherscanToken}
          />
        </div>

        {/* ── Claim / Success ── */}
        {mintedEdition ? (
          <div className="claim-success">
            <div className="claim-success-icon">🎉</div>
            <h3>Edition Claimed!</h3>
            <p>Your NFT edition is being minted. It will arrive in your wallet in ~30–60 seconds.</p>
            <div className="proof-section" style={{ marginTop: 12 }}>
              <ProofRow
                label="Your wallet"
                value={short(mintedEdition.wallet, 8)}
                full={mintedEdition.wallet}
                link={`https://sepolia.etherscan.io/address/${mintedEdition.wallet}`}
                mono
              />
            </div>
            <button className="claim-btn-ghost" onClick={clearMintedEdition}>
              Claim another edition
            </button>
          </div>
        ) : isOpen ? (
          <div className="claim-form-section">
            <div className="claim-form-title">
              <span>✨</span> Claim Your Edition
            </div>
            <p className="claim-form-sub">
              Submit your wallet address to receive a free NFT edition of this photo. Each edition is its own unique token linked to this original.
            </p>

            {!useManual ? (
              <>
                {!authenticated ? (
                  <button className="claim-btn" onClick={login} disabled={!ready}>
                    {ready ? 'Connect Wallet to Claim' : 'Loading…'}
                  </button>
                ) : walletAddress ? (
                  <>
                    <div className="wallet-connected">
                      <span className="wallet-dot" />
                      <span className="mono">{walletAddress.slice(0,8)}…{walletAddress.slice(-6)}</span>
                    </div>
                    <button className="claim-btn" onClick={submit} disabled={submitting}>
                      {submitting ? 'Submitting…' : 'Claim Free Edition'}
                    </button>
                  </>
                ) : (
                  <button className="claim-btn" onClick={login}>Connect Wallet</button>
                )}
                <button className="claim-btn-ghost" onClick={() => setUseManual(true)}>
                  Enter address manually
                </button>
              </>
            ) : (
              <>
                <input
                  className="claim-input"
                  type="text"
                  placeholder="0x..."
                  value={manualAddress}
                  onChange={e => setManualAddress(e.target.value)}
                />
                <button className="claim-btn" onClick={submit} disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Claim Free Edition'}
                </button>
                <button className="claim-btn-ghost" onClick={() => { setUseManual(false); setManualAddress('') }}>
                  Use connected wallet instead
                </button>
              </>
            )}

            {error && <div className="claim-error">{error}</div>}
          </div>
        ) : isPending ? (
          <div className="claim-pending">
            <div className="claim-pending-spinner" />
            <p>The camera is still processing this photo. The claim will open automatically once the original NFT is minted.</p>
          </div>
        ) : null}

        <div className="claim-footer">
          Powered by LensMint · Hardware-signed photos on Sepolia
        </div>
      </div>
    </div>
  )
}
