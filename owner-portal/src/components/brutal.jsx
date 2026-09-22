// Veris Hotshoe "brutal glass" design system — mirrors mobile-app/src/constants/theme.ts and
// mobile-app/src/components/{brutal-block,pill-button}.tsx so the web claim/search pages read as
// the same product as the phone app instead of the portal's own dark theme.

export const Palette = {
  cream: '#EDE7DA',
  paper: '#DED8C9',
  ink: '#100E0C',
  orange: '#E7581C',
  green: '#1E7A4C',
  bone: '#F5F1E7',
  onyx: '#0B0A09',
  espresso: '#140B06',
}

/* ── Brutal block: solid content layer over a flat, unblurred offset duplicate of itself. ── */
export function Brutal({ bg = Palette.cream, border = Palette.ink, shadowColor, offset = 3, radius = 16, borderWidth = 2.5, className = '', contentClassName = '', style, children }) {
  return (
    <div className={`relative ${className}`} style={style}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: shadowColor ?? border, borderRadius: radius, transform: `translate(${offset}px, ${offset}px)` }} />
      <div className={`relative overflow-hidden ${contentClassName}`} style={{ background: bg, border: `${borderWidth}px solid ${border}`, borderRadius: radius }}>
        {children}
      </div>
    </div>
  )
}

/* ── Pill button: the chunky offset-shadow CTA shared across the mobile app. ── */
export function Pill({ label, onPress, disabled, bg, color, border = Palette.ink, arrow, fullWidth, className = '' }) {
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      className={`${fullWidth ? 'w-full' : ''} text-left disabled:opacity-55 transition-transform active:translate-x-[2px] active:translate-y-[2px] ${className}`}
    >
      <Brutal bg={bg} border={border} offset={4} radius={16} contentClassName="flex items-center justify-center gap-2.5 px-4 py-4">
        <span className="font-brutal-mono font-semibold text-[11px] tracking-[0.16em] uppercase" style={{ color }}>{label}</span>
        {arrow && <span className="text-sm" style={{ color }}>→</span>}
      </Brutal>
    </button>
  )
}

/* ── Section head: dot + mono uppercase label, shared rhythm across claim/search pages. ── */
export function SectionHead({ label, tone = 'onLight' }) {
  const color = tone === 'onLight' ? Palette.ink : Palette.bone
  return (
    <div className="flex items-baseline gap-2 mt-6 mb-3">
      <span className="w-[5px] h-[5px] rounded-full" style={{ background: color }} />
      <span className="font-brutal-mono font-semibold text-[11px] tracking-[0.2em]" style={{ color }}>{label}</span>
    </div>
  )
}

export function short(str, len = 8) {
  if (!str) return '—'
  if (str.length <= len * 2 + 3) return str
  return `${str.slice(0, len)}…${str.slice(-len)}`
}
