import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';

import { Border, Palette, Radius } from '@/constants/theme';

type Props = {
  backgroundColor: string;
  borderColor?: string;
  shadowColor?: string;
  borderWidth?: number;
  radius?: number;
  /** Distance of the flat offset shadow — also the press-travel distance when `animatedStyle` is supplied. */
  offset?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** Reanimated style (e.g. from `useBrutalPress`) applied to the front content layer, for a pressed-flush effect. */
  animatedStyle?: AnimatedStyle<ViewStyle>;
  children?: ReactNode;
};

/**
 * The neobrutalist "sticker" block: a solid content layer sitting over a
 * flat, unblurred offset duplicate of itself. No shadow blur anywhere —
 * the hard edge is the point.
 */
export function BrutalBlock({
  backgroundColor,
  borderColor = Palette.ink,
  shadowColor = Palette.ink,
  borderWidth = Border.thick,
  radius = Radius.md,
  offset = 5,
  style,
  contentStyle,
  animatedStyle,
  children,
}: Props) {
  return (
    <View style={style}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: offset,
          left: offset,
          right: -offset,
          bottom: -offset,
          backgroundColor: shadowColor,
          borderRadius: radius,
        }}
      />
      <Animated.View
        style={[
          {
            backgroundColor,
            borderWidth,
            borderColor,
            borderRadius: radius,
            overflow: 'hidden',
          },
          contentStyle,
          animatedStyle,
        ]}>
        {children}
      </Animated.View>
    </View>
  );
}
