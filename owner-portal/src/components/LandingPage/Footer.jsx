import { Link } from 'react-router-dom'
import { PixelCat } from './Sprite'
import mewLogo from '../../assets/mewlogo.png'
import { OWNER_PORTAL, VERIFY_PHOTO } from './links'

// The only place the company name appears: the mew logo with the cat sitting on top of it.
export default function Footer({ onStory }) {
  return (
    <footer className="foot">
      <div className="wrap">
        <p className="hand madeby">made by</p>
        <div className="stack">
          <PixelCat u={5} />
          <img className="wm" src={mewLogo} alt="mew" width="816" height="171" />
        </div>
        <nav className="flinks" aria-label="Footer">
          <a href="#waitlist" onClick={(e) => { e.preventDefault(); document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth' }) }}>Join the waitlist</a>
          <Link to={VERIFY_PHOTO}>Verify a photo</Link>
          <Link to={OWNER_PORTAL}>Owner portal</Link>
          <button type="button" onClick={onStory}>The story behind Veris</button>
        </nav>
        <p className="fine">Veris is a prototype and runs on the Ethereum Sepolia testnet.</p>
      </div>
    </footer>
  )
}
