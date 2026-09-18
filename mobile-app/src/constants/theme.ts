/**
 * Veris Hotshoe is a fixed-palette product (not light/dark themed) — the
 * cream/ink/orange identity is the brand, independent of system appearance.
 *
 * Visual language: "brutal glass" — neobrutalist structure (thick ink
 * borders, flat hard-edged offset shadows, blocky press states, chunky
 * uppercase type) for content and controls, with frosted glassmorphic
 * panels reserved for floating chrome (dock, sheets, headers, badges) so
 * the two languages read as one system rather than fighting each other.
 */

export const Palette = {
  cream: '#EDE7DA',
  paper: '#DED8C9',
  ink: '#100E0C',
  orange: '#E7581C',
  orangeHover: '#FF6A2C',
  espresso: '#140B06',
  charcoal: '#0C0A09',
  onyx: '#0B0A09',
  bone: '#F5F1E7',
  /** Verified/authentic accent — the one place the palette says "confirmed" instead of "brand". */
  green: '#1E7A4C',
} as const;

/** Border weights for the neobrutalist stroke — always solid, never soft. */
export const Border = {
  hairline: 1,
  thin: 1.5,
  thick: 2.5,
  heavy: 3,
} as const;

/** Corner radii — small and deliberate, enough to seat a glass highlight without softening the brutalist block. */
export const Radius = {
  none: 0,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 22,
  pill: 999,
} as const;

/** Flat, unblurred offset shadows — the hallmark neobrutalist "sticker" edge. Pair with `Shadow.hard()` below. */
export const Shadow = {
  /** RN shadow props for a hard offset shadow (no blur). `color` should usually be Palette.ink. */
  hard(color: string, x = 5, y = 5) {
    return {
      shadowColor: color,
      shadowOffset: { width: x, height: y },
      shadowOpacity: 1,
      shadowRadius: 0,
      elevation: Math.max(x, y),
    } as const;
  },
} as const;

/** Glassmorphism surface tints — used with `GlassPanel` / `BlurView` overlays only. */
export const Glass = {
  onDark: 'rgba(237,231,218,0.10)',
  onDarkStrong: 'rgba(237,231,218,0.16)',
  onLight: 'rgba(255,255,255,0.38)',
  onLightStrong: 'rgba(255,255,255,0.55)',
  borderOnDark: 'rgba(237,231,218,0.30)',
  borderOnLight: 'rgba(16,14,12,0.14)',
} as const;

/**
 * DigiLocker's own brand colors — sampled from the official logo mark
 * (assets/digilocker/logo.png), not invented. Used only inside the
 * DigiLocker consent screen as co-branding: this identifies whose
 * document panel it is, it never bleeds into the app's own Palette.
 */
export const DigiLocker = {
  purpleDeep: '#583BDF',
  purple: '#6849D6',
  purpleLight: '#9583E7',
  surface: '#F4F2FD',
  surfaceBorder: '#E1DCF9',
} as const;

export const Tones: readonly [string, string, string][] = [
  ['#8d9a86', '#c3c9b4', '#5f6b58'],
  ['#c98a4b', '#e6c79a', '#8c5a2b'],
  ['#7d8894', '#b8c2c9', '#4f5a63'],
  ['#a8a093', '#d6cfc0', '#6f685c'],
  ['#b4634a', '#e0a58c', '#7a3b2a'],
  ['#6f7a6a', '#a9b39c', '#464f42'],
  ['#9a8fa1', '#cfc6d3', '#5f5766'],
  ['#c2b071', '#e6dcb4', '#84763f'],
];

export const FontFamily = {
  display: 'ArchivoBlack_400Regular',
  bodyRegular: 'Archivo_400Regular',
  bodyMedium: 'Archivo_500Medium',
  bodySemiBold: 'Archivo_600SemiBold',
  bodyBold: 'Archivo_700Bold',
  monoRegular: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  monoSemiBold: 'IBMPlexMono_600SemiBold',
} as const;

/** CSS letter-spacing was authored in `em`; RN wants points. */
export function em(fontSize: number, value: number) {
  return fontSize * value;
}

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;
