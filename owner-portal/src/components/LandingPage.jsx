import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import HeroSection from "./LandingPage/HeroSection";
import CameraSection from "./LandingPage/CameraSection";
import HowItWorksSection from "./LandingPage/HowItWorksSection";
import StorySection from "./LandingPage/StorySection";
import Footer from "./LandingPage/Footer";
import UseCasesModal from "./LandingPage/UseCasesModal";
import Loader from "./LandingPage/Loader";
import wipe from "./LandingPage/wipe";
import "./LandingPage/landing.css";

const SEEN_KEY = "veris-landing-seen";

function readSeen() {
  try { return sessionStorage.getItem(SEEN_KEY) === "1"; } catch { return false; }
}
function writeSeen() {
  try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* storage unavailable */ }
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(() => !readSeen());
  // story: null while closed, otherwise the act to open at ("intro", "benefits", ...)
  const [story, setStory] = useState(null);
  const [useCasesOpen, setUseCasesOpen] = useState(false);
  const closeUseCases = useCallback(() => setUseCasesOpen(false), []);

  // Owner portal: the dashboard has its own sign-in gate.
  const openPortal = useCallback(() => navigate("/dashboard"), [navigate]);

  useEffect(() => {
    document.documentElement.classList.toggle("vl-lock", loading);
    return () => document.documentElement.classList.remove("vl-lock");
  }, [loading]);

  const openStory = useCallback((act = "intro") => {
    wipe(() => {
      setStory(act);
      try { window.history.pushState({ story: 1 }, "", "#story"); } catch { /* ignore */ }
    });
  }, []);

  const closeStory = useCallback((fromPop) => {
    wipe(() => { setStory(null); window.scrollTo({ top: 0, behavior: "auto" }); });
    if (!fromPop) {
      try { if (window.history.state && window.history.state.story) window.history.back(); } catch { /* ignore */ }
    }
  }, []);

  // Browser back closes the story.
  useEffect(() => {
    if (story === null) return undefined;
    const onPop = () => closeStory(true);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [story, closeStory]);

  return (
    <div className="vl" style={{ minHeight: "100vh" }}>
      {loading && (
        <Loader onDone={() => { writeSeen(); setLoading(false); }} />
      )}

      {story === null ? (
        <div id="site">
          <main>
            <HeroSection onOwner={openPortal} onStory={openStory} onUseCases={() => setUseCasesOpen(true)} />
            <CameraSection />
            <HowItWorksSection onOwner={openPortal} onStory={openStory} />
          </main>
          <Footer onOwner={openPortal} onStory={openStory} />
        </div>
      ) : (
        <StorySection startAct={story} onBack={() => closeStory(false)} onOwner={openPortal} />
      )}
      {useCasesOpen && <UseCasesModal onClose={closeUseCases} />}
    </div>
  );
}
