import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import Sprite from './Sprite'
import { DOCS_URL, VERIFY_URL } from './config'

// Pixel hills: three stepped layers (light peach, orange, black) painted on one tiny canvas.
const HILL_W = 200
const HILL_H = 26
const FLAG_X = 172
const hillHeight = (layer, x) => {
  if (layer === 0) return 17 + 5 * Math.sin(x * 0.045 + 0.6) + 2.2 * Math.sin(x * 0.13)
  if (layer === 1) return 10 + 4 * Math.sin(x * 0.06 + 2.3) + 2 * Math.sin(x * 0.17 + 1)
  return Math.max(4, 7 + 3 * Math.sin(x * 0.05 + 4) + 1.6 * Math.sin(x * 0.21))
}

function paintHills(cv) {
  cv.width = HILL_W
  cv.height = HILL_H
  const ctx = cv.getContext('2d')
  const fills = ['#FFD9BD', '#FF6A1A', '#14110E']
  for (let L = 0; L < 3; L++) {
    const top = []
    for (let x = 0; x < HILL_W; x++) top.push(HILL_H - Math.round(hillHeight(L, x)))
    if (L < 2) {
      ctx.fillStyle = '#14110E'
      for (let x = 0; x < HILL_W; x++) {
        const t = top[x]
        const l = x ? top[x - 1] : t
        const r = x < HILL_W - 1 ? top[x + 1] : t
        const from = Math.max(Math.min(t, l, r) - 1, 0)
        ctx.fillRect(x, t - 1, 1, 1)
        ctx.fillRect(x, from, 1, t - from)
      }
    }
    ctx.fillStyle = fills[L]
    for (let x = 0; x < HILL_W; x++) ctx.fillRect(x, top[x], 1, HILL_H - top[x])
  }
}

const SCENERY = [
  ['plus', 'o', 5, '22%', '26%'], ['plus', 'o', 4, '78%', '16%'], ['plus', 'o', 4, '93%', '50%'], ['plus', 'o', 4, '14%', '62%'],
  ['dotx', 'o', 4, '31%', '18%'], ['dotx', 'o', 4, '66%', '34%'], ['dotx', 'o', 3, '5%', '24%'],
  ['plus', 'k', 4, '70%', '22%'], ['dotx', 'k', 4, '26%', '52%'],
]

export default function HeroSection({ onOwner, onStory, onUseCases }) {
  const hillRef = useRef(null)
  useEffect(() => { paintHills(hillRef.current) }, [])

  return (
    <>
      <header className="nav">
        <a className="logo" href="#top" aria-label="Veris home">
          <Sprite name="camera" s={3} />VERIS
        </a>
        <nav className="nav-r" aria-label="Main">
          <button type="button" className="l" onClick={() => onStory('intro')}>How it works</button>
          <button type="button" className="l" onClick={onUseCases}>Use cases</button>
          <Link className="l" to={DOCS_URL}>Docs</Link>
          <button type="button" className="btn btn-o" onClick={onOwner}>Owner portal →</button>
        </nav>
      </header>

      <section className="hero" id="top" aria-labelledby="veris-h1">
        <div className="scene" aria-hidden="true">
          <Sprite name="cloud" className="cloud at cl-l" style={{ left: '9%', top: '44%' }} />
          <Sprite name="cloud" className="cloud at cl-r" style={{ left: '86%', top: '28%' }} />
          {SCENERY.map(([name, fill, s, left, top], i) => (
            <Sprite key={i} name={name} fill={fill} s={s} className="at" data-sp={name} style={{ left, top }} />
          ))}
          <Sprite name="sparkle" s={3} className="at" style={{ left: '90%', top: '12%' }} />
          <Sprite name="flower" s={3} className="at" style={{ left: '3%', top: '76%' }} />
        </div>

        <div className="hero-copy">
          <h1 id="veris-h1">
            Proof, made at<br /><em>the</em> <span className="shut">shutter.</span>
          </h1>
          <p className="hsub">
            Veris clips onto the camera or phone you already own,<br />
            and proves your photo is real the moment you take it.
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn-o" onClick={onOwner}>Owner portal →</button>
            <a className="btn btn-w" href={VERIFY_URL} target="_blank" rel="noopener noreferrer">
              <Sprite name="scan" ol="none" s={2} />Verify a photo
            </a>
          </div>
        </div>

        <div className="hills" aria-hidden="true">
          <Sprite name="sun" className="sun" />
          <canvas ref={hillRef} className="sp map" />
          <Sprite name="flag" className="flag" style={{ left: `${(FLAG_X / HILL_W) * 100}%`, bottom: `${(hillHeight(1, FLAG_X) / HILL_H) * 100 - 1}%` }} />
        </div>
      </section>
    </>
  )
}
