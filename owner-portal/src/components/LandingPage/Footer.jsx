import { Link } from 'react-router-dom'
import Sprite, { PixelCat } from './Sprite'
import { OWNER_PORTAL, VERIFY_PHOTO } from './links'

// The only place the company name appears: a pixel wordmark with the cat sitting on top of it.
export default function Footer({ onStory }) {
  return (
    <footer className="foot">
      <div className="wrap">
        <p className="hand madeby">made by</p>
        <div className="stack" role="img" aria-label="mew, shown as a pixel wordmark with a pixel cat sitting on top">
          <PixelCat u={8} />
          <Sprite name="mew" u={8} className="wm" />
        </div>
        <nav className="flinks" aria-label="Footer">
          <Link to={VERIFY_PHOTO}>Verify a photo</Link>
          <Link to={OWNER_PORTAL}>Owner portal</Link>
          <button type="button" onClick={onStory}>The story behind Veris</button>
        </nav>
        <p className="fine">Veris is a prototype and runs on the Ethereum Sepolia testnet.</p>
      </div>
    </footer>
  )
}
