import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';

import { Border, Glass, Palette, Radius } from '@/constants/theme';

type Variant = 'onDark' | 'onLight';

type Props = {
  variant?: Variant;
  intensity?: number;
  radius?: number;
  borderWidth?: number;
  borderColor?: string;
  /** Give the glass a brutalist offset shadow too — `true` for ink, or a custom color. */
  shadow?: boolean | string;
  shadowOffset?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  animatedStyle?: AnimatedStyle<ViewStyle>;
  children?: ReactNode;
};

/**
 * Frosted, translucent chrome surface — reserved for floating/overlay
 * elements (dock, sheets, headers, badges) so the glass reads as a distinct
 * material layer above the flat brutalist content underneath.
 */
export function GlassPanel({
  variant = 'onDark',
  intensity = 40,
  radius = Radius.lg,
  borderWidth = Border.thin,
  borderColor,
  shadow,
  shadowOffset = 5,
  style,
  contentStyle,
  animatedStyle,
  children,
}: Props) {
  const tint = variant === 'onDark' ? 'dark' : 'light';
  const overlay = variant === 'onDark' ? Glass.onDark : Glass.onLight;
  const border = borderColor ?? (variant === 'onDark' ? Glass.borderOnDark : Glass.borderOnLight);
  const shadowColor = typeof shadow === 'string' ? shadow : Palette.ink;

  return (
    <View style={style}>
      {shadow ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: shadowOffset,
            left: shadowOffset,
            right: -shadowOffset,
            bottom: -shadowOffset,
            backgroundColor: shadowColor,
            borderRadius: radius,
          }}
        />
      ) : null}
      <Animated.View
        style={[
          { borderRadius: radius, overflow: 'hidden', borderWidth, borderColor: border },
          contentStyle,
          animatedStyle,
        ]}>
        <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: overlay }]} />
        {children}
      </Animated.View>
    </View>
  );
}
