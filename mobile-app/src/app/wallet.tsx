import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { BrutalBlock } from '@/components/brutal-block';
import { PillButton } from '@/components/pill-button';
import { RadialGlow } from '@/components/radial-glow';
import { ViewfinderBrackets } from '@/components/viewfinder-brackets';
import { Palette } from '@/constants/theme';
import { display, mono } from '@/constants/typography';
import { useConnection } from '@/hooks/use-connection';
import { useDevice } from '@/hooks/use-device';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const METAMASK_BUTTON_LABEL: Record<string, string> = {
  idle: 'CONNECT METAMASK',
  connecting: 'OPENING METAMASK…',
  'awaiting-signature': 'WAITING FOR SIGNATURE…',
  linking: 'LOGGING IN…',
  error: 'TRY AGAIN',
};

export default function WalletScreen() {
  const router = useRouter();
  const {
    connected,
    otpStage,
    otpError,
    sendCode,
    verifyCode,
    metamaskStage,
    metamaskError,
    loginWithMetaMaskWallet,
  } = useConnection();
  const { paired, pairingSeen } = useDevice();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);

  const busy = otpStage === 'sending' || otpStage === 'verifying';

  useEffect(() => {
    if (!connected) return;
    // Wait for the persisted pairing-seen flag before deciding — otherwise a
    // returning user would flash through /pairing again on every reconnect.
    if (pairingSeen === undefined || paired === undefined) return;
    if (!pairingSeen) return router.replace('/pairing');
    // A Hotshoe owner lands on the ambient monitor dashboard instead of the portal grid.
    router.replace(paired === 'hotshoe' ? '/monitor' : '/portal');
  }, [connected, pairingSeen, paired, router]);

  const handleSendCode = async () => {
    if (!EMAIL_RE.test(email.trim())) return;
    const ok = await sendCode(email.trim());
    if (ok) setCodeSent(true);
  };

  const handleVerify = async () => {
    if (code.trim().length === 0) return;
    await verifyCode(email.trim(), code.trim());
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
        <BackButton onPress={() => router.back()} style={styles.back} />

        <View style={styles.hero}>
          <Text style={mono(11, { spacing: 0.2, color: Palette.orange })}>SIGN IN / NO PASSWORD</Text>
          <Text style={[display(38, { color: Palette.bone, lineHeight: 35 }), styles.heroTitle]}>
            Connect the{'\n'}wallet that{'\n'}holds you.
          </Text>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <BrutalBlock
            backgroundColor={Palette.cream}
            borderColor={Palette.ink}
            radius={24}
            offset={0}
            style={styles.sheetWrap}
            contentStyle={styles.sheet}>
            {!codeSent ? (
              <>
                <View style={styles.sheetHeader}>
                  <Text style={mono(10, { spacing: 0.18, color: 'rgba(16,14,12,.5)' })}>EMAIL</Text>
                </View>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="rgba(16,14,12,.4)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  editable={!busy}
                  style={styles.input}
                />
                <PillButton
                  label={otpStage === 'sending' ? 'SENDING…' : 'SEND CODE'}
                  onPress={handleSendCode}
                  disabled={busy || !EMAIL_RE.test(email.trim())}
                  backgroundColor={Palette.ink}
                  textColor={Palette.cream}
                  arrow
                  fullWidth
                />
              </>
            ) : (
              <>
                <View style={styles.sheetHeader}>
                  <Text style={mono(10, { spacing: 0.18, color: 'rgba(16,14,12,.5)' })}>CODE SENT TO {email}</Text>
                </View>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder="000000"
                  placeholderTextColor="rgba(16,14,12,.4)"
                  keyboardType="number-pad"
                  editable={!busy}
                  style={styles.input}
                />
                <PillButton
                  label={otpStage === 'verifying' ? 'VERIFYING…' : 'VERIFY & CONTINUE'}
                  onPress={handleVerify}
                  disabled={busy || code.trim().length === 0}
                  backgroundColor={Palette.ink}
                  textColor={Palette.cream}
                  arrow
                  fullWidth
                />
                <Pressable
                  onPress={() => {
                    setCodeSent(false);
                    setCode('');
                  }}
                  disabled={busy}
                  hitSlop={8}
                  style={styles.changeEmail}>
                  <Text style={mono(10, { spacing: 0.14, color: 'rgba(16,14,12,.5)' })}>USE A DIFFERENT EMAIL</Text>
                </Pressable>
              </>
            )}

            {!codeSent && (
              <>
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={mono(9.5, { spacing: 0.14, color: 'rgba(16,14,12,.4)' })}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>
                <PillButton
                  label={METAMASK_BUTTON_LABEL[metamaskStage]}
                  onPress={loginWithMetaMaskWallet}
                  disabled={busy || (metamaskStage !== 'idle' && metamaskStage !== 'error')}
                  backgroundColor={Palette.bone}
                  textColor={Palette.ink}
                  arrow
                  fullWidth
                />
                {metamaskError && (
                  <Text style={[mono(10, { spacing: 0.1, color: Palette.orange }), styles.errorText]}>
                    {metamaskError}
                  </Text>
                )}
              </>
            )}

            {otpError && (
              <Text style={[mono(10, { spacing: 0.1, color: Palette.orange }), styles.errorText]}>{otpError}</Text>
            )}

            <Text style={mono(10, { spacing: 0.1, color: 'rgba(16,14,12,.4)', lineHeight: 16 })}>
              SECURED BY PRIVY. YOUR WALLET IS CREATED AND ENCRYPTED FOR YOU — NO SEED PHRASE TO LOSE.
            </Text>
          </BrutalBlock>
        </KeyboardAvoidingView>
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
  sheetWrap: { marginTop: 'auto' },
  sheet: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 34,
    gap: 14,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: {
    borderWidth: 1.5,
    borderColor: 'rgba(16,14,12,.2)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Palette.ink,
    backgroundColor: Palette.bone,
  },
  changeEmail: { alignSelf: 'center', paddingVertical: 4 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(16,14,12,.12)' },
  errorText: { marginTop: -4 },
});
