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
    <section ref={sectionRef} className={`${styles.section} ${visible ? styles.visible : ''}`}>
      <div className={styles.inner}>
        <div className={styles.badge}><span>●</span> The Protocol</div>
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
