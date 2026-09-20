import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./LandingPage/landing.css";
import "./authenticity.css";
import Sprite from "./LandingPage/Sprite";
import { OWNER_PORTAL } from "./LandingPage/links";

const VERIFY_API_URL = import.meta.env.VITE_VERIFY_API_URL || "http://localhost:8000";

const SIGNAL_LABELS = {
  orb: "Geometric match (ORB)",
  ssim_edge: "Structural match (edges)",
  color_hist: "Color match",
  clip: "Semantic match (CLIP)",
  phash: "Perceptual hash",
  vision: "Forensic vision check",
};

const CELLS = 10;

function PhotoSlot({ title, hint, sprite, file, preview, onFile }) {
  const [dragging, setDragging] = useState(false);
  const id = useId();

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) onFile(f);
  }

  return (
    <div className="slot-wrap">
      <h2 className="slot-title" id={`${id}-t`}>{title}</h2>
      <label
        className={`slot${dragging ? " drag" : ""}${preview ? " filled" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          className="sr"
          type="file"
          accept="image/*"
          aria-labelledby={`${id}-t`}
          onChange={(e) => e.target.files[0] && onFile(e.target.files[0])}
        />
        {preview ? (
          <img src={preview} alt={`${title}: ${file?.name ?? "selected photo"}`} />
        ) : (
          <span className="empty">
            <Sprite name={sprite} u={7} />
            <span className="empty-main">Drop a photo here</span>
            <span className="empty-sub">or click to browse</span>
          </span>
        )}
        {preview && <span className="swap">Replace</span>}
      </label>
      <p className="slot-hint">{file ? file.name : hint}</p>
    </div>
  );
}

function SignalRow({ name, score }) {
  const pct = Math.round(score * 100);
  const on = Math.round(score * CELLS);
  const tone = pct >= 70 ? "hi" : pct >= 40 ? "mid" : "lo";
  return (
    <li className="sig">
      <span className="sig-name">{SIGNAL_LABELS[name] || name}</span>
      <span className={`cells ${tone}`} role="img" aria-label={`${pct} percent`}>
        {Array.from({ length: CELLS }, (_, i) => <i key={i} className={i < on ? "on" : ""} />)}
      </span>
      <span className="sig-pct">{pct}%</span>
    </li>
  );
}

function Verdict({ result }) {
  const ok = result.authentic;
  return (
    <section className={`verdict ${ok ? "ok" : "no"}`} aria-labelledby="verdict-h">
      <div className="verdict-top">
        <span className="verdict-icon"><Sprite name={ok ? "check" : "meh"} u={5} /></span>
        <div>
          <h2 id="verdict-h">{ok ? "Consistent with the source photo" : "Not verified"}</h2>
          <p>
            {ok
              ? "The candidate photo lines up with the hardware-verified capture."
              : "The candidate photo could not be confirmed against the hardware-verified capture."}
          </p>
        </div>
      </div>

      <dl className="stats">
        <div><dt>Score</dt><dd>{Math.round(result.score * 100)}%</dd></div>
        <div><dt>Confidence</dt><dd className="cap">{result.confidence}</dd></div>
        <div><dt>Needed to pass</dt><dd>{Math.round(result.threshold * 100)}%</dd></div>
      </dl>

      {result.rejected_by && (
        <p className="reject">
          Rejected by <b>{SIGNAL_LABELS[result.rejected_by] || result.rejected_by}</b>.
          {result.rejected_by === "vision_unavailable" &&
            " The forensic vision check couldn't run, so this photo could not be verified."}
        </p>
      )}

      <h3 className="sig-h">How each check scored</h3>
      <ul className="sigs">
        {Object.entries(result.signals).map(([name, score]) => (
          <SignalRow key={name} name={name} score={score} />
        ))}
      </ul>
    </section>
  );
}

export default function AuthenticityCheckPage() {
  const [companionFile, setCompanionFile] = useState(null);
  const [truthFile, setTruthFile] = useState(null);
  const [companionPreview, setCompanionPreview] = useState(null);
  const [truthPreview, setTruthPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const resultRef = useRef(null);

  // free object URLs when they're replaced or the page unmounts
  useEffect(() => () => { if (companionPreview) URL.revokeObjectURL(companionPreview); }, [companionPreview]);
  useEffect(() => () => { if (truthPreview) URL.revokeObjectURL(truthPreview); }, [truthPreview]);

  function pickCompanion(file) {
    setCompanionFile(file);
    setCompanionPreview(URL.createObjectURL(file));
    setResult(null);
    setError(null);
  }

  function pickTruth(file) {
    setTruthFile(file);
    setTruthPreview(URL.createObjectURL(file));
    setResult(null);
    setError(null);
  }

  async function handleCheck() {
    if (!companionFile || !truthFile) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("companion", companionFile);
      form.append("truth", truthFile);
      const res = await fetch(`${VERIFY_API_URL}/api/verify`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Verification failed");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  }, [result]);

  const ready = companionFile && truthFile && !loading;
  const missing = !companionFile && !truthFile ? "Add both photos to start" : !companionFile ? "Add the candidate photo" : !truthFile ? "Add the source of truth" : "";

  return (
    <div className="vl va">
      <header className="va-nav">
        <div className="wrap">
          <Link className="brand" to="/" aria-label="Veris home"><Sprite name="camera" u={1.7} />VERIS</Link>
          <Link className="btn btn-ghost" to={OWNER_PORTAL}>Owner portal →</Link>
        </div>
      </header>

      <main className="wrap va-main">
        <div className="va-head">
          <h1>Do these two photos match?</h1>
          <p>Add the photo you want to check and the hardware-verified original. Veris compares them six ways and tells you if they agree.</p>
        </div>

        <div className="board">
          <PhotoSlot
            title="Candidate photo"
            hint="The photo being checked, such as a claim submission."
            sprite="phone"
            file={companionFile}
            preview={companionPreview}
            onFile={pickCompanion}
          />
          <div className="vs" aria-hidden="true"><span>vs</span></div>
          <PhotoSlot
            title="Source of truth"
            hint="The hardware-verified capture to check against."
            sprite="chip"
            file={truthFile}
            preview={truthPreview}
            onFile={pickTruth}
          />
        </div>

        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={handleCheck} disabled={!ready}>
            <Sprite name="scan" u={1.5} />{loading ? "Checking…" : "Check the photos"}
          </button>
          {!ready && !loading && <p className="need">{missing}</p>}
        </div>

        <div className="out" ref={resultRef} aria-live="polite">
          {loading && (
            <div className="busy" role="status">
              <span className="cells run" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} style={{ "--i": i }} />)}</span>
              <p>Comparing the photos. This can take a few seconds.</p>
            </div>
          )}

          {error && (
            <div className="err" role="alert">
              <Sprite name="meh" u={3} />
              <div>
                <b>The check didn't finish</b>
                <p>{error}. Check your connection and try again.</p>
              </div>
            </div>
          )}

          {result && !loading && <Verdict result={result} />}
        </div>
      </main>

      <footer className="va-foot">
        <Link to="/dashboard">Back to dashboard</Link>
        <span>Veris is a prototype and runs on the Ethereum Sepolia testnet.</span>
      </footer>
    </div>
  );
}
