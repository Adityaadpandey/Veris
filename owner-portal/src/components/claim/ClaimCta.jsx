import { useEffect, useState } from 'react'
import axios from 'axios'
import { useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { Input } from '@/components/ui/input'
import { Palette, Brutal, Pill, short } from '@/components/brutal'
import { VERIS_ABI } from '@/lib/contracts'
import { txUrl } from '@/lib/chains'
import { ExternalLink, Loader2 } from 'lucide-react'

const dim = 'rgba(16,14,12,.45)'

function WalletChip({ address }) {
  return (
    <div className="flex items-center gap-2 py-2 px-3 rounded-lg" style={{ background: 'rgba(16,14,12,.05)', border: '1px solid rgba(16,14,12,.1)' }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: Palette.green }} />
      <span className="font-brutal-mono text-[11.5px]" style={{ color: Palette.ink }}>{address.slice(0, 8)}…{address.slice(-6)}</span>
    </div>
  )
}

function Tag({ children, color = dim, bg = 'rgba(16,14,12,.04)', border = 'rgba(16,14,12,.1)', bold }) {
  return (
    <span className={`font-brutal-mono text-[10.5px] rounded-full px-2 py-0.5 ${bold ? 'font-bold' : ''}`} style={{ color, background: bg, border: `1px solid ${border}` }}>
      {children}
    </span>
  )
}

/**
 * The one thing most visitors came to do: claim their edition. Three modes, picked by the page:
 *  - claim server offline: mint straight from the wallet on-chain
 *  - claim server open: free, gasless claim to a connected or typed-in address
 *  - claim still processing: a short wait message
 * Once claimed, the result is remembered per claim so a refresh doesn't offer it again.
 */
export default function ClaimCta({ claimId, claimApi, isOpen, isPending, serverOffline, chain, onChainTokenId, auth }) {
  const { ready, authenticated, login, walletAddress } = auth
  const storeKey = `veris_claim_${claimId}`

  const [claimed, setClaimed] = useState(null)
  const [useManual, setUseManual] = useState(false)
  const [manualAddress, setManualAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storeKey)
      if (stored) setClaimed(JSON.parse(stored))
    } catch {}
  }, [storeKey])

  const saveClaimed = (data) => {
    setClaimed(data)
    try { localStorage.setItem(storeKey, JSON.stringify(data)) } catch {}
  }
  const clearClaimed = () => {
    setClaimed(null)
    try { localStorage.removeItem(storeKey) } catch {}
  }

  // Direct on-chain mint, used when the claim server can't be reached
  const { switchChainAsync } = useSwitchChain()
  const { data: mintTxHash, writeContract, isPending: isMintPending, error: mintError } = useWriteContract()
  const { isLoading: isMintConfirming, isSuccess: isMintConfirmed } = useWaitForTransactionReceipt({ hash: mintTxHash })

  const mintOnChain = async () => {
    if (!onChainTokenId || !chain) return
    await switchChainAsync({ chainId: chain.id }).catch(() => {})
    writeContract({ chainId: chain.id, address: chain.veris, abi: VERIS_ABI, functionName: 'mintEdition', args: [walletAddress, onChainTokenId] })
  }

  const submit = async () => {
    const recipient = useManual ? manualAddress.trim() : walletAddress
    if (!recipient) { setError('No wallet address. Connect a wallet or enter one manually.'); return }
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) { setError('Invalid Ethereum address.'); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await axios.post(`${claimApi}/claim/${claimId}/submit`, { wallet_address: recipient })
      if (res.data.success) { saveClaimed({ wallet: recipient }); setManualAddress('') }
      else setError(res.data.error || 'Submission failed.')
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    }
    setSubmitting(false)
  }

  const connect = (label) => (
    <Pill label={label} onPress={login} disabled={!ready} bg={Palette.ink} color={Palette.cream} arrow fullWidth />
  )
  const connectLabel = ready ? 'CONNECT WALLET TO CLAIM' : 'LOADING…'

  // Already claimed
  if (claimed) {
    return (
      <Brutal bg={Palette.green} offset={3} radius={16} contentClassName="p-4 text-center">
        <span className="font-brutal-mono font-semibold text-[11.5px] tracking-[0.14em]" style={{ color: Palette.bone }}>✓ EDITION CLAIMED</span>
        <p className="font-brutal-mono text-[10.5px] mt-1.5" style={{ color: 'rgba(237,231,218,.8)' }}>
          Sent to {short(claimed.wallet, 8)} · arrives in ~30–60s
        </p>
        <button onClick={clearClaimed} className="font-brutal-mono text-[10.5px] mt-2.5 underline" style={{ color: 'rgba(237,231,218,.7)' }}>
          Claim another edition
        </button>
      </Brutal>
    )
  }

  // Claim server down: the wallet mints straight on-chain
  if (serverOffline) {
    return (
      <Brutal offset={3} radius={16} contentClassName="p-4">
        {isMintConfirmed ? (
          <div className="text-center space-y-1.5">
            <span className="font-brutal-mono text-[11.5px] font-semibold tracking-[0.14em]" style={{ color: Palette.green }}>✓ EDITION MINTED</span>
            {mintTxHash && (
              <a href={txUrl(chain, mintTxHash)} target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-1.5 font-brutal-mono text-[11px] hover:brightness-125" style={{ color: Palette.orange }}>
                <ExternalLink size={11} /> View transaction
              </a>
            )}
          </div>
        ) : !authenticated ? connect(connectLabel) : walletAddress ? (
          <div className="space-y-2.5">
            <WalletChip address={walletAddress} />
            <Pill
              label={isMintConfirming ? 'CONFIRMING…' : isMintPending ? 'CONFIRM IN WALLET…' : 'CLAIM EDITION ON-CHAIN'}
              onPress={mintOnChain}
              disabled={isMintPending || isMintConfirming || !onChainTokenId}
              bg={Palette.ink} color={Palette.cream} arrow fullWidth
            />
          </div>
        ) : connect('CONNECT WALLET')}
        {mintError && (
          <p className="font-brutal-mono text-[11px] mt-2.5" style={{ color: Palette.orange }}>{mintError.shortMessage || mintError.message}</p>
        )}
      </Brutal>
    )
  }

  if (isOpen) {
    return (
      <Brutal offset={3} radius={16} contentClassName="p-4">
        <span className="font-brutal-mono font-semibold text-[11px] tracking-[0.16em] uppercase" style={{ color: Palette.orange }}>Claim free edition</span>
        <div className="mt-2.5 space-y-2.5">
          {useManual ? (
            <Input
              type="text"
              placeholder="0x..."
              value={manualAddress}
              onChange={e => setManualAddress(e.target.value)}
              className="font-mono h-10 text-sm"
              style={{ background: 'rgba(16,14,12,.03)', borderColor: 'rgba(16,14,12,.15)', color: Palette.ink }}
            />
          ) : walletAddress ? (
            <WalletChip address={walletAddress} />
          ) : null}

          {useManual || walletAddress ? (
            <Pill label={submitting ? 'SUBMITTING…' : 'CLAIM FREE EDITION'} onPress={submit} disabled={submitting} bg={Palette.ink} color={Palette.cream} arrow fullWidth />
          ) : connect(authenticated ? 'CONNECT WALLET' : connectLabel)}

          <button
            onClick={() => { setUseManual(v => !v); setManualAddress('') }}
            className="w-full font-brutal-mono text-[10.5px] text-center"
            style={{ color: dim }}
          >
            {useManual ? 'Use connected wallet instead' : 'Enter address manually'}
          </button>

          {error && <p className="font-brutal-mono text-[11px]" style={{ color: Palette.orange }}>{error}</p>}

          <div className="flex items-center justify-center gap-1.5 pt-1">
            <Tag>ERC-1155</Tag>
            <Tag>{chain?.short || '…'}</Tag>
            <Tag bold color={Palette.green} bg="rgba(30,122,76,.08)" border={`${Palette.green}33`}>Free · Gasless</Tag>
          </div>
        </div>
      </Brutal>
    )
  }

  if (isPending) {
    return (
      <Brutal offset={3} radius={16} contentClassName="p-4 text-center">
        <Loader2 size={18} className="animate-spin mx-auto" style={{ color: Palette.ink }} strokeWidth={1.5} />
        <p className="font-brutal-body font-semibold text-[13px] mt-2" style={{ color: Palette.ink }}>Processing photo…</p>
        <p className="font-brutal-mono text-[11px] mt-1" style={{ color: 'rgba(16,14,12,.5)' }}>Claim opens once the original NFT is minted.</p>
      </Brutal>
    )
  }

  return null
}
