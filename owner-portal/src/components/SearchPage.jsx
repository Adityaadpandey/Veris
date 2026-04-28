import { useState, useRef } from "react";

const API_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

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
  const shortWallet = result.wallet_address
    ? `${result.wallet_address.slice(0, 6)}...${result.wallet_address.slice(-4)}`
    : "Unknown";
  const mintDate = result.minted_at
    ? new Date(result.minted_at * 1000).toLocaleDateString()
    : "Unknown";
  const ipfsUrl = result.image_cid
    ? `${IPFS_GATEWAYS[0]}/${result.image_cid}`
    : null;

  return (
    <div style={{
      background: "#111827",
      border: "1px solid #374151",
      borderRadius: 12,
      padding: "16px 20px",
      marginBottom: 12,
    }}>
      <SimilarityBar score={result.similarity} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginTop: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Owner</div>
          <div style={{ fontSize: 13, color: "#e5e7eb", fontFamily: "monospace", display: "flex", alignItems: "center", gap: 6 }}>
            {shortWallet}
            <button
              onClick={() => navigator.clipboard.writeText(result.wallet_address)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 11 }}
              title="Copy address"
            >⎘</button>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Token ID</div>
          <div style={{ fontSize: 13, color: "#e5e7eb" }}>#{result.token_id}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Device</div>
          <div style={{ fontSize: 13, color: "#e5e7eb" }}>{result.device_id}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 }}>Minted</div>
          <div style={{ fontSize: 13, color: "#e5e7eb" }}>{mintDate}</div>
        </div>
      </div>
      {ipfsUrl && (
        <a
          href={ipfsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            marginTop: 12,
            fontSize: 12,
            color: "#E85002",
            textDecoration: "none",
            border: "1px solid #E85002",
            borderRadius: 6,
            padding: "4px 10px"
          }}
        >
          View on Filecoin
        </a>
      )}
    </div>
  );
}

export default function SearchPage() {
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef();

  async function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }
    setPreview(URL.createObjectURL(file));
    setResults(null);
    setError(null);
    setLoading(true);

    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch(`${API_URL}/api/search`, { method: "POST", body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Search failed");
      setResults(data.results);
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
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
              {results.length === 0
                ? "No matching images found on-chain (score < 60%)"
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
