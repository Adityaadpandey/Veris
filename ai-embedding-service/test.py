"""
VERIS - International Fair Poster
1000mm x 1000mm (1m x 1m)
Orange + Black palette
"""
import cairosvg
import os

SVG = r'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="1000mm" height="1000mm"
     viewBox="0 0 1000 1000">

<defs>
  <radialGradient id="lensCore" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#2a1505"/>
    <stop offset="55%" stop-color="#0a0302"/>
    <stop offset="100%" stop-color="#000"/>
  </radialGradient>
  <radialGradient id="orangeGlow" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#ff6a1f" stop-opacity="0.35"/>
    <stop offset="60%" stop-color="#ff6a1f" stop-opacity="0.06"/>
    <stop offset="100%" stop-color="#ff6a1f" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="hotspot" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#ffb070"/>
    <stop offset="50%" stop-color="#ff6a1f"/>
    <stop offset="100%" stop-color="#a0320a"/>
  </radialGradient>
  <linearGradient id="orangeBar" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#c94a0f"/>
    <stop offset="50%" stop-color="#ff6a1f"/>
    <stop offset="100%" stop-color="#ff8c42"/>
  </linearGradient>
  <pattern id="grid" width="15" height="15" patternUnits="userSpaceOnUse">
    <path d="M 15 0 L 0 0 0 15" fill="none" stroke="#1a0a05" stroke-width="0.3"/>
  </pattern>
</defs>

<!-- BACKGROUND -->
<rect width="1000" height="1000" fill="#080402"/>
<rect width="1000" height="1000" fill="url(#grid)" opacity="0.55"/>

<!-- OUTER CORNER BRACKETS -->
<g stroke="#ff6a1f" stroke-width="1.4" fill="none">
  <path d="M 22 38 L 22 22 L 38 22"/>
  <path d="M 962 22 L 978 22 L 978 38"/>
  <path d="M 22 962 L 22 978 L 38 978"/>
  <path d="M 962 978 L 978 978 L 978 962"/>
</g>

<!-- TOP HUD STRIP -->
<g>
  <circle cx="34" cy="33" r="2.2" fill="#ff6a1f"/>
  <text x="42" y="36" fill="#ff6a1f" font-family="monospace" font-size="7" font-weight="700" letter-spacing="2">REC // VERIS.CAM</text>
  <text x="500" y="36" fill="#ff8c42" font-family="monospace" font-size="7" letter-spacing="5" text-anchor="middle">- INTERNATIONAL INNOVATION FAIR . 2026 -</text>
  <text x="966" y="36" fill="#ff6a1f" font-family="monospace" font-size="7" font-weight="700" letter-spacing="2" text-anchor="end">LIVE ●</text>
  <line x1="22" y1="48" x2="978" y2="48" stroke="#3a1810" stroke-width="0.4"/>
  <text x="34" y="58" fill="#8b4513" font-family="monospace" font-size="4.5" letter-spacing="1">24mm . f/2.8 . ISO 400 . 1/60s . RAW . AUTH</text>
  <text x="966" y="58" fill="#8b4513" font-family="monospace" font-size="4.5" letter-spacing="1" text-anchor="end">SEPOLIA . zkSNARK . FILECOIN</text>
</g>

<!-- ====== HERO (y 70-380) ====== -->
<g>
  <text x="42" y="95" fill="#c94a0f" font-family="monospace" font-size="8" letter-spacing="8">- INTRODUCING</text>
  <rect x="42" y="110" width="5" height="130" fill="url(#orangeBar)"/>

  <!-- Huge VERIS title with ghost shadow -->
  <text x="62" y="225" fill="#ff8c42" font-family="sans-serif" font-weight="900" font-size="135" letter-spacing="-4" opacity="0.15">VERIS</text>
  <text x="62" y="218" fill="#ff6a1f" font-family="sans-serif" font-weight="900" font-size="135" letter-spacing="-4">VERIS</text>

  <text x="62" y="253" fill="#faf0e4" font-family="sans-serif" font-style="italic" font-weight="300" font-size="17">the camera that proves reality -</text>
  <text x="62" y="272" fill="#d4a888" font-family="sans-serif" font-style="italic" font-weight="300" font-size="13">at the moment of capture.</text>

  <line x1="62" y1="290" x2="490" y2="290" stroke="#3a1810" stroke-width="0.6"/>
  <text x="62" y="310" fill="#faf0e4" font-family="sans-serif" font-size="11" font-weight="500">A Web3 physical camera that cryptographically</text>
  <text x="62" y="326" fill="#faf0e4" font-family="sans-serif" font-size="11" font-weight="500">signs every photograph at the shutter, producing</text>
  <text x="62" y="342" fill="#faf0e4" font-family="sans-serif" font-size="11" font-weight="500">on-chain proof of authenticity in under 60 seconds.</text>

  <!-- HERO LENS -->
  <g transform="translate(770, 215)">
    <circle r="180" fill="url(#orangeGlow)"/>
    <circle r="160" fill="none" stroke="#3a1810" stroke-width="0.3" stroke-dasharray="1,3"/>
    <circle r="145" fill="none" stroke="#2a1005" stroke-width="0.3"/>
    <circle r="130" fill="#1a0a05" stroke="#c94a0f" stroke-width="2"/>
    <circle r="120" fill="#0a0503"/>
    <circle r="108" fill="url(#lensCore)" stroke="#2a1505" stroke-width="0.6"/>
    <circle r="92" fill="none" stroke="#3a1810" stroke-width="0.5"/>
    <circle r="72" fill="#050302"/>
    <circle r="56" fill="none" stroke="#5a2810" stroke-width="0.5"/>
    <circle r="42" fill="#000"/>
    <circle r="28" fill="none" stroke="#c94a0f" stroke-width="0.4"/>
    <circle r="18" fill="url(#hotspot)"/>
    <circle r="10" fill="#ff8c42"/>
    <circle r="4" fill="#ffe0b0" opacity="0.9"/>
    <ellipse cx="-32" cy="-42" rx="24" ry="12" fill="#5a2810" opacity="0.6"/>
    <ellipse cx="-18" cy="-28" rx="10" ry="5" fill="#8b4513" opacity="0.4"/>
    <g fill="#ff6a1f"><circle cx="0" cy="-128" r="1.3"/></g>
    <g fill="#5a2810">
      <circle cx="91" cy="-91" r="0.8"/>
      <circle cx="128" cy="0" r="0.8"/>
      <circle cx="91" cy="91" r="0.8"/>
      <circle cx="0" cy="128" r="0.8"/>
      <circle cx="-91" cy="91" r="0.8"/>
      <circle cx="-128" cy="0" r="0.8"/>
      <circle cx="-91" cy="-91" r="0.8"/>
    </g>
    <g stroke="#3a1810" stroke-width="0.4">
      <line x1="0" y1="-135" x2="0" y2="-140"/>
      <line x1="67.5" y1="-116.9" x2="70" y2="-121.2"/>
      <line x1="116.9" y1="-67.5" x2="121.2" y2="-70"/>
      <line x1="135" y1="0" x2="140" y2="0"/>
      <line x1="116.9" y1="67.5" x2="121.2" y2="70"/>
      <line x1="67.5" y1="116.9" x2="70" y2="121.2"/>
      <line x1="0" y1="135" x2="0" y2="140"/>
      <line x1="-67.5" y1="116.9" x2="-70" y2="121.2"/>
      <line x1="-116.9" y1="67.5" x2="-121.2" y2="70"/>
      <line x1="-135" y1="0" x2="-140" y2="0"/>
      <line x1="-116.9" y1="-67.5" x2="-121.2" y2="-70"/>
      <line x1="-67.5" y1="-116.9" x2="-70" y2="-121.2"/>
    </g>
  </g>

  <line x1="650" y1="360" x2="890" y2="360" stroke="#3a1810" stroke-width="0.4"/>
  <text x="770" y="378" fill="#ff6a1f" font-family="monospace" font-size="7" text-anchor="middle" letter-spacing="5">SIGNED AT THE SHUTTER</text>
</g>

<!-- DIVIDER -->
<g transform="translate(0, 400)">
  <line x1="22" y1="0" x2="978" y2="0" stroke="#3a1810" stroke-width="0.4"/>
  <rect x="40" y="-2" width="80" height="4" fill="#ff6a1f"/>
  <text x="132" y="2" fill="#ff6a1f" font-family="monospace" font-size="7" letter-spacing="4">01 // THE CORE TENSION</text>
  <text x="966" y="2" fill="#8b4513" font-family="monospace" font-size="5" text-anchor="end" letter-spacing="2">FRAME 001 / 004</text>
</g>

<!-- ====== PROBLEM / ANSWER (y 420-560) ====== -->
<g>
  <g transform="translate(40, 425)">
    <rect x="0" y="0" width="450" height="130" fill="#120806" stroke="#3a1810" stroke-width="0.6"/>
    <text x="20" y="24" fill="#8b4513" font-family="monospace" font-size="5.5" letter-spacing="3">PROBLEM</text>
    <text x="20" y="55" fill="#faf0e4" font-family="sans-serif" font-weight="800" font-size="26">AI fakes everything.</text>
    <text x="20" y="80" fill="#d4a888" font-family="sans-serif" font-weight="400" font-size="13" font-style="italic">Nothing proves what's real anymore.</text>
    <g transform="translate(20, 96)">
      <text x="0" y="0" fill="#8b4513" font-family="monospace" font-size="7">› Metadata -</text>
      <text x="75" y="0" fill="#d4a888" font-family="monospace" font-size="7">strippable</text>
      <text x="0" y="11" fill="#8b4513" font-family="monospace" font-size="7">› Timestamps -</text>
      <text x="75" y="11" fill="#d4a888" font-family="monospace" font-size="7">weak</text>
      <text x="0" y="22" fill="#8b4513" font-family="monospace" font-size="7">› Signatures -</text>
      <text x="75" y="22" fill="#d4a888" font-family="monospace" font-size="7">forgeable</text>
    </g>
    <g transform="translate(340, 55)">
      <rect x="0" y="0" width="85" height="55" fill="#1a0a05" stroke="#5a2810" stroke-width="0.5" stroke-dasharray="3,2"/>
      <circle cx="18" cy="14" r="5" fill="#3a1810"/>
      <path d="M 3 48 L 22 28 L 38 38 L 60 22 L 82 38 L 82 55 L 3 55 Z" fill="#3a1810"/>
      <text x="42.5" y="30" fill="#c94a0f" font-family="sans-serif" font-weight="900" font-size="28" text-anchor="middle">?</text>
    </g>
  </g>

  <g transform="translate(500, 490)">
    <text x="0" y="5" fill="#ff6a1f" font-family="sans-serif" font-weight="900" font-size="20" text-anchor="middle">→</text>
  </g>

  <g transform="translate(520, 425)">
    <rect x="0" y="0" width="450" height="130" fill="#120806" stroke="#ff6a1f" stroke-width="1"/>
    <text x="20" y="24" fill="#ff6a1f" font-family="monospace" font-size="5.5" letter-spacing="3">VERIS ANSWERS</text>
    <text x="20" y="55" fill="#ff6a1f" font-family="sans-serif" font-weight="800" font-size="26">Sign reality at source.</text>
    <text x="20" y="80" fill="#faf0e4" font-family="sans-serif" font-weight="400" font-size="13" font-style="italic">Hardware-level proof. On-chain forever.</text>
    <g transform="translate(20, 96)">
      <text x="0" y="0" fill="#ff6a1f" font-family="monospace" font-size="7">✓ Tamper-proof chip</text>
      <text x="0" y="11" fill="#ff6a1f" font-family="monospace" font-size="7">✓ Zero-knowledge proof</text>
      <text x="0" y="22" fill="#ff6a1f" font-family="monospace" font-size="7">✓ Permanent chain record</text>
    </g>
    <g transform="translate(340, 55)">
      <rect x="0" y="0" width="85" height="55" fill="#1a0a05" stroke="#ff6a1f" stroke-width="0.8"/>
      <circle cx="18" cy="14" r="5" fill="#5a2810"/>
      <path d="M 3 48 L 22 28 L 38 38 L 60 22 L 82 38 L 82 55 L 3 55 Z" fill="#5a2810"/>
      <g transform="translate(65, 12)">
        <circle r="9" fill="none" stroke="#ff6a1f" stroke-width="1"/>
        <path d="M -4 0 L -1 3 L 4 -3" fill="none" stroke="#ff6a1f" stroke-width="1.5" stroke-linecap="round"/>
      </g>
    </g>
  </g>
</g>

<!-- DIVIDER -->
<g transform="translate(0, 580)">
  <line x1="22" y1="0" x2="978" y2="0" stroke="#3a1810" stroke-width="0.4"/>
  <rect x="40" y="-2" width="80" height="4" fill="#ff6a1f"/>
  <text x="132" y="2" fill="#ff6a1f" font-family="monospace" font-size="7" letter-spacing="4">02 // HOW IT WORKS</text>
  <text x="966" y="2" fill="#8b4513" font-family="monospace" font-size="5" text-anchor="end" letter-spacing="2">FRAME 002 / 004</text>
</g>

<!-- ====== PIPELINE (y 600-780) ====== -->
<g transform="translate(0, 605)">
  <text x="40" y="18" fill="#d4a888" font-family="sans-serif" font-weight="400" font-size="11" font-style="italic">Shutter to chain in</text>
  <text x="178" y="24" fill="#ff6a1f" font-family="sans-serif" font-weight="900" font-size="28" letter-spacing="-1">&lt; 60 SECONDS</text>
  <text x="360" y="18" fill="#d4a888" font-family="sans-serif" font-weight="400" font-size="11" font-style="italic">- fully automatic, invisible to the photographer.</text>

  <!-- STEP 01 -->
  <g transform="translate(40, 50)">
    <rect x="0" y="0" width="220" height="120" fill="#120806" stroke="#c94a0f" stroke-width="0.8"/>
    <path d="M 6 12 L 6 6 L 12 6" stroke="#ff6a1f" stroke-width="0.5" fill="none"/>
    <path d="M 208 6 L 214 6 L 214 12" stroke="#ff6a1f" stroke-width="0.5" fill="none"/>
    <text x="14" y="38" fill="#ff6a1f" font-family="monospace" font-size="18" font-weight="800">01</text>
    <line x1="14" y1="44" x2="40" y2="44" stroke="#ff6a1f" stroke-width="1"/>
    <g transform="translate(165, 22)">
      <rect x="-18" y="-12" width="36" height="24" fill="#1a0a05" stroke="#ff6a1f" stroke-width="0.6"/>
      <rect x="-14" y="-8" width="28" height="16" fill="#2a1508"/>
      <text x="0" y="3" fill="#ff6a1f" font-family="monospace" font-size="6" text-anchor="middle" font-weight="700">SIG</text>
      <line x1="-18" y1="-6" x2="-22" y2="-6" stroke="#c94a0f" stroke-width="0.5"/>
      <line x1="-18" y1="0" x2="-22" y2="0" stroke="#c94a0f" stroke-width="0.5"/>
      <line x1="-18" y1="6" x2="-22" y2="6" stroke="#c94a0f" stroke-width="0.5"/>
      <line x1="18" y1="-6" x2="22" y2="-6" stroke="#c94a0f" stroke-width="0.5"/>
      <line x1="18" y1="0" x2="22" y2="0" stroke="#c94a0f" stroke-width="0.5"/>
      <line x1="18" y1="6" x2="22" y2="6" stroke="#c94a0f" stroke-width="0.5"/>
    </g>
    <text x="14" y="68" fill="#faf0e4" font-family="sans-serif" font-weight="700" font-size="11">HARDWARE SIGNS</text>
    <text x="14" y="84" fill="#d4a888" font-family="sans-serif" font-size="7.5">Secure chip cryptographically</text>
    <text x="14" y="94" fill="#d4a888" font-family="sans-serif" font-size="7.5">signs every frame the instant</text>
    <text x="14" y="104" fill="#d4a888" font-family="sans-serif" font-size="7.5">the shutter triggers.</text>
    <text x="14" y="115" fill="#ff6a1f" font-family="monospace" font-size="5" letter-spacing="1">CHIP = CREDENTIAL</text>
  </g>

  <g transform="translate(270, 112)">
    <path d="M 0 0 L 14 0 M 10 -2.5 L 14 0 L 10 2.5" stroke="#ff6a1f" stroke-width="1.2" fill="none"/>
  </g>

  <!-- STEP 02 -->
  <g transform="translate(290, 50)">
    <rect x="0" y="0" width="220" height="120" fill="#120806" stroke="#c94a0f" stroke-width="0.8"/>
    <path d="M 6 12 L 6 6 L 12 6" stroke="#ff6a1f" stroke-width="0.5" fill="none"/>
    <path d="M 208 6 L 214 6 L 214 12" stroke="#ff6a1f" stroke-width="0.5" fill="none"/>
    <text x="14" y="38" fill="#ff6a1f" font-family="monospace" font-size="18" font-weight="800">02</text>
    <line x1="14" y1="44" x2="40" y2="44" stroke="#ff6a1f" stroke-width="1"/>
    <g transform="translate(165, 22)">
      <path d="M -8 -4 Q -8 -14 0 -14 Q 8 -14 8 -4" fill="none" stroke="#ff6a1f" stroke-width="1"/>
      <rect x="-12" y="-4" width="24" height="18" fill="#1a0a05" stroke="#ff6a1f" stroke-width="0.7"/>
      <text x="0" y="8" fill="#ff6a1f" font-family="monospace" font-size="6" text-anchor="middle" font-weight="800">ZK</text>
    </g>
    <text x="14" y="68" fill="#faf0e4" font-family="sans-serif" font-weight="700" font-size="11">ZK PROOF</text>
    <text x="14" y="84" fill="#d4a888" font-family="sans-serif" font-size="7.5">zk-SNARK proves the photo</text>
    <text x="14" y="94" fill="#d4a888" font-family="sans-serif" font-size="7.5">is authentic without revealing</text>
    <text x="14" y="104" fill="#d4a888" font-family="sans-serif" font-size="7.5">any private key material.</text>
    <text x="14" y="115" fill="#ff6a1f" font-family="monospace" font-size="5" letter-spacing="1">VERIFY WITHOUT ID</text>
  </g>

  <g transform="translate(520, 112)">
    <path d="M 0 0 L 14 0 M 10 -2.5 L 14 0 L 10 2.5" stroke="#ff6a1f" stroke-width="1.2" fill="none"/>
  </g>

  <!-- STEP 03 -->
  <g transform="translate(540, 50)">
    <rect x="0" y="0" width="220" height="120" fill="#120806" stroke="#c94a0f" stroke-width="0.8"/>
    <path d="M 6 12 L 6 6 L 12 6" stroke="#ff6a1f" stroke-width="0.5" fill="none"/>
    <path d="M 208 6 L 214 6 L 214 12" stroke="#ff6a1f" stroke-width="0.5" fill="none"/>
    <text x="14" y="38" fill="#ff6a1f" font-family="monospace" font-size="18" font-weight="800">03</text>
    <line x1="14" y1="44" x2="40" y2="44" stroke="#ff6a1f" stroke-width="1"/>
    <g transform="translate(165, 22)">
      <circle cx="0" cy="0" r="3" fill="#ff6a1f"/>
      <circle cx="-14" cy="-8" r="2" fill="#c94a0f"/>
      <circle cx="14" cy="-8" r="2" fill="#c94a0f"/>
      <circle cx="-14" cy="8" r="2" fill="#c94a0f"/>
      <circle cx="14" cy="8" r="2" fill="#c94a0f"/>
      <circle cx="-20" cy="0" r="1.5" fill="#8b4513"/>
      <circle cx="20" cy="0" r="1.5" fill="#8b4513"/>
      <line x1="0" y1="0" x2="-14" y2="-8" stroke="#5a2810" stroke-width="0.4"/>
      <line x1="0" y1="0" x2="14" y2="-8" stroke="#5a2810" stroke-width="0.4"/>
      <line x1="0" y1="0" x2="-14" y2="8" stroke="#5a2810" stroke-width="0.4"/>
      <line x1="0" y1="0" x2="14" y2="8" stroke="#5a2810" stroke-width="0.4"/>
      <line x1="-14" y1="-8" x2="-20" y2="0" stroke="#5a2810" stroke-width="0.4"/>
      <line x1="14" y1="-8" x2="20" y2="0" stroke="#5a2810" stroke-width="0.4"/>
      <line x1="-14" y1="8" x2="-20" y2="0" stroke="#5a2810" stroke-width="0.4"/>
      <line x1="14" y1="8" x2="20" y2="0" stroke="#5a2810" stroke-width="0.4"/>
    </g>
    <text x="14" y="68" fill="#faf0e4" font-family="sans-serif" font-weight="700" font-size="11">FILECOIN STORAGE</text>
    <text x="14" y="84" fill="#d4a888" font-family="sans-serif" font-size="7.5">Image + proof pinned across</text>
    <text x="14" y="94" fill="#d4a888" font-family="sans-serif" font-size="7.5">a distributed storage network.</text>
    <text x="14" y="104" fill="#d4a888" font-family="sans-serif" font-size="7.5">Public. Permanent. Immutable.</text>
    <text x="14" y="115" fill="#ff6a1f" font-family="monospace" font-size="5" letter-spacing="1">ON THE RECORD, FOREVER</text>
  </g>

  <g transform="translate(770, 112)">
    <path d="M 0 0 L 14 0 M 10 -2.5 L 14 0 L 10 2.5" stroke="#ff6a1f" stroke-width="1.2" fill="none"/>
  </g>

  <!-- STEP 04 -->
  <g transform="translate(790, 50)">
    <rect x="0" y="0" width="170" height="120" fill="#1a0a05" stroke="#ff6a1f" stroke-width="1.2"/>
    <path d="M 6 12 L 6 6 L 12 6" stroke="#ff6a1f" stroke-width="0.5" fill="none"/>
    <path d="M 158 6 L 164 6 L 164 12" stroke="#ff6a1f" stroke-width="0.5" fill="none"/>
    <text x="14" y="38" fill="#ff6a1f" font-family="monospace" font-size="18" font-weight="800">04</text>
    <line x1="14" y1="44" x2="40" y2="44" stroke="#ff6a1f" stroke-width="1"/>
    <g transform="translate(125, 10)">
      <rect x="0" y="0" width="32" height="32" fill="#faf0e4"/>
      <g fill="#000">
        <rect x="2" y="2" width="8" height="8"/><rect x="4" y="4" width="4" height="4" fill="#faf0e4"/>
        <rect x="22" y="2" width="8" height="8"/><rect x="24" y="4" width="4" height="4" fill="#faf0e4"/>
        <rect x="2" y="22" width="8" height="8"/><rect x="4" y="24" width="4" height="4" fill="#faf0e4"/>
        <rect x="12" y="4" width="2" height="2"/><rect x="16" y="8" width="2" height="2"/>
        <rect x="12" y="12" width="2" height="2"/><rect x="18" y="14" width="2" height="2"/>
        <rect x="14" y="18" width="2" height="2"/><rect x="20" y="16" width="2" height="2"/>
        <rect x="24" y="18" width="2" height="2"/><rect x="22" y="22" width="2" height="2"/>
        <rect x="26" y="24" width="2" height="2"/><rect x="28" y="28" width="2" height="2"/>
      </g>
    </g>
    <text x="14" y="68" fill="#faf0e4" font-family="sans-serif" font-weight="700" font-size="11">QR + NFT</text>
    <text x="14" y="84" fill="#d4a888" font-family="sans-serif" font-size="7.5">Each photo gets a scannable</text>
    <text x="14" y="94" fill="#d4a888" font-family="sans-serif" font-size="7.5">QR + NFT - anyone can verify,</text>
    <text x="14" y="104" fill="#d4a888" font-family="sans-serif" font-size="7.5">creators can claim ownership.</text>
    <text x="14" y="115" fill="#ff6a1f" font-family="monospace" font-size="5" letter-spacing="1">SCAN . VERIFY . OWN</text>
  </g>
</g>

<!-- DIVIDER -->
<g transform="translate(0, 800)">
  <line x1="22" y1="0" x2="978" y2="0" stroke="#3a1810" stroke-width="0.4"/>
  <rect x="40" y="-2" width="80" height="4" fill="#ff6a1f"/>
  <text x="132" y="2" fill="#ff6a1f" font-family="monospace" font-size="7" letter-spacing="4">03 // UNDER THE HOOD</text>
  <text x="966" y="2" fill="#8b4513" font-family="monospace" font-size="5" text-anchor="end" letter-spacing="2">FRAME 003 / 004</text>
</g>

<!-- ====== 3-COLUMN DETAILS (y 815-910) ====== -->
<g transform="translate(0, 815)">

  <!-- HARDWARE -->
  <g transform="translate(40, 0)">
    <rect x="0" y="0" width="290" height="90" fill="#120806" stroke="#3a1810" stroke-width="0.5"/>
    <text x="12" y="14" fill="#ff6a1f" font-family="monospace" font-size="6" letter-spacing="3">HARDWARE</text>

    <g transform="translate(40, 22)">
      <line x1="0" y1="0" x2="0" y2="60" stroke="#3a1810" stroke-width="0.3" stroke-dasharray="1,1.5"/>

      <circle cx="0" cy="6" r="5" fill="#0a0503" stroke="#c94a0f" stroke-width="0.5"/>
      <circle cx="0" cy="6" r="2.2" fill="#000"/>
      <circle cx="0" cy="6" r="0.9" fill="#ff6a1f"/>
      <line x1="5" y1="6" x2="20" y2="6" stroke="#3a1810" stroke-width="0.3"/>
      <text x="22" y="4.5" fill="#faf0e4" font-family="sans-serif" font-weight="600" font-size="6">CMOS Lens</text>
      <text x="22" y="9.5" fill="#8b4513" font-family="monospace" font-size="4.5">24mm . f/2.8</text>

      <rect x="-9" y="20" width="18" height="7" fill="#0f3a0f" stroke="#ff6a1f" stroke-width="0.3"/>
      <rect x="-6" y="22" width="3" height="3" fill="#1a0000"/>
      <rect x="2" y="22" width="3" height="3" fill="#1a0000"/>
      <circle cx="-8" cy="23.5" r="0.3" fill="#c94a0f"/>
      <circle cx="8" cy="23.5" r="0.3" fill="#c94a0f"/>
      <line x1="9" y1="23.5" x2="20" y2="23.5" stroke="#3a1810" stroke-width="0.3"/>
      <text x="22" y="22" fill="#faf0e4" font-family="sans-serif" font-weight="600" font-size="6">Raspberry Pi 4</text>
      <text x="22" y="27" fill="#8b4513" font-family="monospace" font-size="4.5">compute . sign</text>

      <rect x="-9" y="34" width="18" height="6" fill="#1a0a05" stroke="#c94a0f" stroke-width="0.3"/>
      <rect x="-7" y="35" width="14" height="4" fill="#050302"/>
      <text x="0" y="38" fill="#ff6a1f" font-family="monospace" font-size="2.2" text-anchor="middle">LIVE</text>
      <line x1="-9" y1="37" x2="-20" y2="37" stroke="#3a1810" stroke-width="0.3"/>
      <text x="-22" y="35.5" fill="#faf0e4" font-family="sans-serif" font-weight="600" font-size="6" text-anchor="end">Touchscreen</text>
      <text x="-22" y="40.5" fill="#8b4513" font-family="monospace" font-size="4.5" text-anchor="end">HDMI preview</text>

      <rect x="-8" y="48" width="16" height="7" fill="#1a0000" stroke="#ff6a1f" stroke-width="0.5"/>
      <rect x="-6" y="49.5" width="12" height="4" fill="#2a0808"/>
      <text x="0" y="53" fill="#ff6a1f" font-family="monospace" font-size="2.7" text-anchor="middle" font-weight="700">ZK</text>
      <line x1="8" y1="51.5" x2="20" y2="51.5" stroke="#3a1810" stroke-width="0.3"/>
      <text x="22" y="50" fill="#faf0e4" font-family="sans-serif" font-weight="600" font-size="6">ZK Circuit</text>
      <text x="22" y="55" fill="#8b4513" font-family="monospace" font-size="4.5">proves privately</text>
    </g>
  </g>

  <!-- TECH STACK -->
  <g transform="translate(355, 0)">
    <rect x="0" y="0" width="290" height="90" fill="#120806" stroke="#3a1810" stroke-width="0.5"/>
    <text x="12" y="14" fill="#ff6a1f" font-family="monospace" font-size="6" letter-spacing="3">TECH STACK</text>

    <g transform="translate(12, 22)">
      <text x="0" y="0" fill="#8b4513" font-family="monospace" font-size="4.5" letter-spacing="2">CHAIN</text>
      <rect x="0" y="3" width="48" height="8" fill="none" stroke="#ff6a1f" stroke-width="0.4"/>
      <text x="24" y="8.8" fill="#ff6a1f" font-family="monospace" font-size="4.5" text-anchor="middle" font-weight="700">SOLIDITY</text>
      <rect x="52" y="3" width="62" height="8" fill="none" stroke="#ff6a1f" stroke-width="0.4"/>
      <text x="83" y="8.8" fill="#ff6a1f" font-family="monospace" font-size="4.5" text-anchor="middle" font-weight="700">ETH SEPOLIA</text>

      <text x="0" y="20" fill="#8b4513" font-family="monospace" font-size="4.5" letter-spacing="2">CRYPTO</text>
      <rect x="0" y="23" width="50" height="8" fill="none" stroke="#ff6a1f" stroke-width="0.4"/>
      <text x="25" y="28.8" fill="#ff6a1f" font-family="monospace" font-size="4.5" text-anchor="middle" font-weight="700">zk-SNARK</text>
      <rect x="54" y="23" width="60" height="8" fill="none" stroke="#ff6a1f" stroke-width="0.4"/>
      <text x="84" y="28.8" fill="#ff6a1f" font-family="monospace" font-size="4" text-anchor="middle" font-weight="700">CIRCOM/ZoKrates</text>

      <text x="0" y="40" fill="#8b4513" font-family="monospace" font-size="4.5" letter-spacing="2">STORAGE</text>
      <rect x="0" y="43" width="50" height="8" fill="none" stroke="#ff6a1f" stroke-width="0.4"/>
      <text x="25" y="48.8" fill="#ff6a1f" font-family="monospace" font-size="4.5" text-anchor="middle" font-weight="700">FILECOIN</text>
      <rect x="54" y="43" width="32" height="8" fill="none" stroke="#ff6a1f" stroke-width="0.4"/>
      <text x="70" y="48.8" fill="#ff6a1f" font-family="monospace" font-size="4.5" text-anchor="middle" font-weight="700">IPFS</text>

      <text x="135" y="0" fill="#8b4513" font-family="monospace" font-size="4.5" letter-spacing="2">DEVICE</text>
      <rect x="135" y="3" width="68" height="8" fill="none" stroke="#ff6a1f" stroke-width="0.4"/>
      <text x="169" y="8.8" fill="#ff6a1f" font-family="monospace" font-size="4.5" text-anchor="middle" font-weight="700">RASPBERRY Pi 4</text>

      <text x="135" y="20" fill="#8b4513" font-family="monospace" font-size="4.5" letter-spacing="2">LANG</text>
      <rect x="135" y="23" width="32" height="8" fill="none" stroke="#ff6a1f" stroke-width="0.4"/>
      <text x="151" y="28.8" fill="#ff6a1f" font-family="monospace" font-size="4.5" text-anchor="middle" font-weight="700">PYTHON</text>
      <rect x="171" y="23" width="32" height="8" fill="none" stroke="#ff6a1f" stroke-width="0.4"/>
      <text x="187" y="28.8" fill="#ff6a1f" font-family="monospace" font-size="4.5" text-anchor="middle" font-weight="700">JS</text>

      <text x="135" y="40" fill="#8b4513" font-family="monospace" font-size="4.5" letter-spacing="2">FRAMEWORK</text>
      <rect x="135" y="43" width="40" height="8" fill="none" stroke="#ff6a1f" stroke-width="0.4"/>
      <text x="155" y="48.8" fill="#ff6a1f" font-family="monospace" font-size="4.5" text-anchor="middle" font-weight="700">HARDHAT</text>
    </g>
  </g>

  <!-- USE CASES -->
  <g transform="translate(670, 0)">
    <rect x="0" y="0" width="290" height="90" fill="#120806" stroke="#3a1810" stroke-width="0.5"/>
    <text x="12" y="14" fill="#ff6a1f" font-family="monospace" font-size="6" letter-spacing="3">WHO IT'S FOR</text>

    <g transform="translate(12, 22)">
      <rect x="0" y="0" width="12" height="12" fill="none" stroke="#ff6a1f" stroke-width="0.4"/>
      <line x1="2" y1="3" x2="10" y2="3" stroke="#ff6a1f" stroke-width="0.4"/>
      <line x1="2" y1="6" x2="10" y2="6" stroke="#c94a0f" stroke-width="0.3"/>
      <line x1="2" y1="8" x2="10" y2="8" stroke="#c94a0f" stroke-width="0.3"/>
      <line x1="2" y1="10" x2="7" y2="10" stroke="#c94a0f" stroke-width="0.3"/>
      <text x="18" y="5" fill="#faf0e4" font-family="sans-serif" font-weight="800" font-size="8">JOURNALISM</text>
      <text x="18" y="10" fill="#d4a888" font-family="sans-serif" font-size="5.5">Verified news photography with built-in</text>
      <text x="18" y="14.5" fill="#d4a888" font-family="sans-serif" font-size="5.5">proof-of-origin.</text>
    </g>

    <g transform="translate(12, 44)">
      <rect x="0" y="0" width="12" height="12" fill="none" stroke="#ff6a1f" stroke-width="0.4"/>
      <circle cx="6" cy="6" r="2.5" fill="none" stroke="#ff6a1f" stroke-width="0.4"/>
      <ellipse cx="6" cy="6" rx="4" ry="1.5" fill="none" stroke="#c94a0f" stroke-width="0.3"/>
      <ellipse cx="6" cy="6" rx="4" ry="1.5" fill="none" stroke="#c94a0f" stroke-width="0.3" transform="rotate(60 6 6)"/>
      <ellipse cx="6" cy="6" rx="4" ry="1.5" fill="none" stroke="#c94a0f" stroke-width="0.3" transform="rotate(120 6 6)"/>
      <text x="18" y="5" fill="#faf0e4" font-family="sans-serif" font-weight="800" font-size="8">SCIENCE</text>
      <text x="18" y="10" fill="#d4a888" font-family="sans-serif" font-size="5.5">Tamper-proof research imagery -</text>
      <text x="18" y="14.5" fill="#d4a888" font-family="sans-serif" font-size="5.5">observations that can be trusted.</text>
    </g>

    <g transform="translate(12, 66)">
      <rect x="0" y="0" width="12" height="12" fill="none" stroke="#ff6a1f" stroke-width="0.4"/>
      <line x1="6" y1="2" x2="6" y2="10" stroke="#ff6a1f" stroke-width="0.5"/>
      <line x1="2" y1="4" x2="10" y2="4" stroke="#ff6a1f" stroke-width="0.5"/>
      <circle cx="3" cy="6" r="1" fill="none" stroke="#c94a0f" stroke-width="0.3"/>
      <circle cx="9" cy="6" r="1" fill="none" stroke="#c94a0f" stroke-width="0.3"/>
      <line x1="4" y1="10" x2="8" y2="10" stroke="#c94a0f" stroke-width="0.3"/>
      <text x="18" y="5" fill="#faf0e4" font-family="sans-serif" font-weight="800" font-size="8">LAW</text>
      <text x="18" y="10" fill="#d4a888" font-family="sans-serif" font-size="5.5">Digital evidence that's admissible -</text>
      <text x="18" y="14.5" fill="#d4a888" font-family="sans-serif" font-size="5.5">cryptographic chain-of-custody.</text>
    </g>
  </g>
</g>

<!-- DIVIDER -->
<g transform="translate(0, 922)">
  <line x1="22" y1="0" x2="978" y2="0" stroke="#3a1810" stroke-width="0.4"/>
  <rect x="40" y="-2" width="80" height="4" fill="#ff6a1f"/>
  <text x="132" y="2" fill="#ff6a1f" font-family="monospace" font-size="7" letter-spacing="4">04 // STATUS + TEAM + CONTACT</text>
  <text x="966" y="2" fill="#8b4513" font-family="monospace" font-size="5" text-anchor="end" letter-spacing="2">FRAME 004 / 004</text>
</g>

<!-- ====== STATUS / TEAM / QR (y 935-985) ====== -->
<g transform="translate(0, 935)">
  <!-- STATUS -->
  <g transform="translate(40, 0)">
    <text x="0" y="10" fill="#ff6a1f" font-family="monospace" font-size="6" letter-spacing="3">SHIP STATUS</text>
    <g transform="translate(0, 16)">
      <circle cx="2" cy="2.5" r="1.4" fill="#ff6a1f"/>
      <path d="M 0.7 2.8 L 1.5 3.6 L 3.3 1.8" stroke="#000" stroke-width="0.5" fill="none"/>
      <text x="8" y="4" fill="#faf0e4" font-family="monospace" font-size="5.5">Contracts live on Sepolia</text>

      <circle cx="2" cy="11.5" r="1.4" fill="#ff6a1f"/>
      <path d="M 0.7 11.8 L 1.5 12.6 L 3.3 10.8" stroke="#000" stroke-width="0.5" fill="none"/>
      <text x="8" y="13" fill="#faf0e4" font-family="monospace" font-size="5.5">ZK circuit integrated</text>

      <circle cx="2" cy="20.5" r="1.4" fill="#ff6a1f"/>
      <path d="M 0.7 20.8 L 1.5 21.6 L 3.3 19.8" stroke="#000" stroke-width="0.5" fill="none"/>
      <text x="8" y="22" fill="#faf0e4" font-family="monospace" font-size="5.5">Pipeline end-to-end tested</text>

      <circle cx="2" cy="29.5" r="1.4" fill="#ff6a1f"/>
      <path d="M 0.7 29.8 L 1.5 30.6 L 3.3 28.8" stroke="#000" stroke-width="0.5" fill="none"/>
      <text x="8" y="31" fill="#faf0e4" font-family="monospace" font-size="5.5">Hardware prototype built</text>
    </g>
  </g>

  <!-- TEAM -->
  <g transform="translate(390, 0)">
    <text x="0" y="10" fill="#ff6a1f" font-family="monospace" font-size="6" letter-spacing="3">BUILT BY</text>
    <g transform="translate(0, 18)">
      <circle cx="4" cy="4" r="3.5" fill="none" stroke="#ff6a1f" stroke-width="0.6"/>
      <text x="4" y="5.8" fill="#ff6a1f" font-family="sans-serif" font-size="4" text-anchor="middle" font-weight="700">UD</text>
      <text x="11" y="3" fill="#faf0e4" font-family="sans-serif" font-weight="700" font-size="7">Umpil Dixit</text>
      <text x="11" y="7.5" fill="#d4a888" font-family="monospace" font-size="4.5">umpildixit@gmail.com</text>

      <circle cx="4" cy="17" r="3.5" fill="none" stroke="#ff6a1f" stroke-width="0.6"/>
      <text x="4" y="18.8" fill="#ff6a1f" font-family="sans-serif" font-size="4" text-anchor="middle" font-weight="700">AP</text>
      <text x="11" y="16" fill="#faf0e4" font-family="sans-serif" font-weight="700" font-size="7">Aditya Dust Pandey</text>
      <text x="11" y="20.5" fill="#d4a888" font-family="monospace" font-size="4.5">adityapandey@gmail.com</text>
    </g>
  </g>

  <!-- QR CONTACT -->
  <g transform="translate(800, 0)">
    <text x="160" y="10" fill="#ff6a1f" font-family="monospace" font-size="6" letter-spacing="3" text-anchor="end">SCAN TO LEARN MORE</text>
    <g transform="translate(115, 14)">
      <path d="M -2 2 L -2 -2 L 2 -2" stroke="#ff6a1f" stroke-width="0.7" fill="none"/>
      <path d="M 42 -2 L 46 -2 L 46 2" stroke="#ff6a1f" stroke-width="0.7" fill="none"/>
      <path d="M -2 40 L -2 44 L 2 44" stroke="#ff6a1f" stroke-width="0.7" fill="none"/>
      <path d="M 42 44 L 46 44 L 46 40" stroke="#ff6a1f" stroke-width="0.7" fill="none"/>
      <rect x="0" y="0" width="44" height="42" fill="#faf0e4"/>
      <g fill="#000">
        <rect x="2" y="2" width="10" height="10"/><rect x="4" y="4" width="6" height="6" fill="#faf0e4"/><rect x="5.5" y="5.5" width="3" height="3"/>
        <rect x="32" y="2" width="10" height="10"/><rect x="34" y="4" width="6" height="6" fill="#faf0e4"/><rect x="35.5" y="5.5" width="3" height="3"/>
        <rect x="2" y="30" width="10" height="10"/><rect x="4" y="32" width="6" height="6" fill="#faf0e4"/><rect x="5.5" y="33.5" width="3" height="3"/>
        <rect x="14" y="2" width="1.5" height="1.5"/><rect x="18" y="2" width="1.5" height="1.5"/><rect x="22" y="4" width="1.5" height="1.5"/><rect x="26" y="2" width="1.5" height="1.5"/>
        <rect x="16" y="6" width="1.5" height="1.5"/><rect x="20" y="8" width="1.5" height="1.5"/><rect x="24" y="6" width="1.5" height="1.5"/><rect x="28" y="8" width="1.5" height="1.5"/>
        <rect x="2" y="14" width="1.5" height="1.5"/><rect x="4" y="18" width="1.5" height="1.5"/><rect x="2" y="22" width="1.5" height="1.5"/><rect x="4" y="26" width="1.5" height="1.5"/>
        <rect x="6" y="16" width="1.5" height="1.5"/><rect x="8" y="20" width="1.5" height="1.5"/><rect x="6" y="24" width="1.5" height="1.5"/>
        <rect x="14" y="14" width="1.5" height="1.5"/><rect x="18" y="16" width="1.5" height="1.5"/><rect x="22" y="14" width="1.5" height="1.5"/><rect x="26" y="18" width="1.5" height="1.5"/><rect x="30" y="14" width="1.5" height="1.5"/><rect x="34" y="16" width="1.5" height="1.5"/><rect x="38" y="14" width="1.5" height="1.5"/>
        <rect x="16" y="20" width="1.5" height="1.5"/><rect x="20" y="22" width="1.5" height="1.5"/><rect x="24" y="20" width="1.5" height="1.5"/><rect x="28" y="24" width="1.5" height="1.5"/><rect x="32" y="20" width="1.5" height="1.5"/><rect x="36" y="22" width="1.5" height="1.5"/><rect x="40" y="20" width="1.5" height="1.5"/>
        <rect x="14" y="26" width="1.5" height="1.5"/><rect x="18" y="28" width="1.5" height="1.5"/><rect x="22" y="26" width="1.5" height="1.5"/><rect x="26" y="30" width="1.5" height="1.5"/><rect x="30" y="26" width="1.5" height="1.5"/><rect x="34" y="28" width="1.5" height="1.5"/><rect x="38" y="26" width="1.5" height="1.5"/>
        <rect x="14" y="32" width="1.5" height="1.5"/><rect x="18" y="34" width="1.5" height="1.5"/><rect x="22" y="32" width="1.5" height="1.5"/><rect x="26" y="36" width="1.5" height="1.5"/><rect x="30" y="32" width="1.5" height="1.5"/><rect x="34" y="34" width="1.5" height="1.5"/><rect x="38" y="32" width="1.5" height="1.5"/>
        <rect x="14" y="38" width="1.5" height="1.5"/><rect x="22" y="38" width="1.5" height="1.5"/><rect x="30" y="38" width="1.5" height="1.5"/><rect x="38" y="38" width="1.5" height="1.5"/>
        <rect x="32" y="14" width="1.5" height="1.5"/><rect x="36" y="18" width="1.5" height="1.5"/><rect x="32" y="22" width="1.5" height="1.5"/><rect x="36" y="24" width="1.5" height="1.5"/>
        <rect x="32" y="32" width="4" height="4"/>
        <rect x="38" y="34" width="1.5" height="1.5"/><rect x="40" y="38" width="1.5" height="1.5"/>
      </g>
    </g>
    <text x="160" y="66" fill="#d4a888" font-family="monospace" font-size="4.5" text-anchor="end">veris.cam / docs / demo</text>
  </g>
</g>

<!-- BOTTOM HUD -->
<g transform="translate(0, 990)">
  <line x1="22" y1="0" x2="978" y2="0" stroke="#3a1810" stroke-width="0.4"/>
  <circle cx="34" cy="6" r="1.5" fill="#ff6a1f"/>
  <text x="42" y="7.5" fill="#ff6a1f" font-family="monospace" font-size="4.5" letter-spacing="2">VERIS.CAM // PROVES REALITY</text>
  <text x="500" y="7.5" fill="#8b4513" font-family="monospace" font-size="4.5" letter-spacing="2" text-anchor="middle">- DOESN'T JUST CAPTURE REALITY. IT PROVES IT. -</text>
  <text x="966" y="7.5" fill="#ff6a1f" font-family="monospace" font-size="4.5" letter-spacing="2" text-anchor="end">© 2026 . MVP LIVE</text>
</g>

</svg>'''


def main():
    os.makedirs('/mnt/user-data/outputs', exist_ok=True)

    with open('/home/claude/veris_poster.svg', 'w') as f:
        f.write(SVG)
    print(f"SVG: {len(SVG)/1024:.1f} KB")

    # Clean previous outputs
    for old in os.listdir('/mnt/user-data/outputs'):
        os.remove(f'/mnt/user-data/outputs/{old}')

    pdf_path = '/mnt/user-data/outputs/VERIS_POSTER_1x1m_PRINT.pdf'
    cairosvg.svg2pdf(bytestring=SVG.encode('utf-8'), write_to=pdf_path)
    print(f"PDF: {os.path.getsize(pdf_path)/1024:.1f} KB")

    png_path = '/mnt/user-data/outputs/VERIS_POSTER_1x1m_preview.png'
    cairosvg.svg2png(bytestring=SVG.encode('utf-8'),
                     output_width=3000, output_height=3000,
                     write_to=png_path)
    print(f"PNG: {os.path.getsize(png_path)/1024:.1f} KB")


if __name__ == '__main__':
    main()
