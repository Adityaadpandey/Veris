import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { BrutalBlock } from '@/components/brutal-block';
import { GlassPanel } from '@/components/glass-panel';
import { Border, Palette, Radius } from '@/constants/theme';
import { body, display, mono } from '@/constants/typography';
import { useBrutalPress } from '@/hooks/use-brutal-press';

type DeviceId = 'hotshoe' | 'clip';
type PairResult = { ok: true } | { ok: false; reason: string };

type Props = {
  visible: boolean;
  /** Runs the real hardware handshake (useDevice().pair) — its outcome drives the result phase below. */
  onSelect: (device: DeviceId) => Promise<PairResult>;
  onSkip: () => void;
  /** Called once the modal's own animation has finished showing the real outcome, success or not. */
  onDone: () => void;
};

type Phase = 'scanning' | 'found' | 'attesting' | 'result';

// DEMO: mocked scan results — a real scan would return whatever's actually nearby.
const SCAN_RESULTS: { id: DeviceId; name: string; desc: string; signal: string }[] = [
  { id: 'clip', name: 'VHS-CLIP-04A2', desc: 'VERIS Clip · phone-mounted', signal: '−52 dBm' },
  { id: 'hotshoe', name: 'VHS-HOTSHOE-11', desc: 'VERIS Hotshoe · camera-mounted', signal: '−61 dBm' },
];

const SCAN_MS = 2000; // DEMO: static timing — a real scan takes as long as it takes
const ATTEST_MS = 1000; // Minimum time the attesting phase stays up, so a fast real handshake doesn't flash by
const SELECT_HOLD_MS = 350; // dwell so the un-picked row visibly dims before the screen advances
const RESULT_HOLD_MS = 1300; // long enough to read the result copy before the modal closes itself

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * First-run / re-pair prompt. Runs a cosmetic scan/pick sequence, then hands off to the
 * real Bluetooth handshake (`onSelect`, i.e. useDevice().pair()) during the attesting phase —
 * the result phase reflects whatever that handshake actually returned, not a canned success.
 */
export function PairingModal({ visible, onSelect, onSkip, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('scanning');
  const [selectedId, setSelectedId] = useState<DeviceId | null>(null);
  const [result, setResult] = useState<PairResult | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const schedule = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  // Every time the modal opens, start a fresh sequence.
  useEffect(() => {
    if (!visible) return clearTimers;
    clearTimers();
    setPhase('scanning');
    setSelectedId(null);
    setResult(null);
    schedule(() => setPhase('found'), SCAN_MS);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pickDevice = async (id: DeviceId) => {
    if (selectedId) return;
    setSelectedId(id);
    await sleep(SELECT_HOLD_MS);
    setPhase('attesting');
    const [outcome] = await Promise.all([onSelect(id), sleep(ATTEST_MS)]);
    setResult(outcome);
    setPhase('result');
    await sleep(RESULT_HOLD_MS);
    onDone();
  };

  const canSkip = phase === 'scanning' || phase === 'found';

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onSkip}>
      <View style={styles.backdrop}>
        <GlassPanel
          variant="onLight"
          intensity={60}
          radius={Radius.lg}
          borderWidth={Border.thick}
          borderColor={Palette.ink}
          shadow={Palette.ink}
          shadowOffset={6}
          style={styles.cardWrap}
          contentStyle={styles.card}>
          {phase === 'scanning' && <ScanningPhase />}
          {phase === 'found' && <FoundPhase selectedId={selectedId} onPick={pickDevice} />}
          {phase === 'attesting' && <AttestingPhase />}
          {phase === 'result' && selectedId && result && <ResultPhase deviceId={selectedId} result={result} />}

          {canSkip && (
            <Pressable onPress={onSkip} hitSlop={8} style={styles.skipRow}>
              <Text style={mono(11, { spacing: 0.16, color: 'rgba(16,14,12,.5)' })}>SKIP FOR NOW</Text>
            </Pressable>
          )}
        </GlassPanel>
      </View>
    </Modal>
  );
}

function PhaseHeader({ kicker, title, subtitle }: { kicker: string; title: string; subtitle?: string }) {
  return (
    <>
      <Text style={mono(10, { spacing: 0.2, color: Palette.orange })}>{kicker}</Text>
      <Text style={[display(24, { color: Palette.ink, lineHeight: 24 }), styles.title]}>{title}</Text>
      {subtitle && (
        <Text style={[body(12.5, { color: 'rgba(16,14,12,.6)', lineHeight: 17.5 }), styles.subtitle]}>{subtitle}</Text>
      )}
    </>
  );
}

function ScanningPhase() {
  return (
    <Animated.View entering={FadeInDown.duration(300)}>
      <PhaseHeader
        kicker="PAIRING"
        title={'Scanning for\nhardware.'}
        subtitle="Looking for nearby Veris devices over Bluetooth LE…"
      />
      <ScanBar duration={SCAN_MS} style={styles.scanBar} />
    </Animated.View>
  );
}

function FoundPhase({
  selectedId,
  onPick,
}: {
  selectedId: DeviceId | null;
  onPick: (id: DeviceId) => void;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(300)}>
      <PhaseHeader
        kicker="2 DEVICES FOUND"
        title={'Choose a\ndevice.'}
        subtitle="Tap the one you want to pair. You can switch later from your profile."
      />
      <View style={styles.options}>
        {SCAN_RESULTS.map((d) => (
          <ScanRow
            key={d.id}
            device={d}
            dimmed={selectedId !== null && selectedId !== d.id}
            disabled={selectedId !== null}
            onPress={() => onPick(d.id)}
          />
        ))}
      </View>
    </Animated.View>
  );
}

function AttestingPhase() {
  return (
    <Animated.View entering={FadeInDown.duration(300)}>
      <Text style={mono(10, { spacing: 0.2, color: Palette.orange })}>HARDWARE ATTESTATION</Text>
      <Text style={[display(22, { color: Palette.ink, lineHeight: 23 }), styles.title]}>
        Requesting hardware{'\n'}attestation…
      </Text>
      <ScanBar duration={ATTEST_MS} style={styles.scanBar} />
    </Animated.View>
  );
}

function ResultPhase({
  deviceId,
  result,
}: {
  deviceId: DeviceId;
  result: { ok: true } | { ok: false; reason: string };
}) {
  return (
    <Animated.View entering={FadeInDown.duration(300)}>
      <Text style={mono(10, { spacing: 0.2, color: Palette.orange })}>PAIR YOUR HARDWARE</Text>
      <BrutalBlock
        backgroundColor={result.ok ? Palette.green : Palette.orange}
        borderColor={Palette.ink}
        offset={4}
        radius={Radius.md}
        style={styles.resultWrap}
        contentStyle={styles.resultCard}>
        {!result.ok ? (
          <>
            <Text style={display(19, { color: Palette.bone })}>COULDN&apos;T PAIR</Text>
            <Text style={[body(12.5, { color: 'rgba(237,231,218,.9)', lineHeight: 17.5 }), { marginTop: 8 }]}>
              {result.reason}
            </Text>
          </>
        ) : deviceId === 'clip' ? (
          <Text style={display(19, { color: Palette.bone })}>PAIRED — CLIP ARMED</Text>
        ) : (
          <>
            <Text style={display(22, { color: Palette.bone })}>READY</Text>
            <Text style={[body(12.5, { color: 'rgba(237,231,218,.85)', lineHeight: 17.5 }), { marginTop: 8 }]}>
              Shoots even if the phone never reconnects.
            </Text>
          </>
        )}
      </BrutalBlock>
    </Animated.View>
  );
}

/** Thin fill-over-time bar — the same "progress over a timed beat" primitive onboarding's beat ticks use, since this design system has no spinner. */
function ScanBar({ duration, style }: { duration: number; style?: StyleProp<ViewStyle> }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration, easing: Easing.linear });
  }, [duration, progress]);

  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));

  return (
    <View style={[styles.scanTrack, style]}>
      <Animated.View style={[styles.scanFill, fillStyle]} />
    </View>
  );
}

function ScanRow({
  device,
  dimmed,
  disabled,
  onPress,
}: {
  device: { id: DeviceId; name: string; desc: string; signal: string };
  dimmed: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { style, onPressIn, onPressOut } = useBrutalPress(3);
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} disabled={disabled}>
      <BrutalBlock
        backgroundColor={Palette.bone}
        borderColor="rgba(16,14,12,.18)"
        borderWidth={Border.thin}
        offset={3}
        radius={Radius.md}
        animatedStyle={style}
        contentStyle={[styles.option, dimmed && styles.optionDimmed]}>
        <View style={{ flex: 1 }}>
          <Text style={mono(11, { weight: 'semibold', spacing: 0.08, color: Palette.ink })}>{device.name}</Text>
          <Text style={[mono(10, { spacing: 0.1, color: 'rgba(16,14,12,.5)' }), { marginTop: 5 }]}>{device.desc}</Text>
        </View>
        <Text style={mono(9.5, { spacing: 0.1, color: 'rgba(16,14,12,.45)' })}>{device.signal}</Text>
      </BrutalBlock>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(16,14,12,.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  cardWrap: { width: '100%', maxWidth: 380 },
  card: { padding: 22 },
  title: { marginTop: 10, textTransform: 'uppercase' },
  subtitle: { marginTop: 10 },
  scanBar: { marginTop: 20 },
  scanTrack: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(16,14,12,.12)' },
  scanFill: { flex: 1, backgroundColor: Palette.orange, transformOrigin: 'left' },
  options: { marginTop: 18, gap: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 },
  optionDimmed: { opacity: 0.35 },
  resultWrap: { marginTop: 14 },
  resultCard: { padding: 18 },
  skipRow: { marginTop: 16, alignSelf: 'center', padding: 4 },
});
