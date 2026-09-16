import { useState, useRef } from "react";

const API_URL = import.meta.env.VITE_CLAIM_SERVER_URL || "http://localhost:5001";

const IPFS_GATEWAYS = [
  import.meta.env.VITE_IPFS_GATEWAY || 'https://flexible-toucan-z8dgh.lighthouseweb3.xyz/ipfs',
  'https://w3s.link/ipfs',
  'https://ipfs.io/ipfs',
  'https://dweb.link/ipfs',
]

function SimilarityBar({ score, visual, content }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: "#9ca3af" }}>Match</span>
        <span style={{ fontSize: 15, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ background: "#1f2937", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, background: color, height: "100%", borderRadius: 4, transition: "width 0.6s ease" }} />
      </div>
      {/* Transparent breakdown: the headline is a blend of these two signals. */}
      {(visual != null || content != null) && (
        <div style={{ display: "flex", gap: 12, marginTop: 5, fontSize: 10, color: "#6b7280" }}>
          {visual != null && (
            <span>Visual (look) <b style={{ color: "#9ca3af" }}>{Math.round(visual * 100)}%</b></span>
          )}
          {content != null && (
            <span>Content (subject) <b style={{ color: "#9ca3af" }}>{Math.round(content * 100)}%</b></span>
          )}
        </div>
      )}
    </div>
  );
}

const VERDICT_STYLES = {
  authentic_original: { bg: "#0a1f12", border: "#15803d", accent: "#22c55e", icon: "✅", title: "Authentic Original" },
  altered_copy:       { bg: "#241605", border: "#b45309", accent: "#f59e0b", icon: "⚠️", title: "Altered Copy — Not the Verified Original" },
  no_match:           { bg: "#151515", border: "#374151", accent: "#9ca3af", icon: "❔", title: "No Match On-Chain" },
}

function VerdictBanner({ verdict, aiHint }) {
  if (!verdict) return null
  const s = VERDICT_STYLES[verdict.type] || VERDICT_STYLES.no_match
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 14, padding: "18px 20px", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 22 }}>{s.icon}</span>
        <span style={{ fontSize: 17, fontWeight: 700, color: s.accent }}>{s.title}</span>
      </div>
      <p style={{ fontSize: 13, color: "#d1d5db", lineHeight: 1.55, margin: 0 }}>{verdict.message}</p>

      {(verdict.token_id || verdict.bit_distance != null) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12 }}>
          {verdict.token_id != null && (
            <span style={{ fontSize: 12, color: "#e5e7eb" }}>
              Matched token <b style={{ color: s.accent }}>#{verdict.token_id}</b>
            </span>
          )}
          {verdict.visual_match != null && (
            <span style={{ fontSize: 12, color: "#e5e7eb" }}>
              Visual match <b style={{ color: s.accent }}>{verdict.visual_match}%</b>
              <span style={{ color: "#6b7280" }}> ({verdict.bit_distance}/64 bits differ)</span>
            </span>
          )}
          {verdict.claim_url && verdict.claim_id && (
            <a href={`/claim/${verdict.claim_id}`} style={{ fontSize: 12, color: s.accent, textDecoration: "none" }}>
              View on-chain claim →
            </a>
          )}
        </div>
      )}

      {verdict.changes && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            What changed vs the original · non-authoritative
          </div>
          {verdict.changes.summary && (
            <div style={{ fontSize: 12, color: "#d1d5db", lineHeight: 1.5, marginBottom: 8 }}>
              {verdict.changes.summary}
            </div>
          )}
          {verdict.changes.items?.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {verdict.changes.items.map((c, i) => (
                <li key={i} style={{ fontSize: 12, color: "#fbbf24", lineHeight: 1.5, marginBottom: 2 }}>{c}</li>
              ))}
            </ul>
          ) : (
            <div style={{ fontSize: 12, color: "#9ca3af" }}>
              No visible content changes detected — the difference is likely re-saving or compression.
            </div>
          )}
          {verdict.changes.change_type && (
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 10, color: "#9ca3af", background: "#1f2937", border: "1px solid #374151", borderRadius: 999, padding: "2px 8px" }}>
                {verdict.changes.change_type.replace(/_/g, " ")}
              </span>
            </div>
          )}
        </div>
      )}

      {aiHint && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
            AI-generation hint · non-authoritative
          </div>
          <div style={{ fontSize: 12, color: aiHint.likely_ai_generated ? "#f59e0b" : "#9ca3af" }}>
            {aiHint.likely_ai_generated ? "⚠︎ May be AI-generated / manipulated" : "No obvious AI-generation artifacts"}
            {aiHint.note ? ` — ${aiHint.note}` : ""}
          </div>
        </div>
      )}
    </div>
  )
}

function ResultCard({ result }) {
  const shortWallet = result.recipient_address
    ? `${result.recipient_address.slice(0, 6)}...${result.recipient_address.slice(-4)}`
    : "Unclaimed";
  const mintDate = result.created_at
    ? new Date((result.created_at.includes("T") ? result.created_at : result.created_at.replace(" ", "T") + "Z")).toLocaleDateString()
    : "Unknown";
  const ipfsUrl = result.cid
    ? `${IPFS_GATEWAYS[0]}/${result.cid}`
    : null;

  return (
    <a
      href={result.claim_id ? `/claim/${result.claim_id}` : result.claim_url}
      style={{
        display: "block",
        textDecoration: "none",
        background: "#111827",
        border: "1px solid #374151",
        borderRadius: 12,
        padding: "16px 20px",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", gap: 14 }}>
        {ipfsUrl && (
          <img
            src={ipfsUrl}
            alt={result.description || "match"}
            style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: "1px solid #374151" }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <SimilarityBar score={result.similarity} visual={result.visual_similarity} content={result.content_similarity} />
          {result.description && (
            <p style={{ fontSize: 12, color: "#9ca3af", margin: "8px 0 0", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {result.description}
            </p>
          )}
        </div>
      </div>

      {result.tags?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {result.tags.slice(0, 8).map((tag, i) => (
            <span key={i} style={{ fontSize: 10, color: "#9ca3af", background: "#1f2937", border: "1px solid #374151", borderRadius: 999, padding: "2px 8px" }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 16px", marginTop: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Owner</div>
          <div style={{ fontSize: 12, color: "#e5e7eb", fontFamily: "monospace" }}>{shortWallet}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Token ID</div>
          <div style={{ fontSize: 12, color: "#e5e7eb" }}>{result.token_id ? `#${result.token_id}` : "—"}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Captured</div>
          <div style={{ fontSize: 12, color: "#e5e7eb" }}>{mintDate}</div>
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "#E85002" }}>
        View claim →
      </div>
    </a>
  );
}

export default function SearchPage() {
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [aiHint, setAiHint] = useState(null);
  const [queryDescription, setQueryDescription] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef();

  async function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }
    setPreview(URL.createObjectURL(file));
    setResults(null);
    setVerdict(null);
    setAiHint(null);
    setQueryDescription(null);
    setError(null);
    setLoading(true);

    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch(`${API_URL}/api/search`, { method: "POST", body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Search failed");
      setResults(data.similar || data.results || []);
      setVerdict(data.verdict || null);
      setAiHint(data.ai_hint || null);
      setQueryDescription(data.query_description || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      color: "#e5e7eb",
      fontFamily: "Inter, system-ui, sans-serif",
      padding: "40px 24px",
    }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            Verify &amp; Search
          </div>
          <div style={{ fontSize: 14, color: "#6b7280" }}>
            Upload a photo to check it against on-chain originals — is it authentic, altered, or unknown?
          </div>
        </div>

        {/* Drop zone */}
        <div
          onClick={() => inputRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{
            border: `2px dashed ${dragging ? "#E85002" : "#374151"}`,
            borderRadius: 16,
            padding: "32px 24px",
            textAlign: "center",
            cursor: "pointer",
            background: dragging ? "rgba(232,80,2,0.05)" : "#111827",
            transition: "all 0.2s",
            marginBottom: 24,
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={e => e.target.files[0] && handleFile(e.target.files[0])}
          />
          {preview ? (
            <img src={preview} alt="preview" style={{ maxHeight: 180, borderRadius: 8, marginBottom: 12 }} />
          ) : (
            <div style={{ fontSize: 40, marginBottom: 8 }}>🔍</div>
          )}
          <div style={{ fontSize: 14, color: "#9ca3af" }}>
            {preview ? "Click or drag to change image" : "Drag & drop or click to upload"}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "24px 0", color: "#9ca3af" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⚙️</div>
            Searching the blockchain...
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            background: "#1f0a0a",
            border: "1px solid #7f1d1d",
            borderRadius: 10,
            padding: "12px 16px",
            color: "#fca5a5",
            fontSize: 14,
            marginBottom: 16
          }}>
            {error}
          </div>
        )}

        {/* Results */}
        {results !== null && !loading && (
          <div>
            {/* Authoritative verdict first */}
            <VerdictBanner verdict={verdict} aiHint={aiHint} />

            {queryDescription && (
              <div style={{
                background: "rgba(232,80,2,0.05)",
                border: "1px solid rgba(232,80,2,0.2)",
                borderRadius: 10,
                padding: "12px 16px",
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 10, color: "#E85002", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, fontWeight: 600 }}>
                  We detected
                </div>
                <div style={{ fontSize: 13, color: "#d1d5db", lineHeight: 1.5 }}>{queryDescription}</div>
              </div>
            )}

            {/* Similar content — explicitly NOT an authenticity check */}
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, marginTop: 8 }}>
              Visually similar verified photos
            </div>
            <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 12 }}>
              Ranked by a blend of visual look (perceptual hash) and subject matter — for discovery, not an authenticity check.
            </div>
            {results.length === 0 ? (
              <div style={{ fontSize: 13, color: "#6b7280" }}>No visually similar verified photos found.</div>
            ) : (
              results.map((r, i) => <ResultCard key={i} result={r} />)
            )}
          </div>
        )}

        {/* Back link */}
        <div style={{ textAlign: "center", marginTop: 32 }}>
          <a href="/dashboard" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>
            Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
