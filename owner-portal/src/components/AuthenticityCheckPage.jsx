import { useState, useRef } from "react";

const VERIFY_API_URL = import.meta.env.VITE_VERIFY_API_URL || "http://localhost:8000";

const SIGNAL_LABELS = {
  orb: "Geometric match (ORB)",
  ssim_edge: "Structural match (edges)",
  color_hist: "Color match",
  clip: "Semantic match (CLIP)",
  phash: "Perceptual hash",
  vision: "Forensic vision check",
};

function UploadSlot({ label, hint, file, preview, onFile, dragging, setDragging }) {
  const inputRef = useRef();

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8, fontWeight: 600 }}>{label}</div>
      <div
        onClick={() => inputRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${dragging ? "#E85002" : "#374151"}`,
          borderRadius: 14,
          padding: "20px 16px",
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? "rgba(232,80,2,0.05)" : "#111827",
          transition: "all 0.2s",
          minHeight: 160,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={e => e.target.files[0] && onFile(e.target.files[0])}
        />
        {preview ? (
          <img src={preview} alt={label} style={{ maxHeight: 110, maxWidth: "100%", borderRadius: 8, marginBottom: 10, objectFit: "cover" }} />
        ) : (
          <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
        )}
        <div style={{ fontSize: 13, color: "#9ca3af" }}>
          {file ? file.name : "Drag & drop or click to upload"}
        </div>
      </div>
      <div style={{ fontSize: 11, color: "#4b5563", marginTop: 6 }}>{hint}</div>
    </div>
  );
}

function SignalBar({ name, score }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? "#22c55e" : pct >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>{SIGNAL_LABELS[name] || name}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ background: "#1f2937", borderRadius: 4, height: 5, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, background: color, height: "100%", borderRadius: 4, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function VerdictBanner({ result }) {
  const authentic = result.authentic;
  const bg = authentic ? "#0a1f12" : "#241605";
  const border = authentic ? "#15803d" : "#b45309";
  const accent = authentic ? "#22c55e" : "#f59e0b";
  const icon = authentic ? "✅" : "⚠️";
  const title = authentic ? "Consistent With Source of Truth" : "Not Verified";

  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: "18px 20px", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <span style={{ fontSize: 17, fontWeight: 700, color: accent }}>{title}</span>
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: result.rejected_by ? 10 : 0 }}>
        <div>
          <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Score</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#e5e7eb" }}>{Math.round(result.score * 100)}%</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Confidence</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#e5e7eb", textTransform: "capitalize" }}>{result.confidence}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Threshold</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#e5e7eb" }}>{Math.round(result.threshold * 100)}%</div>
        </div>
      </div>
      {result.rejected_by && (
        <div style={{ fontSize: 13, color: "#fbbf24", marginTop: 4 }}>
          Rejected by <b>{SIGNAL_LABELS[result.rejected_by] || result.rejected_by}</b>
          {result.rejected_by === "vision_unavailable" && " — the forensic vision check couldn't run, so this could not be verified."}
        </div>
      )}
    </div>
  );
}

export default function AuthenticityCheckPage() {
  const [companionFile, setCompanionFile] = useState(null);
  const [truthFile, setTruthFile] = useState(null);
  const [companionPreview, setCompanionPreview] = useState(null);
  const [truthPreview, setTruthPreview] = useState(null);
  const [draggingCompanion, setDraggingCompanion] = useState(false);
  const [draggingTruth, setDraggingTruth] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

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

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      color: "#e5e7eb",
      fontFamily: "Inter, system-ui, sans-serif",
      padding: "40px 24px",
    }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            Authenticity Check
          </div>
          <div style={{ fontSize: 14, color: "#6b7280" }}>
            Upload a candidate photo and the hardware-verified source-of-truth photo to check whether they're genuinely consistent.
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
          <UploadSlot
            label="Candidate photo"
            hint="The photo being checked — e.g. a companion capture or claim submission."
            file={companionFile}
            preview={companionPreview}
            onFile={pickCompanion}
            dragging={draggingCompanion}
            setDragging={setDraggingCompanion}
          />
          <UploadSlot
            label="Source of truth"
            hint="The hardware-verified capture to check the candidate against."
            file={truthFile}
            preview={truthPreview}
            onFile={pickTruth}
            dragging={draggingTruth}
            setDragging={setDraggingTruth}
          />
        </div>

        <button
          onClick={handleCheck}
          disabled={!companionFile || !truthFile || loading}
          style={{
            width: "100%",
            padding: "14px 0",
            borderRadius: 12,
            border: "none",
            background: (!companionFile || !truthFile || loading) ? "#1f2937" : "#E85002",
            color: (!companionFile || !truthFile || loading) ? "#6b7280" : "#fff",
            fontSize: 15,
            fontWeight: 700,
            cursor: (!companionFile || !truthFile || loading) ? "not-allowed" : "pointer",
            marginBottom: 24,
            transition: "background 0.2s",
          }}
        >
          {loading ? "Checking..." : "Check Consistency"}
        </button>

        {loading && (
          <div style={{ textAlign: "center", padding: "24px 0", color: "#9ca3af" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⚙️</div>
            Running the verification pipeline...
          </div>
        )}

        {error && (
          <div style={{
            background: "#1f0a0a",
            border: "1px solid #7f1d1d",
            borderRadius: 10,
            padding: "12px 16px",
            color: "#fca5a5",
            fontSize: 14,
            marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {result && !loading && (
          <div>
            <VerdictBanner result={result} />
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
              Signal breakdown
            </div>
            <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: 12, padding: "16px 20px" }}>
              {Object.entries(result.signals).map(([name, score]) => (
                <SignalBar key={name} name={name} score={score} />
              ))}
            </div>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 32 }}>
          <a href="/dashboard" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>
            Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
