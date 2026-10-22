import { catRows, drawRows, hydrate, sprite } from './sprites'
import { VERIFY_URL } from './config'

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x) }
const jumpTo = (top, behavior = 'auto') => window.scrollTo({ top, behavior })

function buildPhotos(root) {
  root.querySelectorAll('[data-photo-card]').forEach((el) => {
    const stamp = el.dataset.stamp
      ? `<span class="stamp ${el.dataset.stampclass || ''}"${el.dataset.stampr ? ` data-r="${el.dataset.stampr}"` : ''}>${el.dataset.stamp}</span>`
      : ''
    el.classList.add('photo')
    el.setAttribute('role', 'img')
    el.setAttribute('aria-label', "Illustration of Meera's photo: officials in a government office with an unexpected guest")
    el.innerHTML = `${stamp}<div class="sky"><canvas class="sp cl" data-sp="cloud" data-s="3"></canvas><canvas class="sp sn" data-sp="sun" data-s="2"></canvas><canvas class="sp" data-sp="person" data-s="9"></canvas><canvas class="sp" data-sp="person" data-s="10"></canvas><canvas class="sp" data-sp="person" data-s="9"></canvas></div><div class="cap"><span>${el.dataset.cap || ''}</span><span>meera_photo.jpg</span></div>`
    if (el.hasAttribute('data-plain')) { el.style.boxShadow = 'none'; el.style.width = '100%' }
  })
}

function seedFloaters(layer) {
  const names = ['cat', 'camera', 'phone', 'chip', 'lock', 'check', 'heart', 'sparkle', 'flower', 'cloud', 'book']
  names.forEach((n, i) => {
    const cv = document.createElement('canvas')
    cv.className = 'sp'
    if (n === 'cat') drawRows(cv, catRows(false, 0), {})
    else sprite(cv, n, {})
    cv.style.width = cv.width * (n === 'cloud' ? 3 : 4) + 'px'
    cv.style.left = 6 + ((i * 37) % 88) + '%'
    cv.style.top = 8 + ((i * 53) % 80) + '%'
    cv.style.setProperty('--d', 7 + ((i % 5) * 2) + 's')
    cv.style.setProperty('--dx', (i % 2 ? 1 : -1) * (20 + i * 3) + 'px')
    cv.style.setProperty('--dy', -30 - i * 4 + 'px')
    layer.appendChild(cv)
  })
}

// Scroll-driven story. "Page stays still, elements move": each .act is tall, its .stage is sticky,
// and a lerped 0..1 progress value drives the elements tagged data-r / .sb / .hz inside it.
// Returns a cleanup function.
export default function initStory(root, { reduced, startAct, onBack, onOwner }) {
  buildPhotos(root)
  hydrate(root)
  root.querySelectorAll('[data-link="verify"]').forEach((a) => { a.href = VERIFY_URL; a.target = '_blank'; a.rel = 'noopener noreferrer' })
  const layer = root.querySelector('#fl')
  if (layer && !reduced && !layer.children.length) seedFloaters(layer)

  let vh = innerHeight
  const acts = [...root.querySelectorAll('.act')].map((el) => ({
    el, p: 0, top: 0, h: 0, range: 0, id: el.id.replace('a-', ''),
    sb: el.querySelector('.sb-inner'),
    hz: el.querySelector('.hz-track'),
    rs: [...el.querySelectorAll('[data-r]')].map((e) => {
      const v = e.dataset.r.split(',').map(parseFloat)
      return { el: e, a: v[0], b: v.length > 1 ? v[1] : null }
    }),
    rv: [...el.querySelectorAll('.rv')],
    pulse: [...el.querySelectorAll('[data-pulse]')],
  }))

  const measure = () => {
    vh = innerHeight
    acts.forEach((a) => {
      a.el.style.height = ''
      if (reduced) return
      if (a.sb) { a.range = Math.max(0, a.sb.offsetHeight - vh); a.el.style.height = a.range + vh + 'px' }
      else if (a.hz) { a.range = Math.max(0, a.hz.scrollWidth - innerWidth); a.el.style.height = vh + a.range * 1.1 + 'px' }
    })
    acts.forEach((a) => { a.top = a.el.getBoundingClientRect().top + scrollY; a.h = a.el.offsetHeight })
  }

  const apply = (a) => {
    const p = a.p
    a.rs.forEach((r) => {
      const inn = smooth((p - r.a) / 0.07)
      const out = r.b == null ? 1 : 1 - smooth((p - r.b) / 0.07)
      const op = inn * out
      const e = r.el
      e.style.opacity = op
      e.style.visibility = op < 0.01 ? 'hidden' : 'visible'
      if (!e.classList.contains('stamp')) e.style.transform = e.dataset.count !== undefined ? '' : `translateY(${(1 - inn) * 22}px)`
      if (e.dataset.count !== undefined) {
        const v = +e.dataset.count * smooth((p - r.a) / 0.12)
        let s = v.toFixed(+e.dataset.dec || 0)
        if (e.dataset.pad) s = ('00' + Math.round(v)).slice(-e.dataset.pad)
        e.textContent = (e.dataset.pre || '') + s + (e.dataset.suf || '')
      }
    })
    a.pulse.forEach((e) => { e.style.opacity = Math.max(0, 1 - Math.abs(p - +e.dataset.pulse) / 0.025) * 0.95 })
    if (a.sb) a.sb.style.transform = `translate3d(0,${-p * a.range}px,0)`
    if (a.hz) a.hz.style.transform = `translate3d(${-p * a.range}px,0,0)`
  }

  const bar = root.querySelector('#sbar')
  const navLinks = [...root.querySelectorAll('#actnav a')]
  let raf
  const tick = () => {
    if (!reduced) {
      const y = scrollY
      acts.forEach((a) => {
        if (y < a.top - vh || y > a.top + a.h + vh) return
        const target = clamp((y - a.top) / Math.max(1, a.h - vh), 0, 1)
        a.p += (target - a.p) * 0.14
        if (Math.abs(target - a.p) < 0.0005) a.p = target
        apply(a)
        a.rv.forEach((e) => { const r = e.getBoundingClientRect(); e.classList.toggle('on', r.top < vh * 0.92 && r.bottom > 0) })
      })
    }
    const d = document.documentElement.scrollHeight - vh
    if (bar) bar.style.width = (d > 0 ? (scrollY / d) * 100 : 0) + '%'
    let cur = ''
    acts.forEach((a) => { if (scrollY + vh * 0.35 >= a.top) cur = a.id })
    navLinks.forEach((l) => l.classList.toggle('on', l.dataset.go === cur))
    raf = requestAnimationFrame(tick)
  }

  const onClick = (e) => {
    const go = e.target.closest('[data-go]')
    if (go) {
      e.preventDefault()
      const a = acts.find((x) => x.id === go.dataset.go)
      if (a) jumpTo(a.top, reduced ? 'auto' : 'smooth')
      return
    }
    if (e.target.closest('#back')) { onBack(); return }
    if (e.target.closest('[data-link="owner"]')) { e.preventDefault(); onOwner() }
  }

  root.addEventListener('click', onClick)
  window.addEventListener('resize', measure)
  document.fonts && document.fonts.ready.then(measure)

  jumpTo(0)
  measure()
  acts.forEach(apply)
  const first = acts.find((a) => a.id === startAct)
  if (first && startAct !== 'intro') {
    jumpTo(first.top)
    acts.forEach((a) => { a.p = clamp((scrollY - a.top) / Math.max(1, a.h - vh), 0, 1); apply(a) })
  }
  const heading = root.querySelector('#storyh')
  if (heading) heading.focus({ preventScroll: true })
  raf = requestAnimationFrame(tick)

  return () => {
    cancelAnimationFrame(raf)
    root.removeEventListener('click', onClick)
    window.removeEventListener('resize', measure)
  }
}
