import { useEffect, useState } from 'react';

import { CLAIM_SERVER_URL } from '@/constants/config';
import type { ClaimData } from '@/hooks/use-claim';

const POLL_MS = 15000;

/**
 * Every claim the connected wallet actually owns on the server, regardless of whether this
 * specific device was the one that captured or claimed it. Without this, the archive only ever
 * shows `sealedClaims` cached in this device's local storage — a fresh install or a second phone
 * on the same wallet would see an empty archive even though the wallet has claimed plenty before.
 */
export function useWalletClaims(address: string): ClaimData[] {
  const [claims, setClaims] = useState<ClaimData[]>([]);

  useEffect(() => {
    if (!address) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear immediately on disconnect, not after the next poll
      setClaims([]);
      return;
    }
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch(`${CLAIM_SERVER_URL}/claims/by-wallet/${encodeURIComponent(address)}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data?.success && Array.isArray(data.claims)) setClaims(data.claims);
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
  }, [address]);

  return claims;
}
