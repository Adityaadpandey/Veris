import { useAccount } from "wagmi";
import { useWallets } from "@privy-io/react-auth";
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { BACKEND_URL, NGROK_HEADERS, CLAIM_SERVER_URL, isFresh } from "./helpers";

// The camera whose shots we show (tagged "Demo") when they aren't minted to the signed-in wallet.
const DEMO_CAMERA_ID = import.meta.env.VITE_DEMO_CAMERA_ID || "7abaf46f54a7d55a";

// A claim-server row, reshaped like the camera service's image so PhotoCard can show either.
// `wallet` is whoever is signed in; a claim that isn't theirs is flagged as a demo.
const fromClaim = (wallet) => (c) => ({
  demo: c.recipient_address?.toLowerCase() !== wallet?.toLowerCase(),
  id: c.claim_id,
  status: c.token_id ? "minted" : "uploaded",
  filecoinCid: c.cid,
  createdAt: c.created_at,
  claimId: c.claim_id,
  tokenId: c.token_id,
  txHash: c.tx_hash,
  deviceId: c.device_id,
  imageHash: c.image_hash,
  ai_score: null,
});

/**
 * Everything the dashboard needs: photos from the camera service, falling back to the wallet's claims
 * on the claim server when the camera is offline, plus device status and the retry actions.
 */
export default function useDashboardData(authenticated) {
  const { wallets } = useWallets();
  const { address } = useAccount();

  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState(null);
  const [retryResult, setRetryResult] = useState(null);
  const [backendOffline, setBackendOffline] = useState(false);
  const [walletImages, setWalletImages] = useState([]);
  const walletAddress = address || wallets[0]?.address;

  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BACKEND_URL}/api/images/list`, {
        timeout: 6000,
        headers: NGROK_HEADERS,
      });
      if (res.data.success) {
        const imgs = res.data.images || [];
        setImages(imgs);
        setBackendOffline(false);
      }
    } catch (_) {
      setBackendOffline(true);
    }
    setLoading(false);
  }, []);

  const fetchDeviceStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/device/status`, {
        headers: NGROK_HEADERS,
        timeout: 6000,
      });
      setDeviceStatus(res.data);
    } catch (_) {
      setDeviceStatus(null);
    }
  }, []);

  useEffect(() => {
    if (authenticated) {
      fetchImages();
      fetchDeviceStatus();
    }
  }, [authenticated, fetchImages, fetchDeviceStatus]);

  // Camera offline: the claim server still knows the wallet's photos, plus the demo camera's.
  useEffect(() => {
    if (!backendOffline || !walletAddress) return;
    const get = (path) =>
      axios.get(`${CLAIM_SERVER_URL}${path}`, { timeout: 8000 }).then((r) => r.data.claims || []).catch(() => []);
    Promise.all([
      get(`/claims/by-wallet/${walletAddress}`),
      get(`/claims/by-camera/${DEMO_CAMERA_ID}`),
    ]).then(([mine, cam]) => {
      const seen = new Set();
      const rows = [...mine, ...cam].filter((c) => !seen.has(c.claim_id) && seen.add(c.claim_id));
      rows.sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
      setWalletImages(rows.map(fromClaim(walletAddress)));
    });
  }, [backendOffline, walletAddress]);

  // Auto-refresh every 8 s while any image is still being processed
  useEffect(() => {
    const hasPending = images.some(
      (i) => i.status === "uploaded" || i.status === "saved",
    );
    if (!authenticated || !hasPending) return;
    const id = setInterval(fetchImages, 8000);
    return () => clearInterval(id);
  }, [authenticated, images, fetchImages]);

  // The camera service retries every stuck photo at once, there is no per-photo endpoint.
  const retryPending = async () => {
    setRetrying(true);
    setRetryResult(null);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/retry-pending`, null, { headers: NGROK_HEADERS });
      setRetryResult(res.data);
      await fetchImages();
    } catch (e) {
      setRetryResult({ success: false, error: e.message });
    }
    setRetrying(false);
  };

  const activeImages = (backendOffline ? walletImages : images).filter(isFresh);

  return {
    walletAddress,
    activeImages,
    stats: {
      total: activeImages.length,
      minted: activeImages.filter((i) => i.status === "minted").length,
      processing: activeImages.filter((i) => i.status === "uploaded").length,
      failed: activeImages.filter((i) => i.status === "saved").length,
    },
    retryableCount: images.filter((i) => i.status !== "minted" && isFresh(i)).length,
    loading,
    backendOffline,
    deviceStatus,
    retrying,
    retryResult,
    clearRetryResult: () => setRetryResult(null),
    fetchImages,
    fetchDeviceStatus,
    retryPending,
  };
}
