import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { GlassPanel } from '@/components/glass-panel';
import type { CaptureOutcome } from '@/components/capture-result-sheet';
import { Border, Palette, Radius } from '@/constants/theme';
import { mono } from '@/constants/typography';

type ToastOutcome = Extract<CaptureOutcome, { status: 'sealed' | 'unverified' }>;

type Props = {
  outcome: ToastOutcome;
  /** Distance from the bottom safe area — passed in so it clears the shutter row without this component knowing about insets. */
  bottomOffset: number;
  onView: () => void;
  onDismiss: () => void;
};

/**
 * Small self-dismissing hand-off for outcomes that don't need a hard stop —
 * the camera and shutter stay live underneath so the next shot can happen
 * immediately, unlike the full-screen sheet used for queued/failed.
 */
export function CaptureToast({ outcome, bottomOffset, onView, onDismiss }: Props) {
  const translateY = useSharedValue(24);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(1, { duration: 200 });
  }, [opacity, translateY]);

  const wrapStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const isSealed = outcome.status === 'sealed';
  const accent = isSealed ? Palette.green : Palette.orange;
  const title = isSealed ? 'SEALED' : 'IMPORTED';

  return (
    <View style={[styles.wrap, { bottom: bottomOffset }]} pointerEvents="box-none">
      <Animated.View style={wrapStyle}>
        <GlassPanel
          variant="onDark"
          intensity={50}
          radius={Radius.pill}
          borderWidth={Border.thick}
          borderColor={Palette.ink}
          shadow={Palette.ink}
          shadowOffset={4}
          contentStyle={styles.card}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text style={mono(10, { weight: 'semibold', spacing: 0.14, color: Palette.bone })}>{title}</Text>
          <Pressable onPress={onView} hitSlop={8} style={styles.viewButton}>
            <Text style={mono(10, { weight: 'semibold', spacing: 0.1, color: accent })}>VIEW →</Text>
          </Pressable>
          <Pressable onPress={onDismiss} hitSlop={8}>
            <Text style={mono(12, { color: 'rgba(237,231,218,.45)' })}>×</Text>
          </Pressable>
        </GlassPanel>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 20, right: 20, alignItems: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, paddingVertical: 11 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  viewButton: { marginLeft: 2 },
});
