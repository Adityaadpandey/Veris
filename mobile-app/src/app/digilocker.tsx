import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { BrutalBlock } from '@/components/brutal-block';
import { PillButton } from '@/components/pill-button';
import { RadialGlow } from '@/components/radial-glow';
import { ViewfinderBrackets } from '@/components/viewfinder-brackets';
import { Border, DigiLocker, Palette, Radius } from '@/constants/theme';
import { body, display, mono } from '@/constants/typography';
import { useDigilocker } from '@/hooks/use-digilocker';

const SHARED_ITEMS: { label: string; note: string }[] = [
  { label: 'Aadhaar e-KYC', note: 'Name · photo · masked ID' },
  { label: 'Address proof', note: 'If issued to your DigiLocker' },
];

export default function DigilockerScreen() {
  const router = useRouter();
  const { verified, verifying, error, profile, startVerification } = useDigilocker();

  // Only auto-advance right after THIS screen completes verification —
  // never as a side effect of the persisted flag already being true (e.g.
  // when the user pressed back from /wallet). That's what was hijacking
  // the back button: it used to fire on every mount where verified===true.
  const handleVerify = async () => {
    const success = await startVerification();
    if (success) router.replace('/wallet');
  };

  // Still loading the persisted flag from storage — avoid a flash of the wrong state.
  if (verified === undefined) return null;

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
        <BackButton onPress={() => router.back()} style={styles.back} />

        <View style={styles.hero}>
          <Text style={mono(11, { spacing: 0.2, color: Palette.orange })}>IDENTITY / GOVT-ISSUED</Text>
          <Text style={[display(38, { color: Palette.bone, lineHeight: 35 }), styles.heroTitle]}>
            Verify you&apos;re{'\n'}the human{'\n'}behind the lens.
          </Text>
        </View>

        <BrutalBlock
          backgroundColor={Palette.cream}
          borderColor={Palette.ink}
          radius={Radius.lg}
          offset={0}
          style={styles.sheetWrap}
          contentStyle={styles.sheet}>
          {verified ? (
            <>
              <DigilockerBrandCard />

              <View style={styles.verifiedRow}>
                <View style={styles.verifiedCheck}>
                  <Text style={styles.verifiedCheckMark}>✓</Text>
                </View>
                <View style={styles.itemBody}>
                  <Text style={body(14.5, { weight: 'semibold', color: Palette.ink })}>
                    {profile?.name ?? 'Identity confirmed'}
                  </Text>
                  <Text style={mono(10, { spacing: 0.12, color: 'rgba(16,14,12,.45)' })}>
                    {profile?.docType ?? 'AADHAAR E-KYC'} · VERIFIED
                  </Text>
                </View>
              </View>

              <PillButton
                label="CONTINUE TO WALLET"
                onPress={() => router.replace('/wallet')}
                backgroundColor={Palette.orange}
                textColor={Palette.bone}
                arrow
                fullWidth
              />
            </>
          ) : (
            <>
              <DigilockerBrandCard status={verifying ? 'Redirecting to DigiLocker…' : undefined} />

              <View style={styles.itemList}>
                {SHARED_ITEMS.map((item, i) => (
                  <View key={item.label} style={[styles.itemRow, i > 0 && styles.itemRowDivider]}>
                    <View style={styles.itemBullet} />
                    <View style={styles.itemBody}>
                      <Text style={body(14, { weight: 'medium', color: Palette.ink })}>{item.label}</Text>
                      <Text style={mono(9.5, { spacing: 0.1, color: 'rgba(16,14,12,.45)' })}>{item.note}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {error && (
                <Text style={mono(10, { spacing: 0.1, color: Palette.orange, lineHeight: 16 })}>{error}</Text>
              )}

              <PillButton
                label={verifying ? 'WAITING FOR DIGILOCKER…' : 'CONNECT DIGILOCKER'}
                onPress={handleVerify}
                disabled={verifying}
                backgroundColor={Palette.orange}
                textColor={Palette.bone}
                arrow={!verifying}
                fullWidth
              />

              <Text style={mono(10, { spacing: 0.1, color: 'rgba(16,14,12,.4)', lineHeight: 16 })}>
                YOU&apos;LL SIGN IN ON DIGILOCKER&apos;S OWN PAGE. WE NEVER SEE YOUR AADHAAR NUMBER OR PASSWORD.
              </Text>
            </>
          )}
        </BrutalBlock>
      </SafeAreaView>
    </View>
  );
}

/**
 * Co-branded identity card — DigiLocker's own mark and colors, seated as a
 * soft (non-brutalist) surface inside our sheet. Signals "this next part is
 * DigiLocker's UI, not ours," the way a Google/Apple sign-in panel would.
 */
function DigilockerBrandCard({ status }: { status?: string }) {
  return (
    <View style={styles.brandCard}>
      <Image source={require('@/assets/digilocker/logo.png')} style={styles.brandLogo} contentFit="contain" />
      <View style={{ flex: 1 }}>
        <Text style={[display(14, { color: DigiLocker.purpleDeep }), styles.brandWordmark]}>DigiLocker</Text>
        <Text style={mono(9, { spacing: 0.08, color: 'rgba(88,59,223,.65)', lineHeight: 13 })}>
          {status ?? 'GOVERNMENT OF INDIA · DIGITAL DOCUMENT WALLET'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.espresso },
  safe: { flex: 1 },
  back: { marginTop: 34, marginLeft: 22 },
  heroTitle: { textTransform: 'uppercase' },
  hero: { paddingHorizontal: 22, marginTop: 28, gap: 14 },
  sheetWrap: { marginTop: 'auto' },
  sheet: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 34,
    gap: 16,
  },
  brandCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: DigiLocker.surface,
    borderWidth: 1,
    borderColor: DigiLocker.surfaceBorder,
    borderRadius: Radius.md,
    padding: 13,
  },
  brandLogo: { width: 34, height: 34, borderRadius: 17 },
  brandWordmark: { textTransform: 'none' },
  itemList: { gap: 2 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 12,
  },
  itemRowDivider: {
    borderTopWidth: Border.hairline,
    borderTopColor: 'rgba(16,14,12,.1)',
  },
  itemBullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: DigiLocker.purple },
  itemBody: { flex: 1, gap: 4 },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  verifiedCheck: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Palette.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedCheckMark: { color: Palette.bone, fontSize: 15, fontWeight: '700' },
});
