import type { TextStyle } from 'react-native';

import { em, FontFamily } from '@/constants/theme';

type MonoWeight = 'regular' | 'medium' | 'semibold';
type BodyWeight = 'regular' | 'medium' | 'semibold' | 'bold';

const MONO_FAMILY: Record<MonoWeight, string> = {
  regular: FontFamily.monoRegular,
  medium: FontFamily.monoMedium,
  semibold: FontFamily.monoSemiBold,
};

const BODY_FAMILY: Record<BodyWeight, string> = {
  regular: FontFamily.bodyRegular,
  medium: FontFamily.bodyMedium,
  semibold: FontFamily.bodySemiBold,
  bold: FontFamily.bodyBold,
};

/** IBM Plex Mono labels — the design's recurring uppercase micro-copy. */
export function mono(
  size: number,
  opts: { weight?: MonoWeight; spacing?: number; color?: string; lineHeight?: number } = {}
): TextStyle {
  const { weight = 'medium', spacing = 0.14, color, lineHeight } = opts;
  return {
    fontFamily: MONO_FAMILY[weight],
    fontSize: size,
    letterSpacing: em(size, spacing),
    lineHeight,
    ...(color ? { color } : null),
  };
}

/** Archivo Black display headlines. */
export function display(size: number, opts: { color?: string; spacing?: number; lineHeight?: number } = {}): TextStyle {
  const { color, spacing = -0.03, lineHeight } = opts;
  return {
    fontFamily: FontFamily.display,
    fontSize: size,
    letterSpacing: em(size, spacing),
    lineHeight,
    textTransform: 'uppercase',
    ...(color ? { color } : null),
  };
}

/** Archivo body copy. */
export function body(
  size: number,
  opts: { weight?: BodyWeight; color?: string; lineHeight?: number; spacing?: number } = {}
): TextStyle {
  const { weight = 'regular', color, lineHeight, spacing } = opts;
  return {
    fontFamily: BODY_FAMILY[weight],
    fontSize: size,
    lineHeight,
    ...(spacing !== undefined ? { letterSpacing: em(size, spacing) } : null),
    ...(color ? { color } : null),
  };
}
