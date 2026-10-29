import { Redirect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalBlock } from '@/components/brutal-block';
import { Border, Palette, Radius } from '@/constants/theme';
import { body, display, mono } from '@/constants/typography';
import { useConnection } from '@/hooks/use-connection';
import { useDevice } from '@/hooks/use-device';
import { useWalletClaims } from '@/hooks/use-wallet-claims';

/** "2M AGO" style age of the newest frame, from its real claim timestamp. */
function agoLabel(ms: number): string {
  const min = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (min < 1) return 'JUST NOW';
  if (min < 60) return `${min}M AGO`;
  const hr = Math.floor(min / 60);
  return hr < 24 ? `${hr}H AGO` : `${Math.floor(hr / 24)}D AGO`;
}

export default function MonitorScreen() {
  const router = useRouter();
  const { paired } = useDevice();
  const { address } = useConnection();
  const claims = useWalletClaims(address);

  // Real numbers from the wallet's own claims: how many frames today, how many carry a
  // signature, and when the newest one landed.
  const stats = useMemo(() => {
    const startOfDay = new Date().setHours(0, 0, 0, 0);
    const times = claims.map((c) => (c.created_at ? Date.parse(c.created_at) : NaN)).filter((t) => !Number.isNaN(t));
    const today = claims.filter((c) => c.created_at && Date.parse(c.created_at) >= startOfDay);
    return {
      captured: today.length,
      signed: today.filter((c) => c.signature).length,
      lastFrame: times.length ? agoLabel(Math.max(...times)) : '—',
      camera: claims.find((c) => c.camera_id)?.camera_id ?? null,
    };
  }, [claims]);

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
              <Text style={[display(22, { color: Palette.bone }), { marginTop: 10 }]}>VERIS Hotshoe{stats.camera ? ` ${stats.camera.slice(0, 8).toUpperCase()}` : ''}</Text>
              <Text style={[mono(10, { spacing: 0.1, color: 'rgba(237,231,218,.5)' }), { marginTop: 6 }]}>
                PAIRED OVER BLUETOOTH
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
              <StatCell
                label="FRAMES TODAY"
                value={String(stats.signed)}
                sub={`${stats.captured} CAPTURED`}
                subColor="rgba(16,14,12,.5)"
              />
              <StatCell label="LAST FRAME" value={stats.lastFrame} sub="FROM YOUR CLAIMS" subColor="rgba(16,14,12,.5)" divider />
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
