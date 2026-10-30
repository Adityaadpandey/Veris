import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './LandingPage/landing.css'
import './authenticity.css'
import './search.css'
import Sprite from './LandingPage/Sprite'
import { OWNER_PORTAL } from './LandingPage/links'

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

const CELLS = 10

const VERDICTS = {
  authentic_original: { cls: 'ok', title: 'Authentic original', sprite: 'check' },
  altered_copy: { cls: 'alt', title: 'Altered copy', sprite: 'meh' },
  no_match: { cls: 'none', title: 'No match on the chain', sprite: 'cloud' },
}

const fmtDate = (s) => (s ? new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`).toLocaleDateString() : '')

function MatchCells({ pct }) {
  const on = Math.round((pct / 100) * CELLS)
  return (
    <span className="cells hi" role="img" aria-label={`${pct} percent visual match`}>
      {Array.from({ length: CELLS }, (_, i) => <i key={i} className={i < on ? 'on' : ''} />)}
    </span>
  )
}

function VerdictCard({ verdict, onOpenClaim }) {
  const tone = VERDICTS[verdict.type] || VERDICTS.no_match
  return (
    <section className={`verdict ${tone.cls}`} aria-labelledby="verdict-h">
      <div className="verdict-top">
        <span className="verdict-icon"><Sprite name={tone.sprite} u={5} /></span>
        <div>
          <h2 id="verdict-h">{tone.title}</h2>
          <p>{verdict.message}</p>
        </div>
      </div>

      {(verdict.token_id != null || verdict.visual_match != null) && (
        <dl className="stats two">
          {verdict.token_id != null && <div><dt>Token</dt><dd>#{verdict.token_id}</dd></div>}
          {verdict.visual_match != null && (
            <div>
              <dt>Visual match</dt>
              <dd>{verdict.visual_match}%</dd>
              <MatchCells pct={verdict.visual_match} />
            </div>
          )}
        </dl>
      )}

      {verdict.hash_decode_failed && verdict.hash_warning && <p className="reject">{verdict.hash_warning}</p>}

      {verdict.changes && (
        <div className="changes">
          <h3 className="sig-h">What changed from the original</h3>
          {verdict.changes.summary && <p>{verdict.changes.summary}</p>}
          {verdict.changes.items?.length > 0 ? (
            <ul>{verdict.changes.items.map((c, i) => <li key={i}>{c}</li>)}</ul>
          ) : (
            <p className="dim">No visible content changes found. It was likely re-saved or compressed.</p>
          )}
          <p className="dim">This comparison is a guide and does not decide authenticity.</p>
        </div>
      )}

      {verdict.claim_id && (
        <button type="button" className="btn btn-primary view" onClick={() => onOpenClaim(verdict.claim_id)}>
          View the on-chain claim →
        </button>
      )}
    </section>
  )
}

function SimilarThumb({ cid }) {
  const [gatewayIndex, setGatewayIndex] = useState(0)
  const clean = cleanCid(cid)
  const uri = clean && gatewayIndex < IPFS_GATEWAYS.length ? `${IPFS_GATEWAYS[gatewayIndex]}/${clean}` : null
  if (!uri) return <span className="thumb blank"><Sprite name="camera" u={2} /></span>
  return <img className="thumb" src={uri} alt="" onError={() => setGatewayIndex((i) => i + 1)} />
}

function SimilarRow({ result, onPress }) {
  const pct = Math.round(result.similarity * 100)
  const meta = [result.token_id ? `Token #${result.token_id}` : null, fmtDate(result.created_at)].filter(Boolean).join(', ')
  return (
    <li>
      <button type="button" className="sim" onClick={onPress}>
        <SimilarThumb cid={result.cid} />
        <span className="sim-text">
          {result.description && <span className="sim-desc">{result.description}</span>}
          {meta && <span className="sim-meta">{meta}</span>}
        </span>
        <span className="sim-pct">{pct}%<small>match</small></span>
      </button>
    </li>
  )
}

/** Pick a photo, hash it, and look for it on the chain. */
function VerifyPanel({ onOpenClaim }) {
  const [state, setState] = useState({ phase: 'idle' })
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()
  const cameraInputRef = useRef()
  const outRef = useRef()
  const previewRef = useRef(null)
  const hasPreview = state.phase !== 'idle'

  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current) }, [])
  useEffect(() => {
    if (state.phase === 'done') outRef.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' })
  }, [state.phase])

  const reset = () => setState({ phase: 'idle' })

  const runVerify = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    const previewUri = URL.createObjectURL(file)
    previewRef.current = previewUri
    setState({ phase: 'running', previewUri, fileName: file.name })

    try {
      const form = new FormData()
      form.append('image', file)
      const res = await fetch(`${CLAIM_API}/api/search`, { method: 'POST', body: form })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Verification failed')
      setState({
        phase: 'done',
        previewUri,
        fileName: file.name,
        verdict: data.verdict,
        aiHint: data.ai_hint ?? null,
        queryDescription: data.query_description ?? null,
        similar: data.similar ?? data.results ?? [],
      })
    } catch (err) {
      setState({ phase: 'error', previewUri, fileName: file.name, message: err.message || 'Verification failed' })
    }
  }, [])

  const pick = (e) => { const f = e.target.files[0]; if (f) runVerify(f); e.target.value = '' }

  return (
    <div className={`vp${hasPreview ? ' has' : ''}`}>
      <input ref={inputRef} type="file" accept="image/*" className="sr" tabIndex={-1} onChange={pick} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="sr" tabIndex={-1} onChange={pick} />

      <div className="vp-photo">
        <div
          className={`slot vp-slot${dragging ? ' drag' : ''}${hasPreview ? ' filled' : ''}`}
          role={hasPreview ? undefined : 'button'}
          tabIndex={hasPreview ? undefined : 0}
          aria-label={hasPreview ? undefined : 'Choose a photo to verify'}
          onClick={() => !hasPreview && inputRef.current.click()}
          onKeyDown={(e) => { if (!hasPreview && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); inputRef.current.click() } }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) runVerify(f) }}
        >
          {hasPreview ? (
            <img src={state.previewUri} alt={`Photo being checked: ${state.fileName}`} />
          ) : (
            <span className="empty">
              <Sprite name="scan" u={7} />
              <span className="empty-main">Drop a photo here</span>
              <span className="empty-sub">or pick one below</span>
            </span>
          )}
        </div>

        {state.phase === 'idle' && (
          <div className="vp-btns">
            <button type="button" className="btn btn-primary" onClick={() => inputRef.current.click()}>Choose a photo</button>
            <button type="button" className="btn btn-ghost" onClick={() => cameraInputRef.current.click()}><Sprite name="camera" u={1.5} />Use the camera</button>
          </div>
        )}
        {hasPreview && state.phase !== 'running' && (
          <div className="vp-btns">
            <button type="button" className="btn btn-ghost" onClick={reset}>{state.phase === 'error' ? 'Try again' : 'Check another photo'}</button>
          </div>
        )}
      </div>

      <div className="vp-out" ref={outRef} aria-live="polite">
        {state.phase === 'running' && (
          <div className="busy" role="status">
            <span className="cells run" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</span>
            <p>Hashing the photo and searching the chain…</p>
          </div>
        )}

        {state.phase === 'error' && (
          <div className="err" role="alert">
            <Sprite name="meh" u={3} />
            <div>
              <b>The check didn't finish</b>
              <p>{state.message}. Check your connection and try again.</p>
            </div>
          </div>
        )}

        {state.phase === 'done' && (
          <>
            <VerdictCard verdict={state.verdict} onOpenClaim={onOpenClaim} />

            {state.queryDescription && (
              <aside className="note">
                <h3>What we see in your photo</h3>
                <p>{state.queryDescription}</p>
              </aside>
            )}

            {state.aiHint && (
              <p className="aihint">
                <b>{state.aiHint.likely_ai_generated ? 'This photo may be AI-generated or manipulated.' : 'No obvious signs of AI generation.'}</b>
                {state.aiHint.note ? ` ${state.aiHint.note}` : ''}
              </p>
            )}

            {state.similar.length > 0 && (
              <section className="similar" aria-labelledby="sim-h">
                <h3 id="sim-h">Verified photos that look similar</h3>
                <p className="dim">For browsing only. This does not check authenticity.</p>
                <ul>
                  {state.similar.map((r) => (
                    <SimilarRow key={r.claim_id} result={r} onPress={() => onOpenClaim(r.claim_id)} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function SearchPage() {
  const navigate = useNavigate()

  return (
    <div className="vl va va-fit">
      <header className="va-nav">
        <div className="wrap">
          <Link className="brand" to="/" aria-label="Veris home"><Sprite name="camera" u={1.7} />VERIS</Link>
          <Link className="btn btn-ghost" to={OWNER_PORTAL}>Owner portal →</Link>
        </div>
      </header>

      <main className="wrap va-main">
        <div className="va-head">
          <h1>Was this photo ever sealed?</h1>
          <p>Every photo captured with a Veris device is recorded on the chain. Add a file and we'll check it against the public registry.</p>
        </div>

        <VerifyPanel onOpenClaim={(claimId) => navigate(`/claim/${claimId}`)} />
      </main>

      <footer className="va-foot">
        <Link to="/">Back to home</Link>
        <span>Veris is a prototype and runs on the Ethereum Sepolia testnet.</span>
      </footer>
    </div>
  )
}
