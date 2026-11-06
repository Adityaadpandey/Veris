import { CHAINS } from "@/lib/chains";

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
// ngrok free serves an HTML warning page (no CORS headers) unless this header is sent.
// Scoped to the device service only, other hosts (claim server) don't allow it.
export const NGROK_HEADERS = { "ngrok-skip-browser-warning": "1" };
export const CLAIM_SERVER_URL = import.meta.env.VITE_CLAIM_SERVER_URL || "http://localhost:5001";
export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || "your-privy-app-id";
export const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || window.location.origin;

// The explorer for the chain a photo was minted on (the camera service reports it per image).
export const chainOfImg = (img) => CHAINS[img.chain] || CHAINS.sepolia;

// The backend stores "2026-10-30 18:21:11" (UTC, no zone), so tack on the T and Z before parsing.
const parseDate = (s) => {
  if (!s) return null;
  const d = new Date(s.includes("T") || s.endsWith("Z") ? s : s.replace(" ", "T") + "Z");
  return isNaN(d) ? null : d;
};

// Anything captured before this moment is hidden from the dashboard (fresh start after the
// wallet switch). The data is still in the backend, we just don't show it.
const HIDE_BEFORE = Date.parse("2026-10-29T19:00:00Z");
export const isFresh = (img) => {
  const d = parseDate(img.createdAt);
  return !d || d.getTime() >= HIDE_BEFORE;
};

export const fmtTime = (s) =>
  parseDate(s)?.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }) ?? "—";

// Older claims were uploaded under a previous Lighthouse API key, so they only resolve on that
// key's dedicated gateway, not the current one — public IPFS gateways never have these CIDs at all.
const IPFS_GATEWAYS = [
  import.meta.env.VITE_IPFS_GATEWAY ||
    "https://unemployed-tyrannosaurus-wprec.lighthouseweb3.xyz/ipfs",
  "https://structural-crocodile-le3p6.lighthouseweb3.xyz/ipfs",
  "https://flexible-toucan-z8dgh.lighthouseweb3.xyz/ipfs",
];
export const ipfsUrl = (cid) => (cid ? `${IPFS_GATEWAYS[0]}/${cid}` : null);
export const ipfsOnError = (cid) => (e) => {
  const next = IPFS_GATEWAYS.findIndex((g) => e.target.src.startsWith(g)) + 1;
  if (next < IPFS_GATEWAYS.length) e.target.src = `${IPFS_GATEWAYS[next]}/${cid}`;
  else e.target.style.display = "none";
};

// minted | minting | claim_failed | upload_failed (anything else falls through as the raw status)
export function imageState(img) {
  if (img.status === "minted") return "minted";
  if (img.status === "uploaded" && img.claimId && !img.tokenId) return "minting";
  if (img.status === "uploaded" && !img.claimId) return "claim_failed";
  if (img.status === "saved") return "upload_failed";
  return img.status;
}

export const STATE_LABEL = {
  minted: "Minted",
  minting: "Minting",
  claim_failed: "Claim failed",
  upload_failed: "Upload failed",
};

export const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "Not connected");
