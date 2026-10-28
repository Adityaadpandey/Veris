import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import { BrutalBlock } from '@/components/brutal-block';
import { GlassPanel } from '@/components/glass-panel';
import { Border, Palette, Radius } from '@/constants/theme';
import { body, mono } from '@/constants/typography';

export type CompanionAiHint = { likely_ai_generated: boolean | null; note?: string | null };

/** Shape of `companion_capture` from `GET /check-claim` (see public-server/companionCapture.js), or a fabricated one for the mock/demo flow. `null` until a companion photo has been submitted; present-but-scoreless while background processing is still running. */
export type CompanionCaptureData = {
  /** A Cloudinary URL (real claims) or a bundled require()'d asset (mock/demo seed data) — same as `Photo.img`. */
  mobile_image_url: ImageSourcePropType;
  mobile_captured_at?: string | null;
  mobile_ai_hint?: CompanionAiHint | null;
  consistency?: { score: number; visual: number; content: number } | null;
  forensic?: { ssim: number; change_type: string; region_bbox: unknown } | null;
  timestamp_delta_seconds?: number | null;
  mock_chain_ref?: string | null;
  paired_at?: string | null;
};

const CHANGE_TYPE_COPY: Record<string, string> = {
  recompression: 'Near-identical framing and detail — a strong pairing.',
  crop: 'Framed a little differently — expected from two separate cameras.',
  global_adjustment: 'Overall look differs slightly — likely different exposure/processing between cameras.',
  localized_edit: 'One part of the frame differs more than the rest.',
};

function short(str: string | null | undefined, len = 6): string {
  if (!str) return '—';
  if (str.length <= len * 2 + 3) return str;
  return `${str.slice(0, len)}…${str.slice(-len)}`;
}

function pct(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${Math.round(value * 100)}%`;
}

function scoreColor(score: number | null | undefined): string {
  if (score == null) return 'rgba(16,14,12,.4)';
  if (score >= 0.85) return Palette.green;
  if (score >= 0.6) return Palette.orange;
  return 'rgba(16,14,12,.4)';
}

function AiFlagChip({ label, hint }: { label: string; hint: CompanionAiHint | null | undefined }) {
  if (!hint || hint.likely_ai_generated == null) return null;
  const flagged = hint.likely_ai_generated;
  return (
    <View style={[styles.aiChip, { borderColor: flagged ? Palette.orange : 'rgba(16,14,12,.2)' }]}>
      <View style={[styles.aiChipDot, { backgroundColor: flagged ? Palette.orange : Palette.green }]} />
      <Text style={mono(8.5, { spacing: 0.08, color: flagged ? Palette.orange : 'rgba(16,14,12,.55)' })}>
        {label} {flagged ? 'FLAGGED' : 'CLEAR'}
      </Text>
    </View>
  );
}

/**
 * Companion Capture: the phone's own photo alongside the real, minted device
 * capture. Demo-quality — the "Paired" badge and its chain ref are
 * off-chain/mocked, never presented as a real transaction. One component
 * consumes one data shape so the real (`claim/real/[claimId]`) and mock
 * (`claim/[index]`) screens render identically.
 */
export function CompanionCaptureCard({
  companion,
  deviceAiHint,
  size = 'compact',
}: {
  companion: CompanionCaptureData | null | undefined;
  deviceAiHint?: CompanionAiHint | null;
  /** 'featured' renders always-expanded with a bigger photo, for top-of-page placement; 'compact' (default) is the tap-to-expand row. */
  size?: 'compact' | 'featured';
}) {
  const [expanded, setExpanded] = useState(false);
  const featured = size === 'featured';

  if (!companion) return null;

  const isPending = !companion.consistency || !companion.forensic;

  if (isPending) {
    return (
      <BrutalBlock backgroundColor={Palette.cream} borderColor={Palette.ink} offset={4} radius={Radius.md} style={styles.wrap} contentStyle={styles.pendingCard}>
        <ActivityIndicator color={Palette.ink} />
        <Text style={[body(12.5, { weight: 'semibold', color: Palette.ink }), { marginTop: 8 }]}>Pairing companion photo…</Text>
        <Text style={[mono(9, { spacing: 0.08, color: 'rgba(16,14,12,.5)' }), { marginTop: 4 }]}>
          Comparing against the device capture
        </Text>
      </BrutalBlock>
    );
  }

  const { consistency, forensic } = companion;
  const explanation = CHANGE_TYPE_COPY[forensic!.change_type] || 'Compared against the device capture.';
  const color = scoreColor(consistency!.score);
  const showBreakdown = featured || expanded;

  return (
    <BrutalBlock backgroundColor={Palette.cream} borderColor={Palette.ink} offset={4} radius={Radius.md} style={styles.wrap} contentStyle={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={mono(10, { weight: 'semibold', spacing: 0.14, color: Palette.ink })}>
            {pct(consistency!.score)} CONSISTENT
          </Text>
        </View>
        <GlassPanel variant="onLight" intensity={55} radius={Radius.xs} borderWidth={Border.hairline} contentStyle={styles.pairedChip}>
          <Text style={mono(8.5, { spacing: 0.1, color: 'rgba(16,14,12,.55)' })}>
            PAIRED · {short(companion.mock_chain_ref)} · OFF-CHAIN
          </Text>
        </GlassPanel>
      </View>

      {featured ? (
        <View style={styles.featuredImageWrap}>
          <Image source={companion.mobile_image_url} style={styles.featuredImage} contentFit="cover" />
        </View>
      ) : (
        <Pressable onPress={() => setExpanded((v) => !v)} style={styles.thumbRow}>
          <View style={styles.thumbWrap}>
            <Image source={companion.mobile_image_url} style={StyleSheet.absoluteFill} contentFit="cover" />
          </View>
          <View style={styles.thumbMeta}>
            <Text style={[body(12, { color: 'rgba(16,14,12,.7)', lineHeight: 16.5 })]}>{explanation}</Text>
            {companion.timestamp_delta_seconds != null && (
              <Text style={[mono(9, { spacing: 0.06, color: 'rgba(16,14,12,.5)' }), { marginTop: 6 }]}>
                CAPTURED {companion.timestamp_delta_seconds.toFixed(1)}s APART
              </Text>
            )}
          </View>
        </Pressable>
      )}

      {featured && (
        <Text style={[body(12.5, { color: 'rgba(16,14,12,.7)', lineHeight: 17.5 }), styles.featuredExplanation]}>
          {explanation}
          {companion.timestamp_delta_seconds != null
            ? ` Captured ${companion.timestamp_delta_seconds.toFixed(1)}s apart.`
            : ''}
        </Text>
      )}

      {showBreakdown && (
        <View style={styles.expandedWrap}>
          {!featured && <Image source={companion.mobile_image_url} style={styles.expandedImage} contentFit="cover" />}
          <View style={styles.breakdownRow}>
            <BreakdownStat label="VISUAL" value={pct(consistency!.visual)} />
            <BreakdownStat label="CONTENT" value={pct(consistency!.content)} />
            <BreakdownStat label="SSIM" value={pct(forensic!.ssim)} />
          </View>
        </View>
      )}

      <View style={styles.aiRow}>
        <AiFlagChip label="DEVICE" hint={deviceAiHint} />
        <AiFlagChip label="PHONE" hint={companion.mobile_ai_hint} />
      </View>
    </BrutalBlock>
  );
}

function BreakdownStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.breakdownStat}>
      <Text style={mono(8.5, { spacing: 0.12, color: 'rgba(16,14,12,.45)' })}>{label}</Text>
      <Text style={[body(12.5, { weight: 'semibold', color: Palette.ink }), { marginTop: 2 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12 },
  card: { padding: 14, gap: 12 },
  pendingCard: { padding: 16, alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  pairedChip: { paddingHorizontal: 9, paddingVertical: 6 },
  thumbRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  thumbWrap: { width: 56, height: 56, borderRadius: Radius.xs, overflow: 'hidden', backgroundColor: Palette.ink },
  thumbMeta: { flex: 1 },
  featuredImageWrap: { aspectRatio: 4 / 3, borderRadius: Radius.sm, overflow: 'hidden', backgroundColor: Palette.ink },
  featuredImage: { flex: 1 },
  featuredExplanation: { marginTop: 2 },
  expandedWrap: { gap: 10 },
  expandedImage: { width: '100%', aspectRatio: 4 / 3, borderRadius: Radius.xs, backgroundColor: Palette.ink },
  breakdownRow: { flexDirection: 'row', gap: 1, backgroundColor: 'rgba(16,14,12,.14)' },
  breakdownStat: { flex: 1, backgroundColor: Palette.cream, padding: 10, gap: 4 },
  aiRow: { flexDirection: 'row', gap: 8 },
  aiChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: Border.hairline, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 5 },
  aiChipDot: { width: 5, height: 5, borderRadius: 2.5 },
});
