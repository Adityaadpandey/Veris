import { Redirect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalBlock } from '@/components/brutal-block';
import { Border, Palette, Radius } from '@/constants/theme';
import { body, display, mono } from '@/constants/typography';
import { useDevice } from '@/hooks/use-device';

// DEMO: static value — no real hardware telemetry channel exists yet.
const SYNC_LATENCY_MS = 42;
// DEMO: static value
const FRAMES_CAPTURED_TODAY = 24;
// DEMO: static value
const FRAMES_SIGNED_TODAY = 24;
// DEMO: static value
const LAST_FRAME_AGO = '2M AGO';

export default function MonitorScreen() {
  const router = useRouter();
  const { paired } = useDevice();

  // Only a paired Hotshoe has a shutter-side signing pipeline to watch — a Clip
  // signs from Click Photo instead, and "no device" has nothing to show. Same
  // guard shape capture.tsx uses for its own clip-only gate.
  if (paired !== undefined && paired !== 'hotshoe') return <Redirect href="/portal" />;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={mono(10, { spacing: 0.2, color: 'rgba(16,14,12,.5)' })}>SYNC MONITOR</Text>
          <Text style={[display(34, { color: Palette.ink, lineHeight: 31 }), styles.title]}>
            Shutter{'\n'}to seal.
          </Text>
          <Text style={[body(13, { color: 'rgba(16,14,12,.55)', lineHeight: 18 }), styles.subtitle]}>
            Live status from the module clipped into your camera&apos;s shutter.
          </Text>

          <Pressable onPress={() => router.push('/trigger')}>
            <BrutalBlock
              backgroundColor={Palette.ink}
              borderColor={Palette.ink}
              offset={5}
              radius={Radius.lg}
              style={styles.deviceWrap}
              contentStyle={styles.deviceCard}>
              <View style={styles.deviceHeader}>
                <Text style={mono(10, { spacing: 0.18, color: 'rgba(237,231,218,.55)' })}>PAIRED DEVICE</Text>
                <Text style={mono(10, { spacing: 0.18, color: Palette.orange })}>TRIGGER →</Text>
              </View>
              <Text style={[display(22, { color: Palette.bone }), { marginTop: 10 }]}>VERIS Hotshoe #0043</Text>
              <Text style={[mono(10, { spacing: 0.1, color: 'rgba(237,231,218,.5)' }), { marginTop: 6 }]}>
                CLIPPED IN · KEY IN SECURE ELEMENT
              </Text>
            </BrutalBlock>
          </Pressable>

          <BrutalBlock
            backgroundColor={Palette.cream}
            borderColor={Palette.ink}
            offset={4}
            radius={Radius.md}
            style={styles.statWrap}>
            <View style={styles.statGrid}>
              <StatCell label="X-SYNC LATENCY" value={`${SYNC_LATENCY_MS}ms`} sub="NOMINAL" subColor={Palette.green} />
              <StatCell
                label="FRAMES TODAY"
                value={String(FRAMES_SIGNED_TODAY)}
                sub={`${FRAMES_CAPTURED_TODAY} CAPTURED`}
                subColor="rgba(16,14,12,.5)"
                divider
              />
              <StatCell label="LAST FRAME" value={LAST_FRAME_AGO} sub="VERIFIED" subColor={Palette.green} divider />
            </View>
          </BrutalBlock>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function StatCell({
  label,
  value,
  sub,
  subColor,
  divider,
}: {
  label: string;
  value: string;
  sub: string;
  subColor: string;
  divider?: boolean;
}) {
  return (
    <View style={[styles.statCell, divider && styles.statCellDivider]}>
      <Text style={display(20, { color: Palette.ink })}>{value}</Text>
      <Text style={[mono(9, { spacing: 0.14, color: 'rgba(16,14,12,.5)' }), { marginTop: 5 }]}>{label}</Text>
      <Text style={[mono(8.5, { spacing: 0.12, color: subColor }), { marginTop: 4 }]}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.cream },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 140 },
  title: { marginTop: 10, textTransform: 'uppercase' },
  subtitle: { marginTop: 10, maxWidth: 280 },
  deviceWrap: { marginTop: 22 },
  deviceCard: { padding: 16 },
  deviceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statWrap: { marginTop: 16 },
  statGrid: { flexDirection: 'row' },
  statCell: { flex: 1, padding: 13, paddingHorizontal: 12 },
  statCellDivider: { borderLeftWidth: Border.thin, borderLeftColor: 'rgba(16,14,12,.14)' },
});
