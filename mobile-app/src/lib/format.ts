/** Truncates a 0x… wallet address to `0x1234…abcd`, same shorthand owner-portal uses. Leaves short/invalid strings alone. */
export function shortAddress(address: string | null | undefined): string {
  if (!address) return '';
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
