import { useEffect, useState } from 'react';

import { CLAIM_SERVER_URL } from '@/constants/config';
import type { ClaimData } from '@/hooks/use-claim';

const POLL_MS = 20000;

/**
 * Fallback discovery for the archive: every claim from a camera this phone already knows about
 * (learned from the camera_id on claims already in the archive), whether or not anyone's claimed it
 * with a wallet yet. useWalletClaims alone misses a claim until it's claimed, and the local
 * sealedClaims list alone misses a claim if this phone's Bluetooth session to the Pi wasn't still
 * connected when the upload finally finished (e.g. a slow retry after a network hiccup) — either gap
 * leaves a real, minted claim permanently invisible. Self-bootstrapping: needs at least one claim
 * from a camera to already be known before it can go find the rest from that same camera.
 */
export function useCameraClaims(cameraIds: string[]): ClaimData[] {
  const key = [...new Set(cameraIds.filter(Boolean))].sort().join(',');
  const [claims, setClaims] = useState<ClaimData[]>([]);

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear immediately when there's nothing to look up, not after the next poll
      setClaims([]);
      return;
    }
    let cancelled = false;

    const run = async () => {
      try {
        const results = await Promise.all(
          ids.map(async (id) => {
            const res = await fetch(`${CLAIM_SERVER_URL}/claims/by-camera/${encodeURIComponent(id)}`);
            const data = await res.json();
            return res.ok && data?.success && Array.isArray(data.claims) ? data.claims : [];
          })
        );
        if (cancelled) return;
        setClaims(results.flat());
      } catch {
        // Transient network hiccup — keep showing whatever we already have.
      }
    };

    run();
    const interval = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the deliberately-flattened, order-independent dependency; `cameraIds` itself is a fresh array every render
  }, [key]);

  return claims;
}
