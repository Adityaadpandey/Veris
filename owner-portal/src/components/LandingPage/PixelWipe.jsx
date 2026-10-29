import { forwardRef, useImperativeHandle, useRef } from 'react'

const COLORS = ['#FF6A1A', '#14110E', '#FFF8EA', '#FF6A1A']
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// Pixel-wipe transition: a grid of random orange / black / cream cells scales in with random
// delays, `cover` runs once the screen is full, then the cells scale back out.
const PixelWipe = forwardRef(function PixelWipe(_, ref) {
  const el = useRef(null)
  useImperativeHandle(ref, () => ({
    run(cover) {
      return new Promise((resolve) => {
        const w = el.current
        if (reduced()) { cover(); resolve(); return }
        const cell = Math.ceil(Math.max(innerWidth, innerHeight) / 12)
        const cols = Math.ceil(innerWidth / cell), rows = Math.ceil(innerHeight / cell)
        w.style.gridTemplateColumns = `repeat(${cols}, 1fr)`
        w.style.gridTemplateRows = `repeat(${rows}, 1fr)`
        w.innerHTML = ''
        for (let i = 0; i < cols * rows; i++) {
          const d = document.createElement('i')
          d.style.background = COLORS[Math.floor(Math.random() * COLORS.length)]
          d.style.transitionDelay = (Math.random() * 0.5).toFixed(2) + 's'
          w.appendChild(d)
        }
        requestAnimationFrame(() => requestAnimationFrame(() => {
          w.classList.add('on')
          setTimeout(() => {
            cover()
            w.classList.remove('on')
            ;[...w.children].forEach((d) => { d.style.transitionDelay = (Math.random() * 0.4).toFixed(2) + 's' })
            setTimeout(() => { w.innerHTML = ''; resolve() }, 900)
          }, 950)
        }))
      })
    },
  }), [])
  return <div ref={el} className="wipe" aria-hidden="true" />
})

export default PixelWipe
