import { usePrivy } from '@privy-io/react-auth'
import AuthCanvas from './AuthCanvas'
import styles from './AuthSection.module.css'

const isConfigured = (import.meta.env.VITE_PRIVY_APP_ID || 'your-privy-app-id') !== 'your-privy-app-id'

export default function AuthSection() {
  const { login } = usePrivy()

  return (
    <section className={styles.section}>
      <AuthCanvas />
      <div className={styles.radial} />
      <div className={styles.vignette} />

      <div className={`${styles.hc} ${styles.hcTL}`} />
      <div className={`${styles.hc} ${styles.hcTR}`} />
      <div className={`${styles.hc} ${styles.hcBL}`} />
      <div className={`${styles.hc} ${styles.hcBR}`} />

      <div className={`${styles.card} glass`}>
        <div className={styles.pre}>Owner Access</div>

        <h2 className={styles.logo}>VERIS</h2>
        <p className={styles.sub}>Owner Portal</p>

        <div className={styles.divider}><span>OWNER ACCESS</span></div>

        {!isConfigured && (
          <div className={styles.warning}>
            Configure VITE_PRIVY_APP_ID in your .env file to enable login
          </div>
        )}

        <button className={styles.cta} onClick={login} disabled={!isConfigured}>
          Authenticate →
        </button>

        <div className={styles.orRow}><span>OR</span></div>

        <button className={`${styles.walletBtn} glass`} onClick={login} disabled={!isConfigured}>
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
