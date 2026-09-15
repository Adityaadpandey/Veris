import HeroSection from "./LandingPage/HeroSection";
import CameraSection from "./LandingPage/CameraSection";
import HowItWorksSection from "./LandingPage/HowItWorksSection";
import AuthSection from "./LandingPage/AuthSection";
import Footer from "./LandingPage/Footer";

export default function LandingPage() {
  const scrollToAuth = () => {
    document
      .getElementById("auth-section")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div style={{ background: "#000", minHeight: "100vh" }}>
      <HeroSection onEnterPortal={scrollToAuth} />
      <CameraSection />
      <HowItWorksSection />
      <div id="auth-section">
        <AuthSection />
      </div>
      <Footer />
    </div>
  );
}
