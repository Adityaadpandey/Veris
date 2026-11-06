import Sprite from "../LandingPage/Sprite";
import { VERIS_ADDRESS, DEVICE_REGISTRY_ADDRESS } from "@/lib/contracts";
import { CHAINS, addressUrl } from "@/lib/chains";
import { BACKEND_URL, shortAddr } from "./helpers";

const Row = ({ label, children }) => (
  <div className="row"><dt>{label}</dt><dd>{children}</dd></div>
);
const Tag = ({ ok, yes, no }) => <span className={`tag ${ok ? "ok" : "bad"}`}>{ok ? yes : no}</span>;
const Link = ({ href, children }) => (
  <a href={href} target="_blank" rel="noreferrer">{children} ↗</a>
);

export default function CameraTab({ status, user, walletAddress, onRefresh }) {
  if (!status) {
    return (
      <div className="empty-state">
        <Sprite name="cloud" u={6} />
        <h2>Can't reach the camera</h2>
        <p>
          Nothing answered at <code>{BACKEND_URL}</code>. Check that the Raspberry Pi and the ngrok tunnel are running.
        </p>
        <button type="button" className="btn btn-primary" onClick={onRefresh}>Try again</button>
      </div>
    );
  }

  const { device, filecoin, blockchain } = status;
  return (
    <div className="panels">
      <section className="panel">
        <h2>Camera</h2>
        <dl>
          <Row label="Service"><Tag ok={status.servicesInitialized} yes="Online" no="Offline" /></Row>
          {device && (
            <>
              <Row label="Device ID"><code>{device.deviceId || "—"}</code></Row>
              <Row label="Registered"><Tag ok={device.isRegistered} yes="Yes" no="Not yet" /></Row>
              <Row label="Address"><code>{shortAddr(device.address)}</code></Row>
            </>
          )}
          {filecoin && <Row label="Storage"><Tag ok={filecoin.connected} yes="Ready" no="Not set up" /></Row>}
          {blockchain !== undefined && <Row label="Chain"><Tag ok={blockchain} yes="Connected" no="Disconnected" /></Row>}
        </dl>
      </section>

      <section className="panel">
        <h2>Contracts</h2>
        <dl>
          <Row label="Photos · Sepolia"><Link href={addressUrl(CHAINS.sepolia, VERIS_ADDRESS)}>{shortAddr(VERIS_ADDRESS)}</Link></Row>
          <Row label="Photos · Arc"><Link href={addressUrl(CHAINS.arc, CHAINS.arc.veris)}>{shortAddr(CHAINS.arc.veris)}</Link></Row>
          <Row label="Device registry"><Link href={addressUrl(CHAINS.sepolia, DEVICE_REGISTRY_ADDRESS)}>{shortAddr(DEVICE_REGISTRY_ADDRESS)}</Link></Row>
        </dl>
      </section>

      <section className="panel">
        <h2>Account</h2>
        <dl>
          <Row label="User ID"><code>{user?.id ? `${user.id.slice(0, 18)}…` : "—"}</code></Row>
          <Row label="Wallet"><code>{shortAddr(walletAddress)}</code></Row>
          {walletAddress && (
            <Row label="Explorers">
              {Object.values(CHAINS).map((c) => (
                <Link key={c.key} href={addressUrl(c, walletAddress)}>{c.short}</Link>
              ))}
            </Row>
          )}
        </dl>
      </section>
    </div>
  );
}
