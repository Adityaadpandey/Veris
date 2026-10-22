import Sprite from './Sprite'
import { VERIFY_URL } from './config'

const STEPS = [
  { n: 1, icon: 'camera', cap: 'Take the photo like always', body: 'Veris clips on and takes its own signed picture. You shoot exactly as before.' },
  { n: 2, icon: 'lock', cap: 'It seals itself', body: 'A chip signs the moment and files a permanent public record.' },
  { n: 3, icon: 'check', cap: 'Anyone can check it', body: "Drop the photo at veris.live/claim. It matches its record, or it doesn't." },
]

// Hand-drawn dotted arrows between the steps.
const ARROWS = [
  { path: 'M6 44 C 22 6, 56 4, 80 30', head: 'M80 30 L66 28 M80 30 L77 44' },
  { path: 'M6 14 C 24 54, 58 58, 80 28', head: 'M80 28 L67 32 M80 28 L78 14' },
]

function Arrow({ path, head }) {
  return (
    <svg className="arrow" viewBox="0 0 90 60" aria-hidden="true">
      <path d={path} fill="none" stroke="#14110E" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 7" />
      <path d={head} fill="none" stroke="#14110E" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export default function HowItWorksSection({ onOwner, onStory }) {
  return (
    <section className="how" id="how" aria-labelledby="veris-how">
      <h2 id="veris-how">Three steps. You only do the first.</h2>
      <button className="btn btn-o" type="button" onClick={() => onStory('intro')}>
        <Sprite name="book" s={2} />The story behind Veris
      </button>

      <div className="steps">
        {STEPS.map((s, i) => (
          <FragmentStep key={s.n} step={s} arrow={ARROWS[i]} />
        ))}
      </div>

      <div className="cta">
        <Sprite name="heart" s={6} />
        <h3>A photo that carries its own proof.</h3>
        <div className="btn-row">
          <button type="button" className="btn btn-o" onClick={onOwner}>Owner portal →</button>
          <a className="btn btn-w" href={VERIFY_URL} target="_blank" rel="noopener noreferrer">
            <Sprite name="scan" ol="none" s={2} />Verify a photo
          </a>
        </div>
      </div>
    </section>
  )
}

function FragmentStep({ step, arrow }) {
  return (
    <>
      <div className="step">
        <div className="ic"><Sprite name={step.icon} s={6} /></div>
        <span className="n">STEP {step.n}</span>
        <div className="cap">{step.cap}</div>
        <p>{step.body}</p>
      </div>
      {arrow && <Arrow {...arrow} />}
    </>
  )
}
