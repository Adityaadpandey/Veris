import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { GlassPanel } from '@/components/glass-panel';
import type { TriggerStage } from '@/hooks/use-pi-trigger';
import { Border, Palette, Radius } from '@/constants/theme';
import { mono } from '@/constants/typography';

const STAGE_LABELS: Partial<Record<TriggerStage, string>> = {
  capturing: 'CAPTURING',
  captured: 'SIGNING…',
  signed: 'SIGNING…',
  tethering: 'TETHERING…',
  uploading: 'UPLOADING…',
};

type Props = {
  stage: TriggerStage;
};

/**
 * Small top-row status pill reflecting the live Pi pipeline — replaces the
 * old full bottom-sheet progress card so the viewfinder stays clear while a
 * capture signs and uploads.
 */
export function CaptureStagePill({ stage }: Props) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(0.35, { duration: 550 }), withTiming(1, { duration: 550 })), -1, true);
  }, [pulse]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <GlassPanel
      variant="onDark"
      intensity={46}
      radius={Radius.pill}
      borderWidth={Border.thin}
      contentStyle={styles.pill}>
      <Animated.View style={[styles.dot, dotStyle]} />
      <Text style={mono(9, { spacing: 0.12, color: Palette.bone })}>{STAGE_LABELS[stage] ?? 'WORKING…'}</Text>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 7 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Palette.orange },
});
