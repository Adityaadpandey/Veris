# Veris Landing Page — Design Spec
**Date:** 2026-03-28
**Status:** Approved
**Stack:** React + Vite + Three.js

---

## Overview

A full-screen immersive landing page for the **Veris** owner portal — a decentralized physical camera system that captures photos and mints them as NFTs on-chain. The page is a **private owner gate**: only Veris camera owners arrive here. It is simultaneously a landing page, a brand statement, and an auth experience.

No navbar. No clutter. Just the world of Veris.

---

## Design Language

### Mood
**Industrial Precision + Cinematic Noir.** Think mission control meets high-end camera brand. Brutal structure, dramatic darkness, orange as the single signal that cuts through.

### Color System
| Token | Value | Usage |
|-------|-------|-------|
| `--orange` | `#FF5500` | Primary signal: CTAs, glows, accents |
| `--orange-dim` | `rgba(255,85,0,0.5)` | HUD text, labels |
| `--orange-ghost` | `rgba(255,85,0,0.06–0.12)` | Grid lines, backgrounds |
| `--black` | `#000000` | Background — pure void |
| `--white` | `#FFFFFF` | Wordmark only |
| `--white-70` | `rgba(255,255,255,0.70)` | Body text |
| `--white-40` | `rgba(255,255,255,0.40)` | Secondary text |
| `--white-15` | `rgba(255,255,255,0.15)` | Dividers, borders |

### Typography
| Role | Font | Weight | Size |
|------|------|--------|------|
| Wordmark | Space Grotesk | 800 | clamp(100px,14vw,180px) |
| Section titles | Space Grotesk | 800 | clamp(52px,6.5vw,96px) |
| Body | Space Grotesk | 400 | 15–18px |
| HUD / labels / buttons | Space Mono | 400/700 | 9–12px |

Extreme letter-spacing on labels (4–6px). Monospace for all system/data text.

### Liquid Glass Effect
Applied to: step cards, ghost button, auth form card, spec grid.
```css
background: linear-gradient(135deg,
  rgba(255,255,255,0.09) 0%,
  rgba(255,255,255,0.04) 40%,
  rgba(255,85,0,0.04) 70%,
  rgba(255,255,255,0.06) 100%
);
backdrop-filter: blur(28px) saturate(180%);
border: 1px solid rgba(255,255,255,0.1);
border-top-color: rgba(255,255,255,0.18);
box-shadow: 0 8px 32px rgba(0,0,0,0.5),
            inset 0 1px 0 rgba(255,255,255,0.12);
```

---

## Page Structure

### Section 1 — Hero (full viewport height)

**Three.js scene (background):**
- Infinite perspective grid: `PlaneGeometry` subdivided, wireframe, rotated ~32° on X-axis, recedes to horizon
- Color: `rgba(255,85,0,0.08)` grid lines
- `THREE.FogExp2` deep black fog — grid fades into void
- Subtle `UnrealBloomPass` post-processing on orange elements
- No scan line — static, atmospheric

**Overlays:**
- Radial gradient glow at bottom center (orange, low opacity)
- Dark vignette radial
- Top and bottom black fades
- HUD corner brackets (4 corners, orange, thin)
- HUD status text: top-left (`VRS / CAM-01 / SIGNAL ACTIVE / AUTH: PRIVY`), top-right (`CHAIN: SEPOLIA / STATUS: ONLINE / NFT: READY`)

**Center content:**
- Liquid glass orange badge pill: pulsing dot + "Decentralized Camera Protocol"
- Wordmark: **VERIS** — 800 weight, massive, white
- Tagline: 2-line, 18–24px, 70% white — "A physical camera that **sees, mints, and proves.** Every frame becomes an on-chain truth."
- Two CTAs: `[Enter Owner Portal →]` (orange fill, chamfered corners) + `[See The Camera ↓]` (liquid glass ghost)
- Scroll indicator: vertical orange line + "SCROLL" monospace label

**Scroll behavior:** Hero fades out as user scrolls. Three.js canvas persists as sticky background (or separate canvas per section).

---

### Section 2 — Camera Reveal (full viewport height)

**Three.js scene:**
An actual 3D model of the Veris camera unit, built with `THREE.BoxGeometry`, `THREE.CylinderGeometry`, and `THREE.TorusGeometry` primitives assembled to represent:
- Raspberry Pi 4B PCB (green-tinted flat box with surface details)
- 40-pin GPIO header (small bumped geometry)
- Ribbon cable connector + flat ribbon (thin bent box)
- Camera module (small square board + concentric torus rings for the lens)
- Lens iris: nested concentric rings with orange emissive glow on innermost

**Camera behavior:**
- On scroll into view: animates from below, rotates slowly (auto-rotate Y axis, ~0.003 rad/frame)
- Mouse parallax: subtle rotation follows cursor position (±15°)
- Ambient orange point light + directional white light
- Dark background with radial orange glow

**Text content:**
- Section badge: `● The Hardware`
- Heading: `THE VERIS UNIT` — massive, dim "UNIT"
- Sub: "Built on Raspberry Pi 4B + HQ Camera Module"
- Annotation labels with lines: `Raspberry Pi 4B — 4GB RAM` (top), `HQ Camera Module v2 — 12MP` (bottom-right)

**Spec bar** (liquid glass, 4 columns):
| 12MP | 4K | ~3s | ∞ |
|------|----|-----|---|
| Sensor | Max Capture | Mint Time | On-Chain Life |

---

### Section 3 — How It Works

**Layout:** Full-width, dark background, max-width 1200px centered.

**Heading:** Large stacked type —
```
From shutter
to ON-CHAIN   ← orange
truth.         ← 15% white (ghost)
```

**3 step cards** (liquid glass, side-by-side grid):
1. **Capture** — RPi HQ Camera chip label
2. **Mint** — IPFS + Sepolia chip label
3. **Claim** — Privy + Wallet chip label

Each card: large ghost step number (01/02/03), liquid glass orange icon dot, title (28px bold), body text (15px 50% white), tech chip tag.

Hover state: orange tint border + subtle orange background wash.

---

### Section 4 — Auth Gate (full viewport height)

**Three.js scene:** Same perspective grid as hero, lower opacity. Radial orange glow at bottom. Deep vignette. HUD corner brackets.

**Auth card** (liquid glass, 480px wide, 24px border-radius, centered):
- Pre-label: `— Owner Access —` monospace
- Wordmark: **VERIS** 72px
- Sub: `Owner Portal` monospace
- Horizontal divider with `OWNER ACCESS` label
- Wallet address input (bottom-border only style, orange tint on focus)
- Primary CTA: `Authenticate →` (orange fill, chamfered)
- OR divider
- Secondary: `Connect Wallet via Privy` (liquid glass ghost)
- Fine print: "Restricted to Veris camera owners only / Unauthorized access is logged on-chain"

**Auth logic:**
- Uses existing `usePrivy()` hook
- On `authenticated`: redirect to dashboard (existing `OwnerDashboard` component)
- On `!ready`: full-screen loading state with pulsing VERIS wordmark
- `PRIVY_APP_ID` warning shown inline in auth card if unconfigured

---

### Footer
- Left: `VERIS` logo (S in orange)
- Right: `DECENTRALIZED CAMERA PROTOCOL — 2024` monospace

---

## File Structure

```
src/
  components/
    LandingPage/
      LandingPage.jsx          ← top-level, orchestrates sections
      HeroSection.jsx           ← Section 1
      HeroCanvas.jsx            ← Three.js perspective grid
      CameraSection.jsx         ← Section 2
      CameraCanvas.jsx          ← Three.js 3D camera model
      HowItWorksSection.jsx     ← Section 3
      AuthSection.jsx           ← Section 4 + Privy auth logic
      AuthCanvas.jsx            ← Three.js grid (reused from hero)
      Footer.jsx
    OwnerDashboard.jsx          ← existing (unchanged)
    OwnerDashboard.css          ← existing (unchanged)
  styles/
    globals.css                 ← design tokens, glass mixins, fonts
  App.jsx                       ← updated: show LandingPage if !authenticated
  main.jsx
```

---

## Dependencies to Install

```bash
npm install three @react-three/fiber @react-three/postprocessing --legacy-peer-deps
```

- `three` — 3D engine
- `@react-three/fiber` — React renderer for Three.js
- `@react-three/postprocessing` — bloom pass

Scroll-triggered animations: **pure CSS** (`IntersectionObserver`) — no additional library.

---

## Interaction & Animation Summary

| Element | Behavior |
|---------|----------|
| Hero grid | Static, atmospheric. Fog fades edges. |
| Badge dot | Pulses orange glow (CSS keyframe) |
| "Enter Portal" btn | Hover: brighter orange + glow shadow |
| Ghost btn | Liquid glass, hover brightens text |
| Camera model | Auto-rotates Y, follows mouse on hover |
| Camera (scroll) | Fades + rises in on IntersectionObserver |
| Step cards | Hover: orange border + tint |
| Auth inputs | Focus: orange border + glow ring |
| Auth CTA | Hover: brighter + glow |
| HUD blink | Step cursor blinks (CSS) |

---

## What Does NOT Change

- `App.jsx` Privy/Wagmi provider setup — only the render logic changes
- `OwnerDashboard.jsx` and `OwnerDashboard.css` — completely untouched
- All environment variables remain the same
