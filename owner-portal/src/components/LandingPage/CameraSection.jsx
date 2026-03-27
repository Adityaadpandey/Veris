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
    <section id="camera-section" ref={sectionRef} className={`${styles.section} ${visible ? styles.visible : ''}`}>
      <div className={styles.bgGlow} />

      <div className={styles.badge}><span>●</span> The Hardware</div>
      <h2 className={styles.heading}>THE VERIS <span className={styles.dim}>UNIT</span></h2>
      <p className={styles.sub}>Built on Raspberry Pi 4B + HQ Camera Module. A node, not just a camera.</p>

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
