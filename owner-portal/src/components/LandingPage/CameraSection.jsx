import { useState } from 'react'
import Sprite from './Sprite'
import { PHOTOS } from './config'

const DEVICES = [
  {
    key: 'hotshoe', name: 'Hotshoe', icon: 'camera', art: 'dev-hotshoe', status: 'in design',
    alt: 'The Veris Hotshoe unit mounted on a Sony alpha camera',
    desc: "Slides into the hot shoe of any DSLR or mirrorless camera and fires off the shoe's centre X-sync pin. No cable, no menu.",
  },
  {
    key: 'clip', name: 'Clip-on', icon: 'phone', art: 'dev-clip', status: 'in design',
    alt: 'The Veris Clip-on unit on the back of a phone',
    desc: "Clips onto almost any phone and grips like a case. Powered by the phone's USB-C port, paired over Bluetooth LE. Its sensor shoots beside the phone camera.",
  },
  {
    key: 'standalone', name: 'Standalone', icon: 'chip', art: 'dev-standalone', status: 'operational',
    alt: 'The yellow Veris Standalone unit',
    desc: 'The reference unit. Runs the whole pipeline end to end today: capture, hardware signature, proof, record.',
  },
]

function DeviceCard({ device }) {
  const [flipped, setFlipped] = useState(false)
  const photo = PHOTOS[device.key]
  const touch = typeof window !== 'undefined' && window.matchMedia('(hover:none)').matches
  const flip = () => setFlipped((f) => !f)

  return (
    <div
      className={`card${flipped ? ' flip' : ''}`}
      tabIndex={0}
      role="button"
      aria-pressed={flipped}
      aria-label={`${device.name}, ${device.status}. Flip for details.`}
      onClick={touch ? flip : undefined}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip() } }}
    >
      <div className="card-in">
        <div className="face front">
          <span className={`tag${device.status === 'operational' ? ' op' : ''}`}>{device.status}</span>
          <div className="art">
            {photo
              ? <img src={photo} alt={device.alt} />
              : <Sprite name={device.art} ol="c" s={9} label={`Pixel illustration: ${device.alt}`} />}
          </div>
          <span className="pill"><Sprite name={device.icon} s={2} />{device.name}</span>
        </div>
        <div className="face back on-o">
          <Sprite name={device.icon} s={4} className="ic" style={{ alignSelf: 'flex-start' }} />
          <h3>{device.name}</h3>
          <p>{device.desc}</p>
        </div>
      </div>
    </div>
  )
}

export default function CameraSection() {
  return (
    <section className="dev vdark" id="use" aria-labelledby="veris-devices">
      <h2 id="veris-devices">Veris<em>devices</em></h2>
      <p className="lead">hover, tap or press enter to flip a card</p>
      <div className="cards">
        {DEVICES.map((d) => <DeviceCard key={d.key} device={d} />)}
      </div>
    </section>
  )
}
