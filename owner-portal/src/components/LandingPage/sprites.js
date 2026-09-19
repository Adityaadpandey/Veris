// Pixel sprite engine. Every sprite is drawn on a tiny canvas (14 to 34 px), gets an
// automatic 1px ink outline, and is scaled up in CSS with image-rendering: pixelated.

const K = '#14110E', W = '#FFFFFF', O = '#FF6A1A', L = '#FFC49C', D = '#C84A06', G = '#D9CFBE', P = '#FFD9BD'
const PAL = { K, W, O, L, D, G, P }

const mk = (w, h) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
const ctx = (c) => {
  const x = c.getContext('2d')
  x.imageSmoothingEnabled = false
  return x
}
const R = (x, c, a, b, w, h) => { x.fillStyle = c; x.fillRect(a, b, w, h) }
const disc = (x, c, a, b, r) => {
  x.fillStyle = c
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + r * 0.7) x.fillRect(a + i, b + j, 1, 1)
}

function fromAscii(rows) {
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length
  const c = mk(w, h), x = ctx(c)
  rows.forEach((r, j) => {
    for (let i = 0; i < r.length; i++) if (r[i] !== '.') R(x, PAL[r[i]], i, j, 1, 1)
  })
  return c
}

// 1px ink outline around every opaque pixel (4-neighbour)
function outline(c) {
  const x = ctx(c), w = c.width, h = c.height
  const src = x.getImageData(0, 0, w, h), s = src.data, out = x.createImageData(w, h)
  out.data.set(s)
  const solid = (i, j) => i >= 0 && j >= 0 && i < w && j < h && s[(j * w + i) * 4 + 3] > 0
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!solid(i, j) && (solid(i - 1, j) || solid(i + 1, j) || solid(i, j - 1) || solid(i, j + 1))) {
        const p = (j * w + i) * 4
        out.data[p] = 20; out.data[p + 1] = 17; out.data[p + 2] = 14; out.data[p + 3] = 255
      }
    }
  }
  x.putImageData(out, 0, 0)
}

function draw(w, h, fn, ol = true) {
  const c = mk(w + 2, h + 2), x = ctx(c)
  x.translate(1, 1)
  fn(x)
  x.setTransform(1, 0, 0, 1, 0, 0)
  if (ol) outline(c)
  return c
}

const CAT = [
  '.KK..........KK.',
  'KOOK........KOOK',
  'KOOOKKKKKKKKOOOK',
  'KOOOOOOOOOOOOOOK',
  'KOOOOOOOOOOOOOOK',
  'KOOKWOOOOOOKWOOK',
  'KOOKKOOOOOOKKOOK',
  'KOOOOWWPPWWOOOOK',
  'KOOOOWKWWKWOOOOK',
  '.KOOOOOOOOOOOOK.',
  '..KKKKKKKKKKKK..',
  '..KOOOOWWOOOOK..',
  '..KOOOOWWOOOOK..',
  '..KOOOOWWOOOOK..',
  '..KOOOOWWOOOOK..',
  '..KWWWKKKKWWWK..',
  '..KKKKKKKKKKKK..',
]
const CAT_BLINK = CAT.slice()
CAT_BLINK[5] = 'KOOOOOOOOOOOOOOK'
const TAIL = ['.KK.', 'KOOK', 'KOOK', 'KOK.', 'KOK.', 'KOK.', 'KOOK', '.KK.']
const HEART = [
  '.KKK.KKK.',
  'KOOOKOOOK',
  'KOWOOOOOK',
  'KOOOOOOOK',
  '.KOOOOOK.',
  '..KOOOK..',
  '...KOK...',
  '....K....',
]
// m, e, w. 5 wide, with a flat top bar so the cat's feet rest on the letters.
const LET = {
  m: ['OOOOO', 'O.O.O', 'O.O.O', 'O.O.O', 'O.O.O'],
  e: ['OOOOO', 'O...O', 'OOOOO', 'O....', 'OOOOO'],
  w: ['O...O', 'O...O', 'O.O.O', 'O.O.O', '.O.O.'],
}

const plus = (col) => (c) => { R(c, col, 3, 0, 1, 7); R(c, col, 0, 3, 7, 1); R(c, col, 2, 2, 3, 3) }
const dots = (col) => (c) => [[2, 0], [0, 2], [2, 2], [4, 2], [2, 4]].forEach(([a, b]) => R(c, col, a, b, 1, 1))

export const SPRITES = {
  cat: () => fromAscii(CAT),
  catblink: () => fromAscii(CAT_BLINK),
  tail: () => fromAscii(TAIL),
  heart: () => fromAscii(HEART),
  happy: () => fromAscii([
    '...KKKKKK...', '..KOOOOOOK..', '.KOOOOOOOOK.', 'KOOKOOOOKOOK', 'KOOKOOOOKOOK', 'KOOOOOOOOOOK',
    'KOKOOOOOOKOK', 'KOOKKKKKKOOK', '.KOOOOOOOOK.', '..KOOOOOOK..', '...KKKKKK...',
  ]),
  shades: () => fromAscii([
    '...KKKKKK...', '..KOOOOOOK..', '.KOOOOOOOOK.', 'KKKKKKKKKKKK', 'KOKKKOOKKKOK', 'KOOOOOOOOOOK',
    'KOKOOOOOOKOK', 'KOOKKKKKKOOK', '.KOOOOOOOOK.', '..KOOOOOOK..', '...KKKKKK...',
  ]),
  meh: () => fromAscii([
    '...KKKKKK...', '..KOOOOOOK..', '.KOOOOOOOOK.', 'KOOKOOOOKOOK', 'KOOKOOOOKOOK', 'KOOOOOOOOOOK',
    'KOOOOOOOOOOK', 'KOOOKKKKOOOK', '.KOOOOOOOOK.', '..KOOOOOOK..', '...KKKKKK...',
  ]),
  sparkle: () => draw(7, 7, plus(O), false),
  sparkleK: () => draw(7, 7, plus(K), false),
  sparkleW: () => draw(7, 7, plus('#FFF8EA'), false),
  dotO: () => draw(5, 5, dots(O), false),
  dotK: () => draw(5, 5, dots(K), false),
  flower: () => draw(7, 10, (x) => {
    R(x, K, 3, 5, 1, 5); R(x, O, 3, 0, 1, 1); R(x, O, 1, 2, 1, 1); R(x, O, 5, 2, 1, 1); R(x, O, 3, 4, 1, 1)
    R(x, O, 2, 1, 3, 3); R(x, W, 3, 2, 1, 1)
  }, false),
  camera: () => draw(26, 20, (x) => {
    R(x, O, 10, 0, 6, 3); R(x, K, 13, 1, 2, 1)
    R(x, W, 8, 3, 10, 3); R(x, O, 19, 3, 3, 3)
    R(x, W, 2, 6, 22, 13); R(x, G, 2, 7, 22, 1); R(x, L, 20, 9, 4, 9)
    disc(x, G, 12, 12, 5); disc(x, K, 12, 12, 3); R(x, W, 10, 10, 1, 1); R(x, O, 13, 13, 1, 1)
  }),
  phone: () => draw(14, 26, (x) => {
    R(x, W, 1, 3, 12, 22); R(x, K, 3, 7, 8, 14)
    ;[[4, 14], [5, 15], [6, 16], [7, 15], [8, 14], [9, 13], [10, 12]].forEach(([a, b]) => R(x, O, a, b, 1, 1))
    R(x, O, 0, 0, 14, 5); R(x, D, 4, 2, 6, 1)
  }),
  chip: () => draw(22, 22, (x) => {
    for (let i = 0; i < 4; i++) {
      const p = 6 + i * 3
      R(x, G, p, 0, 2, 4); R(x, G, p, 18, 2, 4); R(x, G, 0, p, 4, 2); R(x, G, 18, p, 4, 2)
    }
    R(x, K, 4, 4, 14, 14); R(x, O, 6, 6, 10, 10)
    ;[[7, 8], [14, 8], [8, 9], [13, 9], [9, 10], [12, 10], [10, 11], [11, 11], [10, 12], [11, 12]].forEach(([a, b]) => R(x, K, a, b, 1, 1))
  }),
  lock: () => draw(14, 16, (x) => {
    R(x, G, 3, 1, 2, 6); R(x, G, 9, 1, 2, 6); R(x, G, 3, 1, 8, 2); R(x, O, 1, 7, 12, 8); R(x, K, 6, 10, 2, 3)
  }),
  check: () => draw(18, 18, (x) => {
    disc(x, O, 9, 9, 8)
    ;[[5, 9], [6, 10], [7, 11], [5, 10], [6, 11], [7, 12], [8, 10], [9, 9], [10, 8], [11, 7], [12, 6], [8, 11], [9, 10], [10, 9], [11, 8], [12, 7]].forEach(([a, b]) => R(x, W, a, b, 1, 1))
  }),
  book: () => draw(14, 12, (x) => {
    R(x, W, 1, 1, 6, 10); R(x, W, 7, 1, 6, 10); R(x, O, 6, 0, 2, 12)
    R(x, G, 2, 3, 4, 1); R(x, G, 2, 5, 4, 1); R(x, G, 9, 3, 3, 1); R(x, G, 9, 5, 3, 1)
  }),
  scan: () => draw(12, 12, (x) => {
    ;[[0, 0], [8, 0], [0, 8], [8, 8]].forEach(([a, b]) => { R(x, K, a, b, 4, 1); R(x, K, a, b, 1, 4); if (a) R(x, K, a + 3, b, 1, 4); if (b) R(x, K, a, b + 3, 4, 1) })
    R(x, O, 2, 5, 8, 2)
  }, false),
  cloud: () => draw(32, 16, (x) => {
    disc(x, W, 8, 9, 5); disc(x, W, 16, 6, 6); disc(x, W, 24, 9, 5); R(x, W, 8, 9, 17, 5)
  }),
  sun: () => draw(30, 30, (x) => {
    disc(x, O, 15, 15, 12); disc(x, L, 10, 10, 3)
  }),
  // the "mew" wordmark: 5x5 letters at 3px per letter pixel, orange with the automatic ink outline
  mew: () => draw(57, 15, (x) => {
    ;[['m', 0], ['e', 21], ['w', 42]].forEach(([l, ox]) => LET[l].forEach((row, j) => {
      for (let i = 0; i < 5; i++) if (row[i] === 'O') R(x, O, ox + i * 3, j * 3, 3, 3)
    }))
  }),
}

export function paint(canvas, name, arg) {
  const src = SPRITES[name](arg)
  canvas.width = src.width
  canvas.height = src.height
  const x = canvas.getContext('2d')
  x.imageSmoothingEnabled = false
  x.clearRect(0, 0, canvas.width, canvas.height)
  x.drawImage(src, 0, 0)
  canvas.style.setProperty('--w', src.width)
}

export const spriteUrl = (name) => SPRITES[name]().toDataURL()

// ---- hills: three layered pixel hills, drawn once into a 250 x 32 canvas ----
// back = light peach, middle = orange (with a tiny flag), front = ink. The ink layer
// runs to the bottom edge so the next section reads as the hill carrying on downwards.
export const HILL_W = 250
export const HILL_H = 32
const crest = (base, a1, f1, p1, a2, f2, p2) => (X) => Math.round(base + a1 * Math.sin(X * f1 + p1) + a2 * Math.sin(X * f2 + p2))
export const CRESTS = [
  crest(10, 4.2, 0.028, 0.6, 1.8, 0.085, 2.1),
  crest(16, 3.6, 0.034, 3.4, 1.5, 0.1, 0.4),
  crest(23, 2.6, 0.04, 1.2, 1.1, 0.12, 4.0),
]

export function paintHills(canvas, layer) {
  canvas.width = HILL_W
  canvas.height = HILL_H
  const x = ctx(canvas)
  const fills = [P, O, K]
  let seed = 17 + layer * 31
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  for (let X = 0; X < HILL_W; X++) {
    const y = CRESTS[layer](X)
    R(x, fills[layer], X, y, 1, HILL_H - y)
    if (layer < 2) R(x, K, X, y, 1, 1)
    if (layer === 0 && (X + y) % 3 === 0) R(x, L, X, y + 1, 1, 1)
    if (layer === 1 && (X + y) % 2 === 0) R(x, D, X, y + 1, 1, 1)
  }
  if (layer === 2) {
    for (let k = 0; k < 22; k++) {
      const X = Math.floor(rnd() * (HILL_W - 3)) + 1, y = CRESTS[2](X)
      R(x, rnd() > 0.5 ? O : W, X, y + 2, 1, 1)
    }
  }
  if (layer === 1) {
    // tiny flag planted on the right hill
    const X = 216, y = CRESTS[1](X)
    R(x, K, X, y - 8, 1, 8)
    R(x, K, X + 1, y - 8, 5, 1); R(x, K, X + 1, y - 5, 5, 1); R(x, K, X + 5, y - 7, 1, 2)
    R(x, W, X + 1, y - 7, 4, 2)
    R(x, K, X - 1, y - 1, 3, 1)
  }
}
