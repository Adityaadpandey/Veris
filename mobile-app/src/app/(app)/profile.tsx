import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalBlock } from '@/components/brutal-block';
import { PillButton } from '@/components/pill-button';
import { CHAIN_LABEL } from '@/constants/config';
import { Border, Palette, Radius } from '@/constants/theme';
import { body, display, mono } from '@/constants/typography';
import { useBrutalPress } from '@/hooks/use-brutal-press';
import { useConnection, type MetaMaskStage } from '@/hooks/use-connection';
import { useDevice } from '@/hooks/use-device';
import { useDigilocker } from '@/hooks/use-digilocker';
import { usePiTrigger } from '@/hooks/use-pi-trigger';
import { shortAddress } from '@/lib/format';

const OWNER_NAME = 'Umyal Dixit';

const STATS = [
  { value: '412', label: 'SEALED', color: Palette.ink },
  { value: '31', label: 'LICENSED', color: Palette.ink },
  { value: '6', label: 'DISPUTES WON', color: Palette.orange },
];

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function todayLabel() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const METAMASK_BUTTON_LABEL: Record<MetaMaskStage, string> = {
  idle: 'CONNECT METAMASK',
  connecting: 'OPENING METAMASK…',
  'awaiting-signature': 'WAITING FOR SIGNATURE…',
  linking: 'LINKING…',
  error: 'TRY AGAIN',
};

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

export default function ProfileScreen() {
  const router = useRouter();
  const {
    address,
    embeddedAddress,
    metamaskAddress,
    activeWallet,
    setActiveWallet,
    metamaskStage,
    metamaskError,
    connectMetaMaskWallet,
    disconnect,
  } = useConnection();
  const { verified, reset: disconnectDigilocker } = useDigilocker();
  const { paired, openPrompt } = useDevice();
  const { connectionState, deviceName, connect: reconnect } = usePiTrigger();
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (key: string) => setExpanded((cur) => (cur === key ? null : key));

  const isLive = connectionState === 'connected';
  const liveLabel =
    connectionState === 'unsupported'
      ? 'NEEDS ANDROID'
      : connectionState === 'connected'
        ? 'CONNECTED'
        : connectionState === 'connecting'
          ? 'CONNECTING…'
          : 'NOT CONNECTED';

  // Signing keys
  const [rotating, setRotating] = useState(false);
  const [rotatedAt, setRotatedAt] = useState('04 MAR 2026');
  const handleRotate = () => {
    Alert.alert(
      'Rotate signing key',
      'Your current key stays valid for frames already sealed. New captures will sign with the new key.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rotate',
          onPress: () => {
            setRotating(true);
            setTimeout(() => {
              setRotating(false);
              setRotatedAt(todayLabel());
              Alert.alert('Key rotated', 'The new signing key is now active in the secure element.');
            }, 900);
          },
        },
      ]
    );
  };

  // Licensing terms
  const [defaultLicence, setDefaultLicence] = useState<'EDITORIAL' | 'COMMERCIAL'>('EDITORIAL');

  // Dispute centre
  const handleFileDispute = () => {
    Alert.alert('File a takedown', 'Open a dispute using your sealed proof as evidence?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Start dispute',
        onPress: () => {
          const ref = `D-${Math.floor(1000 + Math.random() * 9000)}`;
          Alert.alert('Dispute opened', `Reference ${ref}. We'll email next steps within 24 hours.`);
        },
      },
    ]);
  };

  // Destructive rows
  const confirmDisconnectWallet = () => {
    Alert.alert('Disconnect wallet', 'You will need to reconnect a wallet to reach your archive again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: disconnect },
    ]);
  };
  const confirmDisconnectDigilocker = () => {
    Alert.alert('Disconnect DigiLocker', "You'll need to re-verify your identity the next time you connect.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: disconnectDigilocker },
    ]);
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={mono(10, { spacing: 0.2, color: 'rgba(16,14,12,.5)' })}>PROFILE / KEYS &amp; DEVICE</Text>

          <View style={styles.identity}>
            <BrutalBlock backgroundColor={Palette.ink} borderColor={Palette.ink} offset={3} radius={Radius.md} contentStyle={styles.avatar}>
              <Text style={display(20, { color: Palette.orange })}>{initials(OWNER_NAME)}</Text>
            </BrutalBlock>
            <View>
              <Text style={[display(24, { color: Palette.ink, lineHeight: 24 })]}>{OWNER_NAME}</Text>
              <View style={styles.addressRow}>
                <Text
                  style={[mono(10.5, { spacing: 0.1, color: 'rgba(16,14,12,.55)' }), { marginTop: 7 }]}
                  numberOfLines={1}>
                  {shortAddress(address)} · {CHAIN_LABEL}
                </Text>
                {verified && (
                  <View style={styles.verifiedChip}>
                    <Text style={mono(8.5, { spacing: 0.12, color: Palette.orange })}>VERIFIED</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          <BrutalBlock backgroundColor={Palette.cream} borderColor={Palette.ink} offset={4} radius={Radius.md} style={styles.statWrap}>
            <View style={styles.statGrid}>
              {STATS.map((s, i) => (
                <View key={s.label} style={[styles.statCell, i > 0 && styles.statCellDivider]}>
                  <Text style={display(20, { color: s.color })}>{s.value}</Text>
                  <Text style={[mono(9, { spacing: 0.14, color: 'rgba(16,14,12,.5)' }), { marginTop: 5 }]}>
                    {s.label}
                  </Text>
                </View>
              ))}
            </View>
          </BrutalBlock>

          {paired === 'hotshoe' && (
            <Pressable onPress={() => router.push('/trigger')}>
              <BrutalBlock backgroundColor={Palette.ink} borderColor={Palette.ink} offset={5} radius={Radius.lg} style={styles.moduleWrap} contentStyle={styles.moduleCard}>
                <View style={styles.moduleHeader}>
                  <Text style={mono(10, { spacing: 0.18, color: 'rgba(237,231,218,.55)' })}>PAIRED MODULE</Text>
                  <Text style={mono(10, { spacing: 0.18, color: Palette.orange })}>TRIGGER →</Text>
                </View>
                <View style={styles.moduleBody}>
                  <View style={styles.moduleImageWrap}>
                    <Image source={require('@/assets/hotshoe/hotshoe.png')} style={styles.moduleImage} contentFit="contain" />
                  </View>
                  <View style={styles.moduleInfo}>
                    <Text style={display(20, { color: Palette.bone })} numberOfLines={1}>
                      {deviceName ?? 'HOTSHOE'}
                    </Text>
                    <View style={styles.liveRow}>
                      <View style={[styles.liveDot, { backgroundColor: isLive ? Palette.green : 'rgba(237,231,218,.35)' }]} />
                      <Text style={mono(9.5, { spacing: 0.12, color: 'rgba(237,231,218,.6)' })}>{liveLabel}</Text>
                    </View>
                    <Text style={[mono(10, { spacing: 0.1, color: 'rgba(237,231,218,.55)', lineHeight: 17 }), { marginTop: 6 }]}>
                      KEY IN SECURE ELEMENT
                    </Text>
                  </View>
                </View>
              </BrutalBlock>
            </Pressable>
          )}

          {paired === 'clip' && (
            <BrutalBlock backgroundColor={Palette.ink} borderColor={Palette.ink} offset={5} radius={Radius.lg} style={styles.moduleWrap} contentStyle={styles.clipCard}>
              <View style={styles.moduleHeader}>
                <Text style={mono(10, { spacing: 0.18, color: 'rgba(237,231,218,.55)' })}>PAIRED MODULE</Text>
                <View style={styles.onlineChip}>
                  <View style={[styles.onlineDot, { backgroundColor: isLive ? Palette.green : 'rgba(237,231,218,.35)' }]} />
                  <Text style={mono(10, { spacing: 0.18, color: isLive ? Palette.orange : 'rgba(237,231,218,.5)' })}>
                    {liveLabel}
                  </Text>
                </View>
              </View>
              <View style={{ marginTop: 12 }}>
                <Text style={display(20, { color: Palette.bone })} numberOfLines={1}>
                  {deviceName ?? 'VERIS Clip'}
                </Text>
                <Text style={[mono(10, { spacing: 0.1, color: 'rgba(237,231,218,.55)', lineHeight: 17 }), { marginTop: 8 }]}>
                  KEY IN SECURE ELEMENT{'\n'}USE CLICK PHOTO TO CAPTURE
                </Text>
              </View>
            </BrutalBlock>
          )}

          {paired === null && (
            <BrutalBlock backgroundColor={Palette.ink} borderColor={Palette.ink} offset={5} radius={Radius.lg} style={styles.moduleWrap} contentStyle={styles.noDeviceCard}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={mono(10, { spacing: 0.18, color: Palette.orange })}>NO DEVICE PAIRED</Text>
                <Text style={body(13.5, { weight: 'semibold', color: Palette.bone, lineHeight: 18 })}>
                  Pair a Hotshoe or Clip to sign captures with a hardware key.
                </Text>
              </View>
              <PillButton label="PAIR" onPress={openPrompt} backgroundColor={Palette.orange} textColor={Palette.espresso} />
            </BrutalBlock>
          )}

          <View style={styles.rows}>
            <AccordionRow
              label="Wallet"
              note={
                activeWallet === 'metamask'
                  ? `METAMASK · ${shortAddress(metamaskAddress)}`
                  : `EMBEDDED · ${shortAddress(embeddedAddress)}`
              }
              expanded={expanded === 'wallet'}
              onToggle={() => toggle('wallet')}>
              <Text style={[body(12, { color: 'rgba(16,14,12,.6)', lineHeight: 17 }), { marginBottom: 10 }]}>
                Pick which wallet acts as you. Your embedded wallet is created and held for you — link MetaMask to
                use a wallet you control directly instead.
              </Text>
              <WalletOptionRow
                label="EMBEDDED WALLET"
                address={embeddedAddress}
                active={activeWallet === 'embedded'}
                onPress={() => setActiveWallet('embedded')}
              />
              {metamaskAddress ? (
                <WalletOptionRow
                  label="METAMASK"
                  address={metamaskAddress}
                  active={activeWallet === 'metamask'}
                  onPress={() => setActiveWallet('metamask')}
                />
              ) : (
                <>
                  <PillButton
                    label={METAMASK_BUTTON_LABEL[metamaskStage]}
                    onPress={connectMetaMaskWallet}
                    disabled={metamaskStage !== 'idle' && metamaskStage !== 'error'}
                    backgroundColor={Palette.ink}
                    textColor={Palette.cream}
                    style={styles.detailButton}
                  />
                  {metamaskError && (
                    <Text style={[mono(9.5, { spacing: 0.08, color: Palette.orange }), { marginTop: 8 }]}>
                      {metamaskError}
                    </Text>
                  )}
                </>
              )}
            </AccordionRow>

            <AccordionRow
              label="Signing keys"
              note={`1 ACTIVE · ROTATED ${rotatedAt}`}
              expanded={expanded === 'keys'}
              onToggle={() => toggle('keys')}>
              <DetailLine k="ACTIVE KEY" v="0x4F2A…9E1C" />
              <DetailLine k="ALGORITHM" v="secp256k1 · hardware-backed" />
              <DetailLine k="CREATED" v="12 JAN 2026" />
              <DetailLine k="LAST ROTATED" v={rotatedAt} />
              <PillButton
                label={rotating ? 'ROTATING…' : 'ROTATE KEY'}
                onPress={handleRotate}
                disabled={rotating}
                backgroundColor={Palette.ink}
                textColor={Palette.cream}
                style={styles.detailButton}
              />
            </AccordionRow>

            <AccordionRow
              label="Licensing terms"
              note={`DEFAULT · ${defaultLicence} · ${defaultLicence === 'EDITORIAL' ? '7.5%' : '10%'} ROYALTY`}
              expanded={expanded === 'licensing'}
              onToggle={() => toggle('licensing')}>
              <Text style={[body(12, { color: 'rgba(16,14,12,.6)', lineHeight: 17 }), { marginBottom: 10 }]}>
                New claims default to this preset. You can override it per frame from the claim sheet.
              </Text>
              <View style={styles.presetRow}>
                <PresetChip
                  label="EDITORIAL"
                  sub="7.5% royalty"
                  active={defaultLicence === 'EDITORIAL'}
                  onPress={() => setDefaultLicence('EDITORIAL')}
                />
                <PresetChip
                  label="COMMERCIAL"
                  sub="10% royalty"
                  active={defaultLicence === 'COMMERCIAL'}
                  onPress={() => setDefaultLicence('COMMERCIAL')}
                />
              </View>
            </AccordionRow>

            <AccordionRow
              label="Paired device"
              note={
                paired === 'hotshoe'
                  ? `VERIS HOTSHOE · ${liveLabel}`
                  : paired === 'clip'
                    ? `VERIS CLIP · ${liveLabel}`
                    : 'NO DEVICE PAIRED'
              }
              expanded={expanded === 'device'}
              onToggle={() => toggle('device')}>
              <Text style={[body(12, { color: 'rgba(16,14,12,.6)', lineHeight: 17 }), { marginBottom: 10 }]}>
                {paired === 'hotshoe'
                  ? 'Your Hotshoe clips onto a camera and signs frames the instant the shutter fires.'
                  : paired === 'clip'
                    ? 'Your Clip mounts on your phone. Use Click Photo in the navbar to capture a signed frame.'
                    : 'Pair a Hotshoe or Clip to start signing captures with a hardware key.'}
              </Text>
              {paired !== null && deviceName && (
                <DetailLine k="BLUETOOTH NAME" v={deviceName} />
              )}
              {paired !== null && Platform.OS === 'android' && !isLive && (
                <PillButton
                  label={connectionState === 'connecting' ? 'CONNECTING…' : 'RECONNECT'}
                  onPress={reconnect}
                  disabled={connectionState === 'connecting'}
                  backgroundColor={Palette.orange}
                  textColor={Palette.espresso}
                  style={styles.detailButton}
                />
              )}
              <PillButton
                label={paired === null ? 'PAIR A DEVICE' : 'CHANGE DEVICE'}
                onPress={openPrompt}
                backgroundColor={Palette.ink}
                textColor={Palette.cream}
                style={styles.detailButton}
              />
            </AccordionRow>

            <AccordionRow
              label="Dispute centre"
              note="FILE A TAKEDOWN WITH PROOF"
              expanded={expanded === 'dispute'}
              onToggle={() => toggle('dispute')}>
              <Text style={[body(12, { color: 'rgba(16,14,12,.6)', lineHeight: 17 }), { marginBottom: 10 }]}>
                A sealed frame is signed proof of origin. File a takedown against a copy and cite the seal as
                evidence.
              </Text>
              <View style={styles.disputeStats}>
                <DisputeStat value="6" label="WON" />
                <DisputeStat value="0" label="OPEN" />
                <DisputeStat value="~4D" label="AVG RESOLVE" />
              </View>
              <PillButton
                label="START A DISPUTE"
                onPress={handleFileDispute}
                backgroundColor={Palette.ink}
                textColor={Palette.cream}
                style={styles.detailButton}
              />
            </AccordionRow>

            <ConfirmRow label="Disconnect wallet" note="RETURNS TO THE LANDING DOOR" onPress={confirmDisconnectWallet} />
            <ConfirmRow
              label="Disconnect DigiLocker"
              note="YOU'LL RE-VERIFY NEXT TIME YOU CONNECT"
              onPress={confirmDisconnectDigilocker}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function AccordionRow({
  label,
  note,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  note: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { style, onPressIn, onPressOut } = useBrutalPress(3);
  const rotation = useSharedValue(expanded ? 1 : 0);
  useEffect(() => {
    rotation.value = withTiming(expanded ? 1 : 0, { duration: 200 });
  }, [expanded, rotation]);
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value * 90}deg` }] }));

  return (
    <View>
      <Pressable onPress={onToggle} onPressIn={onPressIn} onPressOut={onPressOut}>
        <BrutalBlock
          backgroundColor={Palette.bone}
          borderColor={expanded ? Palette.ink : 'rgba(16,14,12,.16)'}
          borderWidth={Border.thin}
          offset={3}
          radius={Radius.md}
          animatedStyle={style}
          contentStyle={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={body(14, { weight: 'semibold', color: Palette.ink })}>{label}</Text>
            <Text style={[mono(10, { spacing: 0.12, color: 'rgba(16,14,12,.45)' }), { marginTop: 6 }]}>{note}</Text>
          </View>
          <Animated.Text style={[styles.rowArrow, chevronStyle]}>→</Animated.Text>
        </BrutalBlock>
      </Pressable>
      {expanded && (
        <Animated.View entering={FadeInDown.duration(200)} style={styles.detailPanel}>
          {children}
        </Animated.View>
      )}
    </View>
  );
}

function ConfirmRow({ label, note, onPress }: { label: string; note: string; onPress: () => void }) {
  const { style, onPressIn, onPressOut } = useBrutalPress(3);
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <BrutalBlock
        backgroundColor={Palette.bone}
        borderColor="rgba(16,14,12,.16)"
        borderWidth={Border.thin}
        offset={3}
        radius={Radius.md}
        animatedStyle={style}
        contentStyle={styles.row}>
        <View>
          <Text style={body(14, { weight: 'semibold', color: Palette.orange })}>{label}</Text>
          <Text style={[mono(10, { spacing: 0.12, color: 'rgba(16,14,12,.45)' }), { marginTop: 6 }]}>{note}</Text>
        </View>
        <Text style={styles.rowArrow}>→</Text>
      </BrutalBlock>
    </Pressable>
  );
}

function WalletOptionRow({
  label,
  address,
  active,
  onPress,
}: {
  label: string;
  address: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.walletOption}>
      <View style={{ flex: 1 }}>
        <Text style={mono(9, { spacing: 0.14, color: active ? Palette.orange : 'rgba(16,14,12,.5)' })}>{label}</Text>
        <Text style={[body(12.5, { weight: 'medium', color: Palette.ink }), { marginTop: 3 }]} numberOfLines={1}>
          {address ? shortAddress(address) : 'NOT AVAILABLE'}
        </Text>
      </View>
      {active && <Text style={{ color: Palette.green, fontSize: 14, fontWeight: '700' }}>✓</Text>}
    </Pressable>
  );
}

function DetailLine({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.detailLine}>
      <Text style={mono(9.5, { spacing: 0.14, color: 'rgba(16,14,12,.5)' })}>{k}</Text>
      <Text style={body(12, { weight: 'medium', color: Palette.ink })}>{v}</Text>
    </View>
  );
}

function DisputeStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.disputeStat}>
      <Text style={display(15, { color: Palette.ink })}>{value}</Text>
      <Text style={[mono(8.5, { spacing: 0.12, color: 'rgba(16,14,12,.5)' }), { marginTop: 3 }]}>{label}</Text>
    </View>
  );
}

function PresetChip({
  label,
  sub,
  active,
  onPress,
}: {
  label: string;
  sub: string;
  active: boolean;
  onPress: () => void;
}) {
  const { style, onPressIn, onPressOut } = useBrutalPress(3);
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} style={{ flex: 1 }}>
      <BrutalBlock
        backgroundColor={active ? Palette.ink : Palette.cream}
        borderColor={active ? Palette.ink : 'rgba(16,14,12,.2)'}
        borderWidth={Border.thin}
        offset={3}
        radius={Radius.sm}
        animatedStyle={style}
        contentStyle={styles.presetChip}>
        <Text style={mono(10.5, { weight: 'semibold', spacing: 0.12, color: active ? Palette.cream : Palette.ink })}>
          {label}
        </Text>
        <Text style={[mono(9, { spacing: 0.1, color: active ? 'rgba(237,231,218,.6)' : 'rgba(16,14,12,.5)' }), { marginTop: 3 }]}>
          {sub}
        </Text>
      </BrutalBlock>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.cream },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 140 },
  identity: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  verifiedChip: {
    borderWidth: 1,
    borderColor: Palette.orange,
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  statWrap: { marginTop: 22 },
  statGrid: { flexDirection: 'row' },
  statCell: { flex: 1, padding: 13, paddingHorizontal: 12 },
  statCellDivider: { borderLeftWidth: Border.thin, borderLeftColor: 'rgba(16,14,12,.14)' },
  moduleWrap: { marginTop: 18 },
  moduleCard: { paddingBottom: 0 },
  clipCard: { padding: 16 },
  noDeviceCard: { padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  moduleHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  onlineChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Palette.orange },
  moduleBody: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 12, paddingHorizontal: 16 },
  moduleImageWrap: {
    width: 150,
    height: 120,
    flexShrink: 0,
    backgroundColor: Palette.cream,
    overflow: 'hidden',
  },
  moduleImage: { width: '100%', height: '100%' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  moduleGlyphWrap: {
    width: 150,
    height: 120,
    flexShrink: 0,
    backgroundColor: Palette.cream,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleGlyph: { width: 46, height: 46, borderRadius: 12, backgroundColor: Palette.orange },
  moduleInfo: { paddingBottom: 18 },
  rows: { marginTop: 20, gap: 9 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 15,
  },
  rowArrow: { color: 'rgba(16,14,12,.4)', fontSize: 14 },
  detailPanel: {
    marginTop: -6,
    marginHorizontal: 6,
    backgroundColor: 'rgba(16,14,12,.04)',
    borderLeftWidth: 2,
    borderLeftColor: Palette.orange,
    borderBottomLeftRadius: Radius.sm,
    borderBottomRightRadius: Radius.sm,
    padding: 14,
    paddingTop: 12,
  },
  detailLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: Border.hairline,
    borderBottomColor: 'rgba(16,14,12,.1)',
  },
  detailButton: { marginTop: 12, alignSelf: 'flex-start' },
  walletOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: Border.hairline,
    borderBottomColor: 'rgba(16,14,12,.1)',
  },
  presetRow: { flexDirection: 'row', gap: 8 },
  presetChip: { paddingVertical: 11, paddingHorizontal: 12, alignItems: 'center' },
  disputeStats: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  disputeStat: { flex: 1, alignItems: 'center', paddingVertical: 8, backgroundColor: 'rgba(16,14,12,.05)', borderRadius: Radius.sm },
});
