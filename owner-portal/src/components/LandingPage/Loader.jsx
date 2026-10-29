import { useEffect, useRef, useState } from 'react'
import Sprite, { PixelCat } from './Sprite'

const CELLS = 12
const MESSAGES = ['waking up the cat…', 'dusting the lens…', 'sealing the pixels…', 'almost there…']
const RISERS = [
  ['sparkle', 30, 58, 0], ['heart', 64, 62, 0.9], ['sparkle', 72, 46, 1.6], ['sparkleK', 24, 42, 2.2], ['heart', 40, 66, 2.7],
]

// First-load screen: a blinking pixel cat, floating sparkles and hearts, 12 cells that fill orange
// one by one, a rotating handwritten message, then a white flash and the pixel wipe.
export default function Loader({ onFinish }) {
  const [filled, setFilled] = useState(0)
  const [flash, setFlash] = useState(false)
  const done = useRef(false)
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (filled < CELLS) {
      const t = setTimeout(() => setFilled((n) => n + 1), reduce ? 40 : 210)
      return () => clearTimeout(t)
    }
    if (done.current) return undefined
    done.current = true
    const fonts = document.fonts?.ready ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]) : Promise.resolve()
    let t
    fonts.then(() => {
      setFlash(true)
      t = setTimeout(onFinish, reduce ? 0 : 380)
    })
    return () => clearTimeout(t)
  }, [filled, onFinish, reduce])

  const msg = MESSAGES[Math.min(MESSAGES.length - 1, Math.floor((filled / CELLS) * MESSAGES.length))]
  return (
    <div className={`loader${flash ? ' flash' : ''}`} role="status" aria-live="polite" aria-label="Loading Veris">
      {!reduce && RISERS.map(([n, x, y, d]) => (
        <Sprite key={n + x} name={n} u={5} className="rise" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }} />
      ))}
      <PixelCat u={10} />
      <div className="cells" aria-hidden="true">
        {Array.from({ length: CELLS }, (_, i) => <i key={i} className={i < filled ? 'on' : ''} />)}
      </div>
      <p className="msg hand">{msg}</p>
    </div>
  )
}
