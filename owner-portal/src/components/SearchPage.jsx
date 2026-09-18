import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Palette, Brutal, Pill } from '@/components/brutal'

const CLAIM_API = import.meta.env.VITE_CLAIM_SERVER_URL
  || (import.meta.env.DEV ? 'http://localhost:5001' : '/api/claim-server')

// Older claims were uploaded under a previous Lighthouse API key, so they only resolve on that
// key's dedicated gateway, not the current one — public IPFS gateways never have these CIDs at all.
const IPFS_GATEWAYS = [
  `${CLAIM_API}/api/image`,
  import.meta.env.VITE_IPFS_GATEWAY || 'https://unemployed-tyrannosaurus-wprec.lighthouseweb3.xyz/ipfs',
  'https://structural-crocodile-le3p6.lighthouseweb3.xyz/ipfs',
  'https://flexible-toucan-z8dgh.lighthouseweb3.xyz/ipfs',
]
const cleanCid = (hash) => {
  if (!hash) return null
  if (hash.startsWith('ipfs://')) return hash.slice(7)
  if (hash.startsWith('https://') || hash.startsWith('http://')) return null
  return hash
}
const ipfsOnError = (cid) => (e) => {
  const idx = IPFS_GATEWAYS.findIndex(g => e.target.src.startsWith(g))
  const next = idx + 1
  if (next < IPFS_GATEWAYS.length) e.target.src = `${IPFS_GATEWAYS[next]}/${cid}`
  else e.target.style.display = 'none'
}

/** Photos come in every aspect ratio a camera can shoot — clamp so a panorama or a tall portrait never blows up the card. */
function clampAspect(aspect) {
  return Math.min(1.9, Math.max(0.55, aspect))
}

const VERDICT_TONE = {
  authentic_original: { border: Palette.green, badgeBg: Palette.green, badgeText: Palette.bone, label: 'AUTHENTIC ORIGINAL', glyph: '✓' },
  altered_copy:        { border: Palette.orange, badgeBg: Palette.orange, badgeText: Palette.espresso, label: 'ALTERED COPY', glyph: '⚠' },
  no_match:            { border: 'rgba(237,231,218,.3)', badgeBg: 'rgba(237,231,218,.14)', badgeText: Palette.bone, label: 'NO MATCH ON CHAIN', glyph: '◌' },
}

/** >=80 reads as a strong match, >=55 a soft one, below that no color claims confidence. */
function matchColor(pct) {
  if (pct >= 80) return Palette.green
  if (pct >= 55) return Palette.orange
  return 'rgba(237,231,218,.4)'
}

function VerdictCard({ verdict, onOpenClaim }) {
  const tone = VERDICT_TONE[verdict.type] || VERDICT_TONE.no_match
  return (
    <Brutal bg={Palette.espresso} border={tone.border} borderWidth={2.5} offset={3} radius={12} contentClassName="p-4">
      <Brutal bg={tone.badgeBg} border={Palette.ink} offset={2} radius={999} contentClassName="inline-flex px-3 py-1.5 w-fit">
        <span className="font-brutal-mono font-semibold text-[10px] tracking-[0.12em]" style={{ color: tone.badgeText }}>
          {tone.glyph} {tone.label}
        </span>
      </Brutal>

      <p className="font-brutal-body text-[12.5px] leading-relaxed mt-2.5" style={{ color: 'rgba(237,231,218,.8)' }}>{verdict.message}</p>

      {(verdict.token_id != null || verdict.visual_match != null) && (
        <div className="flex flex-wrap gap-4 mt-2.5">
          {verdict.token_id != null && (
            <span className="font-brutal-mono text-[10.5px]" style={{ color: 'rgba(237,231,218,.6)' }}>
              TOKEN <span style={{ color: tone.border }}>#{verdict.token_id}</span>
            </span>
          )}
          {verdict.visual_match != null && (
            <span className="font-brutal-mono text-[10.5px]" style={{ color: 'rgba(237,231,218,.6)' }}>
              VISUAL MATCH <span style={{ color: tone.border }}>{verdict.visual_match}%</span>
            </span>
          )}
        </div>
      )}

      {verdict.hash_decode_failed && verdict.hash_warning && (
        <p className="font-brutal-mono text-[9.5px] leading-snug mt-2" style={{ color: Palette.orange }}>{verdict.hash_warning}</p>
      )}

      {verdict.changes && (
        <div className="mt-3 pt-2.5 space-y-1" style={{ borderTop: '1px solid rgba(237,231,218,.14)' }}>
          <p className="font-brutal-mono text-[9px] tracking-[0.14em]" style={{ color: 'rgba(237,231,218,.45)' }}>
            WHAT CHANGED VS THE ORIGINAL · NON-AUTHORITATIVE
          </p>
          {verdict.changes.summary && (
            <p className="font-brutal-body text-[11.5px] leading-snug" style={{ color: 'rgba(237,231,218,.75)' }}>{verdict.changes.summary}</p>
          )}
          {verdict.changes.items?.length > 0 ? (
            verdict.changes.items.map((c, i) => (
              <p key={i} className="font-brutal-body text-[11.5px] leading-snug" style={{ color: Palette.orange }}>• {c}</p>
            ))
          ) : (
            <p className="font-brutal-body text-[11.5px] leading-snug" style={{ color: 'rgba(237,231,218,.5)' }}>
              No visible content changes detected — likely just re-saved or compressed.
            </p>
          )}
        </div>
      )}

      {verdict.claim_id && (
        <button onClick={() => onOpenClaim(verdict.claim_id)} className="mt-3">
          <span className="font-brutal-mono font-semibold text-[10.5px]" style={{ color: tone.border }}>VIEW ON-CHAIN CLAIM →</span>
        </button>
      )}
    </Brutal>
  )
}

function SimilarThumb({ cid }) {
  const [gatewayIndex, setGatewayIndex] = useState(0)
  const clean = cleanCid(cid)
  const uri = clean && gatewayIndex < IPFS_GATEWAYS.length ? `${IPFS_GATEWAYS[gatewayIndex]}/${clean}` : null
  if (!uri) return <div className="w-[52px] h-[52px] rounded-lg shrink-0" style={{ background: 'rgba(237,231,218,.08)' }} />
  return (
    <img
      src={uri}
      alt=""
      className="w-[52px] h-[52px] rounded-lg shrink-0 object-cover"
      onError={() => setGatewayIndex(i => i + 1)}
    />
  )
}

function SimilarRow({ result, onPress }) {
  const pct = Math.round(result.similarity * 100)
  return (
    <button onClick={onPress} className="w-full text-left">
      <Brutal bg="rgba(237,231,218,.05)" border="rgba(237,231,218,.28)" borderWidth={1.5} offset={3} radius={16} contentClassName="flex items-center gap-3 p-2.5">
        <SimilarThumb cid={result.cid} />
        <div className="flex-1 min-w-0">
          {result.description && (
            <p className="font-brutal-body text-[11.5px] leading-snug overflow-hidden" style={{ color: 'rgba(237,231,218,.7)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {result.description}
            </p>
          )}
          <p className="font-brutal-mono text-[9px] mt-1" style={{ color: 'rgba(237,231,218,.4)' }}>
            {result.token_id ? `#${result.token_id}` : '—'}
            {result.created_at ? ` · ${new Date(result.created_at.includes('T') ? result.created_at : `${result.created_at.replace(' ', 'T')}Z`).toLocaleDateString()}` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-brutal-mono font-semibold text-sm" style={{ color: matchColor(pct) }}>{pct}%</p>
          <p className="font-brutal-mono text-[8px]" style={{ color: 'rgba(237,231,218,.4)' }}>MATCH</p>
        </div>
      </Brutal>
    </button>
  )
}

/** The web equivalent of mobile-app's VerifyPanel: pick a photo, hash it against the chain. */
function VerifyPanel({ onOpenClaim }) {
  const [state, setState] = useState({ phase: 'idle' })
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()
  const cameraInputRef = useRef()
  const hasPreview = state.phase === 'running' || state.phase === 'done' || state.phase === 'error'

  const reset = () => setState({ phase: 'idle' })

  const runVerify = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const previewUri = URL.createObjectURL(file)
    const previewAspect = await new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img.naturalWidth / img.naturalHeight || 1)
      img.onerror = () => resolve(1)
      img.src = previewUri
    })
    setState({ phase: 'running', previewUri, previewAspect })

    try {
      const form = new FormData()
      form.append('image', file)
      const res = await fetch(`${CLAIM_API}/api/search`, { method: 'POST', body: form })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Verification failed')
      setState({
        phase: 'done',
        previewUri,
        previewAspect,
        verdict: data.verdict,
        aiHint: data.ai_hint ?? null,
        queryDescription: data.query_description ?? null,
        similar: data.similar ?? data.results ?? [],
      })
    } catch (err) {
      setState({ phase: 'error', previewUri, previewAspect, message: err.message || 'Verification failed' })
    }
  }, [])

  return (
    <Brutal
      bg="rgba(237,231,218,.06)"
      border={dragging ? Palette.orange : 'rgba(237,231,218,.4)'}
      shadowColor="rgba(231,88,28,.4)"
      offset={4}
      radius={22}
      className="mt-6"
      contentClassName="p-5"
    >
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) runVerify(f) }}
      >
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files[0] && runVerify(e.target.files[0])} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => e.target.files[0] && runVerify(e.target.files[0])} />

        <span className="font-brutal-mono text-[10px] tracking-[0.2em]" style={{ color: Palette.orange }}>REVERSE CHECK</span>
        <p className="font-brutal-body font-semibold text-[15px] leading-snug mt-1" style={{ color: Palette.bone }}>
          Pick or shoot a photo — we'll tell you if it was ever sealed
        </p>

        {!hasPreview && (
          <div className="flex justify-center mt-4 mb-1">
            <Brutal bg={Palette.cream} border={Palette.ink} offset={3} radius={999} contentClassName="w-14 h-14 flex items-center justify-center">
              <span className="text-2xl" style={{ color: Palette.espresso }}>◎</span>
            </Brutal>
          </div>
        )}

        {hasPreview && (
          <Brutal bg={Palette.ink} border={Palette.ink} offset={4} radius={12} className="mt-4">
            <div style={{ aspectRatio: clampAspect(state.previewAspect) }}>
              <img src={state.previewUri} alt="preview" className="w-full h-full object-cover" />
            </div>
          </Brutal>
        )}

        {state.phase === 'idle' && (
          <div className="flex gap-2.5 mt-4">
            <Pill label="CHOOSE PHOTO" onPress={() => inputRef.current.click()} bg={Palette.cream} color={Palette.espresso} className="flex-1" />
            <Pill label="USE CAMERA" onPress={() => cameraInputRef.current.click()} bg="rgba(237,231,218,.1)" border="rgba(237,231,218,.4)" color={Palette.bone} className="flex-1" />
          </div>
        )}

        {state.phase === 'running' && (
          <div className="flex items-center gap-2.5 mt-4">
            <Loader2 size={16} className="animate-spin" style={{ color: Palette.orange }} />
            <span className="font-brutal-mono text-[11px] tracking-[0.12em]" style={{ color: 'rgba(237,231,218,.55)' }}>
              HASHING &amp; SEARCHING THE CHAIN…
            </span>
          </div>
        )}

        {state.phase === 'error' && (
          <>
            <Brutal bg="rgba(231,88,28,.1)" border={Palette.orange} offset={0} radius={12} className="mt-3.5" contentClassName="p-3.5">
              <p className="font-brutal-body text-xs leading-snug" style={{ color: Palette.bone }}>{state.message}</p>
            </Brutal>
            <div className="mt-3.5">
              <Pill label="TRY AGAIN" onPress={reset} bg={Palette.cream} color={Palette.espresso} fullWidth />
            </div>
          </>
        )}

        {state.phase === 'done' && (
          <>
            <div className="mt-3.5">
              <VerdictCard verdict={state.verdict} onOpenClaim={onOpenClaim} />
            </div>

            {state.queryDescription && (
              <Brutal bg="rgba(231,88,28,.06)" border="rgba(231,88,28,.3)" offset={0} radius={12} className="mt-3" contentClassName="p-3">
                <span className="font-brutal-mono text-[9.5px] tracking-[0.16em]" style={{ color: Palette.orange }}>WE DETECTED</span>
                <p className="font-brutal-body text-xs leading-snug mt-1" style={{ color: 'rgba(237,231,218,.75)' }}>{state.queryDescription}</p>
              </Brutal>
            )}

            {state.aiHint && (
              <p className="font-brutal-mono text-[9.5px] leading-snug mt-2.5" style={{ color: 'rgba(237,231,218,.45)' }}>
                {state.aiHint.likely_ai_generated ? '⚠ MAY BE AI-GENERATED / MANIPULATED' : 'NO OBVIOUS AI-GENERATION ARTIFACTS'}
                {state.aiHint.note ? ` — ${state.aiHint.note}` : ''}
              </p>
            )}

            {state.similar.length > 0 && (
              <div className="mt-4.5">
                <p className="font-brutal-mono text-[9.5px] tracking-[0.14em]" style={{ color: 'rgba(237,231,218,.5)' }}>VISUALLY SIMILAR VERIFIED PHOTOS</p>
                <p className="font-brutal-mono text-[8.5px] mt-0.5" style={{ color: 'rgba(237,231,218,.35)' }}>For discovery, not an authenticity check.</p>
                <div className="mt-2.5 space-y-2.5">
                  {state.similar.map(r => (
                    <SimilarRow key={r.claim_id} result={r} onPress={() => onOpenClaim(r.claim_id)} />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3.5">
              <Pill label="RUN ANOTHER" onPress={reset} bg={Palette.cream} color={Palette.espresso} fullWidth />
            </div>
          </>
        )}
      </div>
    </Brutal>
  )
}

export default function SearchPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen relative" style={{ background: Palette.espresso }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 24% 0%, rgba(231,88,28,.4) 0%, rgba(231,88,28,0) 68%)' }}
      />
      <div className="relative max-w-[440px] mx-auto px-5 pt-6 pb-32">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate(-1)}>
            <Brutal bg="rgba(237,231,218,.1)" border="rgba(237,231,218,.55)" borderWidth={2.5} offset={3} radius={999} contentClassName="w-[42px] h-[42px] flex items-center justify-center">
              <span className="text-lg font-semibold" style={{ color: Palette.bone }}>←</span>
            </Brutal>
          </button>
          <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(237,231,218,.1)', border: '1px solid rgba(237,231,218,.3)', backdropFilter: 'blur(12px)' }}>
            <span className="font-brutal-mono text-[10px] tracking-[0.18em]" style={{ color: 'rgba(237,231,218,.55)' }}>REGISTRY / PUBLIC</span>
          </div>
        </div>

        <h1 className="font-brutal-display text-[36px] leading-[33px] mt-5" style={{ color: Palette.bone }}>Verify a<br />frame.</h1>
        <p className="font-brutal-body text-[13px] leading-relaxed mt-2.5 max-w-[270px]" style={{ color: 'rgba(237,231,218,.55)' }}>
          Every sealed photo lives on-chain. Drop a file below to check it against the registry.
        </p>

        <VerifyPanel onOpenClaim={(claimId) => navigate(`/claim/${claimId}`)} />
      </div>
    </div>
  )
}
