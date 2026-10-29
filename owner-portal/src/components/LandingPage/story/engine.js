// Scroll engine for "The story behind Veris": the page stays still while the elements move.
// Smoothed (lerped) scroll progress drives a pinned sequence, a horizontal-scrub benefits rail,
// and a few reveal effects. Returns a cleanup function.
import { paint, spriteUrl } from '../sprites'

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const lerp = (a, b, t) => a + (b - a) * t

// photo travels through the acts: [progress, x, y, scale, rotation]
const PHOTO = [[0, 320, 215, 0.85, -3], [0.13, 320, 215, 0.85, -3], [0.22, 320, 300, 1.25, 0], [0.31, 320, 300, 1.25, 0], [0.40, 320, 168, 0.82, 0], [0.50, 320, 168, 0.82, 0], [0.60, 190, 170, 0.7, -2], [0.71, 190, 170, 0.7, -2], [0.80, 320, 250, 1.05, 0], [0.90, 320, 250, 1.05, 0], [1, 110, 66, 0.34, 0]]
const DEVS = [[0, 320, 505, 1, 0], [0.2, 320, 505, 1, 0], [0.45, 190, 462, 0.62, 0], [1, 190, 462, 0.62, 0]]
const ACTS = [[0, 0.14], [0.16, 0.31], [0.33, 0.5], [0.52, 0.71], [0.73, 0.9], [0.92, 1]]

function keyframes(F, p) {
  if (p <= F[0][0]) return F[0].slice(1)
  for (let i = 1; i < F.length; i++) {
    if (p <= F[i][0]) {
      const a = F[i - 1], b = F[i], t = ss(a[0], b[0], p)
      return [1, 2, 3, 4].map((k) => lerp(a[k], b[k], t))
    }
  }
  return F[F.length - 1].slice(1)
}
const setT = (el, v) => el.setAttribute('transform', `translate(${v[0].toFixed(2)} ${v[1].toFixed(2)}) rotate(${v[3].toFixed(2)}) scale(${v[2].toFixed(3)})`)

export function initStory(root, { reduce = false, onNav } = {}) {
  const $ = (s) => root.querySelector(s)
  const $$ = (s) => [...root.querySelectorAll(s)]
  const cleanups = []
  let raf = 0

  // sprites + decorative hex columns
  $$('canvas[data-spr]').forEach((c) => paint(c, c.dataset.spr))
  $$('.pxi').forEach((el) => el.setAttribute('href', spriteUrl(el.dataset.emo)))
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  ;['hx1', 'hx2', 'hx3'].forEach((id, i) => {
    let t = ''
    for (let r = 0; r < 90; r++) {
      let line = ''
      for (let k = 0; k < (i === 1 ? 5 : 3); k++) line += Math.floor(rnd() * 4294967295).toString(16).padStart(8, '0') + ' '
      t += line + '\n'
    }
    $('#' + id).textContent = t
  })

  const story = $('#story'), stage = $('#stage'), acts = $$('.act')
  const photo = $('#photo'), devs = $('#devs'), vf = $('#vf'), feed = $('#feed'), pipe = $('#pipe'), witness = $('#witness')
  const claimurl = $('#claimurl'), consoleG = $('#console'), dock = $('#dock')
  const phDim = $('#ph-dim'), phFlash = $('#ph-flash'), phSeal = $('#ph-seal'), phChip = $('#ph-sealchip'), phStamp = $('#ph-stamp'), phVer = $('#ph-ver'), heroRing = $('#heroring')
  const rows = $$('#feed .row'), nodes = $$('#pipe .node'), lns = $$('#console .ln')
  const pline = $('#pline'), packet = $('#packet'), timer = $('#timer'), reposts = $('#reposts')
  const strike = $('#strike'), metanote = $('#metanote'), vfguest = $('#vfguest'), vfguesttxt = $('#vfguesttxt')
  const hx = [$('#hx1'), $('#hx2'), $('#hx3')]
  const floats = $$('.sf')
  floats.forEach((f) => { f._m = [Math.random() * 2 - 1, Math.random() * 2 - 1] })
  const V = [], T = []
  const op = (el, v) => el.setAttribute('opacity', v.toFixed(3))

  function render(p) {
    stage.style.setProperty('--p', p.toFixed(4))
    ACTS.forEach((r, i) => {
      const a = r[0], b = r[1]
      const inn = i === 0 ? 1 : ss(a - 0.03, a, p), out = i === 5 ? 0 : ss(b, b + 0.03, p), v = inn * (1 - out)
      const el = acts[i]
      el.style.opacity = v.toFixed(3)
      el.style.visibility = v < 0.01 ? 'hidden' : 'visible'
      el.style.pointerEvents = v > 0.6 ? 'auto' : 'none'
      el.style.setProperty('--ay', ((1 - inn) * 30 - out * 30).toFixed(1) + 'px')
      V[i] = v
      T[i] = clamp((p - a) / (b - a))
    })
    hx[0].style.transform = `translateY(${-p * 1100}px)`
    hx[1].style.transform = `translateY(${-p * 620}px)`
    hx[2].style.transform = `translateY(${-p * 1500}px)`

    setT(photo, keyframes(PHOTO, p))
    setT(devs, keyframes(DEVS, p))
    op(devs, clamp(V[0] + V[3]))
    op(heroRing, V[0])

    // act 1: viewfinder, flash, metadata rewrite
    op(vf, V[1])
    op(phFlash, Math.max(0, 1 - Math.abs(T[1] - 0.45) / 0.07) * V[1] * 0.85)
    const g = ss(0.15, 0.3, T[1]); op(vfguest, g); op(vfguesttxt, g)
    const st = ss(0.62, 0.9, T[1]); strike.setAttribute('x2', (196 + 248 * st).toFixed(1)); op(metanote, st)

    // act 2: the feed and the "AI?" stamp
    op(feed, V[2])
    rows.forEach((r, i) => {
      const k = ss(0.1 + i * 0.13, 0.2 + i * 0.13, T[2])
      op(r, k); r.setAttribute('transform', `translate(0 ${((1 - k) * 12).toFixed(1)})`)
    })
    reposts.textContent = '↻ ' + Math.round(ss(0.05, 0.9, T[2]) * 12400).toLocaleString('en-IN')
    const stamp = ss(0.36, 0.42, p) * (1 - ss(0.5, 0.55, p))
    op(phStamp, stamp); op(phDim, stamp * 0.45)

    // act 3: pipeline and the seal
    op(pipe, V[3]); op(witness, V[3] * ss(0.05, 0.2, T[3]))
    const prog = clamp((T[3] - 0.1) / 0.78)
    pline.setAttribute('stroke-dashoffset', (1 - prog).toFixed(4))
    packet.setAttribute('y', (85 + 440 * prog).toFixed(1))
    op(packet, prog > 0 && prog < 1 ? 1 : 0)
    timer.textContent = '+' + String(Math.round(prog * 58)).padStart(2, '0') + 's'
    nodes.forEach((n, i) => {
      const k = ss(0.1 + i * 0.15 - 0.04, 0.1 + i * 0.15, T[3])
      n.querySelector('.nc').setAttribute('fill-opacity', k.toFixed(3))
      op(n.querySelector('.nt'), 0.4 + 0.6 * k); op(n.querySelector('.ns'), 0.3 + 0.7 * k)
    })
    const seal = ss(0.62, 0.68, p); op(phSeal, seal); op(phChip, seal)

    // act 4: claim page, console, verified badge
    op(claimurl, V[4]); op(consoleG, V[4])
    const vb = ss(0.77, 0.82, p); op(phVer, vb)
    phVer.setAttribute('transform', `translate(148 -98) scale(${(0.6 + 0.4 * vb).toFixed(3)})`)
    const th = [0.14, 0.24, 0.32, 0.4, 0.58, 0.66, 0.74, 0.84]
    lns.forEach((l, i) => op(l, ss(th[i], th[i] + 0.05, T[4])))

    floats.forEach((f, i) => {
      const m = f._m
      f.style.transform = `translate(${(m[0] * p * 180 + Math.sin(p * 9 + i) * 14).toFixed(1)}px,${(m[1] * p * 150 + Math.cos(p * 7 + i) * 14).toFixed(1)}px)`
    })
    op(dock, V[5])
  }

  // horizontal benefits scrub
  const hs = $('#benefits'), hrow = $('#hrow'), hbar = $('#hbar')
  const hRender = (t) => {
    const max = Math.max(0, hrow.scrollWidth - window.innerWidth)
    hrow.style.transform = `translate3d(${(-t * max).toFixed(1)}px,0,0)`
    hbar.style.transform = `scaleX(${t.toFixed(4)})`
  }

  // chapter highlighting
  const chLinks = $$('[data-ch]')
  const secs = { benefits: $('#benefits'), feasibility: $('#feasibility'), viability: $('#viability'), technical: $('#technical') }
  const topOf = (el) => el.getBoundingClientRect().top + window.scrollY
  let curCh = null
  const setCh = (id) => {
    if (id === curCh) return
    curCh = id
    chLinks.forEach((a) => a.classList.toggle('on', a.dataset.ch === id))
  }
  const activeChapter = (p) => {
    const y = window.scrollY + window.innerHeight * 0.4
    for (const id of ['technical', 'viability', 'feasibility', 'benefits']) if (y >= topOf(secs[id])) return id
    if (p >= 0.73) return 'impact'
    if (p >= 0.52) return 'solution'
    if (p >= 0.32) return 'problem'
    return ''
  }

  // jump links
  const goto = (t) => {
    let y
    if (t.startsWith('p:')) y = topOf(story) + parseFloat(t.slice(2)) * (story.offsetHeight - window.innerHeight)
    else y = topOf($(t))
    window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' })
  }
  const onClick = (e) => {
    const a = e.target.closest('[data-go]')
    if (a) { e.preventDefault(); goto(a.dataset.go); return }
    const n = e.target.closest('[data-nav]')
    if (n && onNav) { e.preventDefault(); onNav(n.getAttribute('href')) }
  }
  root.addEventListener('click', onClick)
  cleanups.push(() => root.removeEventListener('click', onClick))

  // reveals
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target) } }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' })
    $$('.rv, .path').forEach((el) => io.observe(el))
    cleanups.push(() => io.disconnect())
  } else $$('.rv, .path').forEach((el) => el.classList.add('in'))

  // parallax words + technical progress
  const pars = $$('[data-par]')
  const parallax = () => pars.forEach((el) => {
    const r = el.parentElement.getBoundingClientRect()
    if (r.bottom < -200 || r.top > window.innerHeight + 200) return
    el.style.transform = `translateY(${(((r.top + r.height / 2) - window.innerHeight / 2) * parseFloat(el.dataset.par)).toFixed(1)}px)`
  })
  const arch = $('#arch'), archbar = $('#archbar'), bar = $('#bar')
  const archRender = () => {
    const r = arch.getBoundingClientRect()
    archbar.style.transform = `scaleX(${clamp((window.innerHeight * 0.85 - r.top) / (r.height + window.innerHeight * 0.3)).toFixed(3)})`
  }

  let ps = 0, hp = 0, lastP = -1, lastH = -1
  function frame() {
    const r = story.getBoundingClientRect(), total = Math.max(1, story.offsetHeight - window.innerHeight)
    const target = clamp(-r.top / total)
    ps = reduce ? target : ps + (target - ps) * 0.13
    if (Math.abs(target - ps) < 0.0004) ps = target
    if (Math.abs(ps - lastP) > 1e-5) { render(ps); lastP = ps }
    const hr = hs.getBoundingClientRect(), ht = clamp(-hr.top / Math.max(1, hs.offsetHeight - window.innerHeight))
    hp = reduce ? ht : hp + (ht - hp) * 0.14
    if (Math.abs(ht - hp) < 0.0004) hp = ht
    if (Math.abs(hp - lastH) > 1e-5) { hRender(hp); lastH = hp }
    setCh(activeChapter(target))
    const doc = document.documentElement
    bar.style.transform = `scaleX(${clamp(window.scrollY / Math.max(1, doc.scrollHeight - window.innerHeight)).toFixed(4)})`
    parallax(); archRender()
    raf = requestAnimationFrame(frame)
  }
  render(0); hRender(0)
  raf = requestAnimationFrame(frame)
  const onResize = () => { lastP = -1; lastH = -1 }
  window.addEventListener('resize', onResize)
  cleanups.push(() => window.removeEventListener('resize', onResize))

  return () => { cancelAnimationFrame(raf); cleanups.forEach((fn) => fn()) }
}
