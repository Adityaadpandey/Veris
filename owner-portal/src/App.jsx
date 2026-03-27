import { PrivyProvider, usePrivy } from '@privy-io/react-auth'
import { WagmiProvider } from 'wagmi'
import { createConfig, http } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { sepolia } from 'wagmi/chains'
import LandingPage from './components/LandingPage'
import OwnerDashboard from './components/OwnerDashboard'

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || 'your-privy-app-id'
const queryClient = new QueryClient()

const wagmiConfig = createConfig({
  chains: [sepolia],
  transports: { [sepolia.id]: http() },
})

function AppContent() {
  const { ready, authenticated } = usePrivy()

  if (!ready) {
    return (
      <div style={{
        height: '100vh',
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: '48px',
          fontWeight: 800,
          color: '#fff',
          letterSpacing: '16px',
          textIndent: '16px',
          opacity: 0.5,
        }}>
          VERIS
        </div>
      </div>
    )
  }

  if (authenticated) return <OwnerDashboard />

  return <LandingPage />
}

export default function App() {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['wallet', 'email', 'sms'],
        appearance: { theme: 'dark', accentColor: '#FF5500' },
        embeddedWallets: { createOnLogin: 'users-without-wallets' },
      }}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <AppContent />
        </QueryClientProvider>
      </WagmiProvider>
    </PrivyProvider>
  )
}
