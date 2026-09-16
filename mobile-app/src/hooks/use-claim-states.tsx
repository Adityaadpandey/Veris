import { useEffect, useState } from 'react';

import { fetchClaimOnce, type ClaimState } from '@/hooks/use-claim';

const POLL_MS = 8000;

/** Same live polling as `useClaim`, but for a whole list of claim ids at once — used by the archive grid. */
export function useClaimStates(claimIds: string[]): Record<string, ClaimState> {
  const [states, setStates] = useState<Record<string, ClaimState>>({});
  const idsKey = claimIds.join(',');

  useEffect(() => {
    if (!idsKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear immediately when the archive empties, not after the next poll
      setStates({});
      return;
    }
    let cancelled = false;

    const run = async () => {
      // idsKey (the effect's dep) and claimIds always describe the same list here, so reading
      // claimIds straight from the closure is safe without also depending on the array identity.
      const results = await Promise.all(claimIds.map(async (id) => [id, await fetchClaimOnce(id)] as const));
      if (cancelled) return;
      setStates((prev) => {
        const next: Record<string, ClaimState> = {};
        for (const [id, result] of results) {
          // Keep the last good read through a transient failure rather than flashing "not found".
          next[id] = result.phase === 'not-found' && prev[id]?.phase === 'ready' ? prev[id] : result;
        }
        return next;
      });
    };

    run();
    const interval = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- claimIds is represented by idsKey
  }, [idsKey]);

  return states;
}
