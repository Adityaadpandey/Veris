import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalBlock } from '@/components/brutal-block';
import { GlassPanel } from '@/components/glass-panel';
import { RadialGlow } from '@/components/radial-glow';
import { ViewfinderBrackets } from '@/components/viewfinder-brackets';
import { Border, Palette, Radius } from '@/constants/theme';
import { display, mono } from '@/constants/typography';
import { useBrutalPress } from '@/hooks/use-brutal-press';
import { useConnection } from '@/hooks/use-connection';
import { useDevice } from '@/hooks/use-device';
import { useDigilocker } from '@/hooks/use-digilocker';

const SPEC_TAGS = ['HARDWARE-SIGNED', 'AI-VERIFIED', 'NO CLOUD ROUNDTRIP'];

export default function LandingScreen() {
  const router = useRouter();
  const { connected } = useConnection();
  const { verified } = useDigilocker();
  const { paired } = useDevice();
  const ownerPress = useBrutalPress(4);
  const searchPress = useBrutalPress(4);

  const goWallet = () => {
    if (connected) return router.push(paired === 'hotshoe' ? '/monitor' : '/portal');
    // Identity check happens once, before the wallet connect step.
    if (verified) return router.push('/wallet');
    return router.push('/digilocker');
  };
  const goSearchPublic = () => router.push('/verify');

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <RadialGlow
        cx={0.72}
        cy={0.06}
        r={0.6}
        stops={[
          [0, 'rgba(231,88,28,.32)', 1],
          [0.72, 'rgba(231,88,28,0)', 1],
        ]}
      />

      <SafeAreaView style={styles.safe}>
        <ViewfinderBrackets />

        <View style={styles.header}>
          <View style={styles.wordmark}>
            <View style={styles.dot} />
            <Text style={mono(11, { weight: 'semibold', spacing: 0.22, color: Palette.cream })}>VERIS</Text>
          </View>
          <GlassPanel variant="onDark" intensity={36} radius={Radius.xs} borderWidth={Border.hairline} contentStyle={styles.buildChip}>
            <Text style={mono(10, { spacing: 0.18, color: 'rgba(237,231,218,.65)' })}>VHS-P1 / EN</Text>
          </GlassPanel>
        </View>

        <View style={styles.hero}>
          <Text style={mono(10, { spacing: 0.2, color: Palette.orange })}>SHUTTER-SYNCED SIGNING MODULE</Text>
          <Text style={[display(53, { color: Palette.bone, lineHeight: 45 }), styles.heroTitle]}>
            Proof{'\n'}at the{'\n'}shutter
            <Text style={{ color: Palette.orange }}>.</Text>
          </Text>
        </View>

        <View style={styles.specsStrip}>
          {SPEC_TAGS.map((tag, i) => (
            <View key={tag} style={styles.specsItem}>
              {i > 0 && <View style={styles.specsDot} />}
              <Text style={mono(9, { spacing: 0.14, color: 'rgba(237,231,218,.5)' })}>{tag}</Text>
            </View>
          ))}
        </View>

        <View style={styles.deviceSection}>
          <Image
            source={require('@/assets/hotshoe/hotshoe-peek.png')}
            contentFit="contain"
            style={styles.deviceImage}
          />
        </View>

        <View style={styles.actions}>
          <Pressable onPress={goWallet} onPressIn={ownerPress.onPressIn} onPressOut={ownerPress.onPressOut}>
            <GlassPanel
              variant="onDark"
              intensity={38}
              radius={Radius.md}
              borderWidth={Border.thick}
              borderColor="rgba(237,231,218,.4)"
              shadow="rgba(0,0,0,.55)"
              shadowOffset={4}
              animatedStyle={ownerPress.style}
              contentStyle={styles.rowGhost}>
              <Text style={mono(10, { spacing: 0.16, color: 'rgba(237,231,218,.45)' })}>01</Text>
              <View style={styles.rowBody}>
                <Text style={[display(19, { color: Palette.bone })]}>Owner portal</Text>
                <Text style={mono(10, { spacing: 0.12, color: 'rgba(237,231,218,.5)' })}>
                  CONNECT WALLET · YOUR ARCHIVE
                </Text>
              </View>
              <Text style={styles.rowArrow}>→</Text>
            </GlassPanel>
          </Pressable>

          <Pressable onPress={goSearchPublic} onPressIn={searchPress.onPressIn} onPressOut={searchPress.onPressOut}>
            <BrutalBlock
              backgroundColor={Palette.orange}
              borderColor={Palette.ink}
              offset={4}
              radius={Radius.md}
              animatedStyle={searchPress.style}
              contentStyle={styles.rowSolid}>
              <Text style={mono(10, { spacing: 0.16, color: 'rgba(20,11,6,.6)' })}>02</Text>
              <View style={styles.rowBody}>
                <Text style={[display(19, { color: Palette.espresso })]}>Verify a photo</Text>
                <Text style={mono(10, { spacing: 0.12, color: 'rgba(20,11,6,.65)' })}>
                  AI SEARCH · NO WALLET NEEDED
                </Text>
              </View>
              <Text style={[styles.rowArrow, { color: Palette.espresso }]}>↗</Text>
            </BrutalBlock>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.charcoal, overflow: 'hidden' },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    marginTop: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, backgroundColor: Palette.orange, borderRadius: Radius.xs / 2 },
  buildChip: { paddingHorizontal: 10, paddingVertical: 6 },
  hero: { paddingHorizontal: 24, marginTop: 22, gap: 16 },
  heroTitle: { textTransform: 'uppercase' },
  specsStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    marginTop: 18,
  },
  specsItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  specsDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: Palette.orange },
  deviceSection: {
    flex: 1,
    minHeight: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deviceImage: {
    width: '62%',
    aspectRatio: 495 / 468,
  },
  actions: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    gap: 10,
  },
  rowGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  rowSolid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  rowBody: { flex: 1, gap: 7 },
  rowArrow: { fontSize: 16, color: Palette.bone },
});
