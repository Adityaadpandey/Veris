import { Link, NavLink } from "react-router-dom";
import Sprite from "./LandingPage/Sprite";
import { OWNER_PORTAL, VERIFY_PHOTO } from "./LandingPage/links";

// Top bar shared by the public check pages (search + compare), so each one points at the other.
export default function SiteNav() {
  return (
    <header className="va-nav">
      <div className="wrap">
        <Link className="brand" to="/" aria-label="Veris home"><Sprite name="camera" u={1.7} />VERIS</Link>
        <nav className="nav-links" aria-label="Check a photo">
          <NavLink className="nav-link" to={VERIFY_PHOTO}>Verify</NavLink>
          <NavLink className="nav-link" to="/authenticity-check">Compare</NavLink>
          <Link className="btn btn-ghost" to={OWNER_PORTAL}>Owner portal →</Link>
        </nav>
      </div>
    </header>
  );
}
