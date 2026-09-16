import { Asset } from 'expo-asset';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import { BackButton } from '@/components/back-button';
import { BrutalBlock } from '@/components/brutal-block';
import { CompanionCaptureCard } from '@/components/companion-capture-card';
import { GlassPanel } from '@/components/glass-panel';
import { PhotoThumb } from '@/components/photo-thumb';
import { PillButton } from '@/components/pill-button';
import { ProvenanceTimeline } from '@/components/provenance-timeline';
import { publicClaimUrl } from '@/constants/config';
import type { Photo } from '@/constants/photos';
import { Border, Palette, Radius } from '@/constants/theme';
import { body, display, mono } from '@/constants/typography';
import { useBrutalPress } from '@/hooks/use-brutal-press';
import { useConnection } from '@/hooks/use-connection';
import { usePhotos } from '@/hooks/use-photos';
import { saveToPhotoLibrary } from '@/lib/save-photo';

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Resolves a bundled require()'d image to a real file:// uri, downloading it into the asset cache on first use. A captured/picked frame already carries a real uri and passes through unchanged. */
async function resolveLocalUri(img: ImageSourcePropType) {
  if (typeof img !== 'number') return (img as { uri: string }).uri;
  const asset = Asset.fromModule(img);
  if (!asset.localUri) await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
}

export default function ClaimScreen() {
  const router = useRouter();
  const { index } = useLocalSearchParams<{ index: string }>();
  const { photos } = usePhotos();
  const resolvedIndex = photos[Number(index)] ? Number(index) : 0;
  const photo = photos[resolvedIndex];
  const isUnverified = photo.status === 'UNVERIFIED';
  const [day, month, year] = photo.date.split(' ');
  const { address, connected } = useConnection();
  // Photo has no ownership field today, so "public" is defined purely by connection state — see
  // task summary for why. `connected !== true` also covers the brief `undefined` loading window on
  // a cold link open, so an owner-only action never flashes in before connection state resolves.
  const isPublic = connected !== true;

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [sharing, setSharing] = useState(false);
  const downloadPress = useBrutalPress(4);

  const otherPhotos = photos
    .map((p, i) => ({ photo: p, index: i }))
    .filter(({ index: i }) => i !== resolvedIndex)
    .slice(0, 6);

  const handleDownload = async () => {
    if (saveState === 'saving') return;
    setSaveState('saving');
    const uri = await resolveLocalUri(photo.img);
    const result = await saveToPhotoLibrary(uri);
    if (result.ok) {
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1800);
      return;
    }
    setSaveState('idle');
    if (result.reason === 'unsupported') {
      Alert.alert('Not available on web', 'Open this frame in the mobile app to save it to your device.');
    } else if (result.reason === 'denied') {
      Alert.alert('Permission needed', 'Allow photo library access to save this frame to your device.');
    } else {
      Alert.alert('Could not save', `Something went wrong saving ${photo.code}. Try again.`);
    }
  };

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    const link = publicClaimUrl(resolvedIndex);
    // Public, non-sensitive claim facts only — no personal identity, no exact GPS.
    const lines = [
      `${photo.code} — sealed ${photo.date} by Hotshoe #0043.`,
      `Owner ${address}${photo.tid !== '—' ? ` · Token ${photo.tid}` : ''}${
        photo.lic !== '—' ? ` · ${photo.lic} licence` : ''
      }`,
      `Seal ${photo.tx}`,
      `View & verify: ${link}`,
    ];
    const message = lines.join('\n');

    try {
      if (Platform.OS === 'ios') {
        // iOS shares `url` and `message` together — attaches the sealed image alongside the text+link.
        const uri = await resolveLocalUri(photo.img);
        await Share.share({ message, url: uri });
      } else {
        // Android's Share only carries `message` — the link travels inline in the text.
        await Share.share({ message });
      }
    } catch {
      if (Platform.OS === 'web') {
        try {
          await navigator.clipboard.writeText(message);
          Alert.alert('Link copied', 'Sharing isn’t available in this browser — the claim details and link were copied instead.');
        } catch {
          // Clipboard unavailable too — nothing left to fall back to.
        }
      }
      // Native: the user dismissed the share sheet — nothing to recover.
    } finally {
      setSharing(false);
    }
  };

  const handleLicense = () => {
    Alert.alert(
      'Licence this frame',
      `Send a ${photo.lic === '—' ? 'standard' : photo.lic.toLowerCase()} licence request for ${photo.code}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send request',
          onPress: () => Alert.alert('Request sent', "We'll email the licence terms within 24 hours."),
        },
      ]
    );
  };

  const exif: [string, string][] = [
    ['CAMERA', photo.cam],
    ['LENS', photo.lens],
    ['SHUTTER', photo.sh],
    ['APERTURE', photo.ap],
    ['ISO', photo.iso],
    ['CAPTURED', photo.cap],
    ['GPS', photo.gps],
    ['MODULE', isUnverified ? 'NONE · PHONE LIBRARY' : photo.device === 'clip' ? 'VERIS CLIP' : 'HOTSHOE #0043'],
  ];

  const nft: [string, string][] = [
    ['TOKEN', photo.tid],
    ['CONTRACT', photo.cont],
    ['MINT TX', photo.tx],
    ['EDITION', photo.ed],
    ['ROYALTY', photo.roy],
    ['LICENCE', photo.lic],
    ['PERCEPTUAL HASH', 'p:9f31c2…7ad0'],
  ];

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <BackButton onPress={() => router.back()} variant="light" />
          <GlassPanel variant="onLight" intensity={55} radius={Radius.xs} borderWidth={Border.hairline} contentStyle={styles.codeChip}>
            <Text style={mono(10, { spacing: 0.16, color: 'rgba(16,14,12,.55)' })}>CLAIM SHEET / {photo.code}</Text>
          </GlassPanel>
        </View>

        <BrutalBlock backgroundColor={Palette.ink} borderColor={Palette.ink} offset={5} radius={Radius.lg} style={styles.heroWrap}>
          <View>
            <PhotoThumb photo={photo} dynamic radius={0} />
            <GlassPanel
              variant="onDark"
              intensity={50}
              radius={Radius.sm}
              borderWidth={Border.hairline}
              style={styles.signedBadge}
              contentStyle={styles.signedBadgeContent}>
              <View style={styles.signedDot} />
              <Text style={mono(9.5, { spacing: 0.14, color: Palette.cream })}>SIGNED AT CAPTURE</Text>
            </GlassPanel>
            <GlassPanel
              variant="onDark"
              intensity={50}
              radius={Radius.xs}
              borderWidth={Border.hairline}
              style={styles.resBadge}
              contentStyle={styles.resBadgeContent}>
              <Text style={mono(9.5, { spacing: 0.1, color: 'rgba(237,231,218,.9)' })}>{photo.res}</Text>
            </GlassPanel>
          </View>
        </BrutalBlock>

        <Text style={[mono(11, { spacing: 0.16, color: 'rgba(16,14,12,.5)' }), styles.captionRow]}>
          {photo.place} · {day} {month} {year}
        </Text>

        <View style={styles.ctaRow}>
          <Pressable onPress={handleDownload} onPressIn={downloadPress.onPressIn} onPressOut={downloadPress.onPressOut}>
            <BrutalBlock
              backgroundColor={saveState === 'saved' ? Palette.green : Palette.cream}
              borderColor={Palette.ink}
              offset={4}
              radius={Radius.md}
              animatedStyle={downloadPress.style}
              contentStyle={styles.downloadButton}>
              <Text style={[styles.downloadIcon, { color: saveState === 'saved' ? Palette.bone : Palette.ink }]}>
                {saveState === 'saving' ? '···' : saveState === 'saved' ? '✓' : '↓'}
              </Text>
            </BrutalBlock>
          </Pressable>
          <PillButton
            label={sharing ? 'OPENING…' : 'SHARE PROOF'}
            onPress={handleShare}
            disabled={sharing}
            style={styles.ctaFlex}
            backgroundColor={Palette.cream}
            borderColor={Palette.ink}
            textColor={Palette.ink}
          />
          {!isPublic && (
            <PillButton
              label="LICENCE IT"
              onPress={handleLicense}
              style={styles.ctaFlex}
              backgroundColor={Palette.ink}
              textColor={Palette.cream}
            />
          )}
        </View>

        {isUnverified ? (
          <BrutalBlock backgroundColor={Palette.orange} borderColor={Palette.ink} offset={4} radius={Radius.md} style={styles.authenticWrap} contentStyle={styles.authenticBar}>
            <View>
              <Text style={mono(11, { weight: 'semibold', spacing: 0.16, color: Palette.espresso })}>UNVERIFIED</Text>
              <Text style={[mono(10, { spacing: 0.08, color: 'rgba(35,20,10,.7)' }), { marginTop: 6 }]}>
                NO HARDWARE SEAL ON RECORD
              </Text>
            </View>
          </BrutalBlock>
        ) : (
          <BrutalBlock backgroundColor={Palette.green} borderColor={Palette.ink} offset={4} radius={Radius.md} style={styles.authenticWrap} contentStyle={styles.authenticBar}>
            <View>
              <Text style={mono(11, { weight: 'semibold', spacing: 0.16, color: Palette.bone })}>AUTHENTIC</Text>
              <Text style={[mono(10, { spacing: 0.08, color: 'rgba(237,231,218,.75)' }), { marginTop: 6 }]}>
                SEAL {photo.tx}
              </Text>
            </View>
            <Text style={display(24, { color: Palette.bone })}>100%</Text>
          </BrutalBlock>
        )}

        <View style={styles.sectionHead}>
          <View style={styles.sectionDot} />
          <Text style={mono(11, { weight: 'semibold', spacing: 0.2, color: Palette.ink })}>CAPTURE METADATA</Text>
        </View>
        <BrutalBlock backgroundColor={Palette.cream} borderColor={Palette.ink} offset={4} radius={Radius.md} style={styles.metaWrap}>
          <View style={styles.metaGrid}>
            {chunk(exif, 2).map((pair, i) => (
              <View key={i} style={styles.metaRow}>
                {pair.map(([k, v]) => (
                  <View key={k} style={styles.metaCell}>
                    <Text style={mono(9, { spacing: 0.16, color: 'rgba(16,14,12,.48)' })}>{k}</Text>
                    <Text style={body(13, { weight: 'medium', color: Palette.ink })}>{v}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </BrutalBlock>

        {isUnverified ? (
          <BrutalBlock backgroundColor={Palette.ink} borderColor={Palette.ink} offset={5} radius={Radius.lg} style={styles.custodyWrap} contentStyle={styles.custodyCard}>
            <View style={styles.chainHeader}>
              <Text style={mono(10, { weight: 'semibold', spacing: 0.2, color: Palette.orange })}>CHAIN OF CUSTODY</Text>
            </View>
            <Text style={body(12.5, { color: 'rgba(237,231,218,.55)', lineHeight: 17.5 })}>
              This frame was imported from your phone&apos;s library, not captured by a paired module — there&apos;s no
              custody chain or on-chain claim to show.
            </Text>
          </BrutalBlock>
        ) : (
          <>
            <BrutalBlock backgroundColor={Palette.ink} borderColor={Palette.ink} offset={5} radius={Radius.lg} style={styles.custodyWrap} contentStyle={styles.custodyCard}>
              <View style={styles.chainHeader}>
                <Text style={mono(10, { weight: 'semibold', spacing: 0.2, color: Palette.orange })}>CHAIN OF CUSTODY</Text>
                <Text style={mono(10, { spacing: 0.1, color: 'rgba(237,231,218,.5)' })}>6 STEPS</Text>
              </View>
              <ProvenanceTimeline capturedAt={photo.cap} />
            </BrutalBlock>

            <BrutalBlock backgroundColor={Palette.ink} borderColor={Palette.ink} offset={5} radius={Radius.lg} style={styles.chainWrap} contentStyle={styles.chainCard}>
              <View style={styles.chainHeader}>
                <Text style={mono(10, { weight: 'semibold', spacing: 0.2, color: Palette.orange })}>ON-CHAIN CLAIM</Text>
                <Text style={mono(10, { spacing: 0.1, color: 'rgba(237,231,218,.5)' })}>BASE / L2</Text>
              </View>
              <View style={styles.chainList}>
                {nft.map(([k, v]) => (
                  <View key={k} style={styles.chainRow}>
                    <Text style={mono(10, { spacing: 0.14, color: 'rgba(237,231,218,.45)' })}>{k}</Text>
                    <Text style={mono(12, { color: Palette.bone })}>{v}</Text>
                  </View>
                ))}
              </View>
            </BrutalBlock>
          </>
        )}

        <View style={styles.sectionHead}>
          <View style={styles.sectionDot} />
          <Text style={mono(11, { weight: 'semibold', spacing: 0.2, color: Palette.ink })}>COMPANION CAPTURE</Text>
        </View>
        <CompanionCaptureFallback photo={photo} />

        {otherPhotos.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <View style={styles.sectionDot} />
              <Text style={mono(11, { weight: 'semibold', spacing: 0.2, color: Palette.ink })}>SIMILAR FRAMES</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.similarRow}
              style={styles.similarScroll}>
              {otherPhotos.map(({ photo: p, index: i }) => (
                <SimilarTile key={p.code} photo={p} onPress={() => router.push({ pathname: '/claim/[index]', params: { index: String(i) } })} />
              ))}
            </ScrollView>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * Renders the shared CompanionCaptureCard when a companion pairing exists;
 * otherwise falls back to a short explanatory message (gallery import with
 * no hardware counterpart at all, or a pairing that never landed) — same
 * messaging role the old device/phone match card used to fill.
 */
function CompanionCaptureFallback({ photo }: { photo: Photo }) {
  if (photo.companion) return <CompanionCaptureCard companion={photo.companion} />;

  const isUnverified = photo.status === 'UNVERIFIED';
  return (
    <BrutalBlock backgroundColor={Palette.cream} borderColor={Palette.ink} offset={4} radius={Radius.md} style={styles.matchWrap} contentStyle={styles.matchCard}>
      <View style={styles.matchThumbSingle}>
        <Image source={photo.img} style={StyleSheet.absoluteFill} contentFit="cover" />
      </View>
      <View style={styles.matchBadgeRow}>
        <View style={[styles.matchDot, { backgroundColor: Palette.orange }]} />
        <Text style={mono(10, { weight: 'semibold', spacing: 0.14, color: Palette.orange })}>
          {isUnverified ? 'NO HARDWARE COUNTERPART' : 'NO COMPANION PAIRING'}
        </Text>
      </View>
      <Text style={body(12.5, { color: 'rgba(16,14,12,.6)', lineHeight: 17.5 })}>
        {isUnverified
          ? "Imported straight from your phone's library — it never passed through a paired module, so there's nothing to pair against."
          : "No phone photo was paired with this capture, so only the hardware-signed device image is kept and shown as proof."}
      </Text>
    </BrutalBlock>
  );
}

function SimilarTile({ photo, onPress }: { photo: Photo; onPress: () => void }) {
  const { style, onPressIn, onPressOut } = useBrutalPress(3);
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <BrutalBlock
        backgroundColor={Palette.ink}
        borderColor={Palette.ink}
        offset={3}
        radius={Radius.sm}
        animatedStyle={style}
        style={styles.similarTileWrap}>
        <PhotoThumb photo={photo} height={128} radius={0} />
      </BrutalBlock>
      <Text style={[mono(9.5, { spacing: 0.12, color: 'rgba(16,14,12,.55)' }), styles.similarCode]}>{photo.code}</Text>
      <Text style={mono(9.5, { spacing: 0.08, color: 'rgba(16,14,12,.4)' })}>{photo.place.split(' / ')[0]}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.cream },
  scroll: { paddingHorizontal: 20, paddingTop: 62, paddingBottom: 44 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  codeChip: { paddingHorizontal: 12, paddingVertical: 8 },
  captionRow: { marginTop: 16, textTransform: 'uppercase' },
  heroWrap: { marginTop: 12 },
  signedBadge: { position: 'absolute', left: 12, top: 12 },
  signedBadgeContent: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7 },
  signedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Palette.orange },
  resBadge: { position: 'absolute', right: 12, bottom: 12 },
  resBadgeContent: { paddingHorizontal: 8, paddingVertical: 5 },
  authenticWrap: { marginTop: 22 },
  authenticBar: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHead: { marginTop: 26, flexDirection: 'row', alignItems: 'baseline', gap: 9 },
  sectionDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Palette.ink },
  metaWrap: { marginTop: 12 },
  metaGrid: { gap: 1, backgroundColor: 'rgba(16,14,12,.14)' },
  metaRow: { flexDirection: 'row', gap: 1 },
  metaCell: { flex: 1, backgroundColor: Palette.cream, padding: 11, paddingHorizontal: 12, gap: 6 },
  custodyWrap: { marginTop: 22 },
  custodyCard: { padding: 18, gap: 16 },
  chainWrap: { marginTop: 22 },
  chainCard: { padding: 18, gap: 14 },
  chainHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chainList: { gap: 11 },
  chainRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 16,
    borderBottomWidth: Border.hairline,
    borderBottomColor: 'rgba(237,231,218,.1)',
    paddingBottom: 9,
  },
  ctaRow: { marginTop: 18, flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  ctaFlex: { flex: 1 },
  downloadButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  downloadIcon: { fontSize: 18, fontWeight: '700' },
  matchWrap: { marginTop: 12 },
  matchCard: { padding: 16, gap: 14 },
  matchBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  matchDot: { width: 6, height: 6, borderRadius: 3 },
  matchThumbSingle: { aspectRatio: 16 / 9, borderRadius: Radius.xs, overflow: 'hidden', backgroundColor: Palette.ink },
  similarScroll: { marginTop: 12 },
  similarRow: { gap: 12, paddingRight: 4 },
  similarTileWrap: { width: 110 },
  similarCode: { marginTop: 8 },
});
