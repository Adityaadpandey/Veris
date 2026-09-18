import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlassPanel } from '@/components/glass-panel';
import { PillButton } from '@/components/pill-button';
import { RadialGlow } from '@/components/radial-glow';
import { ViewfinderBrackets } from '@/components/viewfinder-brackets';
import { ONBOARD_BEATS } from '@/constants/onboarding';
import { Border, Palette, Radius } from '@/constants/theme';
import { body, display, mono } from '@/constants/typography';

const BEAT_DURATION = 4200;

export default function OnboardingScreen() {
  const router = useRouter();
  const [beat, setBeat] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: BEAT_DURATION, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(setBeat)((prev) => (prev + 1) % ONBOARD_BEATS.length);
    });
  }, [beat, progress]);

  const enterApp = () => router.replace('/landing');
  const next = () => setBeat((b) => Math.min(b + 1, ONBOARD_BEATS.length - 1));
  const isLast = beat === ONBOARD_BEATS.length - 1;
  const current = ONBOARD_BEATS[beat];

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <RadialGlow
        cx={0.4}
        cy={0.28}
        r={0.7}
        stops={[
          [0, '#FFCE58', 0.55],
          [0.4, Palette.orange, 0.36],
          [0.74, Palette.orange, 0],
        ]}
      />

      <SafeAreaView style={styles.safe}>
        <ViewfinderBrackets />
        <View style={styles.header}>
          <View style={styles.wordmark}>
            <View style={styles.dot} />
            <Text style={mono(11, { weight: 'semibold', spacing: 0.22, color: Palette.cream })}>VERIS</Text>
            <Text style={mono(11, { spacing: 0.22, color: 'rgba(237,231,218,.42)' })}>HOTSHOE</Text>
          </View>
          <Pressable onPress={enterApp} hitSlop={8}>
            <GlassPanel variant="onDark" intensity={36} radius={Radius.xs} borderWidth={Border.hairline} contentStyle={styles.skipChip}>
              <Text style={mono(11, { spacing: 0.16, color: 'rgba(237,231,218,.6)' })}>SKIP</Text>
            </GlassPanel>
          </Pressable>
        </View>

        <View style={styles.bottom}>
          <Animated.View key={beat} entering={FadeInDown.duration(500)} style={styles.textBlock}>
            <View style={styles.kickerRow}>
              <View style={styles.kickerBar} />
            </View>
            <Text style={mono(10.5, { spacing: 0.2, color: Palette.orange })}>{current.kicker}</Text>
            <Text style={[display(33, { color: Palette.bone }), styles.title]}>{current.title}</Text>
            <Text style={body(13, { color: 'rgba(237,231,218,.62)', lineHeight: 19.5 })}>{current.body}</Text>
          </Animated.View>

          <View style={styles.ctaRow}>
            <View style={styles.ticks}>
              {ONBOARD_BEATS.map((_, i) => (
                <Tick key={i} index={i} active={beat} progress={progress} />
              ))}
            </View>
            <PillButton
              label={isLast ? 'ENTER' : 'NEXT'}
              onPress={isLast ? enterApp : next}
              backgroundColor={Palette.orange}
              textColor={Palette.espresso}
              arrow
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function Tick({
  index,
  active,
  progress,
}: {
  index: number;
  active: number;
  progress: SharedValue<number>;
}) {
  const fillStyle = useAnimatedStyle(() => {
    const scale = index < active ? 1 : index === active ? progress.value : 0;
    return { transform: [{ scaleX: scale }] };
  });
  return (
    <View style={[styles.tick, { width: index === active ? 30 : 14 }]}>
      <Animated.View style={[styles.tickFill, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.espresso, overflow: 'hidden' },
  safe: { flex: 1 },
  header: {
    marginTop: 34,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, backgroundColor: Palette.orange, borderRadius: Radius.xs / 2 },
  skipChip: { paddingHorizontal: 12, paddingVertical: 7 },
  bottom: {
    marginTop: 'auto',
    paddingHorizontal: 26,
    paddingBottom: 46,
    gap: 18,
  },
  textBlock: { gap: 12 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kickerBar: { width: 16, height: 3, borderRadius: 2, backgroundColor: Palette.orange },
  title: { textTransform: 'uppercase' },
  ctaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  ticks: { flexDirection: 'row', gap: 6 },
  tick: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(237,231,218,.22)' },
  tickFill: {
    flex: 1,
    backgroundColor: Palette.orange,
    transformOrigin: 'left',
  },
});
