import { useEffect, useRef } from 'react'
import { Cat } from './Sprite'
import { drawRows } from './sprites'
import { VERIFY_URL } from './config'

// 3x-thick pixel "mew" letters so the 1px outline reads clearly.
const GLYPHS = {
  m: ['xxxxx', 'x.x.x', 'x.x.x', 'x.x.x', 'x.x.x'],
  e: ['xxxxx', 'x...x', 'xxxxx', 'x....', 'xxxxx'],
  w: ['x...x', 'x...x', 'x.x.x', 'x.x.x', 'xxxxx'],
}
const big = (g) => g.flatMap((r) => { const o = r.split('').map((ch) => ch + ch + ch).join(''); return [o, o, o] })
const WORD_ROWS = (() => {
  const [m, e, w] = [big(GLYPHS.m), big(GLYPHS.e), big(GLYPHS.w)]
  return m.map((_, i) => m[i] + '...' + e[i] + '...' + w[i])
})()

export default function Footer({ onOwner, onStory }) {
  const wordRef = useRef(null)
  useEffect(() => { drawRows(wordRef.current, WORD_ROWS, { fill: 'o' }) }, [])

  return (
    <footer>
      <div className="by">made by</div>
      <div className="mew" role="img" aria-label="mew">
        <canvas ref={wordRef} className="sp word" aria-hidden="true" />
        <Cat className="kitty" />
      </div>
      <nav className="flinks" aria-label="Footer">
        <a href={VERIFY_URL} target="_blank" rel="noopener noreferrer">Verify a photo</a>
        <button type="button" onClick={onOwner}>Owner portal</button>
        <button type="button" onClick={() => onStory('intro')}>The story behind Veris</button>
      </nav>
      <p className="fine">Veris is a prototype and runs on the Ethereum Sepolia testnet.</p>
    </footer>
  )
}
