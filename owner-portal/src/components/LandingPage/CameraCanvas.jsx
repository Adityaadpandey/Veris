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
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.4

    const scene = new THREE.Scene()

    const cam3d = new THREE.PerspectiveCamera(32, 1, 0.1, 80)
    cam3d.position.set(4.5, 2.2, 7.5)
    cam3d.lookAt(0, 0, 0)

    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight
      renderer.setSize(w, h, false)
      cam3d.aspect = w / h
      cam3d.updateProjectionMatrix()
    }
    resize()
    window.addEventListener('resize', resize)

    // ── Lighting ──────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.7))

    const key = new THREE.DirectionalLight(0xfff5ee, 2.6)
    key.position.set(5, 8, 7)
    key.castShadow = true
    scene.add(key)

    const front = new THREE.DirectionalLight(0xffffff, 1.4)
    front.position.set(-1, 1, 9)
    scene.add(front)

    const fill = new THREE.PointLight(0xffddcc, 1.5, 20)
    fill.position.set(-6, 2, 3)
    scene.add(fill)

    const rimTop = new THREE.DirectionalLight(0xffffff, 1.2)
    rimTop.position.set(0, 10, -2)
    scene.add(rimTop)

    const rimSide = new THREE.PointLight(0xff8844, 1.8, 14)
    rimSide.position.set(4, -3, -4)
    scene.add(rimSide)

    // ── Materials ─────────────────────────────────────────
    // Main body — warm orange
    const matOrangeBody = new THREE.MeshPhysicalMaterial({
      color: 0xff5e00,
      roughness: 0.38,
      metalness: 0.08,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
    })
    // Darker orange (shadows/grip zones)
    const matDeepOrange = new THREE.MeshPhysicalMaterial({
      color: 0xcc3d00,
      roughness: 0.55,
      metalness: 0.06,
    })
    // Matte black (top/bottom plates, accents)
    const matBlack = new THREE.MeshPhysicalMaterial({
      color: 0x111315,
      roughness: 0.78,
      metalness: 0.22,
    })
    // Aluminium / silver
    const matAlum = new THREE.MeshPhysicalMaterial({
      color: 0x8a9099,
      roughness: 0.18,
      metalness: 0.92,
    })
    // Lens glass
    const matGlass = new THREE.MeshPhysicalMaterial({
      color: 0x040608,
      roughness: 0.0,
      metalness: 0.05,
      transmission: 0.6,
      thickness: 0.5,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
    })
    // Lens barrel rings
    const matBarrel = new THREE.MeshPhysicalMaterial({
      color: 0x1c1e22,
      roughness: 0.15,
      metalness: 0.95,
    })
    // Rubber / soft grip
    const matRubber = new THREE.MeshStandardMaterial({ color: 0x0d0e0f, roughness: 0.97 })
    // Orange accent emissive
    const matAccent = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      emissive: 0xff4400,
      emissiveIntensity: 0.7,
      roughness: 0.3,
    })
    // Bright chrome detail
    const matChrome = new THREE.MeshPhysicalMaterial({
      color: 0xc8cdd4,
      roughness: 0.08,
      metalness: 1.0,
    })

    // ── Device group ──────────────────────────────────────
    const dev = new THREE.Group()
    dev.rotation.y = 0.4
    dev.rotation.x = -0.06
    scene.add(dev)

    // Compact camera dims — sleek & thin
    const W = 3.2, H = 2.0, D = 0.52

    // ── Body (rounded) ────────────────────────────────────
    const bodyGeo = new RoundedBoxGeometry(W, H, D, 4, 0.14)
    const body = new THREE.Mesh(bodyGeo, matOrangeBody)
    body.castShadow = true
    dev.add(body)

    // Top plate (black strip)
    const topPlate = new THREE.Mesh(new RoundedBoxGeometry(W, 0.46, D + 0.01, 4, 0.1), matBlack)
    topPlate.position.set(0, H / 2 - 0.05, 0)
    dev.add(topPlate)

    // Bottom plate (black strip)
    const botPlate = new THREE.Mesh(new RoundedBoxGeometry(W, 0.28, D + 0.01, 4, 0.08), matBlack)
    botPlate.position.set(0, -H / 2 + 0.05, 0)
    dev.add(botPlate)

    // Subtle grip zone — right side, slightly recessed darker orange
    const gripZone = new THREE.Mesh(new RoundedBoxGeometry(0.62, H * 0.72, D + 0.015, 4, 0.1), matDeepOrange)
    gripZone.position.set(W / 2 - 0.28, -0.05, 0)
    dev.add(gripZone)

    // Thin chrome side rails (left & right edges)
    // const railL = new THREE.Mesh(new THREE.BoxGeometry(0.03, H - 0.3, D - 0.06), matChrome)
    // railL.position.set(-W / 2 + 0.015, 0, 0)
    // dev.add(railL)
    // const railR = new THREE.Mesh(new THREE.BoxGeometry(0.03, H - 0.3, D - 0.06), matChrome)
    // railR.position.set(W / 2 - 0.015, 0, 0)
    // dev.add(railR)

    // ── Lens assembly (front face, offset left) ───────────
    const LX = -0.52, LY = 0.08
    const LFZ = D / 2

    // VERIS label on front face (right of lens)
    const verisC = document.createElement('canvas')
    verisC.width = 256; verisC.height = 64
    const vc = verisC.getContext('2d')
    vc.clearRect(0, 0, 256, 64)
    vc.font = 'bold 28px "Space Grotesk", sans-serif'
    vc.letterSpacing = '8px'
    vc.fillStyle = 'rgba(255, 255, 255, 0.82)'
    vc.textAlign = 'center'
    vc.textBaseline = 'middle'
    vc.fillText('VERIS', 128, 32)
    const verisTex = new THREE.CanvasTexture(verisC)
    const verisLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.22),
      new THREE.MeshBasicMaterial({ map: verisTex, transparent: true, depthWrite: false })
    )
    verisLabel.position.set(0.85, -0.45, D / 2 + 0.002)
    dev.add(verisLabel)

    // Lens surround (flush dark plate around barrel)
    const lensSurround = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.04, 64), matBlack)
    lensSurround.rotation.x = Math.PI / 2
    lensSurround.position.set(LX, LY, LFZ + 0.02)
    dev.add(lensSurround)

    // Outer barrel — chunky, protruding
    const barrel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.60, 0.63, 0.22, 64), matBarrel)
    barrel1.rotation.x = Math.PI / 2
    barrel1.position.set(LX, LY, LFZ + 0.13)
    dev.add(barrel1)

    // Mid barrel — focus ring, slight aluminium
    const barrel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.55, 0.16, 64), matAlum)
    barrel2.rotation.x = Math.PI / 2
    barrel2.position.set(LX, LY, LFZ + 0.30)
    dev.add(barrel2)

    // Inner barrel
    const barrel3 = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.14, 64), matBarrel)
    barrel3.rotation.x = Math.PI / 2
    barrel3.position.set(LX, LY, LFZ + 0.44)
    dev.add(barrel3)

    // Front ring (chrome)
    const frontRing = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.41, 0.04, 64), matChrome)
    frontRing.rotation.x = Math.PI / 2
    frontRing.position.set(LX, LY, LFZ + 0.545)
    dev.add(frontRing)

    // Glass element
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.04, 64), matGlass)
    glass.rotation.x = Math.PI / 2
    glass.position.set(LX, LY, LFZ + 0.58)
    dev.add(glass)

    // Lens inner reflection (bluish dot)
    const refl = new THREE.Mesh(new THREE.CircleGeometry(0.11, 32), new THREE.MeshBasicMaterial({ color: 0x1133aa, transparent: true, opacity: 0.65 }))
    refl.position.set(LX + 0.08, LY + 0.08, LFZ + 0.605)
    dev.add(refl)
    const refl2 = new THREE.Mesh(new THREE.CircleGeometry(0.04, 24), new THREE.MeshBasicMaterial({ color: 0x4466cc, transparent: true, opacity: 0.45 }))
    refl2.position.set(LX - 0.07, LY - 0.07, LFZ + 0.605)
    dev.add(refl2)

    // // ── Top plate controls ────────────────────────────────
    // const topY = H / 2 + 0.01

    // // Shutter button
    // const shutBase = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 32), matChrome)
    // shutBase.position.set(W / 2 - 0.42, topY + 0.02, 0.12)
    // dev.add(shutBase)
    // const shutCap = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.12, 0.035, 32), matRubber)
    // shutCap.position.set(W / 2 - 0.42, topY + 0.05, 0.12)
    // dev.add(shutCap)
    // // Shutter orange ring
    // const shutRing = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.014, 8, 40), matAccent)
    // shutRing.rotation.x = Math.PI / 2
    // shutRing.position.set(W / 2 - 0.42, topY + 0.022, 0.12)
    // dev.add(shutRing)

    // Mode dial
    // const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.055, 40), matAlum)
    // dial.position.set(-0.72, topY + 0.025, 0.0)
    // dev.add(dial)
    // for (let i = 0; i < 8; i++) {
    //   const a = (i / 8) * Math.PI * 2
    //   const tick = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.048, 0.012), matAccent)
    //   tick.position.set(-0.72 + 0.145 * Math.cos(a), topY + 0.03, 0.0 + 0.145 * Math.sin(a))
    //   tick.rotation.y = -a
    //   dev.add(tick)
    // }
    // Dial dot marker
    // const dialDot = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), new THREE.MeshBasicMaterial({ color: 0xff5500 }))
    // dialDot.rotation.x = -Math.PI / 2
    // dialDot.position.set(-0.72, topY + 0.058, 0.145)
    // dev.add(dialDot)

    // Power button (small round, near shutter)
    // const pwrBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 20), matBlack)
    // pwrBtn.position.set(W / 2 - 0.42, topY + 0.015, -0.18)
    // dev.add(pwrBtn)

    // ── Strap lugs ────────────────────────────────────────
    // ;[[-W / 2, -0.3], [W / 2, -0.3]].forEach(([lx]) => {
    //   const lug = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.12), matChrome)
    //   lug.position.set(lx + (lx < 0 ? -0.035 : 0.035), 0.2, 0)
    //   dev.add(lug)
    //   const hole = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.018, 8, 24), matBlack)
    //   hole.rotation.z = Math.PI / 2
    //   hole.position.set(lx + (lx < 0 ? -0.05 : 0.05), 0.2, 0)
    //   dev.add(hole)
    // })

    // ── Back face: glowing display ─────────────────────────
    const scrW = 512, scrH = 384
    const scrCanv = document.createElement('canvas')
    scrCanv.width = scrW; scrCanv.height = scrH
    const ctx = scrCanv.getContext('2d')

    const cx = scrW / 2, cy = scrH / 2

    // ── Background ────────────────────────────────────────
    ctx.fillStyle = '#112030'
    ctx.fillRect(0, 0, scrW, scrH)

    // Sky gradient
    const skyGrd = ctx.createLinearGradient(0, 0, 0, scrH * 0.6)
    skyGrd.addColorStop(0, 'rgba(30,70,110,0.7)')
    skyGrd.addColorStop(1, 'rgba(10,25,40,0)')
    ctx.fillStyle = skyGrd
    ctx.fillRect(0, 0, scrW, scrH)

    // Ground gradient
    const groundGrd = ctx.createLinearGradient(0, scrH * 0.5, 0, scrH)
    groundGrd.addColorStop(0, 'rgba(0,0,0,0)')
    groundGrd.addColorStop(1, 'rgba(40,28,12,0.6)')
    ctx.fillStyle = groundGrd
    ctx.fillRect(0, 0, scrW, scrH)

    // Bokeh blobs — brighter so they read on screen
    const bokeh = [
      [90,  110, 38, 'rgba(255,160,60,0.22)'],
      [310, 80,  52, 'rgba(255,210,100,0.18)'],
      [430, 140, 44, 'rgba(180,220,255,0.18)'],
      [180, 220, 30, 'rgba(255,130,40,0.20)'],
      [390, 200, 60, 'rgba(140,200,255,0.15)'],
      [60,  260, 24, 'rgba(255,190,80,0.20)'],
    ]
    bokeh.forEach(([bx, by, br, col]) => {
      const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br)
      bg.addColorStop(0, col)
      bg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = bg
      ctx.fillRect(bx - br, by - br, br * 2, br * 2)
    })

    // ── Rule-of-thirds grid (very faint) ──────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'
    ctx.lineWidth = 1
    ;[scrW / 3, scrW * 2 / 3].forEach(x => { ctx.beginPath(); ctx.moveTo(x, 44); ctx.lineTo(x, scrH - 46); ctx.stroke() })
    ;[scrH / 3 + 14, scrH * 2 / 3 - 14].forEach(y => { ctx.beginPath(); ctx.moveTo(14, y); ctx.lineTo(scrW - 14, y); ctx.stroke() })

    // ── Outer viewfinder frame ────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1
    ctx.strokeRect(14, 46, scrW - 28, scrH - 94)

    // ── Focus bracket (centre, orange) ───────────────────
    const fbS = 68 // half-size of focus box
    const fbL = 22 // corner line length
    ctx.strokeStyle = 'rgba(255,120,0,1)'
    ctx.lineWidth = 2
    ;[[cx - fbS, cy - fbS], [cx + fbS, cy - fbS], [cx - fbS, cy + fbS], [cx + fbS, cy + fbS]].forEach(([fx, fy], i) => {
      const sx = i % 2 === 0 ? 1 : -1, sy = i < 2 ? 1 : -1
      ctx.beginPath(); ctx.moveTo(fx, fy + sy * fbL); ctx.lineTo(fx, fy); ctx.lineTo(fx + sx * fbL, fy); ctx.stroke()
    })
    // AF lock dot inside bracket (green = locked)
    ctx.fillStyle = 'rgba(80,255,120,0.9)'
    ctx.beginPath(); ctx.arc(cx + fbS - 8, cy - fbS + 8, 4, 0, Math.PI * 2); ctx.fill()

    // ── Big "+" crosshair in exact centre ─────────────────
    const armLen = 24, gap = 6
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 1.5
    // Horizontal arms
    ctx.beginPath(); ctx.moveTo(cx - armLen, cy); ctx.lineTo(cx - gap, cy); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx + gap, cy);     ctx.lineTo(cx + armLen, cy); ctx.stroke()
    // Vertical arms
    ctx.beginPath(); ctx.moveTo(cx, cy - armLen); ctx.lineTo(cx, cy - gap); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx, cy + gap);     ctx.lineTo(cx, cy + armLen); ctx.stroke()
    // Centre dot
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill()

    // ── "CAPTURE NOW" label below crosshair ──────────────
    ctx.font = 'bold 15px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.0)'
    // Pill background
    const labelW = 148, labelH = 28, labelY = cy + 48
    ctx.fillStyle = 'rgba(255,90,0,0.82)'
    const r = 6
    ctx.beginPath()
    ctx.moveTo(cx - labelW / 2 + r, labelY - labelH / 2)
    ctx.arcTo(cx + labelW / 2, labelY - labelH / 2, cx + labelW / 2, labelY + labelH / 2, r)
    ctx.arcTo(cx + labelW / 2, labelY + labelH / 2, cx - labelW / 2, labelY + labelH / 2, r)
    ctx.arcTo(cx - labelW / 2, labelY + labelH / 2, cx - labelW / 2, labelY - labelH / 2, r)
    ctx.arcTo(cx - labelW / 2, labelY - labelH / 2, cx + labelW / 2, labelY - labelH / 2, r)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#000'
    ctx.font = 'bold 12px monospace'
    ctx.fillText('CAPTURE', cx, labelY + 4)
    ctx.textAlign = 'left'

    // ── Top status bar ────────────────────────────────────
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, scrW, 46)
    ctx.fillStyle = '#ff5500'
    ctx.font = 'bold 14px monospace'
    ctx.fillText('● REC', 14, 30)
    ctx.fillStyle = '#ffffff'
    ctx.font = '13px monospace'
    ctx.fillText('f/1.8', 96, 30)
    ctx.fillText('1/1000s', 162, 30)
    ctx.fillText('ISO800', 260, 30)
    ctx.fillStyle = '#ffcc00'
    ctx.font = 'bold 13px monospace'
    ctx.fillText('4K RAW', 360, 30)
    ctx.fillStyle = '#ff8800'
    ctx.font = '12px monospace'
    ctx.fillText('60fps', 450, 30)

    // ── Bottom bar ────────────────────────────────────────
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, scrH - 48, scrW, 48)
    ctx.fillStyle = '#ff5500'
    ctx.font = 'bold 14px monospace'
    ctx.fillText('VERIS', 14, scrH - 18)
    ctx.fillStyle = '#aaaaaa'
    ctx.font = '12px monospace'
    ctx.fillText('CAM-01', 82, scrH - 18)
    ctx.fillStyle = '#ffffff'
    ctx.fillText('0042 / ∞', cx - 34, scrH - 18)
    // Battery
    const batX = scrW - 70, batY = scrH - 38
    ctx.strokeStyle = '#44ff88'; ctx.lineWidth = 2
    ctx.strokeRect(batX, batY, 48, 20)
    ctx.strokeRect(batX + 48, batY + 6, 5, 8)
    ctx.fillStyle = '#44ff88'
    ctx.fillRect(batX + 2, batY + 2, 40, 16)

    const scrTex = new THREE.CanvasTexture(scrCanv)
    scrTex.needsUpdate = true

    // Black bezel border behind screen
    const bezel = new THREE.Mesh(
      new THREE.PlaneGeometry(2.22, 1.68),
      new THREE.MeshBasicMaterial({ color: 0x080a0c, side: THREE.DoubleSide })
    )
    bezel.position.set(-0.15, 0.0, -(D / 2 + 0.012))
    dev.add(bezel)

    // Screen — DoubleSide so it renders no matter which way the device faces
    const screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 1.5),
      new THREE.MeshBasicMaterial({ map: scrTex, side: THREE.DoubleSide })
    )
    screenMesh.position.set(-0.15, 0.0, -(D / 2 + 0.01))
    dev.add(screenMesh)

    // Point light behind screen — bleeds warm teal onto orange body when rotated
    const screenLight = new THREE.PointLight(0x00aacc, 1.6, 4.5)
    screenLight.position.set(-0.15, 0.0, -(D / 2 + 0.5))
    scene.add(screenLight)

    // Second softer fill so nearby orange body picks up the glow colour
    const screenFill = new THREE.PointLight(0x0088aa, 0.7, 6.0)
    screenFill.position.set(-0.15, 0.0, -(D / 2 + 1.2))
    scene.add(screenFill)

    // Back buttons (right of screen, minimal)
    const bBtnMat = new THREE.MeshPhysicalMaterial({ color: 0x1e2024, roughness: 0.65, metalness: 0.45 })
    ;[[1.42, 0.42], [1.42, 0.05], [1.42, -0.32]].forEach(([bx, by]) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.038, 20), bBtnMat)
      b.rotation.x = Math.PI / 2
      b.position.set(bx, by, -(D / 2 + 0.019))
      dev.add(b)
    })
    // // Nav dial (small, compact)
    // const navD = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 40), matAlum)
    // navD.rotation.x = Math.PI / 2
    // navD.position.set(1.42, -0.62, -(D / 2 + 0.02))
    // dev.add(navD)
    // const navC = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 32), bBtnMat)
    // navC.rotation.x = Math.PI / 2
    // navC.position.set(1.42, -0.62, -(D / 2 + 0.026))
    // dev.add(navC)

    // ── Right side: port door ────────────────────────────
    // const portDoor = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, 0.9), matDeepOrange)
    // portDoor.position.set(W / 2 + 0.01, -0.38, -0.12)
    // dev.add(portDoor)
    // // Tiny port openings
    // const usbC = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.24), new THREE.MeshStandardMaterial({ color: 0x080a0c, roughness: 0.9 }))
    // usbC.position.set(W / 2 + 0.015, -0.38, 0.12)
    // dev.add(usbC)
    // const hdmi = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.35), new THREE.MeshStandardMaterial({ color: 0x080a0c, roughness: 0.9 }))
    // hdmi.position.set(W / 2 + 0.015, -0.38, -0.34)
    // dev.add(hdmi)

    // ── Floating dust particles ───────────────────────────
    const pGeo = new THREE.BufferGeometry()
    const pCount = 70
    const pPos = new Float32Array(pCount * 3)
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3]     = (Math.random() - 0.5) * 14
      pPos[i * 3 + 1] = (Math.random() - 0.5) * 10
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 10
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
    const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xff7700, size: 0.028, transparent: true, opacity: 0.22 }))
    scene.add(particles)

    // ── Interaction ───────────────────────────────────────
    let isDragging = false, prevX = 0, prevY = 0
    let rotY = 0.4, rotX = -0.06, zoom = 1.0
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
      zoom = Math.max(0.6, Math.min(1.9, zoom))
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

      if (autoRotate) rotY += 0.0032

      dev.rotation.y = rotY
      dev.rotation.x = rotX
      dev.position.y = Math.sin(t * 0.6) * 0.06

      const pulse = 0.55 + 0.45 * Math.sin(t * 2.0)
      matAccent.emissiveIntensity = 0.5 + 0.4 * pulse
      screenLight.intensity = 1.4 + 0.25 * Math.sin(t * 2.8)
      screenFill.intensity  = 0.6 + 0.15 * Math.sin(t * 2.8)

      cam3d.position.set(4.5 * zoom, 2.2 * zoom, 7.5 * zoom)
      cam3d.lookAt(0, 0, 0)

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
