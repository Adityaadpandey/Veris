import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Link } from "react-router-dom";
import Sprite from "../LandingPage/Sprite";
import { txUrl } from "@/lib/chains";
import { chainOfImg, fmtTime, imageState, ipfsOnError, ipfsUrl, PORTAL_URL, STATE_LABEL } from "./helpers";

// What a photo that isn't minted yet is doing, in plain words.
const PROGRESS = {
  minting: "Minting the NFT on-chain…",
  claim_failed: "Uploaded, but the claim link wasn't created. Retry to fix it.",
  upload_failed: "The upload to Filecoin failed. Retry to send it again.",
};

function useCopy(text) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return [copied, copy];
}

function QRModal({ url, onClose }) {
  const ref = useRef(null);
  const [copied, copy] = useCopy(url);
  useEffect(() => { ref.current.showModal(); }, []);
  // Drawn in the browser, so the claim link never goes to a QR service.
  const [qr, setQr] = useState("");
  useEffect(() => { QRCode.toDataURL(url, { width: 240, margin: 2 }).then(setQr); }, [url]);

  return (
    <dialog
      ref={ref}
      className="qr"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current.close()}
    >
      <h2>Claim QR code</h2>
      <img src={qr} alt="QR code for the claim link" width="240" height="240" />
      <p>{url}</p>
      <div className="row">
        <button type="button" className="btn btn-ghost" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
        <button type="button" className="btn btn-primary" onClick={() => ref.current.close()}>Done</button>
      </div>
    </dialog>
  );
}

/**
 * One photo. `featured` makes it the wide "latest shot" card at the top of the grid.
 * Minted photos get a claim link plus QR / copy / explorer; stuck ones get a retry instead.
 */
export default function PhotoCard({ img, featured, onRetry }) {
  const [showQR, setShowQR] = useState(false);
  const state = imageState(img);
  const claimPath = img.claimId ? `/claim/${img.claimId}` : null;
  const claimUrl = claimPath && `${PORTAL_URL}${claimPath}`;
  const [copied, copy] = useCopy(claimUrl);
  const src = ipfsUrl(img.filecoinCid);
  const minted = state === "minted";
  const chainLink = img.txHash ? txUrl(chainOfImg(img), img.txHash) : img.nftUrl;
  const tone = minted ? "ok" : state === "minting" ? "wait" : "bad";

  return (
    <article className={`card${featured ? " feat" : ""}`}>
      <div className="shot">
        {src ? (
          <img src={src} alt={`Photo #${img.id}`} loading="lazy" onError={ipfsOnError(img.filecoinCid)} />
        ) : (
          <Sprite name="camera" u={featured ? 5 : 3} />
        )}
        <span className={`tag ${tone}`}>{STATE_LABEL[state] || img.status}</span>
        {minted && img.ai_score != null && <span className="tag score">AI {img.ai_score}</span>}
      </div>

      <div className="body">
        <div className="meta">
          <b>#{img.id}</b>
          <span>{featured ? `Latest · ${fmtTime(img.createdAt)}` : fmtTime(img.createdAt)}</span>
        </div>
        {img.deviceId && <p className="dev">Camera {img.deviceId}</p>}
        {!minted && <p className={`state ${tone}`}>{PROGRESS[state] || img.status}</p>}

        <div className="acts">
          {minted && claimPath && <Link className="btn btn-primary" to={claimPath}>View claim</Link>}
          {minted && claimUrl && (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setShowQR(true)}>QR</button>
              <button type="button" className="btn btn-ghost" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
            </>
          )}
          {chainLink && (
            <a className="btn btn-ghost" href={chainLink} target="_blank" rel="noreferrer">
              {img.txHash ? chainOfImg(img).explorerName : "View NFT"} ↗
            </a>
          )}
          {!minted && <button type="button" className="btn btn-ghost" onClick={onRetry}>Retry</button>}
        </div>
      </div>

      {showQR && <QRModal url={claimUrl} onClose={() => setShowQR(false)} />}
    </article>
  );
}
