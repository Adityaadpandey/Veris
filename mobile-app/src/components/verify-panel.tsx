import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { BrutalBlock } from '@/components/brutal-block';
import { PillButton } from '@/components/pill-button';
import { Border, Palette, Radius } from '@/constants/theme';
import { body, mono } from '@/constants/typography';
import { useBrutalPress } from '@/hooks/use-brutal-press';
import {
  useVerifySearch,
  type VerifySimilarResult,
  type VerifyVerdict,
} from '@/hooks/use-verify-search';

// Lighthouse only serves an upload through the dedicated gateway tied to whichever API key
// uploaded it — the public IPFS gateways never have these CIDs at all. The account's dedicated
// gateway subdomain has changed over time (key rotations), so older claims live behind older
// subdomains. Current one first, then the previous ones as fallback.
const IPFS_GATEWAYS = [
  'https://unemployed-tyrannosaurus-wprec.lighthouseweb3.xyz/ipfs',
  'https://structural-crocodile-le3p6.lighthouseweb3.xyz/ipfs',
  'https://flexible-toucan-z8dgh.lighthouseweb3.xyz/ipfs',
];

function cleanCid(cid: string | null | undefined): string | null {
  if (!cid) return null;
  if (cid.startsWith('ipfs://')) return cid.slice(7);
  if (cid.startsWith('http://') || cid.startsWith('https://')) return null;
  return cid;
}

const VERDICT_TONE: Record<
  VerifyVerdict['type'],
  { border: string; badgeBg: string; badgeText: string; label: string; glyph: string }
> = {
  authentic_original: {
    border: Palette.green,
    badgeBg: Palette.green,
    badgeText: Palette.bone,
    label: 'AUTHENTIC ORIGINAL',
    glyph: '✓',
  },
  altered_copy: {
    border: Palette.orange,
    badgeBg: Palette.orange,
    badgeText: Palette.espresso,
    label: 'ALTERED COPY',
    glyph: '⚠',
  },
  no_match: {
    border: 'rgba(237,231,218,.3)',
    badgeBg: 'rgba(237,231,218,.14)',
    badgeText: Palette.bone,
    label: 'NO MATCH ON CHAIN',
    glyph: '◌',
  },
};

/** >=80 reads as a strong match, >=55 a soft one, below that no color claims confidence. */
function matchColor(pct: number) {
  if (pct >= 80) return Palette.green;
  if (pct >= 55) return Palette.orange;
  return 'rgba(237,231,218,.4)';
}

type Props = {
  /** Navigate to the real claim behind a verdict/result — the id comes straight from the server. */
  onOpenClaim: (claimId: string) => void;
};

/** Photos come in every aspect ratio a phone can shoot — clamp so a panorama or a tall portrait never blows up the card. */
function clampAspect(aspect: number) {
  return Math.min(1.9, Math.max(0.55, aspect));
}

/** The mobile equivalent of owner-portal's "Verify & Search" page: pick or shoot a photo, hash it against the chain. */
export function VerifyPanel({ onOpenClaim }: Props) {
  const { state, pickFromLibrary, pickFromCamera, reset } = useVerifySearch();
  const hasPreview = state.phase === 'running' || state.phase === 'done' || state.phase === 'error';

  return (
    <BrutalBlock
      backgroundColor="rgba(237,231,218,.06)"
      borderColor="rgba(237,231,218,.4)"
      shadowColor="rgba(231,88,28,.4)"
      offset={4}
      radius={Radius.lg}
      style={styles.wrap}
      contentStyle={styles.card}>
      <Text style={mono(10, { spacing: 0.2, color: Palette.orange })}>REVERSE CHECK</Text>
      <Text style={[body(15, { weight: 'semibold', color: Palette.bone, lineHeight: 19.5 }), styles.title]}>
        Pick or shoot a photo — we&apos;ll tell you if it was ever sealed
      </Text>

      {!hasPreview && (
        <View style={styles.iconBadgeWrap}>
          <BrutalBlock
            backgroundColor={Palette.cream}
            borderColor={Palette.ink}
            offset={3}
            radius={Radius.pill}
            contentStyle={styles.iconBadge}>
            <Text style={{ fontSize: 26, color: Palette.espresso }}>◎</Text>
          </BrutalBlock>
        </View>
      )}

      {hasPreview && (
        <BrutalBlock
          backgroundColor={Palette.ink}
          borderColor={Palette.ink}
          offset={4}
          radius={Radius.sm}
          style={styles.previewWrap}
          contentStyle={{ aspectRatio: clampAspect(state.previewAspect) }}>
          <Image source={{ uri: state.previewUri }} style={styles.preview} contentFit="cover" />
        </BrutalBlock>
      )}

      {state.phase === 'idle' && (
        <View style={styles.pickRow}>
          <PillButton
            label="CHOOSE PHOTO"
            onPress={pickFromLibrary}
            backgroundColor={Palette.cream}
            textColor={Palette.espresso}
            style={styles.pickButton}
          />
          <PillButton
            label="USE CAMERA"
            onPress={pickFromCamera}
            backgroundColor="rgba(237,231,218,.1)"
            borderColor="rgba(237,231,218,.4)"
            textColor={Palette.bone}
            style={styles.pickButton}
          />
        </View>
      )}

      {state.phase === 'running' && (
        <View style={styles.statusRow}>
          <ActivityIndicator color={Palette.orange} />
          <Text style={mono(11, { spacing: 0.12, color: 'rgba(237,231,218,.55)' })}>
            HASHING & SEARCHING THE CHAIN…
          </Text>
        </View>
      )}

      {state.phase === 'error' && (
        <>
          <BrutalBlock
            backgroundColor="rgba(231,88,28,.1)"
            borderColor={Palette.orange}
            offset={0}
            radius={Radius.sm}
            style={styles.errorWrap}
            contentStyle={styles.errorCard}>
            <Text style={body(12, { color: Palette.bone, lineHeight: 16.8 })}>{state.message}</Text>
          </BrutalBlock>
          <PillButton
            label="TRY AGAIN"
            onPress={reset}
            fullWidth
            backgroundColor={Palette.cream}
            textColor={Palette.espresso}
            style={styles.retryButton}
          />
        </>
      )}

      {state.phase === 'done' && (
        <>
          <VerdictCard verdict={state.verdict} onOpenClaim={onOpenClaim} />

          {state.queryDescription && (
            <BrutalBlock
              backgroundColor="rgba(231,88,28,.06)"
              borderColor="rgba(231,88,28,.3)"
              offset={0}
              radius={Radius.sm}
              style={styles.detectedWrap}
              contentStyle={styles.detectedCard}>
              <Text style={mono(9.5, { spacing: 0.16, color: Palette.orange })}>WE DETECTED</Text>
              <Text style={body(12, { color: 'rgba(237,231,218,.75)', lineHeight: 16.8 })}>
                {state.queryDescription}
              </Text>
            </BrutalBlock>
          )}

          {state.aiHint && (
            <Text style={[mono(9.5, { spacing: 0.1, color: 'rgba(237,231,218,.45)' }), styles.aiHintText]}>
              {state.aiHint.likely_ai_generated ? '⚠ MAY BE AI-GENERATED / MANIPULATED' : 'NO OBVIOUS AI-GENERATION ARTIFACTS'}
              {state.aiHint.note ? ` — ${state.aiHint.note}` : ''}
            </Text>
          )}

          {state.similar.length > 0 && (
            <View style={styles.similarSection}>
              <Text style={mono(9.5, { spacing: 0.14, color: 'rgba(237,231,218,.5)' })}>
                VISUALLY SIMILAR VERIFIED PHOTOS
              </Text>
              <Text style={[mono(8.5, { spacing: 0.06, color: 'rgba(237,231,218,.35)' }), styles.similarHint]}>
                For discovery, not an authenticity check.
              </Text>
              <View style={styles.similarList}>
                {state.similar.map((r) => (
                  <SimilarRow key={r.claim_id} result={r} onPress={() => onOpenClaim(r.claim_id)} />
                ))}
              </View>
            </View>
          )}

          <PillButton
            label="RUN ANOTHER"
            onPress={reset}
            fullWidth
            backgroundColor={Palette.cream}
            textColor={Palette.espresso}
            style={styles.retryButton}
          />
        </>
      )}
    </BrutalBlock>
  );
}

function VerdictCard({ verdict, onOpenClaim }: { verdict: VerifyVerdict; onOpenClaim: (claimId: string) => void }) {
  const tone = VERDICT_TONE[verdict.type];

  return (
    <BrutalBlock
      backgroundColor={Palette.espresso}
      borderColor={tone.border}
      borderWidth={Border.thick}
      offset={3}
      radius={Radius.sm}
      style={styles.verdictWrap}
      contentStyle={styles.verdictCard}>
      <BrutalBlock
        backgroundColor={tone.badgeBg}
        borderColor={Palette.ink}
        offset={2}
        radius={Radius.pill}
        style={styles.badgeWrap}
        contentStyle={styles.badge}>
        <Text style={mono(10, { weight: 'semibold', spacing: 0.12, color: tone.badgeText })}>
          {tone.glyph} {tone.label}
        </Text>
      </BrutalBlock>

      <Text style={[body(12.5, { color: 'rgba(237,231,218,.8)', lineHeight: 17.5 }), styles.verdictMessage]}>
        {verdict.message}
      </Text>

      {(verdict.token_id != null || verdict.visual_match != null) && (
        <View style={styles.verdictMeta}>
          {verdict.token_id != null && (
            <Text style={mono(10.5, { spacing: 0.06, color: 'rgba(237,231,218,.6)' })}>
              TOKEN <Text style={{ color: tone.border }}>#{verdict.token_id}</Text>
            </Text>
          )}
          {verdict.visual_match != null && (
            <Text style={mono(10.5, { spacing: 0.06, color: 'rgba(237,231,218,.6)' })}>
              VISUAL MATCH <Text style={{ color: tone.border }}>{verdict.visual_match}%</Text>
            </Text>
          )}
        </View>
      )}

      {verdict.hash_decode_failed && verdict.hash_warning && (
        <Text style={[mono(9.5, { spacing: 0.06, color: Palette.orange, lineHeight: 14 }), styles.verdictSubtext]}>
          {verdict.hash_warning}
        </Text>
      )}

      {verdict.changes && (
        <View style={styles.changesBlock}>
          <Text style={mono(9, { spacing: 0.14, color: 'rgba(237,231,218,.45)' })}>
            WHAT CHANGED VS THE ORIGINAL · NON-AUTHORITATIVE
          </Text>
          {verdict.changes.summary && (
            <Text style={[body(11.5, { color: 'rgba(237,231,218,.75)', lineHeight: 16 }), styles.changesSummary]}>
              {verdict.changes.summary}
            </Text>
          )}
          {verdict.changes.items && verdict.changes.items.length > 0 ? (
            verdict.changes.items.map((c, i) => (
              <Text key={i} style={[body(11.5, { color: Palette.orange, lineHeight: 16 }), styles.changesItem]}>
                {'•'} {c}
              </Text>
            ))
          ) : (
            <Text style={body(11.5, { color: 'rgba(237,231,218,.5)', lineHeight: 16 })}>
              No visible content changes detected — likely just re-saved or compressed.
            </Text>
          )}
        </View>
      )}

      {verdict.claim_id && (
        <Pressable onPress={() => onOpenClaim(verdict.claim_id!)} style={styles.viewClaimLink}>
          <Text style={mono(10.5, { weight: 'semibold', spacing: 0.1, color: tone.border })}>VIEW ON-CHAIN CLAIM →</Text>
        </Pressable>
      )}
    </BrutalBlock>
  );
}

function SimilarRow({ result, onPress }: { result: VerifySimilarResult; onPress: () => void }) {
  const { style, onPressIn, onPressOut } = useBrutalPress(3);
  const pct = Math.round(result.similarity * 100);

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <BrutalBlock
        backgroundColor="rgba(237,231,218,.05)"
        borderColor="rgba(237,231,218,.28)"
        borderWidth={Border.thin}
        offset={3}
        radius={Radius.md}
        animatedStyle={style}
        contentStyle={styles.similarRow}>
        <SimilarThumb cid={result.cid} />
        <View style={{ flex: 1, gap: 4 }}>
          {result.description && (
            <Text style={body(11.5, { color: 'rgba(237,231,218,.7)', lineHeight: 15 })} numberOfLines={2}>
              {result.description}
            </Text>
          )}
          <Text style={mono(9, { spacing: 0.08, color: 'rgba(237,231,218,.4)' })}>
            {result.token_id ? `#${result.token_id}` : '—'}
            {result.created_at ? ` · ${new Date(result.created_at.includes('T') ? result.created_at : `${result.created_at.replace(' ', 'T')}Z`).toLocaleDateString()}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={mono(14, { weight: 'semibold', color: matchColor(pct) })}>{pct}%</Text>
          <Text style={mono(8, { spacing: 0.1, color: 'rgba(237,231,218,.4)' })}>MATCH</Text>
        </View>
      </BrutalBlock>
    </Pressable>
  );
}

function SimilarThumb({ cid }: { cid: string | null | undefined }) {
  const [gatewayIndex, setGatewayIndex] = useState(0);
  const clean = cleanCid(cid);
  const uri = clean && gatewayIndex < IPFS_GATEWAYS.length ? `${IPFS_GATEWAYS[gatewayIndex]}/${clean}` : null;

  if (!uri) return <View style={[styles.similarThumb, styles.similarThumbPlaceholder]} />;

  return (
    <Image
      source={{ uri }}
      style={styles.similarThumb}
      contentFit="cover"
      onError={() => setGatewayIndex((i) => i + 1)}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 26 },
  card: { padding: 22, gap: 4 },
  title: { marginTop: 4 },
  iconBadgeWrap: { alignItems: 'center', marginTop: 18, marginBottom: 4 },
  iconBadge: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  previewWrap: { marginTop: 16, alignSelf: 'stretch' },
  preview: { width: '100%', height: '100%' },
  pickRow: { flexDirection: 'row', gap: 10, marginTop: 18, alignSelf: 'stretch' },
  pickButton: { flex: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  errorWrap: { marginTop: 14, alignSelf: 'stretch' },
  errorCard: { padding: 14 },
  retryButton: { marginTop: 14 },
  verdictWrap: { marginTop: 14, alignSelf: 'stretch' },
  verdictCard: { padding: 16, gap: 4 },
  badgeWrap: { alignSelf: 'flex-start' },
  badge: { paddingHorizontal: 12, paddingVertical: 7 },
  verdictMessage: { marginTop: 10 },
  verdictMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 10 },
  verdictSubtext: { marginTop: 8 },
  changesBlock: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: Border.hairline,
    borderTopColor: 'rgba(237,231,218,.14)',
    gap: 4,
  },
  changesSummary: { marginTop: 2 },
  changesItem: { marginTop: 2 },
  viewClaimLink: { marginTop: 12 },
  detectedWrap: { marginTop: 12, alignSelf: 'stretch' },
  detectedCard: { padding: 12, gap: 4 },
  aiHintText: { marginTop: 10, alignSelf: 'stretch', lineHeight: 13 },
  similarSection: { marginTop: 18, alignSelf: 'stretch' },
  similarHint: { marginTop: 2 },
  similarList: { marginTop: 10, gap: 10 },
  similarRow: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10 },
  similarThumb: { width: 52, height: 52, borderRadius: Radius.sm, flexShrink: 0 },
  similarThumbPlaceholder: { backgroundColor: 'rgba(237,231,218,.08)' },
});
