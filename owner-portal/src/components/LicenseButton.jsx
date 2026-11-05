import { useState } from 'react'
import axios from 'axios'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { arcTestnet, LICENSE_ADDRESS, ARC_USDC_ADDRESS, LICENSE_PRICE, LICENSE_ABI, ERC20_ABI } from '@/lib/arc'

// An editor pays the photographer 5 USDC on Arc for a 30 day license.
// tokenId is the photo's token on Arc (not the Sepolia one).
export default function LicenseButton({ tokenId, photographer, claimApi }) {
  const { address, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const arcClient = usePublicClient({ chainId: arcTestnet.id })
  const [step, setStep] = useState('idle') // idle | working | done | error
  const [message, setMessage] = useState('')

  if (!LICENSE_ADDRESS || !ARC_USDC_ADDRESS || !tokenId || !photographer) return null

  const buy = async () => {
    setStep('working')
    try {
      if (chainId !== arcTestnet.id) await switchChainAsync({ chainId: arcTestnet.id })

      setMessage('Approving 5 USDC…')
      const allowance = await arcClient.readContract({ address: ARC_USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [address, LICENSE_ADDRESS] })
      if (allowance < LICENSE_PRICE) {
        const approveHash = await writeContractAsync({ address: ARC_USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve', args: [LICENSE_ADDRESS, LICENSE_PRICE], chainId: arcTestnet.id })
        await arcClient.waitForTransactionReceipt({ hash: approveHash })
      }

      setMessage('Paying the photographer…')
      const hash = await writeContractAsync({ address: LICENSE_ADDRESS, abi: LICENSE_ABI, functionName: 'buyLicense', args: [BigInt(tokenId), photographer], chainId: arcTestnet.id })
      await arcClient.waitForTransactionReceipt({ hash })

      // the server mirrors the license to Arkiv; the purchase itself is already final on-chain
      axios.post(`${claimApi}/api/license/record`, { txHash: hash }).catch(() => {})
      setStep('done')
      setMessage('Licensed for 30 days.')
    } catch (e) {
      setStep('error')
      setMessage(e?.shortMessage || e?.message || 'Payment failed')
    }
  }

  return (
    <div className="mt-3">
      <button onClick={buy} disabled={step === 'working' || step === 'done'}
        className="w-full rounded-lg px-4 py-3 font-brutal-mono text-[11px] tracking-[0.16em] uppercase disabled:opacity-60"
        style={{ background: '#E7581C', color: '#fff' }}>
        {step === 'done' ? 'Licensed' : step === 'working' ? 'Working…' : 'License this photo · 5 USDC'}
      </button>
      {message && <p className="font-brutal-mono text-[10px] mt-1.5" style={{ color: 'rgba(16,14,12,.6)' }}>{message}</p>}
    </div>
  )
}
