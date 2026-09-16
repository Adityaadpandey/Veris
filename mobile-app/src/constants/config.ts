import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Where the web build of this app is hosted in production — used to build
 * shareable claim links from native share sheets, which have no
 * `window.location` to read. Point this at the real deployed domain once
 * one exists; until then shared links from a native build fall back to
 * this placeholder.
 */
const PRODUCTION_WEB_ORIGIN = "https://veris.live";

/** The origin a shared claim link should point at, best-known for the current runtime. */
function resolveWebOrigin(): string {
  if (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    window.location?.origin
  ) {
    return window.location.origin;
  }
  // In dev (Expo Go / dev client), reuse the Metro dev server's LAN address so a
  // link shared to a device on the same network actually opens the running app.
  const hostUri = Constants.expoConfig?.hostUri;
  if (__DEV__ && hostUri) return `http://${hostUri}`;
  return PRODUCTION_WEB_ORIGIN;
}

/** Public, shareable URL for a claim sheet — opens the same claim page in a browser, no wallet required. */
export function publicClaimUrl(index: number): string {
  return `${resolveWebOrigin()}/claim/${index}`;
}

/** Public, shareable URL for a real (Pi-sealed) claim — same owner-portal route (`/claim/:claimId`), backed by the hosted claim server instead of mock data. */
export function publicRealClaimUrl(claimId: string): string {
  return `${resolveWebOrigin()}/claim/${claimId}`;
}

/** The hosted claim server backing real (Pi-sealed) captures — same one owner-portal talks to. */
export const CLAIM_SERVER_URL = "https://api.veris.live";

/** Privy app id — same project hardware-web3-service already authenticates with server-side. */
export const PRIVY_APP_ID = "cm6qrmvfp00z8uyepxhokh2mc";

/** Privy client id for this native app (Settings → Clients in the Privy dashboard). */
export const PRIVY_CLIENT_ID =
  "client-WY5gHJ1GB6pZaCe6f3ghDY7JWtRYa8jg6x4CB4YGu6DvW";

/** WalletConnect (Reown Cloud) project id — lets the app open a real MetaMask session to link an external wallet. */
export const WALLETCONNECT_PROJECT_ID = "26f04dce1c97b0b9933ed58ab97e8dfa";

/** Chain the contracts are actually deployed on (see contracts/script/Deploy.s.sol) — Ethereum Sepolia, not Base. */
export const CHAIN_ID = 11155111;
export const CHAIN_LABEL = "SEPOLIA";
