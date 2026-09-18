import { StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/theme';
import { body, mono } from '@/constants/typography';

const STEPS = ['Captured', 'Signed', 'Stored', 'Proven', 'Verified on-chain', 'Minted'] as const;

// DEMO: offsets from the photo's own capture timestamp — there's no separate
// per-stage timestamp anywhere in the data model (Photo only carries `cap`),
// so each step is spaced a few seconds after it rather than inventing a
// second, disconnected time source.
const STEP_OFFSETS_SEC = [0, 2, 6, 11, 18, 26];

/** Adds `offsetSec` to a "HH:MM:SS IST"-style timestamp, wrapping past midnight defensively. */
function addSeconds(time: string, offsetSec: number): string {
  const match = time.match(/(\d{1,2}):(\d{2}):(\d{2})/);
  if (!match) return time;
  const [, h, m, s] = match;
  const total = (Number(h) * 3600 + Number(m) * 60 + Number(s) + offsetSec) % 86400;
  const hh = String(Math.floor(total / 3600)).padStart(2, '0');
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  const suffix = time.replace(/[\d:]+/, '').trim();
  return suffix ? `${hh}:${mm}:${ss} ${suffix}` : `${hh}:${mm}:${ss}`;
}

type Props = {
  /** The photo's own capture timestamp — the one existing time source every step derives from. */
  capturedAt: string;
};

/**
 * Vertical stepper for a sealed frame's custody chain. Every step already
 * happened by the time a claim sheet is reachable (you can only get here for
 * an already-sealed photo), so there's no pending/in-progress state to design
 * for — every dot renders filled.
 */
export function ProvenanceTimeline({ capturedAt }: Props) {
  return (
    <View>
      {STEPS.map((label, i) => (
        <View key={label} style={styles.row}>
          <View style={styles.markerCol}>
            <View style={styles.dot} />
            {i < STEPS.length - 1 && <View style={styles.line} />}
          </View>
          <View style={[styles.content, i === STEPS.length - 1 && styles.contentLast]}>
            <Text style={body(13, { weight: 'medium', color: Palette.bone })}>{label}</Text>
            <Text style={mono(9.5, { spacing: 0.08, color: 'rgba(237,231,218,.5)' })}>
              {addSeconds(capturedAt, STEP_OFFSETS_SEC[i])}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  markerCol: { alignItems: 'center', width: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Palette.orange },
  line: { width: 1.5, flex: 1, backgroundColor: 'rgba(237,231,218,.18)', marginTop: 3 },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
  },
  contentLast: { paddingBottom: 0 },
});
