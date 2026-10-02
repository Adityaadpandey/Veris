import axios from 'axios'
import { searchArkiv, verifyExactOnArkiv } from '@/lib/arkivDirect'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './LandingPage/landing.css'
import './authenticity.css'
import './search.css'
import Sprite from './LandingPage/Sprite'
import SiteNav from './SiteNav'

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
  if (hash.startsWith('0g://')) return '0g' + hash.slice(5).replace(/^0x/, '')
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
function VerifyPanel({ onOpenClaim, onActiveChange }) {
  const [state, setState] = useState({ phase: 'idle' })
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()
  const cameraInputRef = useRef()
  const outRef = useRef()
  const previewRef = useRef(null)
  const hasPreview = state.phase !== 'idle'

  useEffect(() => { onActiveChange?.(hasPreview) }, [hasPreview, onActiveChange])

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
      // A byte-identical photo is settled on this device: hash it here and ask Arkiv, so the photo
      // never leaves the browser. Any failure or miss falls through to the server check below.
      const direct = await verifyExactOnArkiv(file).catch(() => null)
      if (direct) {
        setState({ phase: 'done', previewUri, fileName: file.name, verdict: direct, aiHint: null, queryDescription: null, similar: [] })
        return
      }
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
              <span className="empty-sub">or click to choose one</span>
            </span>
          )}
        </div>

        {state.phase === 'idle' && (
          <div className="vp-btns">
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

            {state.aiHint && (
              <aside className={`aihint${state.aiHint.likely_ai_generated ? ' flag' : ''}`}>
                <b>{state.aiHint.likely_ai_generated ? 'This photo may be AI-generated or manipulated.' : 'No obvious signs of AI generation.'}</b>
                {state.aiHint.note && <p>{state.aiHint.note}</p>}
              </aside>
            )}

            {state.queryDescription && (
              <details className="note">
                <summary>What we see in your photo</summary>
                <p>{state.queryDescription}</p>
              </details>
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

// Look a photo up by its SHA-256 hash or a device id (the browser asks Arkiv first, then our server)
function HashLookup({ onOpenClaim }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)

  const search = async (e) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setBusy(true)
    try {
      const params = /^[0-9a-f]{64}$/i.test(q) ? { imageHash: q.toLowerCase() } : { deviceId: q }
      // Ask Arkiv directly first, so Veris never sees the lookup. Our server is only the fallback.
      let found = await searchArkiv(params).catch(() => [])
      if (!found.length) found = (await axios.get(`${CLAIM_API}/api/arkiv/search`, { params, timeout: 10000 })).data?.results || []
      setResults(found)
    } catch {
      setResults([])
    }
    setBusy(false)
  }

  return (
    <details className="lookup">
      <summary>No file? Search by image hash or device ID</summary>
      <form onSubmit={search}>
        <label htmlFor="hash-q" className="sr">Image hash or device ID</label>
        <input id="hash-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="64 character SHA-256, or a device ID" />
        <button className="btn btn-primary" type="submit" disabled={busy || !query.trim()}>{busy ? 'Searching…' : 'Search'}</button>
      </form>
      {results && (results.length === 0
        ? <p className="dim">Nothing found for that.</p>
        : (
          <ul>
            {results.map((r) => (
              <li key={r.claimId}>
                <button type="button" className="sim" onClick={() => onOpenClaim(r.claimId)}>
                  <span className="sim-text">
                    <span className="sim-desc">Claim {String(r.claimId).slice(0, 8)}…</span>
                    <span className="sim-meta">{r.status}</span>
                  </span>
                  <span className="sim-pct">→</span>
                </button>
              </li>
            ))}
          </ul>
        ))}
    </details>
  )
}

export default function SearchPage() {
  const navigate = useNavigate()
  const [photoAdded, setPhotoAdded] = useState(false)

  return (
    <div className="vl va">
      <SiteNav />

      <main className="wrap va-main">
        <div className="va-head">
          <h1>Was this photo ever sealed?</h1>
          {!photoAdded && <p>Every photo captured with a Veris device is recorded on the chain. Add a file and we'll check it against the public registry.</p>}
        </div>

        <VerifyPanel onOpenClaim={(claimId) => navigate(`/claim/${claimId}`)} onActiveChange={setPhotoAdded} />
        <HashLookup onOpenClaim={(claimId) => navigate(`/claim/${claimId}`)} />
      </main>

      <footer className="va-foot">
        <Link to="/">Back to home</Link>
        <span>Veris is a prototype and runs on the Ethereum Sepolia and Arc testnets.</span>
      </footer>
    </div>
  )
}
