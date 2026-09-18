import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { Palette } from '@/constants/theme';

type Props = {
  /** [offset 0..1 within the glow's own radius, color, opacity][] — center to edge. */
  stops?: [number, string, number][];
  cx?: number;
  cy?: number;
  r?: number;
  style?: StyleProp<ViewStyle>;
};

/** Sub-samples rendered per gap between two stops — higher reads as a smoother falloff. */
const STEPS_PER_BAND = 10;

/**
 * Absolutely-fills its container with a soft radial glow, approximated with
 * plain stacked circles rather than an SVG radial gradient.
 *
 * react-native-svg's `RadialGradient` renders as a flat solid fill instead
 * of an actual gradient on Android — the same class of bug LinearScrim and
 * PhotoThumb's ToneWash already work around for linear gradients — which
 * turned every glow screen solid orange instead of a soft glow. This
 * samples the gradient at many radii and "peels" each ring's own standalone
 * opacity so the discs composite (Porter-Duff "over", outermost drawn
 * first) into the same per-radius alpha a real gradient would show.
 */
export function RadialGlow({
  cx = 0.5,
  cy = 0.3,
  r = 0.7,
  stops = [
    [0, 'rgba(231,88,28,.45)', 1],
    [0.7, 'rgba(231,88,28,0)', 1],
  ],
  style,
}: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize(e.nativeEvent.layout);

  const base = Math.max(size.width, size.height);
  const centerX = cx * size.width;
  const centerY = cy * size.height;

  // Sample the piecewise-linear gradient at many radii, center to edge.
  const samples: { offset: number; color: string; alpha: number }[] = [];
  for (let i = 0; i < stops.length; i++) {
    const [offset, color, alpha] = stops[i];
    const next = stops[i + 1];
    const steps = next ? STEPS_PER_BAND : 1;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const off = next ? offset + (next[0] - offset) * t : offset;
      const a = next ? alpha + (next[2] - alpha) * t : alpha;
      samples.push({ offset: off, color, alpha: Math.min(Math.max(a, 0), 1) });
    }
  }

  // Walk outermost sample inward, solving each ring's own standalone opacity
  // so the running composite matches the sampled target at that radius.
  const discs: { color: string; opacity: number; radius: number }[] = [];
  let cumulative = 0;
  for (let k = samples.length - 1; k >= 0; k--) {
    const { offset, color, alpha } = samples[k];
    const ringAlpha = alpha > cumulative ? (alpha - cumulative) / Math.max(1 - cumulative, 0.0001) : 0;
    if (ringAlpha > 0.002) {
      discs.push({ color, opacity: Math.min(ringAlpha, 1), radius: offset * r * base });
    }
    cumulative = Math.max(cumulative, alpha);
  }

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: Palette.ink, overflow: 'hidden' }, style]}
      onLayout={onLayout}>
      {size.width > 0 &&
        size.height > 0 &&
        discs.map(({ color, opacity, radius }, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: centerX - radius,
              top: centerY - radius,
              width: radius * 2,
              height: radius * 2,
              borderRadius: radius,
              backgroundColor: color,
              opacity,
            }}
          />
        ))}
    </View>
  );
}
