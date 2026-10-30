import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Sprite, { Hill } from './Sprite'
import useReveal from './useReveal'
import WaitlistForm from './WaitlistForm'
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
  const scrollTo = (id) => (e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }) }
  const toDevices = scrollTo('devices')
  const toWaitlist = scrollTo('waitlist')
  // After the hero scrolls away the waitlist button slides in at the bottom right (hidden again at the form itself).
  const [dock, setDock] = useState(false)
  useEffect(() => {
    const hero = root.current?.querySelector('.hero'), form = document.getElementById('waitlist')
    if (!hero || !('IntersectionObserver' in window)) return undefined
    let pastHero = false, atForm = false
    const update = () => setDock(pastHero && !atForm)
    const o1 = new IntersectionObserver(([e]) => { pastHero = !e.isIntersecting && e.boundingClientRect.top < 0; update() })
    const o2 = new IntersectionObserver(([e]) => { atForm = e.isIntersecting; update() })
    o1.observe(hero); form && o2.observe(form)
    return () => { o1.disconnect(); o2.disconnect() }
  }, [])

  return (
    <div ref={root}>
      <a className={`btn btn-primary dock${dock ? ' on' : ''}`} href="#waitlist" onClick={toWaitlist} tabIndex={dock ? 0 : -1} aria-hidden={!dock}>Join the waitlist</a>
      <header className="nav">
        <div className="wrap">
          <Link className="brand" to="/" aria-label="Veris home"><Sprite name="camera" u={1.7} />VERIS</Link>
          <nav className="nav-links" aria-label="Main">
            <button type="button" className="nav-link" onClick={onStory}>How it works</button>
            <a className="nav-link" href="#devices" onClick={toDevices}>Use cases</a>
            <a className="nav-link" href={DOCS} target="_blank" rel="noopener noreferrer">Docs</a>
            <Link className="nav-link" to={OWNER_PORTAL}>Owner portal</Link>
            <a className="btn btn-primary" href="#waitlist" onClick={toWaitlist}>Join the waitlist</a>
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
          <span className="badge"><Sprite name="sparkle" u={1.5} />Early access waitlist is open</span>
          <h1>Proof, made at<br /><i>the</i> <em>shutter.</em></h1>
          <p>Veris clips onto the camera or phone you already own, and proves your photo is real the moment you take it.</p>
          <div className="hero-btns">
            <Link className="btn btn-primary" to={OWNER_PORTAL}>Owner portal →</Link>
            <Link className="btn btn-ghost" to={VERIFY_PHOTO}><Sprite name="scan" u={1.5} />Verify a photo</Link>
          </div>
        </div>
      </section>

      <section className="what" aria-labelledby="what-h">
        <div className="wrap">
          <h2 id="what-h" className="rv">What is Veris?</h2>
          <p className="what-lead rv">Veris is a small device that proves a photo is real. It signs the picture the instant you take it, so anyone can check it later and nobody can pass off an edit as the original.</p>
          <div className="whatrow">
            <div className="wcard rv"><Sprite name="meh" u={4} /><h3>The problem</h3><p>Photos are easy to fake and easy to edit. When a picture matters, such as news, an insurance claim or evidence, there is no good way to tell which ones are real.</p></div>
            <div className="wcard rv" style={{ '--d': '.1s' }}><Sprite name="lock" u={4} /><h3>What Veris does</h3><p>A chip in the device signs your photo at the moment of capture and files a permanent public record. Nothing about how you shoot changes.</p></div>
            <div className="wcard rv" style={{ '--d': '.2s' }}><Sprite name="check" u={4} /><h3>What you get</h3><p>A photo that carries its own proof. Anyone can drop it on the claim page and see that it matches the record, or that it does not.</p></div>
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

      <section className="cta" id="waitlist" aria-labelledby="cta-h">
        <div className="wrap">
          <div className="wlcard rv">
            <Sprite name="heart" u={5} />
            <h2 id="cta-h">Be first to carry proof.</h2>
            <p>Veris is a prototype and early access is limited. Tell us where you'd use it and we'll email you once when your spot opens.</p>
            <WaitlistForm variant="full" />
          </div>
        </div>
      </section>
    </div>
  )
}
