import { prefersReducedMotion } from './sprites'

const COLORS = ['#FF6A1A', '#14110E', '#FFF8EA', '#FF6A1A', '#14110E']

// Pixel wipe: a grid of random orange / black / cream cells scales in with random delays,
// `mid` runs while the screen is covered, then the cells scale back out. Resolves when done.
export default function wipe(mid) {
  return new Promise((resolve) => {
    const el = document.createElement('div')
    el.setAttribute('aria-hidden', 'true')
    el.style.cssText = 'position:fixed;inset:0;z-index:1200;pointer-events:none;'
    document.body.appendChild(el)

    if (prefersReducedMotion()) {
      el.style.background = '#FFF8EA'
      el.style.opacity = '0'
      el.style.transition = 'opacity .3s'
      void el.offsetWidth
      el.style.opacity = '1'
      setTimeout(() => {
        mid && mid()
        el.style.opacity = '0'
        setTimeout(() => { el.remove(); resolve() }, 320)
      }, 330)
      return
    }

    const size = Math.max(44, Math.round(innerWidth / 18))
    const cols = Math.ceil(innerWidth / size)
    const rows = Math.ceil(innerHeight / size)
    el.style.display = 'grid'
    el.style.gridTemplateColumns = `repeat(${cols},1fr)`
    el.style.gridTemplateRows = `repeat(${rows},1fr)`
    const cells = []
    for (let i = 0; i < cols * rows; i++) {
      const c = document.createElement('i')
      const col = COLORS[Math.floor(Math.random() * COLORS.length)]
      c.style.cssText = `display:block;background:${col};box-shadow:0 0 0 1px ${col};transform:scale(0);transition:transform .28s steps(4,end)`
      el.appendChild(c)
      cells.push(c)
    }
    void el.offsetWidth
    cells.forEach((c) => { c.style.transitionDelay = Math.random() * 420 + 'ms'; c.style.transform = 'scale(1)' })
    setTimeout(() => {
      mid && mid()
      cells.forEach((c) => { c.style.transitionDelay = Math.random() * 420 + 'ms'; c.style.transform = 'scale(0)' })
      setTimeout(() => { el.remove(); resolve() }, 760)
    }, 760)
  })
}
