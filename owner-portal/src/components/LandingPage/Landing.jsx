import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Sprite, { Hill } from './Sprite'
import useReveal from './useReveal'
import { DOCS, OWNER_PORTAL, VERIFY_PHOTO } from './links'

// Optional product photos (transparent PNG/WebP). Drop hotshoe.png, clipon.png and standalone.png
// into src/assets/devices/ and they replace the pixel placeholders below.
const photos = import.meta.glob('../../assets/devices/*.{png,webp}', { eager: true, import: 'default' })
const photoFor = (key) => Object.entries(photos).find(([p]) => p.split('/').pop().startsWith(key + '.'))?.[1]

const DEVICES = [
  {
    key: 'hotshoe', name: 'Hotshoe', icon: 'camera', placeholder: 'camera', u: 10, status: 'in design', alt: 'Veris Hotshoe on a Sony alpha camera',
    text: "Slides into the hot shoe of any DSLR or mirrorless camera and fires off the shoe's centre X-sync pin. No cable, no menu.",
  },
  {
    key: 'clipon', name: 'Clip-on', icon: 'phone', placeholder: 'phone', u: 9, status: 'in design', alt: 'Veris Clip-on on the back of a phone',
    text: "Clips onto almost any phone and grips like a case. Powered by the phone's USB-C port, paired over Bluetooth LE. Its sensor shoots beside the phone camera.",
  },
  {
    key: 'standalone', name: 'Standalone', icon: 'chip', placeholder: 'chip', u: 11, status: 'operational', alt: 'The Veris Standalone unit',
    text: 'The reference unit. Runs the whole pipeline end to end today: capture, hardware signature, proof, record.',
  },
]

// Scenery is placed by percentage so it holds at every desktop width. All static.
const SCENERY = [
  ['cloud', 5, 9, 44], ['cloud', 4, 86, 28],
  ['sparkle', 3, 18, 25], ['sparkle', 3.4, 81, 52], ['sparkle', 2.6, 93, 63],
  ['dotO', 4, 29, 17], ['dotO', 3.4, 89, 15], ['sparkleK', 2.4, 78, 24], ['dotK', 5, 5, 68],
]

function Device({ d }) {
  const [flipped, setFlipped] = useState(false)
  const photo = photoFor(d.key)
  const on = d.status === 'operational'
  return (
    <article
      className={`dev rv${flipped ? ' flipped' : ''}`}
      tabIndex={0}
      role="button"
      aria-pressed={flipped}
      aria-label={`${d.name}. Press to ${flipped ? 'hide' : 'read'} details.`}
      onClick={() => setFlipped(!flipped)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlipped(!flipped) } }}
    >
      <div className="flip">
        <div className="face front">
          <span className={`tag${on ? ' on' : ''}`}>{d.status}</span>
          <div className="art">
            {photo ? <img src={photo} alt={d.alt} loading="lazy" /> : <Sprite name={d.placeholder} u={d.u} role="img" aria-hidden="false" aria-label={d.alt} />}
          </div>
          <div className="pill"><Sprite name={d.icon} />{d.name}</div>
        </div>
        <div className="face back">
          <h3>{d.name}</h3>
          <p>{d.text}</p>
          <span className={`tag${on ? ' on' : ''}`}>{d.status}</span>
        </div>
      </div>
    </article>
  )
}

const Arrow = ({ b }) => (
  <svg className={`arrow${b ? ' b' : ''}`} viewBox="0 0 54 40" aria-hidden="true">
    <path d="M6 30 C14 8 32 6 46 22" /><path d="M38 22 L46 23 L45 14" />
  </svg>
)

export default function Landing({ onStory }) {
  const root = useRef(null)
  useReveal(root)
  const toDevices = (e) => { e.preventDefault(); document.getElementById('devices')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }) }

  return (
    <div ref={root}>
      <header className="nav">
        <div className="wrap">
          <Link className="brand" to="/" aria-label="Veris home"><Sprite name="camera" u={1.7} />VERIS</Link>
          <nav className="nav-links" aria-label="Main">
            <button type="button" className="nav-link" onClick={onStory}>How it works</button>
            <a className="nav-link" href="#devices" onClick={toDevices}>Use cases</a>
            <a className="nav-link" href={DOCS} target="_blank" rel="noopener noreferrer">Docs</a>
            <Link className="btn btn-ghost" to={OWNER_PORTAL}>Owner portal →</Link>
          </nav>
        </div>
      </header>

      <section className="hero" aria-label="Veris">
        <div className="scene" aria-hidden="true">
          {SCENERY.map(([n, u, x, y], i) => (
            <Sprite key={i} name={n} u={u} className="abs" style={{ left: `${x}%`, top: `${y}%` }} />
          ))}
          <div className="sunw"><Sprite name="sun" /></div>
          <Hill layer={0} />
          <Hill layer={1} />
          <Hill layer={2} />
        </div>
        <div className="hero-copy">
          <h1>Proof, made at<br /><i>the</i> <em>shutter.</em></h1>
          <p>Veris clips onto the camera or phone you already own, and proves your photo is real the moment you take it.</p>
          <div className="hero-btns">
            <Link className="btn btn-primary" to={OWNER_PORTAL}>Owner portal →</Link>
            <Link className="btn btn-ghost" to={VERIFY_PHOTO}><Sprite name="scan" u={1.5} />Verify a photo</Link>
          </div>
        </div>
      </section>

      <section className="devices" id="devices" aria-labelledby="devices-h">
        <div className="wrap">
          <h2 id="devices-h" className="rv">Veris<em>devices</em></h2>
          <div className="devs">
            {DEVICES.map((d) => <Device key={d.key} d={d} />)}
          </div>
        </div>
      </section>

      <section className="how" aria-labelledby="how-h">
        <div className="wrap">
          <h2 id="how-h" className="rv">Three steps. You only do the first.</h2>
          <div className="story-row rv">
            <button type="button" className="btn btn-ghost story-btn" onClick={onStory}><Sprite name="book" u={2} />The story behind Veris</button>
          </div>
          <div className="howrow">
            <div className="hstep rv"><Sprite name="camera" /><p className="hand">take the photo like always</p><span>Veris takes its own signed picture at the same instant.</span></div>
            <Arrow />
            <div className="hstep rv" style={{ '--d': '.1s' }}><Sprite name="lock" /><p className="hand">it seals itself</p><span>A chip signs it and a permanent public record is filed in under a minute.</span></div>
            <Arrow b />
            <div className="hstep rv" style={{ '--d': '.2s' }}><Sprite name="check" /><p className="hand">anyone can check it</p><span>Drop the photo on the claim page. It matches, or it does not.</span></div>
          </div>
        </div>
      </section>

      <section className="cta" aria-labelledby="cta-h">
        <div className="wrap">
          <Sprite name="heart" />
          <h2 id="cta-h" className="rv">A photo that carries its own proof.</h2>
          <div className="hero-btns rv">
            <Link className="btn btn-primary" to={OWNER_PORTAL}>Owner portal →</Link>
            <Link className="btn btn-ghost" to={VERIFY_PHOTO}><Sprite name="scan" u={1.5} />Verify a photo</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
