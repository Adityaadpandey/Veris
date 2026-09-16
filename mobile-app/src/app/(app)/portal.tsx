import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalBlock } from '@/components/brutal-block';
import { GlassPanel } from '@/components/glass-panel';
import { PhotoThumb } from '@/components/photo-thumb';
import { Border, Palette, Radius } from '@/constants/theme';
import { body, display, mono } from '@/constants/typography';
import { useConnection } from '@/hooks/use-connection';
import { useBrutalPress } from '@/hooks/use-brutal-press';
import { useCameraClaims } from '@/hooks/use-camera-claims';
import { useClaimStates } from '@/hooks/use-claim-states';
import { useDevice } from '@/hooks/use-device';
import { usePhotos, type SealedEntry } from '@/hooks/use-photos';
import type { ClaimData, ClaimState } from '@/hooks/use-claim';
import { useWalletClaims } from '@/hooks/use-wallet-claims';
import { shortAddress } from '@/lib/format';
import { parsePhotoDate } from '@/constants/photos';

type StatusFilter = 'ALL' | 'SEALED' | 'PENDING' | 'UNVERIFIED';
const FILTERS: StatusFilter[] = ['ALL', 'SEALED', 'PENDING', 'UNVERIFIED'];
const DEVICE_FILTERS: ('ALL' | 'CLIP' | 'HOTSHOE')[] = ['ALL', 'CLIP', 'HOTSHOE'];
const DEVICE_FILTER_NAME: Record<'CLIP' | 'HOTSHOE', string> = { CLIP: 'Clip', HOTSHOE: 'Hotshoe' };

const DEVICE_LABEL = { hotshoe: 'HOTSHOE PAIRED', clip: 'VERIS CLIP PAIRED' } as const;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
// Lighthouse only serves an upload through the dedicated gateway tied to whichever API key
// uploaded it — the public IPFS gateways (w3s.link, dweb.link, ipfs.io) never have these CIDs at
// all. The account's dedicated gateway subdomain has changed over time (key rotations), so older
// claims live behind older subdomains. Current one first, then the previous ones as fallback.
const IPFS_GATEWAYS = [
  'https://unemployed-tyrannosaurus-wprec.lighthouseweb3.xyz/ipfs',
  'https://structural-crocodile-le3p6.lighthouseweb3.xyz/ipfs',
  'https://flexible-toucan-z8dgh.lighthouseweb3.xyz/ipfs',
];

function cleanCid(hash: string | null | undefined): string | null {
  if (!hash) return null;
  if (hash.startsWith('ipfs://')) return hash.slice(7);
  if (hash.startsWith('http://') || hash.startsWith('https://')) return null;
  return hash;
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const iso = dateStr.includes('T') || dateStr.endsWith('Z') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Unifies a real, hardware-sealed claim and a locally-imported unverified photo into one archive row. */
type ArchiveItem =
  | { kind: 'real'; entry: SealedEntry; claim: ClaimState }
  | { kind: 'unverified'; index: number; photo: import('@/constants/photos').Photo };

function realStatus(claim: ClaimState): 'SEALED' | 'PENDING' {
  if (claim.phase !== 'ready') return 'PENDING';
  return claim.claim.status === 'pending' ? 'PENDING' : 'SEALED';
}

function statusOf(item: ArchiveItem): StatusFilter {
  return item.kind === 'unverified' ? 'UNVERIFIED' : realStatus(item.claim);
}

function deviceOf(item: ArchiveItem): 'clip' | 'hotshoe' {
  return item.kind === 'real' ? item.entry.device : item.photo.device;
}

/** Folds a batch of server ClaimData into a SealedEntry list, skipping ids already present. */
function mergeClaimsIntoSealed(base: SealedEntry[], claims: ClaimData[]): SealedEntry[] {
  const byId = new Map<string, SealedEntry>();
  for (const entry of base) byId.set(entry.claimId, entry);
  for (const c of claims) {
    if (!c.claim_id || byId.has(c.claim_id)) continue;
    const idHint = `${c.device_id ?? ''} ${c.camera_id ?? ''}`.toLowerCase();
    byId.set(c.claim_id, {
      claimId: c.claim_id,
      addedAt: (c.created_at && Date.parse(c.created_at)) || Date.now(),
      device: idHint.includes('clip') ? 'clip' : 'hotshoe',
    });
  }
  return Array.from(byId.values());
}

function timeOf(item: ArchiveItem): number {
  if (item.kind === 'unverified') return parsePhotoDate(item.photo.date);
  if (item.claim.phase === 'ready' && item.claim.claim.created_at) {
    const t = Date.parse(item.claim.claim.created_at);
    if (!Number.isNaN(t)) return t;
  }
  return item.entry.addedAt;
}

export default function PortalScreen() {
  const router = useRouter();
  const { address } = useConnection();
  const { paired } = useDevice();
  const { photos, sealedClaims } = usePhotos();
  // sealedClaims only knows about claims *this device* captured. A fresh install or a second
  // phone on the same wallet needs the claims the server has on record for that wallet too —
  // merged in here, deduped by claim id, so the archive reflects everything the wallet owns.
  const walletClaims = useWalletClaims(address);
  const knownSealed = useMemo(() => mergeClaimsIntoSealed(sealedClaims, walletClaims), [sealedClaims, walletClaims]);
  const knownClaimStates = useClaimStates(useMemo(() => knownSealed.map((e) => e.claimId), [knownSealed]));

  // A claim only reaches knownSealed above if either this phone's Bluetooth session was still
  // connected when the Pi's upload finished, or someone's already claimed it with a wallet — miss
  // both (e.g. the session dropped during a slow network retry) and an otherwise perfectly real,
  // minted claim is invisible forever. Once we've seen even one claim from a camera, ask the server
  // for every other claim from that same camera too, so a stray one like that still turns up here.
  const cameraIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of walletClaims) if (c.camera_id) ids.add(c.camera_id);
    for (const state of Object.values(knownClaimStates)) {
      if (state.phase === 'ready' && state.claim.camera_id) ids.add(state.claim.camera_id);
    }
    return Array.from(ids);
  }, [walletClaims, knownClaimStates]);
  const cameraClaims = useCameraClaims(cameraIds);

  const allSealed = useMemo(() => mergeClaimsIntoSealed(knownSealed, cameraClaims), [knownSealed, cameraClaims]);
  const claimStates = useClaimStates(useMemo(() => allSealed.map((e) => e.claimId), [allSealed]));
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [deviceFilter, setDeviceFilter] = useState<'ALL' | 'CLIP' | 'HOTSHOE'>('ALL');
  const [sortDir, setSortDir] = useState<'newest' | 'oldest'>('newest');

  const items = useMemo<ArchiveItem[]>(() => {
    const real: ArchiveItem[] = allSealed.map((entry) => ({
      kind: 'real',
      entry,
      claim: claimStates[entry.claimId] ?? { phase: 'loading' },
    }));
    const unverified: ArchiveItem[] = photos.map((photo, index) => ({ kind: 'unverified', index, photo }));
    return [...real, ...unverified];
  }, [allSealed, claimStates, photos]);

  const shown = useMemo(() => {
    const filtered = items.filter(
      (it) =>
        (filter === 'ALL' || statusOf(it) === filter) &&
        (deviceFilter === 'ALL' || deviceOf(it) === deviceFilter.toLowerCase())
    );
    return filtered.sort((a, b) => {
      const diff = timeOf(b) - timeOf(a);
      return sortDir === 'newest' ? diff : -diff;
    });
  }, [items, filter, deviceFilter, sortDir]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headerTextCol}>
            <Text style={mono(10, { spacing: 0.2, color: 'rgba(16,14,12,.5)' })}>OWNER PORTAL</Text>
            <Text style={[display(34, { color: Palette.ink, lineHeight: 31 }), styles.headerTitle]}>
              The{'\n'}archive.
            </Text>
          </View>
          <Pressable onPress={() => router.push('/profile')} style={styles.addrCol}>
            <BrutalBlock
              backgroundColor={Palette.ink}
              borderColor={Palette.ink}
              offset={3}
              radius={Radius.sm}
              contentStyle={styles.addrChip}>
              <View style={styles.addrDot} />
              <Text style={mono(10, { spacing: 0.1, color: Palette.cream })} numberOfLines={1}>
                {shortAddress(address)}
              </Text>
            </BrutalBlock>
            {paired && (
              <Text
                style={[mono(9.5, { spacing: 0.14, color: 'rgba(16,14,12,.45)' }), { marginTop: 8 }]}
                numberOfLines={1}>
                {DEVICE_LABEL[paired]}
              </Text>
            )}
          </Pressable>
        </View>

        <Text style={[mono(9, { spacing: 0.16, color: 'rgba(16,14,12,.4)' }), styles.filterKicker]}>STATUS</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterRowContent}>
          {FILTERS.map((f) => (
            <FilterChip key={f} label={f} active={filter === f} onPress={() => setFilter(f)} />
          ))}
        </ScrollView>

        <Text style={[mono(9, { spacing: 0.16, color: 'rgba(16,14,12,.4)' }), styles.filterKickerSecond]}>DEVICE</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterRowContent}>
          {DEVICE_FILTERS.map((d) => (
            <FilterChip key={d} label={d} active={deviceFilter === d} onPress={() => setDeviceFilter(d)} />
          ))}
        </ScrollView>

        <View style={styles.countRow}>
          <Text style={mono(10, { spacing: 0.14, color: 'rgba(16,14,12,.5)' })}>
            {shown.length} FRAMES / {filter}
            {deviceFilter !== 'ALL' ? ` · ${deviceFilter}` : ''}
          </Text>
          <Pressable
            onPress={() => setSortDir((d) => (d === 'newest' ? 'oldest' : 'newest'))}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
            <Text style={mono(10, { spacing: 0.14, color: 'rgba(16,14,12,.5)' })}>
              SORT / {sortDir === 'newest' ? 'NEWEST ↓' : 'OLDEST ↑'}
            </Text>
          </Pressable>
        </View>

        {shown.length === 0 ? (
          <BrutalBlock
            backgroundColor={Palette.cream}
            borderColor="rgba(16,14,12,.28)"
            borderWidth={Border.thin}
            offset={0}
            radius={Radius.md}
            style={styles.emptyWrap}
            contentStyle={styles.emptyCard}>
            <Text style={mono(10, { spacing: 0.18, color: Palette.orange })}>NO FRAMES MATCH</Text>
            <Text style={body(15, { weight: 'semibold', color: Palette.ink, lineHeight: 20 })}>
              No {filter === 'ALL' ? 'frames' : `${filter.toLowerCase()} frames`}
              {deviceFilter === 'ALL' ? '' : ` from the ${DEVICE_FILTER_NAME[deviceFilter]}`}.
            </Text>
            <Text style={body(12, { color: 'rgba(16,14,12,.55)', lineHeight: 17 })}>
              {allSealed.length === 0 && photos.length === 0
                ? 'Capture a frame with Click Photo or the Hotshoe trigger to start the archive.'
                : 'Try a different status or device filter — this combination has nothing in the archive yet.'}
            </Text>
          </BrutalBlock>
        ) : (
        <View style={styles.grid}>
          {shown.map((item) => {
            if (item.kind === 'unverified') {
              const p = item.photo;
              const badgeColor = p.status === 'PENDING' || p.status === 'UNVERIFIED' ? 'rgba(237,231,218,.92)' : Palette.orange;
              return (
                <Pressable
                  key={`u-${p.code}`}
                  style={styles.cardPress}
                  onPress={() => router.push({ pathname: '/claim/[index]', params: { index: String(item.index) } })}>
                  <BrutalBlock backgroundColor={Palette.ink} borderColor={Palette.ink} offset={4} radius={Radius.md}>
                    <View>
                      <PhotoThumb photo={p} height={172} radius={0} />
                      <GlassPanel
                        variant="onDark"
                        intensity={50}
                        radius={Radius.xs}
                        borderWidth={Border.hairline}
                        style={styles.badge}
                        contentStyle={styles.badgeContent}>
                        <Text style={mono(8.5, { spacing: 0.12, color: badgeColor })}>{p.status}</Text>
                      </GlassPanel>
                    </View>
                    <View style={styles.cardFooter}>
                      <Text style={mono(10, { spacing: 0.08, color: Palette.cream, lineHeight: 13.5 })}>{p.date}</Text>
                      <Text style={mono(9, { spacing: 0.08, color: 'rgba(237,231,218,.45)', lineHeight: 12 })}>
                        {p.place}
                      </Text>
                    </View>
                  </BrutalBlock>
                </Pressable>
              );
            }

            const status = realStatus(item.claim);
            const claim = item.claim.phase === 'ready' ? item.claim.claim : null;
            const badgeColor = status === 'PENDING' ? 'rgba(237,231,218,.92)' : Palette.orange;
            const place = claim?.location_name || (claim?.latitude != null ? `${claim.latitude.toFixed(2)}N` : '—');
            return (
              <Pressable
                key={`r-${item.entry.claimId}`}
                style={styles.cardPress}
                onPress={() => router.push({ pathname: '/claim/real/[claimId]', params: { claimId: item.entry.claimId } })}>
                <BrutalBlock backgroundColor={Palette.ink} borderColor={Palette.ink} offset={4} radius={Radius.md}>
                  <View>
                    <RealThumb cid={cleanCid(claim?.cid)} />
                    <GlassPanel
                      variant="onDark"
                      intensity={50}
                      radius={Radius.xs}
                      borderWidth={Border.hairline}
                      style={styles.badge}
                      contentStyle={styles.badgeContent}>
                      <Text style={mono(8.5, { spacing: 0.12, color: badgeColor })}>{status}</Text>
                    </GlassPanel>
                  </View>
                  <View style={styles.cardFooter}>
                    <Text style={mono(10, { spacing: 0.08, color: Palette.cream, lineHeight: 13.5 })}>
                      {fmtDate(claim?.created_at)}
                    </Text>
                    <Text style={mono(9, { spacing: 0.08, color: 'rgba(237,231,218,.45)', lineHeight: 12 })}>
                      {place}
                    </Text>
                  </View>
                </BrutalBlock>
              </Pressable>
            );
          })}
        </View>
        )}
      </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** Grid-tile version of the real claim screen's remote hero image — same IPFS gateway fallback chain, fixed 172px height. */
function RealThumb({ cid }: { cid: string | null }) {
  const [gatewayIndex, setGatewayIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const uri = cid && gatewayIndex < IPFS_GATEWAYS.length ? `${IPFS_GATEWAYS[gatewayIndex]}/${cid}` : null;

  if (!uri || failed) {
    return (
      <View style={[styles.realThumb, styles.realThumbPlaceholder]}>
        <Text style={mono(8.5, { spacing: 0.12, color: 'rgba(237,231,218,.4)' })}>
          {cid ? 'IMAGE UNAVAILABLE' : 'PROCESSING…'}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={styles.realThumb}
      contentFit="cover"
      onError={() => {
        if (gatewayIndex + 1 < IPFS_GATEWAYS.length) setGatewayIndex((i) => i + 1);
        else setFailed(true);
      }}
    />
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { style, onPressIn, onPressOut } = useBrutalPress(3);
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} style={styles.chipPress}>
      <BrutalBlock
        backgroundColor={active ? Palette.ink : Palette.cream}
        borderColor={active ? Palette.ink : 'rgba(16,14,12,.28)'}
        borderWidth={Border.thin}
        offset={3}
        radius={Radius.pill}
        animatedStyle={style}
        contentStyle={styles.filterChip}>
        <Text style={mono(10.5, { spacing: 0.14, color: active ? Palette.cream : 'rgba(16,14,12,.6)' })}>{label}</Text>
      </BrutalBlock>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.cream },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 140 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerTextCol: { flex: 1, paddingRight: 12 },
  headerTitle: { marginTop: 10, textTransform: 'uppercase' },
  addrCol: { alignItems: 'flex-end', maxWidth: 132 },
  addrChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  addrDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Palette.orange, flexShrink: 0 },
  filterKicker: { marginTop: 22, marginBottom: 7 },
  filterKickerSecond: { marginTop: 14, marginBottom: 7 },
  filterRow: { overflow: 'visible' },
  filterRowContent: { paddingBottom: 6, paddingRight: 4 },
  chipPress: { marginRight: 8 },
  filterChip: { paddingHorizontal: 15, paddingVertical: 10 },
  countRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: Border.hairline,
    borderTopColor: 'rgba(16,14,12,.16)',
    paddingTop: 10,
  },
  grid: { marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  emptyWrap: { marginTop: 16 },
  emptyCard: { padding: 18, gap: 8 },
  cardPress: { width: '46.5%' },
  realThumb: { width: '100%', height: 172 },
  realThumbPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.onyx, paddingHorizontal: 10 },
  badge: { position: 'absolute', left: 8, top: 8 },
  badgeContent: { paddingHorizontal: 8, paddingVertical: 5 },
  cardFooter: {
    padding: 9,
    paddingTop: 8,
  },
});
