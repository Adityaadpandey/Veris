import { useEffect, useState } from 'react';

import type { CompanionCaptureData } from '@/components/companion-capture-card';
import { CLAIM_SERVER_URL } from '@/constants/config';

/** Shape of GET /check-claim?claim_id= from the hosted claim server (see owner-portal's ClaimPage.jsx). */
export type ClaimData = {
  /** Only present from `/claims/by-wallet` — `/check-claim` callers already know the id they asked for. */
  claim_id?: string;
  status: 'pending' | 'open' | string;
  cid?: string | null;
  image_hash?: string | null;
  signature?: string | null;
  device_address?: string | null;
  camera_id?: string | null;
  device_id?: string | null;
  created_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_name?: string | null;
  tx_hash?: string | null;
  token_id?: string | number | null;
  recipient_address?: string | null;
  description?: string | null;
  tags?: string[] | null;
  ai_status?: string | null;
  likely_ai_generated?: boolean | null;
  ai_assessment?: string | null;
  companion_capture?: CompanionCaptureData | null;
};

export type ClaimState =
  | { phase: 'loading' }
  | { phase: 'not-found' }
  | { phase: 'ready'; claim: ClaimData };

const POLL_MS = 6000;

/** One-shot fetch of `/check-claim` — shared by `useClaim` (single claim) and `useClaimStates` (archive list). */
export async function fetchClaimOnce(claimId: string): Promise<ClaimState> {
  try {
    const res = await fetch(`${CLAIM_SERVER_URL}/check-claim?claim_id=${encodeURIComponent(claimId)}`);
    const data = await res.json();
    if (res.ok && data?.success) return { phase: 'ready', claim: data };
    return { phase: 'not-found' };
  } catch {
    return { phase: 'not-found' };
  }
}

/** Fetches (and polls, like the web claim page does) real claim data for a real Pi-sealed capture. */
export function useClaim(claimId: string | undefined): ClaimState {
  const [state, setState] = useState<ClaimState>({ phase: 'loading' });

  useEffect(() => {
    if (!claimId) return;
    // React tears this effect down (setting `cancelled`) before the next one runs when
    // `claimId` changes, so a plain closure flag is enough — no ref needed to detect staleness.
    let cancelled = false;

    const run = async () => {
      const result = await fetchClaimOnce(claimId);
      if (cancelled) return;
      // A transient network hiccup shouldn't flash "not found" over data we already have.
      setState((prev) => (result.phase === 'not-found' && prev.phase === 'ready' ? prev : result));
    };

    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset to loading the instant claimId changes, not after the first poll resolves
    setState({ phase: 'loading' });
    run();
    const interval = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [claimId]);

  return state;
}
