import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "wagmi";
import { createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { sepolia } from "wagmi/chains";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import OwnerDashboard from "./components/OwnerDashboard";
import ClaimPage from "./components/ClaimPage";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || "your-privy-app-id";

const queryClient = new QueryClient();

const wagmiConfig = createConfig({
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(),
  },
});

function App() {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["wallet", "email", "sms"],
        appearance: {
          theme: "light",
          accentColor: "#667eea",
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
              <Route path="/claim/:claimId" element={<ClaimPage />} />
              <Route path="*" element={<OwnerDashboard />} />
            </Routes>
          </BrowserRouter>
        </QueryClientProvider>
      </WagmiProvider>
    </PrivyProvider>
  );
}

export default App;
