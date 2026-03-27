import HeroCanvas from './HeroCanvas'
import styles from './HeroSection.module.css'

export default function HeroSection({ onEnterPortal }) {
  const scrollToCamera = () => {
    document.getElementById('camera-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section className={styles.hero}>
      <HeroCanvas />

      <div className={styles.radialGlow} />
      <div className={styles.vignette} />
      <div className={styles.topFade} />
      <div className={styles.bottomFade} />

      <div className={`${styles.hudCorner} ${styles.tl}`} />
      <div className={`${styles.hudCorner} ${styles.tr}`} />
      <div className={`${styles.hudCorner} ${styles.bl}`} />
      <div className={`${styles.hudCorner} ${styles.br}`} />

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
          <button className={`${styles.btnGhost} glass`} onClick={scrollToCamera}>
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
