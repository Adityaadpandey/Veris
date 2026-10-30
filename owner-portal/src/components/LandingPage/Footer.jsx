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
