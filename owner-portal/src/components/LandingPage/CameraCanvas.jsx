import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

export default function CameraCanvas() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15

    const scene = new THREE.Scene()

    // Angled so the top face (with fan + camera square) is clearly visible
    const cam3d = new THREE.PerspectiveCamera(28, 1, 0.1, 80)
    cam3d.position.set(1.5, 1.8, 8.5)
    cam3d.lookAt(0.0, 0.2, 0)

    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight
      renderer.setSize(w, h, false)
      cam3d.aspect = w / h
      cam3d.updateProjectionMatrix()
    }
    resize()
    window.addEventListener('resize', resize)

    // ── Lighting ──────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffe8d0, 0.30))

    const key = new THREE.DirectionalLight(0xfff5ee, 2.8)
    key.position.set(-4, 10, 7)
    key.castShadow = true
    scene.add(key)

    // Strong top light — illuminates the fan + camera housing on top face
    const topLight = new THREE.DirectionalLight(0xffffff, 2.0)
    topLight.position.set(1, 14, 2)
    scene.add(topLight)

    const frontFill = new THREE.DirectionalLight(0xffffff, 1.6)
    frontFill.position.set(1, 2, 10)
    scene.add(frontFill)

    // Tight front spotlight to dramatise the VERIS label panel
    const frontSpot = new THREE.SpotLight(0xfff0e0, 2.2, 14, Math.PI / 7, 0.45)
    frontSpot.position.set(-0.6, 0.5, 8)
    frontSpot.target.position.set(-0.6, 0, 0)
    scene.add(frontSpot)
    scene.add(frontSpot.target)

    const rim = new THREE.DirectionalLight(0xff9944, 1.4)
    rim.position.set(6, 3, -3)
    scene.add(rim)

    const screenGlow = new THREE.PointLight(0x44ff88, 1.2, 6)
    screenGlow.position.set(0, 0, -4.5)
    scene.add(screenGlow)

    // ── Materials ─────────────────────────────────────────
    const matOrange = new THREE.MeshPhysicalMaterial({
      color: 0xff5200,
      roughness: 0.68,
      metalness: 0.0,
      clearcoat: 0.55,
      clearcoatRoughness: 0.30,
    })
    const matDark = new THREE.MeshStandardMaterial({
      color: 0x050505,
      roughness: 0.92,
    })
    const matGlass = new THREE.MeshPhysicalMaterial({
      color: 0x020408,
      roughness: 0.0,
      metalness: 0.0,
      transmission: 0.65,
      thickness: 0.4,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
    })
    const matBlade   = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.75, metalness: 0.15 })
    const matFanRing = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.78 })
    const matBlackLine = new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 0.88 })

    // ── Device group ──────────────────────────────────────
    const dev = new THREE.Group()
    dev.rotation.y = -0.2
    dev.rotation.x = 0.06
    dev.scale.set(0.78, 0.78, 0.78)
    scene.add(dev)

    // ── Dimensions — LANDSCAPE, RPi-sized ─────────────────
    const BW = 3.5   // width  (landscape long axis)
    const BH = 2.0   // height
    const BD = 1.30  // depth  (front–back)

    // Camera housing square: RIGHT side of top face
    const CHW = 0.80
    const CHH = 0.78  // protrudes above body top
    const CX  =  BW / 2 - CHW / 2   // right-aligned
    // Sink housing 0.12 into body so junction is fully hidden inside both meshes
    const CY  =  BH / 2 + CHH / 2 - 0.12

    // ── Main body ─────────────────────────────────────────
    const body = new THREE.Mesh(new RoundedBoxGeometry(BW, BH, BD, 4, 0.07), matOrange)
    body.castShadow = true
    dev.add(body)

    // ── Camera housing — same material, overlaps body top ──
    // Overlap hides rounded-corner seam so they read as one solid piece
    const camHouse = new THREE.Mesh(new RoundedBoxGeometry(CHW, CHH, BD, 4, 0.055), matOrange)
    camHouse.position.set(CX, CY, 0)
    camHouse.castShadow = true
    dev.add(camHouse)

    // ── Camera opening — front face of housing ────────────
    const CFZ = BD / 2

    // Dark surround ring
    const camSurround = new THREE.Mesh(
      new THREE.CylinderGeometry(0.27, 0.27, 0.036, 56),
      matDark
    )
    camSurround.rotation.x = Math.PI / 2
    camSurround.position.set(CX, CY, CFZ + 0.010)
    dev.add(camSurround)

    // Lens glass
    const camLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.20, 0.20, 0.026, 56),
      matGlass
    )
    camLens.rotation.x = Math.PI / 2
    camLens.position.set(CX, CY, CFZ + 0.020)
    dev.add(camLens)

    // Lens reflection
    const refl = new THREE.Mesh(
      new THREE.CircleGeometry(0.07, 32),
      new THREE.MeshBasicMaterial({ color: 0x1144cc, transparent: true, opacity: 0.55 })
    )
    refl.position.set(CX + 0.05, CY + 0.05, CFZ + 0.034)
    dev.add(refl)

    // ── Fan — left side face (X = -BW/2) ─────────────────
    // Fan faces outward in the -X direction, fills the side face
    const fanSX = -BW / 2

    // Dark backing disc flush with side face
    const fanBack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.56, 0.56, 0.026, 64),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.90 })
    )
    fanBack.rotation.z = Math.PI / 2
    fanBack.position.set(fanSX - 0.006, 0, 0)
    dev.add(fanBack)

    // Orange outer ring
    const fanRingMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.58, 0.034, 12, 64),
      matFanRing
    )
    fanRingMesh.rotation.y = Math.PI / 2
    fanRingMesh.position.set(fanSX - 0.008, 0, 0)
    dev.add(fanRingMesh)

    // Spinning blades group — rotates around X axis (fan faces -X)
    const fanGroup = new THREE.Group()
    fanGroup.position.set(fanSX - 0.012, 0, 0)
    dev.add(fanGroup)

    // Properly oriented blades: long axis points radially outward, pitched to push air
    // Fan is in the YZ plane (faces -X). For blade at angle a:
    //   rotation.x = PI/2 - a  → makes local Y axis point radially at angle a
    //   rotation.y = pitch      → tilts blade around radial axis (true fan pitch)
    const innerR = 0.10, outerR = 0.48
    const midR = (innerR + outerR) / 2    // 0.29 — blade center radius
    const bladeLen = outerR - innerR       // 0.38 — radial span
    const pitch = 0.38                    // ~22° pitch, realistic fan angle

    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.016, bladeLen, 0.115),
        matBlade
      )
      // Place blade center at mid-radius in the radial direction
      blade.position.set(0, Math.sin(a) * midR, Math.cos(a) * midR)
      // Orient: X rotation puts Y axis radially, Y rotation adds pitch
      blade.rotation.set(Math.PI / 2 - a, pitch, 0)
      fanGroup.add(blade)
    }

    // Fan center hub
    const hubMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.065, 0.030, 20),
      new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.55 })
    )
    hubMesh.rotation.z = Math.PI / 2
    hubMesh.position.set(fanSX - 0.012, 0, 0)
    dev.add(hubMesh)

    // ── Vents — right side face (X = +BW/2), opposite the fan ──
    const ventX = BW / 2
    const ventRows = 7
    const ventMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.95 })
    const ventSpacing = 0.13
    const ventGroupH = ventSpacing * (ventRows - 1)
    for (let i = 0; i < ventRows; i++) {
      const vy = -ventGroupH / 2 + i * ventSpacing
      const slot = new THREE.Mesh(
        new THREE.BoxGeometry(0.036, 0.062, 0.55),
        ventMat
      )
      slot.position.set(ventX - 0.005, vy, 0)
      dev.add(slot)
    }

    // ── Display — BACK face (Z = -BD/2), opposite the camera ─
    const dW = 2.60, dH = 1.55

    // Thin black bezel
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(dW + 0.08, dH + 0.08, 0.018),
      new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.85, metalness: 0.1 })
    )
    bezel.position.set(0, 0, -(BD / 2 + 0.007))
    dev.add(bezel)

    // Screen canvas — live camera viewfinder UI, white/green palette
    const sW = 512, sH = 336
    const scrCanv = document.createElement('canvas')
    scrCanv.width = sW; scrCanv.height = sH
    const ctx = scrCanv.getContext('2d')

    // Rich black background — looks like a real lit display
    ctx.fillStyle = '#030805'
    ctx.fillRect(0, 0, sW, sH)

    // Very subtle green vignette to sell the "on" feel
    const vgn = ctx.createRadialGradient(sW/2, sH/2, sH*0.2, sW/2, sH/2, sH*0.85)
    vgn.addColorStop(0, 'rgba(0,255,100,0.04)')
    vgn.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = vgn; ctx.fillRect(0, 0, sW, sH)

    // ── Viewfinder border ─────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1
    ctx.strokeRect(16, 46, sW - 32, sH - 90)

    // Corner brackets — white
    ;[[16,46],[sW-16,46],[16,sH-44],[sW-16,sH-44]].forEach(([cx,cy],i) => {
      const sx = i%2===0?1:-1, sy = i<2?1:-1
      ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(cx,cy+sy*28); ctx.lineTo(cx,cy); ctx.lineTo(cx+sx*28,cy); ctx.stroke()
    })

    // ── AF focus bracket (centre) ─────────────────────────
    const mx = sW/2, my = (sH - 82)/2 + 46
    const fb = 42
    ;[[mx-fb,my-fb],[mx+fb,my-fb],[mx-fb,my+fb],[mx+fb,my+fb]].forEach(([fx,fy],i) => {
      const sx = i%2===0?1:-1, sy = i<2?1:-1
      ctx.strokeStyle = 'rgba(80,255,140,1)'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(fx,fy+sy*16); ctx.lineTo(fx,fy); ctx.lineTo(fx+sx*16,fy); ctx.stroke()
    })

    // ── Centre crosshair ──────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.88)'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(mx-20,my); ctx.lineTo(mx-5,my); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(mx+5,my);  ctx.lineTo(mx+20,my); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(mx,my-20); ctx.lineTo(mx,my-5); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(mx,my+5);  ctx.lineTo(mx,my+20); ctx.stroke()
    ctx.fillStyle='rgba(255,255,255,0.95)'
    ctx.beginPath(); ctx.arc(mx,my,2.5,0,Math.PI*2); ctx.fill()

    // ── "CLICK FOR A PICTURE" prompt ─────────────────────
    // Green pill button
    const btnW=188, btnH=30, btnY=my+58
    ctx.fillStyle='rgba(50,220,100,0.22)'
    ctx.strokeStyle='rgba(80,255,140,0.90)'; ctx.lineWidth=1.5
    ctx.beginPath(); ctx.roundRect(mx-btnW/2, btnY-btnH/2, btnW, btnH, 5)
    ctx.fill(); ctx.stroke()
    ctx.fillStyle='#ffffff'; ctx.font='bold 13px monospace'
    ctx.textAlign='center'; ctx.textBaseline='middle'
    ctx.fillText('CLICK FOR A PICTURE', mx, btnY)

    // ── Top status bar ────────────────────────────────────
    ctx.fillStyle='rgba(0,0,0,0.82)'; ctx.fillRect(0, 0, sW, 42)
    // Blinking REC dot (green)
    ctx.fillStyle='#44ff88'; ctx.beginPath(); ctx.arc(22,21,5,0,Math.PI*2); ctx.fill()
    ctx.fillStyle='#ffffff'; ctx.font='bold 12px monospace'
    ctx.textAlign='left'; ctx.textBaseline='middle'
    ctx.fillText('REC', 32, 21)
    // Camera params — white
    ctx.fillStyle='rgba(255,255,255,0.80)'; ctx.font='11px monospace'
    ctx.fillText('f/1.8   1/1000s   ISO 800', 90, 21)
    // Resolution tag — green
    ctx.fillStyle='#44ff88'; ctx.font='bold 11px monospace'
    ctx.fillText('4K', 360, 21)
    ctx.fillStyle='rgba(255,255,255,0.60)'; ctx.font='11px monospace'
    ctx.fillText('RAW', 382, 21)
    // Timestamp
    ctx.fillStyle='rgba(255,255,255,0.50)'; ctx.font='10px monospace'
    ctx.textAlign='right'
    ctx.fillText('00:00:00', sW-14, 21)

    // ── Bottom status bar ─────────────────────────────────
    ctx.fillStyle='rgba(0,0,0,0.82)'; ctx.fillRect(0, sH-42, sW, 42)
    ctx.textAlign='left'; ctx.textBaseline='middle'
    // VERIS label — white
    ctx.fillStyle='#ffffff'; ctx.font='bold 13px monospace'
    ctx.fillText('VERIS', 14, sH-21)
    // Cam id — green
    ctx.fillStyle='#44ff88'; ctx.font='11px monospace'
    ctx.fillText('CAM-01', 76, sH-21)
    ctx.fillStyle='rgba(255,255,255,0.50)'; ctx.font='10px monospace'
    ctx.fillText('0042 / ∞', 146, sH-21)
    // Battery — green
    ctx.strokeStyle='rgba(80,255,140,0.90)'; ctx.lineWidth=1.5
    ctx.strokeRect(sW-68, sH-32, 48, 20); ctx.strokeRect(sW-20, sH-27, 5, 10)
    ctx.fillStyle='rgba(80,255,140,0.90)'
    ctx.fillRect(sW-66, sH-30, 40, 16)

    const scrTex = new THREE.CanvasTexture(scrCanv)
    scrTex.needsUpdate = true

    const displayMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(dW, dH),
      // flipY so texture reads correctly when viewed from behind
      new THREE.MeshBasicMaterial({ map: scrTex, side: THREE.FrontSide })
    )
    // Rotate 180° on Y so the plane faces outward from the back face
    displayMesh.rotation.y = Math.PI
    displayMesh.position.set(0, 0, -(BD / 2 + 0.022))
    dev.add(displayMesh)

    // Screen edge glow
    const scrGlowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(dW + 0.25, dH + 0.25),
      new THREE.MeshBasicMaterial({ color: 0x00cc55, transparent: true, opacity: 0.09, depthWrite: false })
    )
    scrGlowMesh.rotation.y = Math.PI
    scrGlowMesh.position.set(0, 0, -(BD / 2 + 0.020))
    dev.add(scrGlowMesh)

    // ── Front face detail — real camera style ─────────────────
    const frontZ = BD / 2 + 0.006

    // ── Raised brand panel — dark recessed slab behind VERIS ──
    const brandPanel = new THREE.Mesh(
      new THREE.BoxGeometry(1.72, 0.52, 0.010),
      new THREE.MeshPhysicalMaterial({ color: 0x080808, roughness: 0.50, metalness: 0.10, clearcoat: 0.4 })
    )
    brandPanel.position.set(-0.55, 0.08, frontZ - 0.003)
    dev.add(brandPanel)

    // Thin orange left-edge accent on brand panel
    const panelAccent = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.52, 0.013),
      new THREE.MeshPhysicalMaterial({ color: 0xff4400, roughness: 0.38, metalness: 0.0, clearcoat: 1.0 })
    )
    panelAccent.position.set(-0.55 - 1.72/2 + 0.009, 0.08, frontZ)
    dev.add(panelAccent)

    // ── Thin top edge seam line ──
    const topSeam = new THREE.Mesh(
      new THREE.BoxGeometry(BW - 0.20, 0.018, 0.005),
      matBlackLine
    )
    topSeam.position.set(0, BH / 2 - 0.09, frontZ)
    dev.add(topSeam)

    // ── Thin bottom edge seam line ──
    const botSeam = new THREE.Mesh(
      new THREE.BoxGeometry(BW - 0.20, 0.018, 0.005),
      matBlackLine
    )
    botSeam.position.set(0, -(BH / 2 - 0.09), frontZ)
    dev.add(botSeam)

    // ── AF-assist / self-timer lamp — small amber circle ──
    const afLamp = new THREE.Mesh(
      new THREE.CircleGeometry(0.030, 20),
      new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.90 })
    )
    afLamp.position.set(-1.46, 0.62, frontZ + 0.002)
    dev.add(afLamp)
    const afGlow = new THREE.Mesh(
      new THREE.CircleGeometry(0.060, 20),
      new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.18, depthWrite: false })
    )
    afGlow.position.set(-1.46, 0.62, frontZ)
    dev.add(afGlow)

    // ── Mic grille — 3×4 pinhole grid, bottom-left ──
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        const pin = new THREE.Mesh(
          new THREE.CircleGeometry(0.015, 10),
          new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.98 })
        )
        pin.position.set(-1.42 + col * 0.052, -0.38 + row * 0.052, frontZ + 0.001)
        dev.add(pin)
      }
    }

    // "MIC" label
    const micC = document.createElement('canvas')
    micC.width = 72; micC.height = 22
    const mctx = micC.getContext('2d')
    mctx.font = '10px monospace'
    mctx.fillStyle = 'rgba(255,255,255,0.30)'
    mctx.textAlign = 'left'; mctx.textBaseline = 'middle'
    mctx.fillText('MIC', 0, 11)
    const micLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.042),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(micC), transparent: true, depthWrite: false })
    )
    micLabel.position.set(-1.19, -0.50, frontZ + 0.002)
    dev.add(micLabel)

    // ── Status LED — green pulse ──
    const ledDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.030, 24),
      new THREE.MeshBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.95 })
    )
    ledDot.position.set(-1.46, -0.68, frontZ + 0.003)
    dev.add(ledDot)
    const ledGlow = new THREE.Mesh(
      new THREE.CircleGeometry(0.062, 24),
      new THREE.MeshBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.20, depthWrite: false })
    )
    ledGlow.position.set(-1.46, -0.68, frontZ)
    dev.add(ledGlow)

    // ── IR sensor — dark tinted dome ──
    const irDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.026, 20),
      new THREE.MeshBasicMaterial({ color: 0x550000, transparent: true, opacity: 0.88 })
    )
    irDot.position.set(-1.34, -0.68, frontZ + 0.003)
    dev.add(irDot)

    // ── Reset pinhole — tiny circle, bottom-right area ──
    const resetHole = new THREE.Mesh(
      new THREE.CircleGeometry(0.012, 12),
      new THREE.MeshStandardMaterial({ color: 0x040404, roughness: 0.99 })
    )
    resetHole.position.set(1.20, -0.68, frontZ + 0.001)
    dev.add(resetHole)

    // ── Grip ribs — 6 slim vertical ribs right side ──
    for (let i = 0; i < 6; i++) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, BH - 0.40, 0.010),
        new THREE.MeshStandardMaterial({ color: 0x1c0800, roughness: 0.85 })
      )
      rib.position.set(BW / 2 - 0.34 + i * 0.032, 0, frontZ)
      dev.add(rib)
    }

    // ── Bottom model strip ──
    const modelC = document.createElement('canvas')
    modelC.width = 320; modelC.height = 28
    const moctx = modelC.getContext('2d')
    moctx.font = '10px monospace'
    moctx.fillStyle = 'rgba(255,255,255,0.25)'
    moctx.textAlign = 'left'; moctx.textBaseline = 'middle'
    moctx.letterSpacing = '2px'
    moctx.fillText('V-CAM PRO  ·  4K  ·  AI  ·  IR', 0, 14)
    const modelLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.20, 0.055),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(modelC), transparent: true, depthWrite: false })
    )
    modelLabel.position.set(-0.52, -(BH / 2 - 0.14), frontZ + 0.002)
    dev.add(modelLabel)

    // ── VERIS brand label — front face ────────────────────────
    const vc = document.createElement('canvas')
    vc.width = 640; vc.height = 160
    const vctx = vc.getContext('2d')
    vctx.clearRect(0, 0, 640, 160)

    // Dark frosted background with sharp left edge cut
    vctx.fillStyle = 'rgba(4,4,6,0.72)'
    vctx.beginPath()
    vctx.moveTo(28, 8)
    vctx.lineTo(612, 8)
    vctx.lineTo(612, 152)
    vctx.lineTo(8, 152)
    vctx.lineTo(8, 28)
    vctx.closePath()
    vctx.fill()

    // Top-left corner tick mark — techy accent
    vctx.strokeStyle = '#ff5200'
    vctx.lineWidth = 3
    vctx.beginPath(); vctx.moveTo(8, 44); vctx.lineTo(8, 8); vctx.lineTo(44, 8); vctx.stroke()
    // Bottom-right corner tick
    vctx.beginPath(); vctx.moveTo(612, 116); vctx.lineTo(612, 152); vctx.lineTo(576, 152); vctx.stroke()

    // Thin top scan line
    const scanGrad = vctx.createLinearGradient(0, 0, 640, 0)
    scanGrad.addColorStop(0,   'rgba(255,82,0,0)')
    scanGrad.addColorStop(0.15,'rgba(255,82,0,0.9)')
    scanGrad.addColorStop(0.85,'rgba(255,82,0,0.9)')
    scanGrad.addColorStop(1,   'rgba(255,82,0,0)')
    vctx.fillStyle = scanGrad
    vctx.fillRect(0, 8, 640, 2)

    // VERIS — big, tracked-out, white with subtle orange glow shadow
    vctx.save()
    vctx.shadowColor = 'rgba(255,100,0,0.55)'
    vctx.shadowBlur = 18
    vctx.font = '900 96px "Arial Black", Impact, sans-serif'
    vctx.fillStyle = '#ffffff'
    vctx.textAlign = 'center'
    vctx.textBaseline = 'alphabetic'
    vctx.letterSpacing = '18px'
    vctx.fillText('VERIS', 320, 112)
    vctx.restore()

    // Subtle gradient sheen on the text
    const textSheen = vctx.createLinearGradient(0, 30, 0, 115)
    textSheen.addColorStop(0,   'rgba(255,255,255,0.22)')
    textSheen.addColorStop(0.5, 'rgba(255,255,255,0)')
    vctx.fillStyle = textSheen
    vctx.font = '900 96px "Arial Black", Impact, sans-serif'
    vctx.textAlign = 'center'
    vctx.textBaseline = 'alphabetic'
    vctx.letterSpacing = '18px'
    vctx.fillText('VERIS', 320, 112)

    // Tagline — "INTELLIGENT SECURITY" in spaced mono below
    vctx.font = '500 13px monospace'
    vctx.fillStyle = 'rgba(255,180,100,0.78)'
    vctx.textAlign = 'center'
    vctx.textBaseline = 'alphabetic'
    vctx.letterSpacing = '5px'
    vctx.fillText('INTELLIGENT SECURITY', 320, 132)

    // Orange underline — full width fade
    const ulGrad = vctx.createLinearGradient(60, 0, 580, 0)
    ulGrad.addColorStop(0,   'rgba(255,82,0,0)')
    ulGrad.addColorStop(0.12,'rgba(255,82,0,1)')
    ulGrad.addColorStop(0.88,'rgba(255,82,0,1)')
    ulGrad.addColorStop(1,   'rgba(255,82,0,0)')
    vctx.fillStyle = ulGrad
    vctx.fillRect(60, 118, 520, 3)

    const verisLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.68, 0.42),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(vc), transparent: true, depthWrite: false })
    )
    verisLabel.position.set(-0.55, 0.08, BD / 2 + 0.012)
    dev.add(verisLabel)

    // ── Particles ─────────────────────────────────────────
    const pGeo = new THREE.BufferGeometry()
    const pPos = new Float32Array(60 * 3)
    for (let i = 0; i < 60; i++) {
      pPos[i * 3]     = (Math.random() - 0.5) * 14
      pPos[i * 3 + 1] = (Math.random() - 0.5) * 10
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 10
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
    const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
      color: 0xff8800, size: 0.022, transparent: true, opacity: 0.14,
    }))
    scene.add(particles)

    // ── Interaction ───────────────────────────────────────
    let isDragging = false, prevX = 0, prevY = 0
    let rotY = -0.2, rotX = 0.06, zoom = 1.0
    let autoRotate = true

    canvas.addEventListener('mousedown', e => { isDragging = true; autoRotate = false; prevX = e.clientX; prevY = e.clientY })
    window.addEventListener('mouseup', () => { isDragging = false })
    window.addEventListener('mousemove', e => {
      if (!isDragging) return
      rotY += (e.clientX - prevX) * 0.008
      rotX += (e.clientY - prevY) * 0.004
      rotX = Math.max(-0.6, Math.min(0.6, rotX))
      prevX = e.clientX; prevY = e.clientY
    })
    canvas.addEventListener('wheel', e => {
      zoom += e.deltaY * 0.001
      zoom = Math.max(0.5, Math.min(2.0, zoom))
      e.preventDefault()
    }, { passive: false })
    canvas.addEventListener('touchstart', e => { isDragging = true; prevX = e.touches[0].clientX; prevY = e.touches[0].clientY }, { passive: true })
    canvas.addEventListener('touchend', () => { isDragging = false }, { passive: true })
    canvas.addEventListener('touchmove', e => {
      if (!isDragging) return
      rotY += (e.touches[0].clientX - prevX) * 0.008
      rotX += (e.touches[0].clientY - prevY) * 0.004
      prevX = e.touches[0].clientX; prevY = e.touches[0].clientY
    }, { passive: true })

    // ── Animate ───────────────────────────────────────────
    let t = 0, animId
    function animate() {
      animId = requestAnimationFrame(animate)
      t += 0.016

      if (autoRotate) rotY += 0.0028

      dev.rotation.y = rotY
      dev.rotation.x = rotX
      dev.position.y = Math.sin(t * 0.55) * 0.05

      // Fan blades spin around X axis (fan faces left side)
      fanGroup.rotation.x += 0.055

      screenGlow.intensity = 1.0 + 0.18 * Math.sin(t * 2.5)

      cam3d.position.set(1.5 * zoom, 1.8 * zoom, 8.5 * zoom)
      cam3d.lookAt(0.0, 0.2, 0)

      particles.rotation.y += 0.0003
      renderer.render(scene, cam3d)
    }
    animate()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
      renderer.dispose()
    }
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  )
}
