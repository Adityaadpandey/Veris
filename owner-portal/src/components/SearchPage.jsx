import { useState, useRef } from "react";

const API_URL = import.meta.env.VITE_CLAIM_SERVER_URL || "http://localhost:5001";

const IPFS_GATEWAYS = [
  import.meta.env.VITE_IPFS_GATEWAY || 'https://flexible-toucan-z8dgh.lighthouseweb3.xyz/ipfs',
  'https://w3s.link/ipfs',
  'https://ipfs.io/ipfs',
  'https://dweb.link/ipfs',
]

function SimilarityBar({ score }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: "#9ca3af" }}>Similarity</span>
        <span style={{ fontSize: 15, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ background: "#1f2937", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, background: color, height: "100%", borderRadius: 4, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
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
          <SimilarityBar score={result.similarity} />
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
    setQueryDescription(null);
    setError(null);
    setLoading(true);

    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch(`${API_URL}/api/search`, { method: "POST", body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Search failed");
      setResults(data.results);
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
            Find Image Owner
          </div>
          <div style={{ fontSize: 14, color: "#6b7280" }}>
            Upload any photo to find its verified owner on the blockchain
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
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
              {results.length === 0
                ? "No matching verified photos found (score < 60%)"
                : `${results.length} match${results.length > 1 ? "es" : ""} found`}
            </div>
            {results.map((r, i) => <ResultCard key={i} result={r} />)}
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
