import { useEffect, useRef, useState } from 'react'
import { Cat } from './Sprite'
import { prefersReducedMotion, sprite } from './sprites'
import wipe from './wipe'

const MESSAGES = ['waking up the cat…', 'dusting the lens…', 'sealing the pixels…', 'almost there…']
const CELLS = 12

// First-load screen: blinking cat, floating sparkles and hearts, 12 progress cells, a white flash, then the pixel wipe.
// `onDone` runs while the wipe covers the screen, so the page swaps underneath it.
export default function Loader({ onDone }) {
  const [n, setN] = useState(0)
  const stackRef = useRef(null)
  const flashRef = useRef(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    const reduced = prefersReducedMotion()
    const timers = []
    const stack = stackRef.current

    const spawn = () => {
      const cv = document.createElement('canvas')
      cv.className = 'sp fl'
      cv.setAttribute('aria-hidden', 'true')
      sprite(cv, Math.random() < 0.5 ? 'sparkle' : 'heart', {})
      cv.style.width = cv.width * (3 + Math.floor(Math.random() * 2)) + 'px'
      cv.style.left = `calc(50% + ${Math.random() * 340 - 170}px)`
      stack.appendChild(cv)
      timers.push(setTimeout(() => cv.remove(), 2700))
    }
    const floater = reduced ? null : setInterval(spawn, 300)

    let filled = 0
    const fill = setInterval(() => {
      filled++
      setN(filled)
      if (filled >= CELLS) {
        clearInterval(fill)
        timers.push(setTimeout(finish, reduced ? 200 : 500))
      }
    }, reduced ? 140 : 330)

    function finish() {
      clearInterval(floater)
      const fl = flashRef.current
      fl.style.transition = 'opacity .12s'
      fl.style.opacity = 1
      timers.push(setTimeout(() => { fl.style.transition = 'opacity .35s'; fl.style.opacity = 0 }, 140))
      timers.push(setTimeout(() => { wipe(() => doneRef.current && doneRef.current()) }, reduced ? 0 : 120))
    }

    return () => {
      clearInterval(fill)
      clearInterval(floater)
      timers.forEach(clearTimeout)
    }
  }, [])

  const msg = MESSAGES[Math.min(3, Math.max(0, Math.floor((n / CELLS) * 4 - 0.01)))]

  return (
    <>
      <div id="loader" role="status" aria-live="polite" aria-label="Loading Veris">
        <div className="stack" ref={stackRef}>
          <div className="cat"><Cat scale={10} /></div>
          <div className="cells" aria-hidden="true">
            {Array.from({ length: CELLS }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}
          </div>
          <div className="msg">{msg}</div>
        </div>
      </div>
      <div id="flash" ref={flashRef} />
    </>
  )
}
