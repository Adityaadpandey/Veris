import bs58 from 'bs58';

/**
 * Validate a Solana address: base58 string that decodes to exactly 32 bytes.
 */
export function isValidSolanaAddress(addr) {
  if (typeof addr !== 'string' || addr.length < 32 || addr.length > 44) return false;
  try { return bs58.decode(addr).length === 32; } catch { return false; }
}
