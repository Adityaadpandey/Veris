import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "wagmi";
import { createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { sepolia } from "wagmi/chains";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import OwnerDashboard from "./components/OwnerDashboard";
import ClaimPage from "./components/ClaimPage";
import LandingPage from "./components/LandingPage";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID

const queryClient = new QueryClient()

const wagmiConfig = createConfig({
  chains: [sepolia],
  transports: { [sepolia.id]: http() },
})

function AppContent() {
  const { ready, authenticated } = usePrivy()
  if (!ready) return null
  if (authenticated) return <OwnerDashboard />
  return <LandingPage />
}

export default function App() {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["wallet", "email", "sms"],
        appearance: {
          theme: "dark",
          accentColor: "#E85002",
          logo: "https://auth.privy.io/logos/privy-logo-dark.png",
        },
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
        },
      }}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/dashboard" element={<OwnerDashboard />} />
              <Route path="/claim/:claimId" element={<ClaimPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </QueryClientProvider>
      </WagmiProvider>
    </PrivyProvider>
  )
}
