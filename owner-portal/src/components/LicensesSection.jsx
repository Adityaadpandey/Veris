import { useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import { useAccount } from 'wagmi'
import { Brutal, Palette, SectionHead, short } from '@/components/brutal'
import { arcTestnet, LICENSE_ADDRESS, LICENSED_TOPIC, ARC_EXPLORER_API } from '@/lib/arc'

const PRICE_USDC = 5
const addrOf = (topic) => ('0x' + topic.slice(-40)).toLowerCase()
const explorer = arcTestnet.blockExplorers.default.url

// Reads every Licensed event for one photo straight from the chain's indexer, so the list is the
// real record (not something our server could edit). Newest first.
async function fetchLicenses(tokenId) {
  const want = BigInt(tokenId)
  const out = []
  let params = {}
  // ponytail: scans up to 10 pages (500 events of the whole contract); add a tokenId-indexed query if volume grows
  for (let i = 0; i < 10; i++) {
    const { data } = await axios.get(`${ARC_EXPLORER_API}/addresses/${LICENSE_ADDRESS}/logs`, { params })
    for (const l of data.items || []) {
      if (l.topics?.[0] !== LICENSED_TOPIC || BigInt(l.topics[1]) !== want) continue
      out.push({
        licensee: addrOf(l.topics[2]),
        photographer: addrOf(l.topics[3]),
        expiresAt: Number(BigInt(l.data)),
        boughtAt: l.block_timestamp,
        txHash: l.transaction_hash,
      })
    }
    if (!data.next_page_params) break
    params = data.next_page_params
  }
  return out
}

export default function LicensesSection({ tokenId, refreshKey }) {
  const { address } = useAccount()
  const [rows, setRows] = useState(null) // null = loading
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    if (!tokenId) return
    setFailed(false)
    fetchLicenses(tokenId).then(setRows).catch(() => { setRows([]); setFailed(true) })
  }, [tokenId])

  // refreshKey bumps after a purchase; the indexer lags a few seconds, so look again shortly after
  useEffect(() => {
    load()
    if (!refreshKey) return
    const t = setTimeout(load, 6000)
    return () => clearTimeout(t)
  }, [load, refreshKey])

  if (!tokenId) return null

  const me = address?.toLowerCase()
  const now = Date.now() / 1000
  const mine = (rows || []).filter(r => r.licensee === me)
  const myEnd = Math.max(0, ...mine.map(r => r.expiresAt))
  const iAmPhotographer = (rows || []).some(r => r.photographer === me)
  const earned = (rows || []).filter(r => r.photographer === me).length * PRICE_USDC

  return (
    <div className="mt-5">
      <SectionHead label="LICENSES" />
      <Brutal offset={3} radius={16} contentClassName="p-4">
        {rows === null ? (
          <p className="font-brutal-mono text-[10px]" style={{ color: 'rgba(16,14,12,.5)' }}>Reading Arc…</p>
        ) : (
          <>
            {myEnd > now && (
              <p className="font-brutal-body font-semibold text-[12.5px] mb-2" style={{ color: Palette.green }}>
                You hold an active license until {new Date(myEnd * 1000).toLocaleDateString()}.
              </p>
            )}
            {myEnd > 0 && myEnd <= now && (
              <p className="font-brutal-body text-[12px] mb-2" style={{ color: Palette.orange }}>
                Your license expired {new Date(myEnd * 1000).toLocaleDateString()}. Buy again to renew.
              </p>
            )}
            {iAmPhotographer && (
              <p className="font-brutal-body font-semibold text-[12.5px] mb-2" style={{ color: Palette.ink }}>
                You earned {earned} USDC from this photo, paid straight to your wallet.
              </p>
            )}
            {failed && <p className="font-brutal-mono text-[10px]" style={{ color: Palette.orange }}>Couldn't reach the Arc indexer. Try reloading.</p>}
            {!failed && rows.length === 0 && (
              <p className="font-brutal-mono text-[10px]" style={{ color: 'rgba(16,14,12,.5)' }}>No licenses yet. Licensing costs {PRICE_USDC} USDC for 30 days and goes to the photographer.</p>
            )}
            {rows.map((r) => {
              const active = r.expiresAt > now
              return (
                <a key={r.txHash} href={`${explorer}/tx/${r.txHash}`} target="_blank" rel="noreferrer"
                  className="flex items-center justify-between py-2 border-t first:border-t-0" style={{ borderColor: 'rgba(16,14,12,.12)' }}>
                  <span>
                    <span className="font-brutal-mono text-[11px]" style={{ color: Palette.ink }}>{short(r.licensee, 6)}{r.licensee === me ? ' (you)' : ''}</span>
                    <span className="block font-brutal-mono text-[9.5px]" style={{ color: 'rgba(16,14,12,.5)' }}>
                      bought {new Date(r.boughtAt).toLocaleDateString()} · ends {new Date(r.expiresAt * 1000).toLocaleDateString()}
                    </span>
                  </span>
                  <span className="font-brutal-mono text-[9.5px] font-bold rounded-full px-2 py-0.5"
                    style={{ color: active ? Palette.green : 'rgba(16,14,12,.45)', background: active ? 'rgba(30,122,76,.08)' : 'rgba(16,14,12,.04)' }}>
                    {active ? 'ACTIVE' : 'EXPIRED'}
                  </span>
                </a>
              )
            })}
          </>
        )}
      </Brutal>
    </div>
  )
}
