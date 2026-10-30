# Veris Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-screen immersive landing page for the Veris owner portal with React + Three.js, featuring a perspective grid hero, a 3D Raspberry Pi camera model, a "How It Works" section, and a liquid-glass auth gate — all without a navbar.

**Architecture:** The landing page is a single scrollable page composed of 4 full-screen sections. Three.js scenes run in dedicated canvas components using `@react-three/fiber`. The existing `OwnerDashboard` is untouched — `App.jsx` simply shows `LandingPage` when unauthenticated and `OwnerDashboard` when authenticated.

**Tech Stack:** React 18, Vite, Three.js, @react-three/fiber, @react-three/postprocessing, Space Grotesk + Space Mono (Google Fonts), existing Privy + Wagmi setup.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/styles/globals.css` | Create | Design tokens, glass mixin, font import, base reset |
| `src/components/LandingPage/LandingPage.jsx` | Create | Top-level page, composes all sections |
| `src/components/LandingPage/HeroSection.jsx` | Create | Hero content overlay (wordmark, tagline, CTAs, HUD) |
| `src/components/LandingPage/HeroCanvas.jsx` | Create | Three.js perspective grid scene |
| `src/components/LandingPage/CameraSection.jsx` | Create | Camera reveal section with 3D canvas + spec bar |
| `src/components/LandingPage/CameraCanvas.jsx` | Create | Three.js 3D Raspberry Pi camera model |
| `src/components/LandingPage/HowItWorksSection.jsx` | Create | 3-step protocol cards (liquid glass) |
| `src/components/LandingPage/AuthSection.jsx` | Create | Auth gate section with Privy login logic |
| `src/components/LandingPage/AuthCanvas.jsx` | Create | Three.js perspective grid (reused for auth bg) |
| `src/components/LandingPage/Footer.jsx` | Create | Simple 2-column footer |
| `src/App.jsx` | Modify | Show LandingPage when !authenticated, OwnerDashboard when authenticated |
| `src/main.jsx` | Modify | Import globals.css |

---

## Task 1: Install Dependencies + Globals CSS

**Files:**
- Modify: `package.json` (via npm install)
- Create: `src/styles/globals.css`
- Modify: `src/main.jsx`

- [ ] **Step 1: Install Three.js packages**

```bash
cd /home/umyaldixit/Desktop/Veris/owner-portal
npm install three @react-three/fiber @react-three/postprocessing --legacy-peer-deps
```

Expected: packages added to `node_modules`, no errors.

- [ ] **Step 2: Create `src/styles/globals.css`**

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');

*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --orange: #FF5500;
  --orange-dim: rgba(255, 85, 0, 0.5);
  --orange-ghost: rgba(255, 85, 0, 0.08);
  --orange-glow: rgba(255, 85, 0, 0.4);
  --black: #000000;
  --white: #FFFFFF;
  --white-70: rgba(255, 255, 255, 0.70);
  --white-40: rgba(255, 255, 255, 0.40);
  --white-15: rgba(255, 255, 255, 0.15);
  --font-sans: 'Space Grotesk', sans-serif;
  --font-mono: 'Space Mono', monospace;
}

html {
  scroll-behavior: smooth;
}

body {
  background: var(--black);
  color: var(--white);
  font-family: var(--font-sans);
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
}

/* ── Liquid Glass ── */
.glass {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.09) 0%,
    rgba(255, 255, 255, 0.04) 40%,
    rgba(255, 85, 0, 0.04) 70%,
    rgba(255, 255, 255, 0.06) 100%
  );
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-top-color: rgba(255, 255, 255, 0.18);
  border-left-color: rgba(255, 255, 255, 0.14);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    inset 0 -1px 0 rgba(0, 0, 0, 0.2),
    0 0 0 0.5px rgba(255, 255, 255, 0.05);
}

.glass-orange {
  background: linear-gradient(
    135deg,
    rgba(255, 85, 0, 0.14) 0%,
    rgba(255, 85, 0, 0.06) 50%,
    rgba(255, 120, 0, 0.08) 100%
  );
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  border: 1px solid rgba(255, 85, 0, 0.25);
  border-top-color: rgba(255, 120, 0, 0.35);
  box-shadow:
    0 8px 40px rgba(255, 85, 0, 0.12),
    inset 0 1px 0 rgba(255, 120, 0, 0.2),
    inset 0 -1px 0 rgba(0, 0, 0, 0.3);
}

@keyframes pulse-dot {
  0%, 100% { box-shadow: 0 0 6px var(--orange); }
  50% { box-shadow: 0 0 16px var(--orange), 0 0 32px rgba(255, 85, 0, 0.4); }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

@keyframes led-blink {
  0%, 90% { opacity: 1; }
  91%, 100% { opacity: 0.1; }
}

@keyframes fade-up {
  from { opacity: 0; transform: translateY(40px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 3: Update `src/main.jsx` to import globals**

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 4: Verify in browser**

Open http://localhost:3000 — page should be black background, no errors in console.

- [ ] **Step 5: Commit**

```bash
git add src/styles/globals.css src/main.jsx package.json package-lock.json
git commit -m "feat: install three.js deps and add global design tokens + glass CSS"
```

---

## Task 2: Hero Canvas (Three.js Perspective Grid)

**Files:**
- Create: `src/components/LandingPage/HeroCanvas.jsx`

- [ ] **Step 1: Create `src/components/LandingPage/HeroCanvas.jsx`**

```jsx
import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function PerspectiveGrid() {
  const meshRef = useRef()
  const materialRef = useRef()

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(80, 80, 40, 40)
    return geo
  }, [])

  const material = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color('#FF5500'),
      wireframe: true,
      transparent: true,
      opacity: 0.08,
    })
  }, [])

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      rotation={[-Math.PI / 2.5, 0, 0]}
      position={[0, -4, -10]}
    />
  )
}

function OrangeGlow() {
  return (
    <pointLight
      position={[0, -2, -5]}
      color="#FF5500"
      intensity={2}
      distance={30}
    />
  )
}

export default function HeroCanvas() {
  return (
    <Canvas
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
      camera={{ position: [0, 2, 8], fov: 60 }}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={['#000000']} />
      <fog attach="fog" args={['#000000', 10, 40]} />
      <ambientLight intensity={0.1} />
      <OrangeGlow />
      <PerspectiveGrid />
    </Canvas>
  )
}
```

- [ ] **Step 2: Quick smoke test — import in a temp file**

Create `src/components/LandingPage/index.js` (empty for now, just to avoid import errors later):

```js
export { default as HeroCanvas } from './HeroCanvas'
```

- [ ] **Step 3: Commit**

```bash
git add src/components/LandingPage/
git commit -m "feat: add HeroCanvas Three.js perspective grid"
```

---

## Task 3: Hero Section (Content Overlay)

**Files:**
- Create: `src/components/LandingPage/HeroSection.jsx`

- [ ] **Step 1: Create `src/components/LandingPage/HeroSection.jsx`**

```jsx
import HeroCanvas from './HeroCanvas'
import styles from './HeroSection.module.css'

export default function HeroSection({ onEnterPortal }) {
  return (
    <section className={styles.hero}>
      {/* Three.js background */}
      <HeroCanvas />

      {/* Overlays */}
      <div className={styles.radialGlow} />
      <div className={styles.vignette} />
      <div className={styles.topFade} />
      <div className={styles.bottomFade} />

      {/* HUD corners */}
      <div className={`${styles.hudCorner} ${styles.tl}`} />
      <div className={`${styles.hudCorner} ${styles.tr}`} />
      <div className={`${styles.hudCorner} ${styles.bl}`} />
      <div className={`${styles.hudCorner} ${styles.br}`} />

      {/* HUD status text */}
      <div className={`${styles.hudText} ${styles.hudTL}`}>
        VRS / CAM-01<br />
        SIGNAL ACTIVE<br />
        <span className={styles.blink}>█</span> AUTH: PRIVY
      </div>
      <div className={`${styles.hudText} ${styles.hudTR}`}>
        CHAIN: SEPOLIA<br />
        STATUS: ONLINE<br />
        NFT: READY
      </div>

      {/* Center content */}
      <div className={styles.content}>
        <div className={`${styles.badge} glass-orange`}>
          <span className={styles.badgeDot} />
          Decentralized Camera Protocol
        </div>

        <h1 className={styles.wordmark}>VERIS</h1>

        <p className={styles.tagline}>
          A physical camera that <strong>sees, mints, and proves.</strong><br />
          Every frame becomes an on-chain truth — permanent, tamper-proof, yours.
        </p>

        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={onEnterPortal}>
            Enter Owner Portal →
          </button>
          <button
            className={`${styles.btnGhost} glass`}
            onClick={() => document.getElementById('camera-section')?.scrollIntoView({ behavior: 'smooth' })}
          >
            See The Camera ↓
          </button>
        </div>

        <div className={styles.scrollCue}>
          <div className={styles.scrollLine} />
          <span>SCROLL</span>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create `src/components/LandingPage/HeroSection.module.css`**

```css
.hero {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.radialGlow {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 80% 60% at 50% 90%, rgba(255, 85, 0, 0.12) 0%, transparent 70%);
  pointer-events: none;
}

.vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 55%, transparent 25%, rgba(0, 0, 0, 0.88) 80%);
  pointer-events: none;
}

.topFade {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 35%;
  background: linear-gradient(180deg, #000 0%, transparent 100%);
  pointer-events: none;
}

.bottomFade {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 20%;
  background: linear-gradient(0deg, #000 0%, transparent 100%);
  pointer-events: none;
}

/* HUD Corners */
.hudCorner {
  position: absolute;
  width: 28px;
  height: 28px;
  border-color: rgba(255, 85, 0, 0.4);
  border-style: solid;
  border-width: 0;
  pointer-events: none;
}
.tl { top: 32px; left: 40px; border-top-width: 2px; border-left-width: 2px; }
.tr { top: 32px; right: 40px; border-top-width: 2px; border-right-width: 2px; }
.bl { bottom: 32px; left: 40px; border-bottom-width: 2px; border-left-width: 2px; }
.br { bottom: 32px; right: 40px; border-bottom-width: 2px; border-right-width: 2px; }

/* HUD text */
.hudText {
  position: absolute;
  font-family: var(--font-mono);
  font-size: 9px;
  color: rgba(255, 85, 0, 0.5);
  letter-spacing: 2px;
  line-height: 2.2;
  text-transform: uppercase;
  pointer-events: none;
}
.hudTL { top: 44px; left: 54px; }
.hudTR { top: 44px; right: 54px; text-align: right; }

.blink {
  animation: blink 1.2s step-end infinite;
}

/* Center content */
.content {
  position: relative;
  z-index: 2;
  text-align: center;
  max-width: 900px;
  padding: 0 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Badge */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 32px;
  padding: 8px 20px;
  border-radius: 100px;
  font-family: var(--font-mono);
  font-size: 9px;
  color: rgba(255, 120, 0, 0.9);
  letter-spacing: 3px;
  text-transform: uppercase;
}

.badgeDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--orange);
  box-shadow: 0 0 8px var(--orange);
  animation: pulse-dot 2s ease-in-out infinite;
  flex-shrink: 0;
}

/* Wordmark */
.wordmark {
  font-size: clamp(100px, 14vw, 180px);
  font-weight: 800;
  color: var(--white);
  letter-spacing: clamp(16px, 3vw, 40px);
  text-indent: clamp(16px, 3vw, 40px);
  line-height: 0.88;
  margin-bottom: 32px;
  text-shadow: 0 0 120px rgba(255, 85, 0, 0.1);
}

/* Tagline */
.tagline {
  font-size: clamp(17px, 2.2vw, 24px);
  font-weight: 400;
  color: rgba(255, 255, 255, 0.65);
  line-height: 1.6;
  margin-bottom: 52px;
  max-width: 540px;
}
.tagline strong {
  color: var(--white);
  font-weight: 700;
}

/* Actions */
.actions {
  display: flex;
  align-items: center;
  gap: 16px;
  justify-content: center;
  margin-bottom: 72px;
  flex-wrap: wrap;
}

.btnPrimary {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: var(--orange);
  color: #000;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
  padding: 18px 40px;
  border: none;
  cursor: pointer;
  border-radius: 4px;
  clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px));
  transition: all 0.25s;
  position: relative;
  overflow: hidden;
}
.btnPrimary::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.15), transparent);
  pointer-events: none;
}
.btnPrimary:hover {
  background: #ff6a1a;
  box-shadow: 0 0 40px rgba(255, 85, 0, 0.5);
}

.btnGhost {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: rgba(255, 255, 255, 0.65);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  padding: 17px 36px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.25s;
  border: none;
  background: none;
}
.btnGhost:hover { color: var(--white); }

/* Scroll cue */
.scrollCue {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.scrollCue span {
  font-family: var(--font-mono);
  font-size: 9px;
  color: rgba(255, 255, 255, 0.2);
  letter-spacing: 4px;
  text-transform: uppercase;
}
.scrollLine {
  width: 1px;
  height: 48px;
  background: linear-gradient(180deg, rgba(255, 85, 0, 0.7), transparent);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/LandingPage/
git commit -m "feat: add HeroSection with content overlay and CSS module"
```

---

## Task 4: Camera Canvas (3D Raspberry Pi Model)

**Files:**
- Create: `src/components/LandingPage/CameraCanvas.jsx`

- [ ] **Step 1: Create `src/components/LandingPage/CameraCanvas.jsx`**

```jsx
import { useRef, useEffect, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

function RaspberryPiBoard({ mouseX, mouseY }) {
  const groupRef = useRef()

  useFrame((state) => {
    if (!groupRef.current) return
    // Auto-rotate Y slowly
    groupRef.current.rotation.y += 0.004
    // Subtle mouse parallax (limited range)
    groupRef.current.rotation.x = THREE.MathUtils.lerp(
      groupRef.current.rotation.x,
      mouseY * 0.3,
      0.05
    )
  })

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* PCB Board — green-tinted flat box */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[4.2, 0.12, 2.8]} />
        <meshStandardMaterial
          color="#0d2010"
          roughness={0.6}
          metalness={0.3}
        />
      </mesh>

      {/* GPIO Header — row of pins */}
      <mesh position={[-1.4, 0.1, -1.0]}>
        <boxGeometry args={[1.2, 0.1, 0.18]} />
        <meshStandardMaterial color="#1a2e1a" roughness={0.8} />
      </mesh>
      {/* GPIO pin details */}
      {Array.from({ length: 10 }).map((_, i) => (
        <mesh key={i} position={[-1.85 + i * 0.24, 0.17, -1.0]}>
          <boxGeometry args={[0.05, 0.14, 0.05]} />
          <meshStandardMaterial color="#c8a040" metalness={0.9} roughness={0.2} />
        </mesh>
      ))}

      {/* Main SoC chip */}
      <mesh position={[-0.6, 0.1, 0.3]}>
        <boxGeometry args={[0.7, 0.08, 0.7]} />
        <meshStandardMaterial color="#111111" roughness={0.4} metalness={0.5} />
      </mesh>

      {/* RAM chip */}
      <mesh position={[0.2, 0.1, 0.3]}>
        <boxGeometry args={[0.55, 0.06, 0.4]} />
        <meshStandardMaterial color="#141414" roughness={0.4} metalness={0.5} />
      </mesh>

      {/* USB ports */}
      <mesh position={[1.7, 0.1, 0.5]}>
        <boxGeometry args={[0.55, 0.22, 0.22]} />
        <meshStandardMaterial color="#222222" roughness={0.7} />
      </mesh>
      <mesh position={[1.7, 0.1, 0.0]}>
        <boxGeometry args={[0.55, 0.22, 0.22]} />
        <meshStandardMaterial color="#222222" roughness={0.7} />
      </mesh>

      {/* Status LED — emissive green */}
      <mesh position={[1.6, 0.12, -0.9]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial
          color="#00ff44"
          emissive="#00ff44"
          emissiveIntensity={2}
        />
      </mesh>

      {/* Ribbon cable connector on board */}
      <mesh position={[0.9, 0.1, -1.1]}>
        <boxGeometry args={[0.5, 0.1, 0.2]} />
        <meshStandardMaterial color="#333" roughness={0.9} />
      </mesh>

      {/* Ribbon cable — flat bent strip */}
      <mesh position={[1.8, 0.06, -1.1]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.8, 0.04, 0.18]} />
        <meshStandardMaterial
          color="#888888"
          roughness={0.5}
          metalness={0.1}
        />
      </mesh>

      {/* Camera module board */}
      <mesh position={[2.6, 0.0, -1.1]}>
        <boxGeometry args={[0.9, 0.1, 0.9]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.5} metalness={0.3} />
      </mesh>

      {/* Lens — outer ring */}
      <mesh position={[2.6, 0.12, -1.1]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.3, 0.04, 16, 32]} />
        <meshStandardMaterial
          color="#FF5500"
          emissive="#FF5500"
          emissiveIntensity={0.4}
          roughness={0.3}
          metalness={0.6}
        />
      </mesh>

      {/* Lens — middle ring */}
      <mesh position={[2.6, 0.12, -1.1]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.2, 0.025, 16, 32]} />
        <meshStandardMaterial
          color="#FF5500"
          emissive="#FF5500"
          emissiveIntensity={0.25}
          roughness={0.4}
        />
      </mesh>

      {/* Lens — inner core (dark) */}
      <mesh position={[2.6, 0.12, -1.1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.05, 32]} />
        <meshStandardMaterial
          color="#050505"
          roughness={0.1}
          metalness={0.8}
        />
      </mesh>

      {/* Lens flare point light */}
      <pointLight
        position={[2.6, 0.5, -1.1]}
        color="#FF5500"
        intensity={1.5}
        distance={5}
      />
    </group>
  )
}

export default function CameraCanvas() {
  const [mouse, setMouse] = useState({ x: 0, y: 0 })

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMouse({
      x: ((e.clientX - rect.left) / rect.width - 0.5) * 2,
      y: ((e.clientY - rect.top) / rect.height - 0.5) * -2,
    })
  }

  return (
    <div
      style={{ width: '100%', height: '500px', position: 'relative' }}
      onMouseMove={handleMouseMove}
    >
      <Canvas
        camera={{ position: [0, 3, 8], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={['#000000']} />
        <ambientLight intensity={0.3} />
        <directionalLight position={[5, 5, 5]} intensity={1} color="#ffffff" />
        <pointLight position={[-3, 2, 3]} color="#FF5500" intensity={0.8} distance={15} />
        <RaspberryPiBoard mouseX={mouse.x} mouseY={mouse.y} />
      </Canvas>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/LandingPage/CameraCanvas.jsx
git commit -m "feat: add CameraCanvas with 3D RPi + camera module in Three.js"
```

---

## Task 5: Camera Section

**Files:**
- Create: `src/components/LandingPage/CameraSection.jsx`
- Create: `src/components/LandingPage/CameraSection.module.css`

- [ ] **Step 1: Create `src/components/LandingPage/CameraSection.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react'
import CameraCanvas from './CameraCanvas'
import styles from './CameraSection.module.css'

const SPECS = [
  { value: '12', unit: 'MP', label: 'Sensor' },
  { value: '4', unit: 'K', label: 'Max Capture' },
  { value: '~3', unit: 's', label: 'Mint Time' },
  { value: '∞', unit: '', label: 'On-Chain Life' },
]

export default function CameraSection() {
  const sectionRef = useRef()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.2 }
    )
    if (sectionRef.current) observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <section
      id="camera-section"
      ref={sectionRef}
      className={`${styles.section} ${visible ? styles.visible : ''}`}
    >
      <div className={styles.bgGlow} />

      <div className={styles.badge}>
        <span>●</span> The Hardware
      </div>

      <h2 className={styles.heading}>
        THE VERIS <span className={styles.dim}>UNIT</span>
      </h2>
      <p className={styles.sub}>
        Built on Raspberry Pi 4B + HQ Camera Module. A node, not just a camera.
      </p>

      <div className={styles.canvasWrap}>
        <div className={styles.annTop}>
          <div className={styles.annLine} />
          Raspberry Pi 4B — 4GB RAM
        </div>
        <CameraCanvas />
        <div className={styles.annBot}>
          <div className={styles.annLine} />
          HQ Camera Module v2 — 12MP
        </div>
      </div>

      <div className={`${styles.specsRow} glass`}>
        {SPECS.map((s) => (
          <div key={s.label} className={styles.specBox}>
            <div className={styles.specNum}>
              {s.value}
              {s.unit && <span className={styles.specUnit}>{s.unit}</span>}
            </div>
            <div className={styles.specLabel}>{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create `src/components/LandingPage/CameraSection.module.css`**

```css
.section {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100px 48px;
  position: relative;
  background: #000;
  overflow: hidden;
  opacity: 0;
  transform: translateY(40px);
  transition: opacity 0.8s ease, transform 0.8s ease;
}
.section.visible {
  opacity: 1;
  transform: translateY(0);
}

.bgGlow {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255, 85, 0, 0.06), transparent 70%);
  pointer-events: none;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--orange);
  letter-spacing: 4px;
  text-transform: uppercase;
  margin-bottom: 24px;
}

.heading {
  font-size: clamp(48px, 6vw, 88px);
  font-weight: 800;
  color: var(--white);
  text-align: center;
  letter-spacing: 6px;
  line-height: 0.95;
  margin-bottom: 16px;
}
.dim { color: rgba(255, 255, 255, 0.18); }

.sub {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
  margin-bottom: 60px;
  max-width: 480px;
}

.canvasWrap {
  width: 100%;
  max-width: 760px;
  position: relative;
  margin-bottom: 48px;
}

.annTop, .annBot {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-mono);
  font-size: 9px;
  color: rgba(255, 85, 0, 0.6);
  letter-spacing: 2px;
  text-transform: uppercase;
  position: absolute;
  left: 10%;
  white-space: nowrap;
}
.annTop { top: 20px; flex-direction: column; align-items: flex-start; }
.annBot { bottom: 20px; right: 10%; left: auto; flex-direction: column; align-items: flex-end; }

.annLine {
  width: 1px;
  height: 24px;
  background: rgba(255, 85, 0, 0.3);
}

/* Specs */
.specsRow {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  width: 100%;
  max-width: 760px;
  overflow: hidden;
  border-radius: 12px;
}

.specBox {
  padding: 24px 28px;
  background: rgba(255, 255, 255, 0.025);
  border-right: 1px solid rgba(255, 255, 255, 0.05);
  position: relative;
}
.specBox:last-child { border-right: none; }
.specBox::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), transparent);
}

.specNum {
  font-size: 40px;
  font-weight: 800;
  color: var(--white);
  line-height: 1;
  margin-bottom: 6px;
  display: flex;
  align-items: flex-start;
  gap: 4px;
}
.specUnit {
  font-size: 18px;
  color: var(--orange);
  margin-top: 6px;
}
.specLabel {
  font-family: var(--font-mono);
  font-size: 9px;
  color: rgba(255, 255, 255, 0.35);
  letter-spacing: 2px;
  text-transform: uppercase;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/LandingPage/CameraSection.jsx src/components/LandingPage/CameraSection.module.css
git commit -m "feat: add CameraSection with 3D canvas, annotations and spec bar"
```

---

## Task 6: How It Works Section

**Files:**
- Create: `src/components/LandingPage/HowItWorksSection.jsx`
- Create: `src/components/LandingPage/HowItWorksSection.module.css`

- [ ] **Step 1: Create `src/components/LandingPage/HowItWorksSection.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react'
import styles from './HowItWorksSection.module.css'

const STEPS = [
  {
    num: '01',
    title: 'Capture',
    body: 'The Veris camera captures the moment. The shutter fires — no cloud, no middleman. Raw signal, straight to the edge processor.',
    chip: 'RPi HQ Camera',
  },
  {
    num: '02',
    title: 'Mint',
    body: 'The image is pinned to IPFS via Filecoin and minted as an NFT on Ethereum. Tamper-proof. Timestamped. Permanent.',
    chip: 'IPFS + Sepolia',
  },
  {
    num: '03',
    title: 'Claim',
    body: 'A QR code appears on-device. Anyone photographed scans it and claims their edition. You — the owner — manage everything here.',
    chip: 'Privy + Wallet',
  },
]

export default function HowItWorksSection() {
  const sectionRef = useRef()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.15 }
    )
    if (sectionRef.current) observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <section
      ref={sectionRef}
      className={`${styles.section} ${visible ? styles.visible : ''}`}
    >
      <div className={styles.inner}>
        <div className={styles.badge}>
          <span>●</span> The Protocol
        </div>

        <h2 className={styles.heading}>
          From shutter<br />
          to <span className={styles.accent}>on-chain</span><br />
          <span className={styles.muted}>truth.</span>
        </h2>

        <div className={styles.steps}>
          {STEPS.map((step) => (
            <div key={step.num} className={`${styles.step} glass`}>
              <div className={styles.stepNum}>{step.num}</div>
              <div className={`${styles.stepIcon} glass-orange`}>
                <div className={styles.stepDot} />
              </div>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepBody}>{step.body}</p>
              <div className={styles.stepChip}>{step.chip}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create `src/components/LandingPage/HowItWorksSection.module.css`**

```css
.section {
  background: #000;
  padding: 0 80px;
  opacity: 0;
  transform: translateY(40px);
  transition: opacity 0.8s ease 0.1s, transform 0.8s ease 0.1s;
}
.section.visible {
  opacity: 1;
  transform: translateY(0);
}

.inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 120px 0;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--orange);
  letter-spacing: 4px;
  text-transform: uppercase;
  margin-bottom: 20px;
}

.heading {
  font-size: clamp(52px, 6.5vw, 96px);
  font-weight: 800;
  line-height: 0.92;
  margin-bottom: 72px;
  letter-spacing: -1px;
}
.accent { color: var(--orange); }
.muted { color: rgba(255, 255, 255, 0.15); }

.steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
}

.step {
  padding: 40px 36px;
  position: relative;
  overflow: hidden;
  border-radius: 4px;
  transition: all 0.3s;
  cursor: default;
}
.step::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.04), transparent);
  pointer-events: none;
}
.step:hover {
  background: rgba(255, 85, 0, 0.06) !important;
  border-color: rgba(255, 85, 0, 0.2) !important;
}

.stepNum {
  font-size: 88px;
  font-weight: 800;
  color: rgba(255, 85, 0, 0.07);
  position: absolute;
  top: 12px;
  right: 20px;
  line-height: 1;
  font-family: var(--font-mono);
  pointer-events: none;
}

.stepIcon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stepDot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--orange);
  box-shadow: 0 0 16px rgba(255, 85, 0, 0.6);
}

.stepTitle {
  font-size: 28px;
  font-weight: 700;
  color: var(--white);
  margin-bottom: 14px;
}

.stepBody {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.75;
  margin-bottom: 24px;
}

.stepChip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 9px;
  color: rgba(255, 85, 0, 0.7);
  letter-spacing: 2px;
  text-transform: uppercase;
  padding: 5px 12px;
  border-radius: 4px;
  border: 1px solid rgba(255, 85, 0, 0.15);
  background: rgba(255, 85, 0, 0.05);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/LandingPage/HowItWorksSection.jsx src/components/LandingPage/HowItWorksSection.module.css
git commit -m "feat: add HowItWorksSection with 3-step liquid glass cards"
```

---

## Task 7: Auth Canvas

**Files:**
- Create: `src/components/LandingPage/AuthCanvas.jsx`

- [ ] **Step 1: Create `src/components/LandingPage/AuthCanvas.jsx`**

```jsx
import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'

function Grid() {
  const geometry = useMemo(() => new THREE.PlaneGeometry(80, 80, 36, 36), [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color('#FF5500'),
    wireframe: true,
    transparent: true,
    opacity: 0.06,
  }), [])

  return (
    <mesh
      geometry={geometry}
      material={material}
      rotation={[-Math.PI / 2.5, 0, 0]}
      position={[0, -4, -10]}
    />
  )
}

export default function AuthCanvas() {
  return (
    <Canvas
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      camera={{ position: [0, 2, 8], fov: 60 }}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={['#000000']} />
      <fog attach="fog" args={['#000000', 8, 35]} />
      <ambientLight intensity={0.05} />
      <pointLight position={[0, -2, -5]} color="#FF5500" intensity={1.5} distance={25} />
      <Grid />
    </Canvas>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/LandingPage/AuthCanvas.jsx
git commit -m "feat: add AuthCanvas reusing perspective grid for auth bg"
```

---

## Task 8: Auth Section

**Files:**
- Create: `src/components/LandingPage/AuthSection.jsx`
- Create: `src/components/LandingPage/AuthSection.module.css`

- [ ] **Step 1: Create `src/components/LandingPage/AuthSection.jsx`**

```jsx
import { usePrivy } from '@privy-io/react-auth'
import AuthCanvas from './AuthCanvas'
import styles from './AuthSection.module.css'

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || 'your-privy-app-id'
const isConfigured = PRIVY_APP_ID !== 'your-privy-app-id'

export default function AuthSection() {
  const { login } = usePrivy()

  return (
    <section className={styles.section}>
      <AuthCanvas />
      <div className={styles.radial} />
      <div className={styles.vignette} />

      {/* HUD corners */}
      <div className={`${styles.hc} ${styles.hcTL}`} />
      <div className={`${styles.hc} ${styles.hcTR}`} />
      <div className={`${styles.hc} ${styles.hcBL}`} />
      <div className={`${styles.hc} ${styles.hcBR}`} />

      <div className={`${styles.card} glass`}>
        <div className={styles.pre}>Owner Access</div>

        <h2 className={styles.logo}>VERIS</h2>
        <p className={styles.sub}>Owner Portal</p>

        <div className={styles.divider}>
          <span>OWNER ACCESS</span>
        </div>

        {!isConfigured && (
          <div className={styles.warning}>
            Configure VITE_PRIVY_APP_ID in your .env file to enable login
          </div>
        )}

        <button
          className={styles.cta}
          onClick={login}
          disabled={!isConfigured}
        >
          Authenticate →
        </button>

        <div className={styles.orRow}>
          <span>OR</span>
        </div>

        <button
          className={`${styles.walletBtn} glass`}
          onClick={login}
          disabled={!isConfigured}
        >
          Connect Wallet via Privy
        </button>

        <p className={styles.notice}>
          Restricted to Veris camera owners only<br />
          Unauthorized access is logged on-chain
        </p>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create `src/components/LandingPage/AuthSection.module.css`**

```css
.section {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  background: #000;
  padding: 80px 24px;
}

.radial {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 70% 60% at 50% 80%, rgba(255, 85, 0, 0.1), transparent 70%);
  pointer-events: none;
}

.vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 60%, transparent 20%, rgba(0, 0, 0, 0.96) 75%);
  pointer-events: none;
}

/* HUD corners */
.hc {
  position: absolute;
  width: 24px;
  height: 24px;
  border-color: rgba(255, 85, 0, 0.35);
  border-style: solid;
  border-width: 0;
  pointer-events: none;
}
.hcTL { top: 48px; left: 48px; border-top-width: 1.5px; border-left-width: 1.5px; }
.hcTR { top: 48px; right: 48px; border-top-width: 1.5px; border-right-width: 1.5px; }
.hcBL { bottom: 48px; left: 48px; border-bottom-width: 1.5px; border-left-width: 1.5px; }
.hcBR { bottom: 48px; right: 48px; border-bottom-width: 1.5px; border-right-width: 1.5px; }

/* Card */
.card {
  position: relative;
  z-index: 2;
  width: 480px;
  padding: 52px;
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.pre {
  font-family: var(--font-mono);
  font-size: 9px;
  color: rgba(255, 85, 0, 0.7);
  letter-spacing: 4px;
  text-transform: uppercase;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  justify-content: center;
}
.pre::before, .pre::after {
  content: '';
  flex: 0 0 20px;
  height: 1px;
  background: rgba(255, 85, 0, 0.35);
}

.logo {
  font-size: 72px;
  font-weight: 800;
  color: var(--white);
  letter-spacing: 22px;
  text-indent: 22px;
  text-align: center;
  line-height: 0.9;
  margin-bottom: 12px;
}

.sub {
  font-family: var(--font-mono);
  font-size: 10px;
  color: rgba(255, 255, 255, 0.38);
  text-align: center;
  letter-spacing: 3px;
  text-transform: uppercase;
  margin-bottom: 40px;
}

.divider {
  width: 100%;
  position: relative;
  text-align: center;
  margin-bottom: 36px;
}
.divider::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
}
.divider span {
  position: relative;
  background: transparent;
  padding: 0 16px;
  font-family: var(--font-mono);
  font-size: 8px;
  color: rgba(255, 255, 255, 0.25);
  letter-spacing: 3px;
  text-transform: uppercase;
  background: rgba(15, 15, 15, 0.8);
}

.warning {
  width: 100%;
  padding: 12px 16px;
  background: rgba(255, 180, 0, 0.08);
  border: 1px solid rgba(255, 180, 0, 0.2);
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 9px;
  color: rgba(255, 200, 0, 0.7);
  letter-spacing: 1px;
  margin-bottom: 20px;
  text-align: center;
}

.cta {
  width: 100%;
  padding: 18px;
  border: none;
  cursor: pointer;
  background: var(--orange);
  color: #000;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 4px;
  text-transform: uppercase;
  border-radius: 8px;
  margin-bottom: 16px;
  position: relative;
  overflow: hidden;
  clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
  transition: all 0.25s;
}
.cta::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.15), transparent);
  pointer-events: none;
}
.cta:hover:not(:disabled) {
  background: #ff6a1a;
  box-shadow: 0 0 40px rgba(255, 85, 0, 0.4);
}
.cta:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.orRow {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
  width: 100%;
}
.orRow::before, .orRow::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.07);
}
.orRow span {
  font-family: var(--font-mono);
  font-size: 9px;
  color: rgba(255, 255, 255, 0.18);
  letter-spacing: 2px;
}

.walletBtn {
  width: 100%;
  padding: 16px;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 3px;
  text-transform: uppercase;
  border-radius: 8px;
  transition: all 0.2s;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  background: none;
}
.walletBtn:hover:not(:disabled) { color: var(--white); }
.walletBtn:disabled { opacity: 0.4; cursor: not-allowed; }

.notice {
  margin-top: 28px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 8px;
  color: rgba(255, 255, 255, 0.15);
  letter-spacing: 2px;
  line-height: 2.2;
  text-transform: uppercase;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/LandingPage/AuthSection.jsx src/components/LandingPage/AuthSection.module.css
git commit -m "feat: add AuthSection with liquid glass card and Privy login"
```

---

## Task 9: Footer

**Files:**
- Create: `src/components/LandingPage/Footer.jsx`

- [ ] **Step 1: Create `src/components/LandingPage/Footer.jsx`**

```jsx
export default function Footer() {
  return (
    <footer style={{
      padding: '28px 48px',
      borderTop: '1px solid rgba(255,255,255,0.05)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: '#000',
    }}>
      <div style={{
        fontSize: '18px',
        fontWeight: 800,
        letterSpacing: '6px',
        color: '#fff',
        fontFamily: 'var(--font-sans)',
      }}>
        VERI<span style={{ color: '#FF5500' }}>S</span>
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '9px',
        color: 'rgba(255,255,255,0.18)',
        letterSpacing: '2px',
        textTransform: 'uppercase',
      }}>
        Decentralized Camera Protocol — 2024
      </div>
    </footer>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/LandingPage/Footer.jsx
git commit -m "feat: add Footer component"
```

---

## Task 10: LandingPage Orchestrator

**Files:**
- Create: `src/components/LandingPage/LandingPage.jsx`
- Update: `src/components/LandingPage/index.js`

- [ ] **Step 1: Create `src/components/LandingPage/LandingPage.jsx`**

```jsx
import HeroSection from './HeroSection'
import CameraSection from './CameraSection'
import HowItWorksSection from './HowItWorksSection'
import AuthSection from './AuthSection'
import Footer from './Footer'

export default function LandingPage({ onEnterPortal }) {
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
```

- [ ] **Step 2: Update `src/components/LandingPage/index.js`**

```js
export { default } from './LandingPage'
```

- [ ] **Step 3: Commit**

```bash
git add src/components/LandingPage/LandingPage.jsx src/components/LandingPage/index.js
git commit -m "feat: add LandingPage orchestrator composing all sections"
```

---

## Task 11: Wire Up App.jsx

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Update `src/App.jsx`**

```jsx
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
  transports: {
    [sepolia.id]: http(),
  },
})

function AppContent() {
  const { ready, authenticated } = usePrivy()

  // Loading state — pulsing wordmark
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
          fontFamily: 'var(--font-sans)',
          fontSize: '48px',
          fontWeight: 800,
          color: '#fff',
          letterSpacing: '16px',
          textIndent: '16px',
          animation: 'pulse-dot 1.5s ease-in-out infinite',
          opacity: 0.6,
        }}>
          VERIS
        </div>
      </div>
    )
  }

  if (authenticated) {
    return <OwnerDashboard />
  }

  return <LandingPage />
}

export default function App() {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['wallet', 'email', 'sms'],
        appearance: {
          theme: 'dark',
          accentColor: '#FF5500',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
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
```

- [ ] **Step 2: Verify the full page renders**

Open http://localhost:3000. Expect:
- Black full-screen hero with VERIS wordmark, Three.js grid
- Scrolling down reveals camera section, how it works, auth gate
- No console errors

- [ ] **Step 3: Final commit**

```bash
git add src/App.jsx
git commit -m "feat: wire LandingPage into App — shows landing when unauthenticated"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Hero ✓, Camera 3D ✓, Scroll-in animation ✓, How It Works ✓, Auth gate ✓, Privy login ✓, Liquid glass ✓, HUD corners ✓, Footer ✓, No navbar ✓, Loading state ✓
- [x] **No placeholders:** All steps have complete code
- [x] **Type consistency:** `onEnterPortal` prop passes through Hero → LandingPage consistently; `usePrivy` from `@privy-io/react-auth` used correctly; CSS variable names consistent (`--font-mono`, `--orange`, etc.) across all modules
- [x] **Dependencies:** `three`, `@react-three/fiber`, `@react-three/postprocessing` installed in Task 1 before used in Tasks 2/4/7
- [x] **globals.css** imported in `main.jsx` before any component renders
