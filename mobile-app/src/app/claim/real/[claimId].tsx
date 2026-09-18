import * as SecureStore from 'expo-secure-store';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { BrutalBlock } from '@/components/brutal-block';
import { CompanionCaptureCard } from '@/components/companion-capture-card';
import { GlassPanel } from '@/components/glass-panel';
import { PillButton } from '@/components/pill-button';
import { CLAIM_SERVER_URL, publicRealClaimUrl } from '@/constants/config';
import { Border, Palette, Radius } from '@/constants/theme';
import { body, display, mono } from '@/constants/typography';
import { useClaim, type ClaimData } from '@/hooks/use-claim';
import { useConnection } from '@/hooks/use-connection';

// expo-secure-store has no web implementation; same fallback shim used elsewhere in the app.
const mintedStorage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return window.localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string) {
    if (Platform.OS === 'web') return window.localStorage.setItem(key, value);
    return SecureStore.setItemAsync(key, value);
  },
};

// Lighthouse only serves an upload through the dedicated gateway tied to whichever API key
// uploaded it — the public IPFS gateways (w3s.link, dweb.link, ipfs.io) never have these CIDs at
// all. The account's dedicated gateway subdomain has changed over time (key rotations), so older
// claims live behind older subdomains. Current one first, then the previous ones as fallback.
const IPFS_GATEWAYS = [
  'https://unemployed-tyrannosaurus-wprec.lighthouseweb3.xyz/ipfs',
  'https://structural-crocodile-le3p6.lighthouseweb3.xyz/ipfs',
  'https://flexible-toucan-z8dgh.lighthouseweb3.xyz/ipfs',
];

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function cleanCid(hash: string | null | undefined): string | null {
  if (!hash) return null;
  if (hash.startsWith('ipfs://')) return hash.slice(7);
  if (hash.startsWith('http://') || hash.startsWith('https://')) return null;
  return hash;
}

function fmt(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr.includes('T') || dateStr.endsWith('Z') ? dateStr : dateStr.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return dateStr;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${hh}:${mm}`;
}

function short(str: string | number | null | undefined, len = 8): string {
  const s = str == null ? '' : String(str);
  if (!s) return '—';
  if (s.length <= len * 2 + 3) return s;
  return `${s.slice(0, len)}…${s.slice(-len)}`;
}

export default function RealClaimScreen() {
  const router = useRouter();
  const { claimId } = useLocalSearchParams<{ claimId: string }>();
  const state = useClaim(claimId);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.headerRow}>
          <BackButton onPress={() => router.back()} variant="light" />
          <GlassPanel variant="onLight" intensity={55} radius={Radius.xs} borderWidth={Border.hairline} contentStyle={styles.codeChip}>
            <Text style={mono(10, { spacing: 0.16, color: 'rgba(16,14,12,.55)' })}>CLAIM / {short(claimId, 6)}</Text>
          </GlassPanel>
        </View>

        {state.phase === 'loading' && (
          <View style={styles.centerFill}>
            <ActivityIndicator color={Palette.ink} />
            <Text style={[mono(10, { spacing: 0.14, color: 'rgba(16,14,12,.5)' }), { marginTop: 10 }]}>
              LOADING CLAIM…
            </Text>
          </View>
        )}

        {state.phase === 'not-found' && (
          <View style={styles.centerFill}>
            <Text style={mono(10, { spacing: 0.18, color: Palette.orange })}>CLAIM NOT FOUND</Text>
            <Text style={[body(13, { color: 'rgba(16,14,12,.55)', lineHeight: 18 }), { marginTop: 8, textAlign: 'center', maxWidth: 260 }]}>
              This claim doesn&apos;t exist yet, or the claim server can&apos;t be reached right now.
            </Text>
          </View>
        )}

        {state.phase === 'ready' && <ClaimBody claim={state.claim} claimId={claimId!} />}
      </SafeAreaView>
    </View>
  );
}

function ClaimBody({ claim, claimId }: { claim: ClaimData; claimId: string }) {
  const cid = cleanCid(claim.cid);
  const isPending = claim.status === 'pending';
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    const link = publicRealClaimUrl(claimId);
    const lines = [
      `Veris claim ${short(claimId, 6)} — sealed ${fmt(claim.created_at)}.`,
      claim.token_id ? `Token #${claim.token_id}` : null,
      `View & verify: ${link}`,
    ].filter((line): line is string => !!line);
    const message = lines.join('\n');

    try {
      await Share.share({ message });
    } catch {
      if (Platform.OS === 'web') {
        try {
          await navigator.clipboard.writeText(message);
          Alert.alert('Link copied', 'Sharing isn’t available in this browser — the claim link was copied instead.');
        } catch {
          // Clipboard unavailable too — nothing left to fall back to.
        }
      }
      // Native: the user dismissed the share sheet — nothing to recover.
    } finally {
      setSharing(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <BrutalBlock backgroundColor={Palette.ink} borderColor={Palette.ink} offset={5} radius={Radius.lg} style={styles.heroWrap}>
        <View>
          <RemoteClaimImage cid={cid} />
          <GlassPanel
            variant="onDark"
            intensity={50}
            radius={Radius.sm}
            borderWidth={Border.hairline}
            style={styles.signedBadge}
            contentStyle={styles.signedBadgeContent}>
            <View style={[styles.signedDot, { backgroundColor: isPending ? Palette.orange : Palette.green }]} />
            <Text style={mono(9.5, { spacing: 0.14, color: Palette.cream })}>
              {isPending ? 'PROCESSING' : 'HARDWARE VERIFIED'}
            </Text>
          </GlassPanel>
        </View>
      </BrutalBlock>

      {claim.companion_capture && (
        <>
          <View style={styles.sectionHead}>
            <View style={styles.sectionDot} />
            <Text style={mono(11, { weight: 'semibold', spacing: 0.2, color: Palette.ink })}>COMPANION CAPTURE</Text>
          </View>
          <CompanionCaptureCard
            companion={claim.companion_capture}
            deviceAiHint={{ likely_ai_generated: claim.likely_ai_generated ?? null, note: claim.ai_assessment }}
            size="featured"
          />
        </>
      )}

      <View style={styles.shareRow}>
        <PillButton
          label={sharing ? 'OPENING…' : 'SHARE PROOF'}
          onPress={handleShare}
          disabled={sharing}
          backgroundColor={Palette.cream}
          borderColor={Palette.ink}
          textColor={Palette.ink}
          fullWidth
        />
      </View>

      <View style={styles.metaRows}>
        <MetaRow label="CAPTURED" value={fmt(claim.created_at)} />
        <MetaRow label="DEVICE" value={claim.device_id || claim.camera_id || '—'} />
        {(claim.location_name || claim.latitude) && (
          <MetaRow label="LOCATION" value={claim.location_name || `${claim.latitude?.toFixed(3)}, ${claim.longitude?.toFixed(3)}`} />
        )}
        <MetaRow label="SHA-256" value={short(claim.image_hash, 10)} />
      </View>

      <View style={styles.sectionHead}>
        <View style={styles.sectionDot} />
        <Text style={mono(11, { weight: 'semibold', spacing: 0.2, color: Palette.ink })}>VERIFICATION</Text>
      </View>
      <ProvenanceScore claim={claim} />
      <ProofStatCard title="ECDSA Signed" sub={claim.signature ? 'Hardware key · on record' : 'No signature on record'} verified={!!claim.signature} />
      <ProofStatCard title="Minted On-Chain" sub={claim.token_id ? `Token #${claim.token_id}` : 'Not minted yet'} verified={!!claim.token_id} />
      <ProofStatCard title="IPFS Stored" sub={cid ? 'Filecoin · Lighthouse' : 'No CID on record'} verified={!!cid} />

      <MintSection claim={claim} claimId={claimId} />

      <ProofAccordion claim={claim} claimId={claimId} />

      {claim.description && (
        <BrutalBlock backgroundColor={Palette.cream} borderColor={Palette.ink} offset={4} radius={Radius.md} style={styles.aiWrap} contentStyle={styles.aiCard}>
          <Text style={mono(9.5, { weight: 'semibold', spacing: 0.16, color: Palette.orange })}>AI DESCRIPTION</Text>
          <Text style={[body(12.5, { color: 'rgba(16,14,12,.7)', lineHeight: 17.5 }), { marginTop: 8 }]}>{claim.description}</Text>
        </BrutalBlock>
      )}
    </ScrollView>
  );
}

function RemoteClaimImage({ cid }: { cid: string | null }) {
  const [gatewayIndex, setGatewayIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const uri = cid && gatewayIndex < IPFS_GATEWAYS.length ? `${IPFS_GATEWAYS[gatewayIndex]}/${cid}` : null;

  if (!uri || failed) {
    return (
      <View style={[styles.heroImage, styles.heroImagePlaceholder]}>
        <Text style={mono(9.5, { spacing: 0.14, color: 'rgba(237,231,218,.4)' })}>
          {cid ? 'IMAGE UNAVAILABLE' : 'AWAITING UPLOAD'}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={styles.heroImage}
      contentFit="cover"
      onError={() => {
        if (gatewayIndex + 1 < IPFS_GATEWAYS.length) setGatewayIndex((i) => i + 1);
        else setFailed(true);
      }}
    />
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={mono(9, { spacing: 0.16, color: 'rgba(16,14,12,.48)' })}>{label}</Text>
      <Text style={body(12.5, { weight: 'medium', color: Palette.ink })}>{value}</Text>
    </View>
  );
}

function ProofStatCard({ title, sub, verified }: { title: string; sub: string; verified: boolean }) {
  return (
    <BrutalBlock
      backgroundColor={verified ? Palette.cream : 'rgba(16,14,12,.04)'}
      borderColor={verified ? Palette.ink : 'rgba(16,14,12,.2)'}
      borderWidth={Border.thin}
      offset={2}
      radius={Radius.sm}
      style={styles.statCardWrap}
      contentStyle={styles.statCard}>
      <View style={[styles.statDot, { backgroundColor: verified ? Palette.green : 'rgba(16,14,12,.25)' }]} />
      <View style={{ flex: 1 }}>
        <Text style={body(12.5, { weight: 'semibold', color: verified ? Palette.ink : 'rgba(16,14,12,.5)' })}>{title}</Text>
        <Text style={[mono(9, { spacing: 0.08, color: 'rgba(16,14,12,.5)' }), { marginTop: 2 }]}>{sub}</Text>
      </View>
      {verified && <Text style={{ color: Palette.green, fontSize: 14, fontWeight: '700' }}>✓</Text>}
    </BrutalBlock>
  );
}

const PROVENANCE_FACTORS: { key: keyof ReturnType<typeof provenanceChecks>; label: string; points: number }[] = [
  { key: 'hash', label: 'SHA-256 image hash recorded', points: 30 },
  { key: 'sig', label: 'Hardware ECDSA signature', points: 25 },
  { key: 'device', label: 'Camera device identity', points: 20 },
  { key: 'mint', label: 'Minted on-chain', points: 15 },
  { key: 'ipfs', label: 'Stored on IPFS / Filecoin', points: 10 },
];

function provenanceChecks(claim: ClaimData) {
  return {
    hash: !!claim.image_hash,
    sig: !!claim.signature,
    device: !!(claim.device_id || claim.camera_id),
    mint: !!claim.tx_hash,
    ipfs: !!cleanCid(claim.cid),
  };
}

function ProvenanceScore({ claim }: { claim: ClaimData }) {
  const passed = provenanceChecks(claim);
  const score = PROVENANCE_FACTORS.reduce((sum, f) => sum + (passed[f.key] ? f.points : 0), 0);
  const r = 24;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = score >= 85 ? Palette.green : score >= 60 ? Palette.orange : 'rgba(16,14,12,.4)';

  return (
    <BrutalBlock backgroundColor={Palette.cream} borderColor={Palette.ink} offset={3} radius={Radius.md} style={styles.scoreWrap} contentStyle={styles.scoreCard}>
      <View style={styles.scoreTop}>
        <View style={styles.scoreRing}>
          <Svg width={56} height={56} viewBox="0 0 56 56" style={{ transform: [{ rotate: '-90deg' }] }}>
            <Circle cx={28} cy={28} r={r} fill="none" stroke="rgba(16,14,12,.1)" strokeWidth={5} />
            <Circle
              cx={28}
              cy={28}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
            />
          </Svg>
          <View style={styles.scoreRingLabel}>
            <Text style={[display(16, { color: Palette.ink }), { lineHeight: 18 }]}>{score}</Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={body(13, { weight: 'semibold', color: Palette.ink })}>Provenance Score</Text>
          <Text style={[mono(9, { spacing: 0.08, color: 'rgba(16,14,12,.5)' }), { marginTop: 3 }]}>
            {score >= 85 ? 'Fully verifiable' : score >= 60 ? 'Strong provenance' : 'Limited provenance on record'}
          </Text>
        </View>
      </View>
      <View style={styles.scoreFactors}>
        {PROVENANCE_FACTORS.map((f) => (
          <View key={f.key} style={styles.scoreFactorRow}>
            <View style={[styles.scoreFactorDot, { borderColor: passed[f.key] ? Palette.green : 'rgba(16,14,12,.25)' }]}>
              {passed[f.key] && <View style={styles.scoreFactorDotFill} />}
            </View>
            <Text style={[mono(9.5, { spacing: 0.05, color: passed[f.key] ? 'rgba(16,14,12,.7)' : 'rgba(16,14,12,.4)' }), { flex: 1 }]}>
              {f.label}
            </Text>
            <Text style={mono(9.5, { spacing: 0.05, color: passed[f.key] ? Palette.green : 'rgba(16,14,12,.3)' })}>
              {passed[f.key] ? `+${f.points}` : '+0'}
            </Text>
          </View>
        ))}
      </View>
    </BrutalBlock>
  );
}

function MintSection({ claim, claimId }: { claim: ClaimData; claimId: string }) {
  const router = useRouter();
  const { connected, address } = useConnection();
  const [mintedAddress, setMintedAddress] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storageKey = `veris_minted_${claimId}`;

  useEffect(() => {
    let cancelled = false;
    mintedStorage.get(storageKey).then((value) => {
      if (!cancelled && value) setMintedAddress(value);
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  if (claim.status === 'pending') {
    return (
      <BrutalBlock backgroundColor={Palette.cream} borderColor={Palette.ink} offset={3} radius={Radius.md} style={styles.mintWrap} contentStyle={[styles.mintCard, styles.mintCardCenter]}>
        <ActivityIndicator color={Palette.ink} />
        <Text style={[body(12.5, { weight: 'semibold', color: Palette.ink }), { marginTop: 8 }]}>Processing photo…</Text>
        <Text style={[mono(9.5, { spacing: 0.08, color: 'rgba(16,14,12,.5)' }), { marginTop: 4 }]}>
          Claim opens once the original NFT is minted.
        </Text>
      </BrutalBlock>
    );
  }

  if (claim.status !== 'open') return null;

  if (mintedAddress) {
    return (
      <BrutalBlock backgroundColor={Palette.green} borderColor={Palette.ink} offset={3} radius={Radius.md} style={styles.mintWrap} contentStyle={[styles.mintCard, styles.mintCardCenter]}>
        <Text style={mono(10.5, { weight: 'semibold', spacing: 0.14, color: Palette.bone })}>✓ EDITION CLAIMED</Text>
        <Text style={[mono(9, { spacing: 0.08, color: 'rgba(237,231,218,.8)' }), { marginTop: 6 }]}>
          Sent to {short(mintedAddress, 8)} · arrives in ~30–60s
        </Text>
      </BrutalBlock>
    );
  }

  const submit = async () => {
    if (!address) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${CLAIM_SERVER_URL}/claim/${claimId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: address }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Submission failed.');
      await mintedStorage.set(storageKey, address);
      setMintedAddress(address);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BrutalBlock backgroundColor={Palette.cream} borderColor={Palette.ink} offset={3} radius={Radius.md} style={styles.mintWrap} contentStyle={styles.mintCard}>
      <Text style={mono(10, { weight: 'semibold', spacing: 0.16, color: Palette.orange })}>CLAIM FREE EDITION</Text>
      {!connected ? (
        <PillButton
          label="CONNECT WALLET"
          onPress={() => router.push('/wallet')}
          backgroundColor={Palette.ink}
          textColor={Palette.cream}
          arrow
          fullWidth
          style={{ marginTop: 10 }}
        />
      ) : !address ? (
        <View style={{ marginTop: 10, alignItems: 'center' }}>
          <ActivityIndicator color={Palette.ink} />
          <Text style={[mono(9.5, { spacing: 0.08, color: 'rgba(16,14,12,.5)' }), { marginTop: 6 }]}>
            Preparing your wallet…
          </Text>
        </View>
      ) : (
        <>
          <Text style={[mono(9.5, { spacing: 0.1, color: 'rgba(16,14,12,.5)' }), { marginTop: 6 }]}>{short(address, 8)}</Text>
          <PillButton
            label={submitting ? 'SUBMITTING…' : 'CLAIM FREE EDITION'}
            onPress={submit}
            disabled={submitting}
            backgroundColor={Palette.ink}
            textColor={Palette.cream}
            arrow
            fullWidth
            style={{ marginTop: 10 }}
          />
        </>
      )}
      {error && <Text style={[mono(9.5, { spacing: 0.08, color: Palette.orange }), { marginTop: 8 }]}>{error}</Text>}
    </BrutalBlock>
  );
}

function ProofAccordion({ claim, claimId }: { claim: ClaimData; claimId: string }) {
  const [open, setOpen] = useState(false);
  const rows: [string, string][] = [
    ['Claim ID', short(claimId, 8)],
    ['Device Address', short(claim.device_address, 8)],
    ['IPFS CID', short(cleanCid(claim.cid), 8)],
    ...(claim.token_id ? ([['Token ID', `#${claim.token_id}`]] as [string, string][]) : []),
    ...(claim.tx_hash ? ([['Mint Transaction', short(claim.tx_hash, 8)]] as [string, string][]) : []),
    ['ECDSA Signature', short(claim.signature, 8)],
    ['SHA-256 Hash', short(claim.image_hash, 8)],
    ['Network', 'Sepolia Testnet'],
    ['Contract', 'Veris ERC-1155'],
    ...(claim.recipient_address ? ([['Original Owner', short(claim.recipient_address, 8)]] as [string, string][]) : []),
  ];

  return (
    <View style={styles.accordionWrap}>
      <Pressable onPress={() => setOpen((v) => !v)} style={styles.accordionHeader}>
        <Text style={mono(10, { spacing: 0.18, color: 'rgba(16,14,12,.5)' })}>CRYPTOGRAPHIC PROOF DATA</Text>
        <Text style={mono(12, { color: Palette.orange })}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open && (
        <View style={styles.accordionGrid}>
          {rows.map(([k, v]) => (
            <View key={k} style={styles.accordionCell}>
              <Text style={mono(8.5, { spacing: 0.14, color: 'rgba(16,14,12,.45)' })}>{k.toUpperCase()}</Text>
              <Text style={[mono(10.5, { color: Palette.ink }), { marginTop: 3 }]}>{v}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.cream },
  safe: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12 },
  codeChip: { paddingHorizontal: 12, paddingVertical: 8 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 60 },
  heroWrap: { marginTop: 4 },
  heroImage: { width: '100%', aspectRatio: 4 / 3, borderRadius: 0 },
  heroImagePlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.onyx },
  signedBadge: { position: 'absolute', left: 12, top: 12 },
  signedBadgeContent: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7 },
  signedDot: { width: 6, height: 6, borderRadius: 3 },
  shareRow: { marginTop: 14 },
  metaRows: { marginTop: 22, gap: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  aiWrap: { marginTop: 22 },
  aiCard: { padding: 14 },
  sectionHead: { marginTop: 24, flexDirection: 'row', alignItems: 'baseline', gap: 9 },
  sectionDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Palette.ink },
  scoreWrap: { marginTop: 12 },
  scoreCard: { padding: 14 },
  scoreTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  scoreRing: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  scoreRingLabel: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  scoreFactors: { marginTop: 12, paddingTop: 12, borderTopWidth: Border.hairline, borderTopColor: 'rgba(16,14,12,.1)', gap: 7 },
  scoreFactorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreFactorDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  scoreFactorDotFill: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Palette.green },
  statCardWrap: { marginTop: 8 },
  statCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  mintWrap: { marginTop: 20 },
  mintCard: { padding: 16 },
  mintCardCenter: { alignItems: 'center' },
  accordionWrap: { marginTop: 22 },
  accordionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: Border.hairline, borderTopColor: 'rgba(16,14,12,.14)' },
  accordionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 6, paddingBottom: 10 },
  accordionCell: { width: '47%', backgroundColor: 'rgba(16,14,12,.04)', borderRadius: Radius.xs, padding: 10 },
});
