import { usePrivy } from '@privy-io/react-auth'
import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Fingerprint, Link2, HardDrive, QrCode, ArrowRight } from 'lucide-react'

const EXAMPLE_CLAIM = import.meta.env.VITE_EXAMPLE_CLAIM_ID || ''

/* ── Veris logo mark — aperture ring with V ── */
function VerisLogoMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="12.5" stroke="#E85002" strokeWidth="1.5" />
      <path
        d="M8.5 10.5L14 17.5L19.5 10.5"
        stroke="#E85002"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Nav({ onDashboard }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-black/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <VerisLogoMark size={24} />
          <span className="font-display font-bold text-lg tracking-tight text-white">
            Veris
          </span>
        </div>
        <nav className="hidden md:flex items-center gap-8 text-sm text-text-secondary">
          <a href="#how" className="hover:text-white transition-colors">How it works</a>
          <a href="#why" className="hover:text-white transition-colors">Why Veris</a>
        </nav>
        <button
          onClick={onDashboard}
          className="h-9 px-5 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-light transition-colors"
        >
          Open Dashboard
        </button>
      </div>
    </header>
  )
}

function HeroSection({ onDashboard }) {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 pt-16 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-brand/5 blur-3xl" />
      </div>

      <div className="inline-flex items-center gap-2 border border-white/10 rounded-full px-4 py-1.5 text-xs text-text-secondary mb-8 backdrop-blur-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
        Hardware-signed photo provenance on Ethereum
      </div>

      <h1 className="font-display font-bold text-5xl md:text-7xl lg:text-8xl tracking-tight text-white leading-[0.95] max-w-4xl">
        Every pixel.<br />
        <span className="text-brand">Proven real.</span>
      </h1>

      <p className="mt-8 text-lg text-text-secondary max-w-xl leading-relaxed">
        Veris cameras cryptographically sign every photo at capture. The signature, hash, and provenance are stored on IPFS and verified on-chain — permanently.
      </p>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <button
          onClick={onDashboard}
          className="h-12 px-8 rounded-xl bg-brand text-white font-semibold text-sm hover:bg-brand-light transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand/20"
        >
          Open Dashboard
        </button>
        {EXAMPLE_CLAIM && (
          <a
            href={`/claim/${EXAMPLE_CLAIM}`}
            className="h-12 px-8 rounded-xl border border-white/10 text-white font-semibold text-sm hover:border-white/25 hover:bg-white/5 transition-all flex items-center gap-2"
          >
            View Example Claim
            <ArrowRight size={14} />
          </a>
        )}
      </div>

      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-text-muted text-xs">
        <div className="w-px h-12 bg-gradient-to-b from-transparent to-white/20" />
        scroll
      </div>
    </section>
  )
}

const FEATURES = [
  {
    icon: Fingerprint,
    title: 'Hardware Signed',
    body: 'Each camera has a unique private key burned into it. Every photo gets an ECDSA signature generated on-device at the moment of capture.'
  },
  {
    icon: Link2,
    title: 'On-Chain Provenance',
    body: 'The image hash and device signature are minted as an ERC-1155 NFT on Ethereum. Ownership is public, immutable, and verifiable by anyone.'
  },
  {
    icon: HardDrive,
    title: 'Permanent Storage',
    body: 'Photos and metadata are uploaded to IPFS via Lighthouse and pinned to Filecoin — decentralised, content-addressed, permanent.'
  },
  {
    icon: QrCode,
    title: 'Open Editions',
    body: 'Anyone who witnesses a moment can scan the QR code and claim their own verified edition NFT — no wallet required to start.'
  },
]

function FeaturesSection() {
  return (
    <section id="why" className="py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-16 max-w-xl">
          <p className="text-xs text-brand font-semibold uppercase tracking-widest mb-4">Why Veris</p>
          <h2 className="font-display font-bold text-4xl md:text-5xl text-white tracking-tight leading-tight">
            The only proof<br />that can't be faked.
          </h2>
        </div>
        <div className="grid md:grid-cols-2 gap-px bg-white/5 rounded-2xl overflow-hidden border border-white/5">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-black p-8 hover:bg-white/[0.02] transition-colors group">
              <div className="w-9 h-9 rounded-lg border border-white/10 flex items-center justify-center mb-5 group-hover:border-brand/40 group-hover:bg-brand/5 transition-all">
                <Icon size={16} className="text-brand" strokeWidth={1.5} />
              </div>
              <h3 className="font-display font-bold text-lg text-white mb-3">{title}</h3>
              <p className="text-text-secondary text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const STEPS = [
  { n: '01', title: 'Camera captures', body: 'The Veris camera takes a photo, computes a SHA-256 hash, and signs it with its hardware key.' },
  { n: '02', title: 'Uploaded to IPFS', body: 'The image and metadata are pinned to IPFS via Lighthouse — a permanent, content-addressed URL.' },
  { n: '03', title: 'Minted on Ethereum', body: 'An ERC-1155 NFT is minted to the owner\'s wallet with the image hash and signature stored on-chain.' },
  { n: '04', title: 'QR code displayed', body: 'The camera shows a QR code. Anyone present scans it to claim their own verified edition NFT.' },
]

function HowSection() {
  return (
    <section id="how" className="py-32 px-6 border-t border-white/5">
      <div className="max-w-6xl mx-auto">
        <div className="mb-16 max-w-xl">
          <p className="text-xs text-brand font-semibold uppercase tracking-widest mb-4">How it works</p>
          <h2 className="font-display font-bold text-4xl md:text-5xl text-white tracking-tight leading-tight">
            Capture to chain<br />in seconds.
          </h2>
        </div>
        <div className="relative">
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-gradient-to-b from-brand/40 via-brand/10 to-transparent hidden md:block" />
          <div className="space-y-0">
            {STEPS.map((s, i) => (
              <div key={s.n} className="flex gap-8 group">
                <div className="flex-shrink-0 w-10 h-10 rounded-full border border-brand/40 bg-black flex items-center justify-center text-brand text-xs font-bold font-mono relative z-10 group-hover:border-brand group-hover:bg-brand/10 transition-colors">
                  {s.n}
                </div>
                <div className={`pb-10 ${i < STEPS.length - 1 ? 'border-b border-white/5' : ''} flex-1 pt-1.5`}>
                  <h3 className="font-display font-bold text-white text-lg mb-2">{s.title}</h3>
                  <p className="text-text-secondary text-sm leading-relaxed max-w-lg">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function CTASection({ onDashboard }) {
  return (
    <section className="py-32 px-6 border-t border-white/5">
      <div className="max-w-6xl mx-auto">
        <div className="rounded-2xl border border-white/8 bg-gradient-to-br from-white/[0.03] to-transparent p-12 md:p-16 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-brand/5 to-transparent pointer-events-none" />
          <h2 className="font-display font-bold text-4xl md:text-5xl text-white tracking-tight mb-6 relative">
            Start proving<br />your photos.
          </h2>
          <p className="text-text-secondary mb-10 max-w-md mx-auto relative">
            Set up your Veris camera, deploy in minutes, and every photo becomes a verifiable, permanent record.
          </p>
          <button
            onClick={onDashboard}
            className="relative h-12 px-10 rounded-xl bg-brand text-white font-semibold hover:bg-brand-light transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand/25"
          >
            Open Dashboard
          </button>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/5 py-10 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <VerisLogoMark size={20} />
          <span className="font-display font-bold text-sm text-white">Veris</span>
        </div>
        <p className="text-text-muted text-xs">Hardware-signed photo provenance · Sepolia Testnet</p>
        <div className="flex gap-6 text-xs text-text-muted">
          <a
            href="https://sepolia.etherscan.io/address/0x35f5B3b5D6BF361169743cB13D66849C4C839c69"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white transition-colors"
          >
            Contract ↗
          </a>
        </div>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  const { login, authenticated } = usePrivy()
  const navigate = useNavigate()

  useEffect(() => {
    if (authenticated) navigate('/dashboard')
  }, [authenticated, navigate])

  const handleDashboard = () => {
    if (authenticated) {
      navigate('/dashboard')
    } else {
      login()
    }
  }

  return (
    <div className="min-h-screen bg-black">
      <Nav onDashboard={handleDashboard} />
      <HeroSection onDashboard={handleDashboard} />
      <FeaturesSection />
      <HowSection />
      <CTASection onDashboard={handleDashboard} />
      <Footer />
    </div>
  )
}
