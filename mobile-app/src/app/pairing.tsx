import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { RadialGlow } from '@/components/radial-glow';
import { ViewfinderBrackets } from '@/components/viewfinder-brackets';
import { Palette } from '@/constants/theme';
import { body, display, mono } from '@/constants/typography';
import { useDevice, type DeviceKind } from '@/hooks/use-device';

const DEVICES: { id: DeviceKind; name: string; note: string; dot: string }[] = [
  { id: 'hotshoe', name: 'VERIS Hotshoe', note: 'CLIPS TO YOUR CAMERA', dot: Palette.orange },
  { id: 'clip', name: 'VERIS Clip', note: 'CLIPS TO YOUR PHONE', dot: Palette.ink },
];

export default function PairingScreen() {
  const router = useRouter();
  const { pairing, pair, skip } = useDevice();
  const [justPaired, setJustPaired] = useState<DeviceKind | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);
  const busy = !!pairing || !!justPaired;

  const leaveToPortal = () => router.replace('/portal');

  const handlePair = async (id: DeviceKind) => {
    setPairError(null);
    const result = await pair(id);
    if (!result.ok) {
      setPairError(result.reason);
      return;
    }
    setJustPaired(id);
    setTimeout(leaveToPortal, 600);
  };

  const handleSkip = () => {
    skip();
    leaveToPortal();
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <RadialGlow
        cx={0.5}
        cy={1.08}
        r={0.62}
        stops={[
          [0, 'rgba(231,88,28,.5)', 1],
          [0.68, 'rgba(231,88,28,0)', 1],
        ]}
      />

      <SafeAreaView style={styles.safe}>
        <ViewfinderBrackets />
        <BackButton onPress={handleSkip} style={styles.back} />

        <View style={styles.hero}>
          <Text style={mono(11, { spacing: 0.2, color: Palette.orange })}>HARDWARE / OPTIONAL</Text>
          <Text style={[display(36, { color: Palette.bone, lineHeight: 33 }), styles.heroTitle]}>
            Pair the module{'\n'}that signs your{'\n'}frames.
          </Text>
        </View>

        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={mono(10, { spacing: 0.18, color: 'rgba(16,14,12,.5)' })}>SELECT A DEVICE</Text>
            <Text style={mono(10, { spacing: 0.18, color: 'rgba(16,14,12,.5)' })}>
              {pairing ? 'PAIRING…' : '2 AVAILABLE'}
            </Text>
          </View>

          <View style={styles.deviceList}>
            {DEVICES.map((d) => {
              const isPairing = pairing === d.id;
              const isDone = justPaired === d.id;
              return (
                <Pressable
                  key={d.id}
                  onPress={() => handlePair(d.id)}
                  disabled={busy}
                  style={[styles.deviceRow, isPairing && styles.deviceRowActive]}>
                  <View style={[styles.deviceDot, { backgroundColor: d.dot }]} />
                  <View style={styles.deviceBody}>
                    <Text style={body(14.5, { weight: 'semibold', color: Palette.ink })}>{d.name}</Text>
                    <Text style={mono(10, { spacing: 0.12, color: 'rgba(16,14,12,.45)' })}>{d.note}</Text>
                  </View>
                  <Text
                    style={mono(10, {
                      spacing: 0.14,
                      color: isPairing || isDone ? Palette.orange : 'rgba(16,14,12,.45)',
                    })}>
                    {isDone ? 'PAIRED' : isPairing ? 'PAIRING' : 'PAIR'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {pairError && (
            <Text style={mono(10, { spacing: 0.1, color: Palette.orange, lineHeight: 15 })}>{pairError}</Text>
          )}

          <Pressable onPress={handleSkip} disabled={busy} hitSlop={8} style={styles.skipRow}>
            <Text style={mono(10.5, { spacing: 0.14, color: 'rgba(16,14,12,.5)' })}>SKIP — I&apos;LL PAIR LATER</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.espresso },
  safe: { flex: 1 },
  back: { marginTop: 34, marginLeft: 22 },
  heroTitle: { textTransform: 'uppercase' },
  hero: { paddingHorizontal: 22, marginTop: 28, gap: 14 },
  sheet: {
    marginTop: 'auto',
    backgroundColor: Palette.cream,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 30,
    gap: 16,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deviceList: { gap: 8 },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 15,
    borderRadius: 16,
    backgroundColor: 'rgba(16,14,12,.05)',
    borderWidth: 1,
    borderColor: 'rgba(16,14,12,.1)',
  },
  deviceRowActive: { borderColor: Palette.orange },
  deviceDot: { width: 34, height: 34, borderRadius: 10 },
  deviceBody: { flex: 1, gap: 5 },
  skipRow: { alignItems: 'center', paddingTop: 4 },
});
