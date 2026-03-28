import HeroSection from './HeroSection'
import CameraSection from './CameraSection'
import HowItWorksSection from './HowItWorksSection'
import AuthSection from './AuthSection'
import Footer from './Footer'

export default function LandingPage() {
  const scrollToAuth = () => {
    document.getElementById('auth-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div style={{ background: '#000', minHeight: '100vh' }}>
      <HeroSection onEnterPortal={scrollToAuth} />
      <CameraSection />
      <HowItWorksSection />
      <div id="auth-section">
        <AuthSection />
      </div>
      <Footer />
    </div>
  )
}
