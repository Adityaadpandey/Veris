import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { useWallets } from "@privy-io/react-auth";
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { VERIS_ADDRESS, VERIS_ABI, hasTokenData } from "@/lib/contracts";
import { CHAINS } from "@/lib/chains";
import { BACKEND_URL, NGROK_HEADERS, CLAIM_SERVER_URL, isFresh } from "./helpers";

const CLAIM_MAP_KEY = "veris_token_claim_map";

/**
 * Everything the dashboard needs: photos from the camera service, falling back to on-chain
 * tokens when the camera is offline, plus device status and the retry actions.
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
  const [resolvedClaimMap, setResolvedClaimMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CLAIM_MAP_KEY) || "{}");
    } catch {
      return {};
    }
  });

  // On-chain fallback: read totalTokens then batch-fetch metadata
  const { data: totalTokens } = useReadContract({
    address: VERIS_ADDRESS,
    abi: VERIS_ABI,
    functionName: "totalTokens",
    query: { enabled: backendOffline },
  });

  const tokenIds = totalTokens
    ? Array.from({ length: Number(totalTokens) }, (_, i) => i + 1)
    : [];

  const { data: onChainMeta, isLoading: onChainLoading } = useReadContracts({
    contracts: tokenIds.map((id) => ({
      address: VERIS_ADDRESS,
      abi: VERIS_ABI,
      functionName: "getTokenMetadata",
      args: [BigInt(id)],
    })),
    query: { enabled: backendOffline && tokenIds.length > 0 },
  });

  const onChainImages =
    backendOffline && onChainMeta
      ? onChainMeta
          .map((r, i) => ({ result: r.result, id: tokenIds[i] }))
          .filter(({ result }) => hasTokenData(result) && result.isOriginal)
          .map(({ result: m, id }) => ({
            id,
            status: "minted",
            filecoinCid: null, // CID is no longer on-chain; only the backend knows it
            createdAt: new Date(Number(m.timestamp) * 1000).toISOString(),
            claimId: resolvedClaimMap[id] || null,
            tokenId: id,
            txHash: null,
            ai_score: null,
            deviceId: null,
            imageHash: null,
            nftUrl: CHAINS.sepolia.nft({ veris: VERIS_ADDRESS }, id),
          }))
      : [];

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
        // Persist tokenId → claimId so on-chain fallback can still link to claim pages
        try {
          setResolvedClaimMap((prev) => {
            const next = { ...prev };
            imgs.forEach((img) => {
              if (img.tokenId && img.claimId) next[img.tokenId] = img.claimId;
            });
            localStorage.setItem(CLAIM_MAP_KEY, JSON.stringify(next));
            return next;
          });
        } catch {}
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

  // When offline and on-chain images are loaded, fetch any missing claimIds from the public server
  useEffect(() => {
    if (!backendOffline || !onChainImages.length) return;
    const missing = onChainImages.filter(
      (img) => img.tokenId && !resolvedClaimMap[img.tokenId],
    );
    if (!missing.length) return;
    Promise.allSettled(
      missing.map((img) =>
        axios
          .get(`${CLAIM_SERVER_URL}/claim/by-token/${img.tokenId}`, { timeout: 5000 })
          .then((r) =>
            r.data.success ? { tokenId: img.tokenId, claimId: r.data.claim_id } : null,
          )
          .catch(() => null),
      ),
    ).then((results) => {
      const additions = {};
      results.forEach((r) => {
        if (r.status === "fulfilled" && r.value)
          additions[r.value.tokenId] = r.value.claimId;
      });
      if (!Object.keys(additions).length) return;
      setResolvedClaimMap((prev) => {
        const next = { ...prev, ...additions };
        try {
          localStorage.setItem(CLAIM_MAP_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendOffline, onChainMeta]);

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

  const activeImages = (backendOffline ? onChainImages : images).filter(isFresh);

  return {
    walletAddress: address || wallets[0]?.address,
    activeImages,
    stats: {
      total: activeImages.length,
      minted: activeImages.filter((i) => i.status === "minted").length,
      processing: activeImages.filter((i) => i.status === "uploaded").length,
      failed: activeImages.filter((i) => i.status === "saved").length,
    },
    retryableCount: images.filter((i) => i.status !== "minted" && isFresh(i)).length,
    loading: loading || (backendOffline && onChainLoading),
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
