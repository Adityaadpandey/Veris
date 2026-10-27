import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import OwnerDashboard from "./components/OwnerDashboard";
import ClaimPage from "./components/ClaimPage";
import LandingPage from "./components/LandingPage";
import SearchPage from "./components/SearchPage";
import { RPC_URL } from "./lib/veris";

import "@solana/wallet-adapter-react-ui/styles.css";

const queryClient = new QueryClient();

export default function App() {
  const endpoint = RPC_URL;
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/dashboard" element={<OwnerDashboard />} />
                <Route path="/claim/:claimId" element={<ClaimPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </QueryClientProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
