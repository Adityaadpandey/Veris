import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { GlassPanel } from '@/components/glass-panel';
import { RadialGlow } from '@/components/radial-glow';
import { VerifyPanel } from '@/components/verify-panel';
import { Border, Palette, Radius } from '@/constants/theme';
import { body, display, mono } from '@/constants/typography';

type Props = {
  onLeave: () => void;
  onOpenRealClaim: (claimId: string) => void;
};

export function SearchScreen({ onLeave, onOpenRealClaim }: Props) {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <RadialGlow
        cx={0.24}
        cy={0}
        r={0.72}
        stops={[
          [0, 'rgba(231,88,28,.4)', 1],
          [0.68, 'rgba(231,88,28,0)', 1],
        ]}
      />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <BackButton onPress={onLeave} />
            <GlassPanel variant="onDark" intensity={36} radius={Radius.xs} borderWidth={Border.hairline} contentStyle={styles.registryChip}>
              <Text style={mono(10, { spacing: 0.18, color: 'rgba(237,231,218,.55)' })}>REGISTRY / PUBLIC</Text>
            </GlassPanel>
          </View>

          <Text style={[display(36, { color: Palette.bone, lineHeight: 33 }), styles.title]}>Verify a{'\n'}frame.</Text>
          <Text style={[body(13, { color: 'rgba(237,231,218,.55)', lineHeight: 18.85 }), styles.subtitle]}>
            Every sealed photo lives on-chain. Drop a file below to check it against the registry.
          </Text>

          <VerifyPanel onOpenClaim={onOpenRealClaim} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.espresso },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 140 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  registryChip: { paddingHorizontal: 12, paddingVertical: 8 },
  title: { marginTop: 22, textTransform: 'uppercase' },
  subtitle: { marginTop: 10, maxWidth: 270 },
});
