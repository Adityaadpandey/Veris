// Pixel sprite engine: ASCII / rect data -> tiny canvas with an automatic 1px outline.
export const PAL = {
  k: '#14110E', o: '#FF6A1A', O: '#C84A06', l: '#FFC49C', p: '#FFD9BD',
  c: '#FFF8EA', w: '#FFFFFF', g: '#EFE8D8', d: '#2B2520',
}

export function G(w, h) {
  const g = Array.from({ length: h }, () => Array(w).fill('.'))
  const o = {
    w, h, g,
    px(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = c; return o },
    rect(x, y, a, b, c) { for (let j = 0; j < b; j++) for (let i = 0; i < a; i++) o.px(x + i, y + j, c); return o },
    disc(cx, cy, r, c) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) g[y][x] = c
      return o
    },
    rows() { return g.map((r) => r.join('')) },
  }
  return o
}

const mirror = (half) => half.map((r) => r + r.split('').reverse().join(''))
const CAT_HALF = ['oo....', 'ooo...', 'oOoOoo', 'ookkoo', 'ookkoo', 'oooook', 'oooooo', 'oooooo', 'oooccc', 'oooccc', 'oooccc', 'ooocco']
const TAILS = [
  [[12, 11], [13, 10], [13, 9], [13, 8]],
  [[12, 11], [13, 11], [14, 10], [14, 9]],
  [[12, 11], [13, 11], [14, 11], [15, 10]],
  [[12, 11], [13, 11], [14, 10], [14, 9]],
]

export function catRows(blink, tail) {
  const rows = mirror(CAT_HALF).map((r) => r + '....')
  if (blink) rows[3] = rows[3].replace(/k/g, 'o')
  const g = rows.map((r) => r.split(''))
  TAILS[tail % 4].forEach((p, i, a) => { g[p[1]][p[0]] = i === a.length - 1 ? 'O' : 'o' })
  return g.map((r) => r.join(''))
}

const S = {
  camera: ['..oooo....cc....', 'oooooooooooooooo', 'ooooocccccoooooo', 'oooocckkkccooooo', 'oooockwkkkcooooo', 'oooocckkkccooooo', 'ooooocccccoooooo', 'oooooooooooooooo'],
  phone: ['kkkkkkkkkk', 'kppppppppk', 'kpoooooopk', 'kpoooooopk', 'kpoooooopk', 'kpooccoopk', 'kpooccoopk', 'kpoooooopk', 'kpoooooopk', 'kpoooooopk', 'kpoooooopk', 'kppppppppk', 'kkkkcckkkk', 'kkkkkkkkkk'],
  heart: ['.oo...oo.', 'opoo.oooo', 'ooooooooo', 'ooooooooo', '.ooooooo.', '..ooooo..', '...ooo...', '....o....'],
  sparkle: ['...o...', '...o...', '..ooo..', 'ooowooo', '..ooo..', '...o...', '...o...'],
  lock: ['...gggggg...', '..gg....gg..', '..g......g..', '..g......g..', 'oooooooooooo', 'oooooooooooo', 'ooooookkoooo', 'ooooookkoooo', 'oooooookoooo', 'oooooooooooo', 'oooooooooooo', 'OOOOOOOOOOOO'],
  plus: ['..x..', '..x..', 'xxxxx', '..x..', '..x..'],
  dotx: ['...x...', '.......', '...x...', 'x.x.x.x', '...x...', '.......', '...x...'],
  flag: ['kccccc', 'kcccccc', 'kccccc', 'kcc...', 'k.....', 'k.....', 'k.....', 'k.....', 'k.....', 'k.....'],
  person: ['..kkkk..', '.kkkkkk.', '.kppppk.', '.kppppk.', '..pppp..', '...pp...', '.OOccOO.', 'OOOcoOOO', 'OOOcoOOO', 'OOOOOOOO', 'OOOOOOOO', '.OO..OO.', '.OO..OO.', '.OO..OO.'],
}

S.chip = (() => {
  const g = G(14, 14); g.rect(2, 2, 10, 10, 'k')
  for (let i = 0; i < 5; i++) {
    const p = 3 + i * 2
    g.px(p, 0, 'g'); g.px(p, 1, 'g'); g.px(p, 12, 'g'); g.px(p, 13, 'g')
    g.px(0, p, 'g'); g.px(1, p, 'g'); g.px(12, p, 'g'); g.px(13, p, 'g')
  }
  g.rect(4, 4, 6, 6, 'o'); g.px(5, 5, 'p'); g.px(6, 5, 'p')
  return g.rows()
})()

S.check = (() => {
  const g = G(12, 12); g.rect(0, 0, 12, 12, 'o')
  ;[[2, 6], [3, 7], [4, 8], [5, 7], [6, 6], [7, 5], [8, 4], [9, 3]].forEach((p) => { g.px(p[0], p[1], 'c'); g.px(p[0], p[1] + 1, 'c') })
  g.rect(0, 10, 12, 2, 'O')
  return g.rows()
})()

S.scan = (() => {
  const g = G(14, 14); const L = 5
  g.rect(0, 0, L, 2, 'k').rect(0, 0, 2, L, 'k').rect(14 - L, 0, L, 2, 'k').rect(12, 0, 2, L, 'k')
    .rect(0, 12, L, 2, 'k').rect(0, 14 - L, 2, L, 'k').rect(14 - L, 12, L, 2, 'k').rect(12, 14 - L, 2, L, 'k').rect(6, 6, 2, 2, 'o')
  return g.rows()
})()

S.cloud = (() => {
  const g = G(26, 12)
  ;[[6, 7, 4], [12, 5, 5], [19, 7, 4], [10, 8, 4], [15, 8, 4]].forEach((c) => g.disc(c[0] + 1, c[1], c[2], 'w'))
  for (let y = 10; y < 12; y++) for (let x = 0; x < 26; x++) g.g[y][x] = '.'
  for (let x = 0; x < 26; x++) if (g.g[9][x] === 'w') g.g[9][x] = 'g'
  return g.rows()
})()

S.sun = (() => {
  const g = G(36, 36), cx = 17.5, cy = 17.5
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4
    for (let r = 13; r <= 17; r++) g.rect(Math.round(cx + Math.cos(a) * r) - 1, Math.round(cy + Math.sin(a) * r) - 1, 2, 2, 'o')
  }
  g.disc(cx, cy, 11, 'o'); g.disc(cx - 1.5, cy - 1.5, 8, 'l'); g.disc(cx - 2, cy - 2, 5, 'p')
  for (let y = 0; y < 36; y++) for (let x = 0; x < 36; x++) {
    const d = (x - cx) ** 2 + (y - cy) ** 2
    if (g.g[y][x] === 'o' && d > 80 && x + y > cx + cy && d <= 121) g.g[y][x] = 'O'
  }
  return g.rows()
})()

S.flower = (() => {
  const g = G(11, 16)
  g.rect(5, 8, 1, 8, 'k'); g.rect(6, 11, 3, 1, 'k'); g.rect(7, 10, 3, 2, 'o'); g.rect(2, 12, 3, 1, 'k'); g.rect(1, 11, 3, 2, 'o')
  ;[[5, 2], [2, 5], [8, 5], [5, 8], [3, 3], [7, 3]].forEach((p) => g.disc(p[0], p[1], 1.6, 'l'))
  g.disc(5, 5, 1.8, 'o'); g.px(4, 4, 'p')
  return g.rows()
})()

S.book = (() => {
  const g = G(17, 10)
  for (let y = 1; y < 8; y++) { g.rect(0, y, 7, 1, 'c'); g.rect(7, y, 3, 1, 'O'); g.rect(10, y, 7, 1, 'c') }
  g.rect(1, 0, 6, 1, 'c').rect(10, 0, 6, 1, 'c')
  ;[2, 4, 6].forEach((y) => g.rect(1, y, 5, 1, 'g').rect(11, y, 5, 1, 'g'))
  g.rect(0, 8, 17, 2, 'o')
  return g.rows()
})()

S['dev-clip'] = (() => {
  const g = G(36, 28)
  g.rect(14, 0, 22, 28, 'g'); g.rect(26, 1, 9, 10, 'd'); g.disc(29, 4, 2, 'k'); g.disc(29, 8, 2, 'k'); g.px(28, 3, 'c')
  g.rect(0, 8, 24, 5, 'o'); g.rect(0, 13, 24, 14, 'p'); g.rect(10, 9, 7, 3, 'c')
  ;[[3, 16], [6, 15], [9, 16], [3, 19], [6, 18], [9, 19], [5, 21], [8, 21]].forEach((p) => g.rect(p[0], p[1], 2, 2, 'k'))
  g.disc(19, 20, 3.6, 'g'); g.disc(19, 20, 2, 'k'); g.rect(0, 26, 24, 1, 'l')
  return g.rows()
})()

S['dev-hotshoe'] = (() => {
  const g = G(30, 36)
  g.rect(1, 15, 28, 11, 'd'); g.rect(22, 12, 7, 3, 'd'); g.rect(9, 12, 11, 3, 'd')
  g.disc(15, 23, 8, 'g'); g.disc(15, 23, 7, 'd'); g.disc(15, 23, 4, 'k'); g.px(13, 21, 'c'); g.px(12, 22, 'c'); g.rect(3, 13, 4, 2, 'g'); g.px(5, 15, 'o')
  g.rect(9, 2, 12, 8, 'p'); g.rect(9, 2, 12, 2, 'o')
  ;[[11, 6], [14, 6], [17, 6], [12, 8], [15, 8], [18, 8]].forEach((p) => g.px(p[0], p[1], 'k'))
  g.rect(12, 10, 6, 3, 'g'); g.rect(21, 6, 5, 1, 'k'); g.rect(25, 6, 1, 9, 'k')
  return g.rows()
})()

S['dev-standalone'] = (() => {
  const g = G(36, 28)
  g.rect(25, 3, 10, 22, 'd'); g.disc(30, 9, 2.6, 'k'); g.disc(30, 9, 3.4, 'g'); g.disc(30, 9, 2.2, 'k')
  g.rect(0, 10, 27, 17, 'l'); for (let y = 14; y < 26; y += 2) g.rect(10, y, 15, 1, 'o')
  g.rect(1, 12, 6, 14, 'd'); g.rect(2, 13, 4, 5, 'k'); g.px(3, 14, 'c'); g.px(4, 15, 'c')
  g.rect(2, 20, 2, 2, 'g').rect(5, 20, 2, 2, 'g').rect(2, 23, 2, 2, 'g').rect(5, 23, 2, 2, 'g')
  ;[[14, 9], [14, 8], [15, 7], [16, 6], [17, 5], [18, 5], [19, 5], [20, 6], [21, 7], [22, 8], [22, 9]].forEach((p) => g.px(p[0], p[1], 'k'))
  return g.rows()
})()

export function drawRows(cv, rows, opt = {}) {
  let w = 0
  rows.forEach((r) => { w = Math.max(w, r.length) })
  const h = rows.length
  const pad = opt.outline === false ? 0 : 1
  const fill = opt.fill ? PAL[opt.fill] || opt.fill : null
  cv.width = w + pad * 2
  cv.height = h + pad * 2
  const ctx = cv.getContext('2d')
  ctx.clearRect(0, 0, cv.width, cv.height)
  const at = (x, y) => (x < 0 || y < 0 || y >= h || x >= w ? '.' : rows[y][x] || '.')
  if (pad) {
    ctx.fillStyle = PAL[opt.outline] || PAL.k
    for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
      if (at(x, y) !== '.') continue
      if (at(x - 1, y) !== '.' || at(x + 1, y) !== '.' || at(x, y - 1) !== '.' || at(x, y + 1) !== '.') ctx.fillRect(x + 1, y + 1, 1, 1)
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = at(x, y)
    if (ch === '.') continue
    ctx.fillStyle = ch === 'x' && fill ? fill : PAL[ch] || '#f0f'
    ctx.fillRect(x + pad, y + pad, 1, 1)
  }
}

export function sprite(cv, name, opt) {
  const rows = S[name]
  if (rows) drawRows(cv, rows, opt)
}

// Options for a sprite by name: plus / dotx are drawn without an outline.
export function spriteOpts(name, ol, fill) {
  return { outline: ol === 'none' || name === 'plus' || name === 'dotx' ? false : ol || 'k', fill }
}

// Turns every <canvas data-sp="..."> under root into a sprite (used by the story markup).
export function hydrate(root) {
  root.querySelectorAll('canvas[data-sp]').forEach((cv) => {
    if (cv.dataset.done) return
    cv.dataset.done = 1
    sprite(cv, cv.dataset.sp, spriteOpts(cv.dataset.sp, cv.dataset.ol, cv.dataset.fill))
    if (cv.dataset.s) cv.style.width = cv.width * +cv.dataset.s + 'px'
  })
}

// Blinking, tail-swishing cat. Returns a stop() function.
export function animCat(cv, { scale, reduced } = {}) {
  let t = 0
  let blink = false
  const draw = () => {
    drawRows(cv, catRows(blink, t), {})
    if (scale) cv.style.width = cv.width * scale + 'px'
  }
  draw()
  if (reduced) return () => {}
  const swish = setInterval(() => { t++; draw() }, 260)
  let blinkTimer
  const scheduleBlink = () => {
    blinkTimer = setTimeout(() => {
      blink = true; draw()
      setTimeout(() => { blink = false; draw(); scheduleBlink() }, 160)
    }, 2600 + Math.random() * 1200)
  }
  scheduleBlink()
  return () => { clearInterval(swish); clearTimeout(blinkTimer) }
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
