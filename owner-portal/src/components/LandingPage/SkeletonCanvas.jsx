import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export default function SkeletonCanvas() {
  const wrapperRef = useRef(null)
  const canvasRef  = useRef(null)

  useEffect(() => {
    const canvas  = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper) return

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1

    const scene = new THREE.Scene()
    const cam3d = new THREE.PerspectiveCamera(44, 1, 0.1, 80)

    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight
      renderer.setSize(w, h, false)
      cam3d.aspect = w / h
      cam3d.updateProjectionMatrix()
    }
    resize()
    window.addEventListener('resize', resize)

    // ── Helpers ───────────────────────────────────────────
    function wire(c, op = 0.9) {
      return new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: op })
    }
    function ghost(c, op = 0.07) {
      return new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide })
    }
    function wBox(g, w, h, d, x, y, z, c, op = 0.9) {
      const geo = new THREE.BoxGeometry(w, h, d)
      const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo), wire(c, op))
      line.position.set(x, y, z); g.add(line)
      const m = new THREE.Mesh(geo, ghost(c)); m.position.set(x, y, z); g.add(m)
    }
    function wCyl(g, rt, rb, h, seg, x, y, z, c, op = 0.85) {
      const geo = new THREE.CylinderGeometry(rt, rb, h, seg)
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo), wire(c, op)); l.position.set(x, y, z); g.add(l)
      const m = new THREE.Mesh(geo, ghost(c, 0.05)); m.position.set(x, y, z); g.add(m)
    }
    function seg(g, ax, ay, az, bx, by, bz, c, op = 0.45) {
      const l = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ax,ay,az), new THREE.Vector3(bx,by,bz)]),
        wire(c, op))
      g.add(l)
    }
    function makeLabel(text, col) {
      const lc = document.createElement('canvas'); lc.width = 360; lc.height = 56
      const lx = lc.getContext('2d')
      const hex = '#' + col.toString(16).padStart(6,'0')
      lx.strokeStyle = hex; lx.lineWidth = 2
      lx.beginPath(); lx.moveTo(0,28); lx.lineTo(22,28); lx.stroke()
      lx.fillStyle = hex; lx.font = 'bold 22px monospace'; lx.textBaseline = 'middle'
      lx.fillText(text, 28, 28)
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 0.34),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(lc), transparent: true, side: THREE.DoubleSide, depthWrite: false }))
      return m
    }

    // ── Y positions — tighter spacing so all fit in view ─
    // Camera FOV 44deg at z=11 => visible half-height ~4.4 units
    // Span: 1.8 to -2.4 = 4.2 units total — all in frame at once
    const Y = [1.8, 0.4, -1.0, -2.4]   // cam, pi, display, battery

    // ══════════════════════════════════════════════════════
    // GROUP 0 — Camera Module
    // ══════════════════════════════════════════════════════
    const gCam = new THREE.Group(); gCam.position.y = Y[0]
    wBox(gCam, 2.0, 0.10, 2.0,  0, 0, 0,     0x22cc66)          // PCB
    wBox(gCam, 1.2, 0.07, 1.2,  0, 0.08, 0,  0x334433, 0.4)     // mount plate
    ;[[0.65,0.05,0.55],[-0.72,0.05,0.62],[0.55,0.05,-0.72],[-0.65,0.05,-0.65],[0.80,0.05,0.0],[-0.80,0.05,0.1]].forEach(([px,py,pz]) =>
      wBox(gCam, 0.10, 0.06, 0.06, px, py, pz, 0x888888, 0.45))
    wCyl(gCam, 0.52, 0.55, 0.38, 48, 0, 0.26, 0, 0xff5500)       // outer barrel
    wCyl(gCam, 0.41, 0.43, 0.28, 48, 0, 0.52, 0, 0xaaaaaa)       // mid barrel
    wCyl(gCam, 0.31, 0.33, 0.20, 48, 0, 0.74, 0, 0x333333, 0.8)  // inner barrel
    wCyl(gCam, 0.26, 0.26, 0.03, 48, 0, 0.86, 0, 0x4488ff, 0.7)  // glass rim
    const gfill = new THREE.Mesh(new THREE.CircleGeometry(0.23,48), ghost(0x2255cc, 0.4))
    gfill.rotation.x = -Math.PI/2; gfill.position.set(0,0.88,0); gCam.add(gfill)
    const rdot = new THREE.Mesh(new THREE.CircleGeometry(0.07,24), new THREE.MeshBasicMaterial({color:0x88aaff,transparent:true,opacity:0.85}))
    rdot.rotation.x = -Math.PI/2; rdot.position.set(0.05,0.89,-0.04); gCam.add(rdot)
    wBox(gCam, 0.26, 0.04, 0.18, 0, -0.04, 0.85, 0xff8800, 0.7)  // FPC
    ;[[-0.82,-0.04,-0.82],[0.82,-0.04,-0.82],[-0.82,-0.04,0.82],[0.82,-0.04,0.82]].forEach(([mx,my,mz]) =>
      wCyl(gCam, 0.05, 0.05, 0.10, 8, mx, my, mz, 0x556655, 0.5))
    const lCam = makeLabel('IMX477  12MP', 0xff6600); lCam.position.set(1.8, 0.4, 0); gCam.add(lCam)
    scene.add(gCam)

    // ══════════════════════════════════════════════════════
    // GROUP 1 — Raspberry Pi 4B
    // ══════════════════════════════════════════════════════
    const gPi = new THREE.Group(); gPi.position.y = Y[1]
    wBox(gPi, 4.4, 0.10, 2.9,  0,0,0,          0x22aa55)         // PCB
    wBox(gPi, 0.75,0.07,0.75, -0.43,0.08,0.12, 0xffffff)         // SoC
    wBox(gPi, 0.56,0.06,0.40, -0.43,0.15,0.12, 0x4488ff, 0.8)    // RAM
    wBox(gPi, 0.48,0.22,0.33,  2.19,0.12,-0.46, 0x3366ff)        // USB3 x2
    wBox(gPi, 0.48,0.22,0.33,  2.19,0.12,-0.84, 0x3366ff)
    wBox(gPi, 0.44,0.18,0.33,  2.19,0.10, 0.32, 0x555555)        // USB2 x2
    wBox(gPi, 0.44,0.18,0.33,  2.19,0.10, 0.68, 0x555555)
    wBox(gPi, 0.30,0.12,0.44,  2.19,0.07,-1.20, 0xffcc00)        // USB-C
    wBox(gPi, 0.52,0.24,0.40,  2.19,0.13, 1.06, 0x888888)        // Ethernet
    wBox(gPi, 0.38,0.16,0.44, -1.24,0.09,-1.46, 0xaaaaaa, 0.7)   // HDMI x2
    wBox(gPi, 0.38,0.16,0.44, -0.62,0.09,-1.46, 0xaaaaaa, 0.7)
    wCyl(gPi, 0.11,0.11,0.30, 16, 0.04,0.09,-1.46, 0x666666)     // audio
    wBox(gPi, 1.28,0.12,0.20, -1.98,0.11,-0.66, 0xffcc00, 0.8)   // GPIO
    for(let i=0;i<20;i++) wCyl(gPi,0.018,0.018,0.09,6,-2.58+i*0.126,0.12,-0.66,0xffcc00,0.55)
    wBox(gPi, 0.26,0.05,0.17, -0.35,0.07,-1.36, 0xff6600, 0.8)   // CSI
    wBox(gPi, 0.26,0.05,0.17,  0.28,0.07,-1.36, 0x4488ff, 0.8)   // DSI
    wBox(gPi, 0.40,0.05,0.30, -0.23,-0.04, 1.40, 0x888888, 0.6)  // SD
    ;[-0.55,-0.35].forEach(lx => wCyl(gPi,0.034,0.034,0.05,8,lx,0.08,1.42,0x00ff66,0.9))
    const lPi = makeLabel('RASPBERRY PI 4B', 0x22dd66); lPi.position.set(2.8, 0.2, 0); gPi.add(lPi)
    scene.add(gPi)

    // ══════════════════════════════════════════════════════
    // GROUP 2 — 3.5" Touchscreen Display
    // ══════════════════════════════════════════════════════
    const gDisp = new THREE.Group(); gDisp.position.y = Y[2]
    wBox(gDisp, 4.0,0.06,2.6,  0,0,0,    0x2255cc, 0.6)          // PCB
    wBox(gDisp, 3.8,0.03,2.4,  0,0.045,0, 0xaaccff, 0.5)          // glass panel

    // Screen canvas
    const dC = document.createElement('canvas'); dC.width=512; dC.height=336
    const dX = dC.getContext('2d')
    dX.fillStyle='#060e18'; dX.fillRect(0,0,512,336)
    const sg = dX.createLinearGradient(0,0,0,336)
    sg.addColorStop(0,'rgba(30,70,110,0.6)'); sg.addColorStop(1,'rgba(5,15,20,0)')
    dX.fillStyle=sg; dX.fillRect(0,0,512,336)
    dX.strokeStyle='rgba(255,100,0,0.75)'; dX.lineWidth=2; dX.strokeRect(14,14,484,308)
    ;[[14,14],[498,14],[14,322],[498,322]].forEach(([cx,cy],i)=>{
      const sx=i%2===0?1:-1,sy=i<2?1:-1
      dX.strokeStyle='rgba(255,130,0,1)'; dX.lineWidth=3
      dX.beginPath(); dX.moveTo(cx,cy+sy*26); dX.lineTo(cx,cy); dX.lineTo(cx+sx*26,cy); dX.stroke()
    })
    const mx=256,my=168
    dX.strokeStyle='rgba(255,255,255,0.9)'; dX.lineWidth=2
    dX.beginPath(); dX.moveTo(mx-22,my); dX.lineTo(mx-6,my); dX.stroke()
    dX.beginPath(); dX.moveTo(mx+6,my);  dX.lineTo(mx+22,my); dX.stroke()
    dX.beginPath(); dX.moveTo(mx,my-22); dX.lineTo(mx,my-6); dX.stroke()
    dX.beginPath(); dX.moveTo(mx,my+6);  dX.lineTo(mx,my+22); dX.stroke()
    dX.fillStyle='rgba(255,255,255,0.95)'; dX.beginPath(); dX.arc(mx,my,3,0,Math.PI*2); dX.fill()
    dX.fillStyle='#ff5500'; dX.fillRect(mx-54,my+46,108,26)
    dX.fillStyle='#000'; dX.font='bold 13px monospace'; dX.textAlign='center'; dX.textBaseline='middle'
    dX.fillText('CAPTURE',mx,my+59)
    dX.fillStyle='#000'; dX.fillRect(0,0,512,38)
    dX.fillStyle='#ff5500'; dX.font='bold 13px monospace'; dX.textAlign='left'; dX.textBaseline='alphabetic'
    dX.fillText('REC',14,27); dX.fillStyle='#fff'; dX.font='12px monospace'
    dX.fillText('f/1.8  1/1000s  ISO800',58,27)
    dX.fillStyle='#ffcc00'; dX.font='bold 12px monospace'; dX.fillText('4K RAW',362,27)
    dX.fillStyle='#000'; dX.fillRect(0,300,512,36)
    dX.fillStyle='#ff5500'; dX.font='bold 13px monospace'; dX.fillText('VERIS',14,322)
    dX.fillStyle='#aaa'; dX.font='12px monospace'; dX.fillText('CAM-01   0042',75,322)
    dX.strokeStyle='rgba(80,255,130,0.9)'; dX.lineWidth=1.5
    dX.strokeRect(422,310,46,18); dX.strokeRect(468,315,4,8)
    dX.fillStyle='rgba(80,255,130,0.9)'; dX.fillRect(424,312,38,14)
    const dTex = new THREE.CanvasTexture(dC); dTex.needsUpdate=true
    const scrMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.55,2.25),
      new THREE.MeshBasicMaterial({map:dTex, side:THREE.DoubleSide}))
    scrMesh.rotation.x=-Math.PI/2; scrMesh.position.set(0,0.07,0); gDisp.add(scrMesh)
    const sGlow = new THREE.Mesh(new THREE.PlaneGeometry(3.85,2.5),
      new THREE.MeshBasicMaterial({color:0x0044aa,transparent:true,opacity:0.1,depthWrite:false}))
    sGlow.rotation.x=-Math.PI/2; sGlow.position.set(0,0.065,0); gDisp.add(sGlow)
    const scrL = new THREE.PointLight(0x0066cc,0.7,4); scrL.position.set(0,0.5,0); gDisp.add(scrL)
    wBox(gDisp,0.30,0.05,0.30, 0.95,-0.03, 1.08, 0x666666,0.6)
    wBox(gDisp,0.28,0.04,0.16, 0,   -0.03, 1.28,0x4488ff,0.8)
    const lDisp = makeLabel('3.5" DSI DISPLAY', 0x4499ff); lDisp.position.set(2.5, 0.15, 0); gDisp.add(lDisp)
    scene.add(gDisp)

    // ══════════════════════════════════════════════════════
    // GROUP 3 — Li-Po Battery
    // ══════════════════════════════════════════════════════
    const gBat = new THREE.Group(); gBat.position.y = Y[3]
    wBox(gBat, 3.8,0.22,2.4,  0,0,0, 0xffcc00, 0.8)              // cell
    for(let i=-0.9;i<=0.9;i+=0.45) seg(gBat,-1.9,0.11,i,1.9,0.11,i,0xffcc00,0.14)
    for(let i=-1.6;i<=1.6;i+=0.52) seg(gBat,i,0.11,-1.2,i,0.11,1.2,0xffcc00,0.09)
    const bC=document.createElement('canvas'); bC.width=280; bC.height=130
    const bX=bC.getContext('2d')
    bX.fillStyle='rgba(255,204,0,0.9)'; bX.font='bold 22px monospace'; bX.textAlign='center'; bX.textBaseline='middle'
    bX.fillText('4000 mAh',140,42)
    bX.font='15px monospace'; bX.fillStyle='rgba(255,204,0,0.7)'
    bX.fillText('3.7V  Li-Po',140,74); bX.fillText('VERIS-BAT-01',140,100)
    const bTex=new THREE.CanvasTexture(bC); bTex.needsUpdate=true
    const bLabel=new THREE.Mesh(new THREE.PlaneGeometry(2.2,1.0),new THREE.MeshBasicMaterial({map:bTex,transparent:true,depthWrite:false}))
    bLabel.rotation.x=-Math.PI/2; bLabel.position.set(0,0.12,0); gBat.add(bLabel)
    wBox(gBat,1.1,0.08,0.30, -0.9,0.17,-1.18, 0xaaaaaa,0.7)     // protection PCB
    ;[[-0.5,0.22],[-0.9,0.22],[-1.4,0.22]].forEach(([px]) =>
      wBox(gBat,0.15,0.05,0.14,px,0.22,-1.18,0x888888,0.6))
    wBox(gBat,0.22,0.10,0.16,-1.5,0.20,-1.18,0xffffff,0.7)       // JST
    const lBat = makeLabel('Li-Po  4000mAh', 0xffcc00); lBat.position.set(2.4, 0.15, 0); gBat.add(lBat)
    scene.add(gBat)

    // ── Ribbon connectors ─────────────────────────────────
    // CSI: camera module -> Pi
    scene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, Y[0]-0.04, 0.85),
        new THREE.Vector3(-0.35, Y[1]+0.07,-1.36)]),
      wire(0xff6600, 0.5)))
    // DSI: Pi -> display
    scene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0.28, Y[1]+0.07,-1.36),
        new THREE.Vector3(0, Y[2]-0.03, 1.28)]),
      wire(0x4488ff, 0.5)))
    // Power: display -> battery
    scene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-1.5, Y[2]+0.20,-1.18),
        new THREE.Vector3(-1.5, Y[3]+0.20,-1.18)]),
      wire(0xffcc00, 0.4)))

    // ── Particles ─────────────────────────────────────────
    const pBuf = new Float32Array(60*3)
    for(let i=0;i<60;i++){
      pBuf[i*3]=(Math.random()-0.5)*14; pBuf[i*3+1]=-0.3+(Math.random()-0.5)*8; pBuf[i*3+2]=(Math.random()-0.5)*6
    }
    const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position',new THREE.BufferAttribute(pBuf,3))
    scene.add(new THREE.Points(pGeo,new THREE.PointsMaterial({color:0xff5500,size:0.024,transparent:true,opacity:0.18})))

    // ── Labels array for billboard ────────────────────────
    const allLabels = [lCam, lPi, lDisp, lBat]

    // ── Scroll progress ───────────────────────────────────
    let scrollProgress = 0
    function onScroll() {
      const rect = wrapper.getBoundingClientRect()
      const scrolled = -rect.top
      const total    = rect.height - window.innerHeight
      scrollProgress = total > 0 ? Math.max(0, Math.min(1, scrolled / total)) : 0
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    // ── Component reveal config ───────────────────────────
    // startScroll: -0.2 means fully visible before any scrolling
    const reveals = [
      { grp: gCam,  startScroll: -0.2 },   // visible from start
      { grp: gPi,   startScroll:  0.2 },
      { grp: gDisp, startScroll:  0.5 },
      { grp: gBat,  startScroll:  0.75 },
    ]

    // Store original opacities once (before any animation)
    const origOpacity = new WeakMap()
    reveals.forEach(({ grp }) => {
      grp.traverse(child => {
        if (child.material && child.material.transparent) {
          origOpacity.set(child.material, child.material.opacity)
        }
      })
    })

    let t = 0, animId
    function animate() {
      animId = requestAnimationFrame(animate)
      t += 0.016

      const p = scrollProgress

      // Camera: fixed position, gentle sway
      cam3d.position.set(Math.sin(t * 0.12) * 0.4 + 2.0, 0.5, 11)
      cam3d.lookAt(0, -0.1, 0)

      reveals.forEach(({ grp, startScroll }, i) => {
        const local = Math.max(0, Math.min(1, (p - startScroll) / 0.22))
        const ease  = 1 - Math.pow(1 - local, 3)

        // Float in from 1.0 units below rest
        grp.position.y = Y[i] - 1.0 + 1.0 * ease

        // Fade in using stored original opacity
        grp.traverse(child => {
          if (child.material && child.material.transparent) {
            const orig = origOpacity.get(child.material)
            if (orig !== undefined) child.material.opacity = orig * ease
          }
        })
      })

      allLabels.forEach(l => l.lookAt(cam3d.position))
      renderer.render(scene, cam3d)
    }
    animate()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('scroll', onScroll)
      renderer.dispose()
    }
  }, [])

  return (
    <div ref={wrapperRef} style={{ height: '280vh', position: 'relative', width: '100%' }}>
      <div style={{ position: 'sticky', top: 0, height: '100vh', width: '100%' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
    </div>
  )
}
