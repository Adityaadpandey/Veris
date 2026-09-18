/** Pulls the trailing claim id off a hosted claim URL, e.g. `https://api.veris.live/claim/<id>` -> `<id>`. */
export function extractClaimId(claimUrl: string): string | null {
  const cleaned = claimUrl.split('?')[0].split('#')[0].replace(/\/+$/, '');
  const parts = cleaned.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? null;
}
