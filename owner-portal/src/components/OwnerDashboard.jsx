import { usePrivy } from "@privy-io/react-auth";
import { useState } from "react";
import { Link } from "react-router-dom";
import Sprite from "./LandingPage/Sprite";
import PhotoCard from "./dashboard/PhotoCard";
import CameraTab from "./dashboard/CameraTab";
import useDashboardData from "./dashboard/useDashboardData";
import { PRIVY_APP_ID, shortAddr } from "./dashboard/helpers";
import "./authenticity.css";
import "./dashboard.css";

// Shown to brand new owners so they can see what a sealed photo will look like.
const SAMPLES = [
  { id: "sample-1", status: "minted", createdAt: null, deviceId: "your-camera", ai_score: 2 },
  { id: "sample-2", status: "uploaded", createdAt: null, deviceId: "your-camera", claimId: "sample", ai_score: null },
];

const Shell = ({ children, right }) => (
  <div className="vl va vd">
    <header className="va-nav">
      <div className="wrap">
        <Link className="brand" to="/" aria-label="Veris home"><Sprite name="camera" u={1.7} />VERIS</Link>
        {right}
      </div>
    </header>
    {children}
  </div>
);

function LoginCard({ login }) {
  const unset = PRIVY_APP_ID === "your-privy-app-id";
  return (
    <Shell>
      <main className="wrap va-main">
        <div className="login">
          <Sprite name="lock" u={6} />
          <h1>Owner dashboard</h1>
          <p>Sign in to see your photos, share claim links and check on your camera.</p>
          {unset && <p className="notice bad">Set VITE_PRIVY_APP_ID in .env to enable sign-in.</p>}
          <button type="button" className="btn btn-primary" onClick={login} disabled={unset}>Connect wallet</button>
        </div>
      </main>
    </Shell>
  );
}

export default function OwnerDashboard() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const data = useDashboardData(authenticated);
  const [tab, setTab] = useState("photos");
  const [filter, setFilter] = useState("all");

  if (!ready) return <Shell><p className="boot">Loading…</p></Shell>;
  if (!authenticated) return <LoginCard login={login} />;

  const { stats, activeImages, retryableCount, deviceStatus } = data;
  const online = deviceStatus?.servicesInitialized;
  const FILTERS = [
    ["all", "All", stats.total],
    ["minted", "Minted", stats.minted],
    ["uploaded", "Processing", stats.processing],
    ["saved", "Failed", stats.failed],
  ];
  // Only the unfiltered view singles out the latest shot; a filtered view is just a flat list.
  const shown = filter === "all" ? activeImages : activeImages.filter((i) => i.status === filter);

  const right = (
    <div className="who">
      <button type="button" className={`cam ${online ? "on" : ""}`} onClick={() => setTab("camera")}>
        <i />{online ? "Camera online" : deviceStatus === null ? "Camera unreachable" : "Camera offline"}
      </button>
      <code>{shortAddr(data.walletAddress)}</code>
      <button type="button" className="btn btn-ghost" onClick={logout}>Sign out</button>
    </div>
  );

  return (
    <Shell right={right}>
      <main className="wrap va-main">
        <nav className="tabs" aria-label="Dashboard sections">
          {[["photos", "Photos"], ["camera", "Camera"]].map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? "page" : undefined}
              onClick={() => { setTab(id); if (id === "camera") data.fetchDeviceStatus(); }}
            >
              {label}
              {id === "photos" && retryableCount > 0 && <span className="tag bad">{retryableCount}</span>}
            </button>
          ))}
        </nav>

        {tab === "camera" ? (
          <>
            <div className="head">
              <div><h1>Your camera</h1><p>Hardware, storage and contract health.</p></div>
              <button type="button" className="btn btn-ghost" onClick={data.fetchDeviceStatus}>Refresh</button>
            </div>
            <CameraTab status={deviceStatus} user={user} walletAddress={data.walletAddress} onRefresh={data.fetchDeviceStatus} />
          </>
        ) : (
          <>
            <div className="head">
              <div><h1>Your photos</h1><p>Every shot your camera has sealed, newest first.</p></div>
              <div className="head-acts">
                <button type="button" className="btn btn-ghost" onClick={data.fetchImages} disabled={data.loading}>
                  {data.loading ? "Refreshing…" : "Refresh"}
                </button>
                {retryableCount > 0 && (
                  <button type="button" className="btn btn-primary" onClick={data.retryPending} disabled={data.retrying}>
                    {data.retrying ? "Retrying…" : `Retry ${retryableCount} stuck`}
                  </button>
                )}
              </div>
            </div>

            {data.backendOffline && (
              <p className="notice wait" role="status">
                The camera is offline, so these come from your wallet's claims instead. Some details may be missing until it is back.
              </p>
            )}
            {data.retryResult && (
              <p className={`notice ${data.retryResult.success ? "ok" : "bad"}`} role="status">
                {data.retryResult.success ? `Processed ${data.retryResult.processed} photo(s).` : `Retry failed: ${data.retryResult.error}`}
                <button type="button" onClick={data.clearRetryResult} aria-label="Dismiss">✕</button>
              </p>
            )}

            <div className="chips" role="group" aria-label="Filter photos">
              {FILTERS.map(([key, label, count]) => (
                <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
                  {label} <b>{count}</b>
                </button>
              ))}
            </div>

            {data.loading && !activeImages.length ? (
              <p className="boot">Loading your photos…</p>
            ) : !activeImages.length && !data.backendOffline ? (
              <>
                <div className="empty-state">
                  <h2>Your first photo goes here</h2>
                  <p>Take a photo with your Veris camera. Here is how two of them will look.</p>
                </div>
                <div className="grid">
                  {SAMPLES.map((img) => <PhotoCard key={img.id} img={img} sample />)}
                </div>
              </>
            ) : shown.length === 0 ? (
              <div className="empty-state">
                <Sprite name="camera" u={6} />
                <h2>{activeImages.length ? "Nothing in this filter" : "No photos yet"}</h2>
                <p>{activeImages.length ? "Pick another filter above." : "Nothing minted to this wallet yet."}</p>
              </div>
            ) : (
              <div className="grid">
                {shown.map((img, i) => (
                  <PhotoCard key={img.id} img={img} featured={filter === "all" && i === 0} onRetry={data.retryPending} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </Shell>
  );
}
