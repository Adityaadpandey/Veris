"use client";

import "@rainbow-me/rainbowkit/styles.css";
import {
  getDefaultConfig,
  RainbowKitProvider,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import { http, createConfig, WagmiProvider } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

// Exported so Navbar can conditionally render ConnectButton without crashing
// when no wagmi context exists
export const WALLET_ENABLED = !!projectId;

// Full config with WalletConnect when projectId is available
const fullConfig = projectId
  ? getDefaultConfig({
      appName: "LensMint",
      projectId,
      chains: [baseSepolia],
      ssr: true,
    })
  : null;

// Minimal config (no wallet connectors) — keeps wagmi context alive so hooks
// like useReadContract don't crash when WALLETCONNECT_PROJECT_ID is not set
const minimalConfig = createConfig({
  chains: [baseSepolia],
  transports: { [baseSepolia.id]: http() },
  ssr: true,
});

const wagmiConfig = fullConfig ?? minimalConfig;
const queryClient = new QueryClient();

export function WalletProvider({ children }: { children: React.ReactNode }) {
  if (!projectId) {
    console.warn(
      "[WalletProvider] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set — wallet features disabled"
    );
  }

  if (fullConfig) {
    return (
      <WagmiProvider config={fullConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            theme={darkTheme({
              accentColor: "#ffffff",
              accentColorForeground: "#000000",
              borderRadius: "medium",
            })}
          >
            {children}
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    );
  }

  // Stub path: no WalletConnect, but WagmiProvider is still present so
  // useReadContract and useAccount don't throw during SSR/render
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
