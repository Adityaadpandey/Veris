import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { BackButton } from '@/components/back-button';
import { BrutalBlock } from '@/components/brutal-block';
import { CaptureResultSheet, type CaptureOutcome } from '@/components/capture-result-sheet';
import { CaptureStagePill } from '@/components/capture-stage-pill';
import { CaptureToast } from '@/components/capture-toast';
import { GlassPanel } from '@/components/glass-panel';
import { PillButton } from '@/components/pill-button';
import { RadialGlow } from '@/components/radial-glow';
import { CLAIM_SERVER_URL } from '@/constants/config';
import { Border, Palette, Radius } from '@/constants/theme';
import { body, display, mono } from '@/constants/typography';
import { useBrutalPress } from '@/hooks/use-brutal-press';
import { useDevice } from '@/hooks/use-device';
import { usePhotos } from '@/hooks/use-photos';
import { usePiTrigger } from '@/hooks/use-pi-trigger';
import { extractClaimId } from '@/lib/claim-id';

const FLASH_MODES: FlashMode[] = ['off', 'auto', 'on'];
const TOAST_DURATION_MS = 4500;

export default function CaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { paired } = useDevice();
  const { photos, addUnverifiedPhoto } = usePhotos();
  const [permission, requestPermission] = useCameraPermissions();

  const cameraRef = useRef<CameraView>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flashIndex, setFlashIndex] = useState(0);
  const [zoomDisplay, setZoomDisplay] = useState(0);
  const [resultOutcome, setResultOutcome] = useState<CaptureOutcome | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shutterPress = useBrutalPress(5);

  const { connectionState, stage, failedStage, claimUrl, shutterDisabled, connect, sendCapture, registerCompanionUpload } =
    usePiTrigger();

  // PiTriggerProvider connects once at app boot — often before pairing/permissions are even
  // settled — and never retries on its own after that. Opening the camera is the natural moment
  // to retry if that first attempt didn't land, without re-owning (and tearing down) the connection.
  useEffect(() => {
    if (connectionState === 'disconnected') connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tracks whether the in-flight CAPTURE was started by this screen, so a stale claimUrl/failedStage
  // left over from a previous session (usePiTrigger persists them until the next capture) never pops
  // up a result sheet nobody asked for.
  const pendingRef = useRef(false);

  const zoom = useSharedValue(0);
  const zoomAtGestureStart = useSharedValue(0);
  const flash = FLASH_MODES[flashIndex];
  const isBusy = stage !== 'idle' && stage !== 'failed' && stage !== 'queued';

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      zoomAtGestureStart.value = zoom.value;
    })
    .onUpdate((e) => {
      const next = Math.min(1, Math.max(0, zoomAtGestureStart.value + (e.scale - 1) * 0.6));
      zoom.value = next;
      runOnJS(setZoomDisplay)(next);
    });

  // Fired the instant the phone's own frame is captured — not gated on the claim existing yet,
  // since the Pi's own capture -> Filecoin -> ZK proof -> mint pipeline this pairs against can take
  // far longer than a single image upload. Uploads straight to Cloudinary and hands the result to
  // PiTriggerProvider (registerCompanionUpload), which links it to the real claim once that claim
  // exists (see use-pi-trigger.tsx) — that hop survives navigation away from this screen, which a
  // ref living here would not. Best-effort with a few retries: a paired companion photo is a demo
  // enhancement layered on top of the real, hardware-minted claim, and must never block or fail
  // that claim if the upload doesn't land. Logs (not silent) so a failed pairing is visible in
  // Metro instead of just absent later.
  const uploadCompanionPhoto = useCallback(
    async (uri: string, capturedAt: string) => {
      const attempts = 3;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          // Expo SDK 57's global fetch (the "winter" WinterCG-compliant runtime) has its own FormData
          // encoder that doesn't understand React Native's classic { uri, name, type } file shape — it
          // only accepts a real Blob-like value (an object with `.bytes()`), which is what expo-file-system's
          // File class provides. The legacy shape throws "Unsupported FormDataPart implementation".
          const form = new FormData();
          form.append('mobile_image', new File(uri));
          const res = await fetch(`${CLAIM_SERVER_URL}/api/companion/upload`, { method: 'POST', body: form });
          const data = await res.json().catch(() => null);
          if (res.ok && data?.success && data.mobile_image_url && data.mobile_public_id) {
            registerCompanionUpload({
              mobile_image_url: data.mobile_image_url,
              mobile_public_id: data.mobile_public_id,
              mobile_captured_at: capturedAt,
            });
            console.log('[companion] uploaded, awaiting claim to link');
            return;
          }
          console.warn(`[companion] upload rejected (${res.status}):`, data);
        } catch (err) {
          console.warn(`[companion] upload attempt ${attempt} failed:`, (err as Error).message);
        }
        if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 800));
      }
      console.warn('[companion] giving up on upload after retries');
    },
    [registerCompanionUpload]
  );

  useEffect(() => {
    if (!pendingRef.current) return;
    if (stage === 'failed' && failedStage) {
      pendingRef.current = false;
      setResultOutcome({ status: 'failed', stage: failedStage });
    } else if (stage === 'queued') {
      pendingRef.current = false;
      setResultOutcome({ status: 'queued' });
    } else if (claimUrl) {
      // Archiving (and, since it lives alongside it now, companion linking) happens centrally in
      // PiTriggerProvider the instant UPLOADED arrives, so both survive even if this screen isn't
      // the one still mounted when that happens — this effect only drives this screen's own UI
      // feedback for the capture it started.
      pendingRef.current = false;
      setResultOutcome({ status: 'sealed', claimUrl });
    }
  }, [stage, failedStage, claimUrl]);

  const clearToastTimer = useCallback(() => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
  }, []);

  const closeResult = useCallback(() => {
    clearToastTimer();
    setResultOutcome(null);
  }, [clearToastTimer]);

  // `sealed` and `unverified` hand off through the small toast (below), which times itself
  // out — it doesn't block the camera, so the next shot doesn't wait on a dismissal tap.
  useEffect(() => {
    clearToastTimer();
    if (resultOutcome?.status === 'sealed' || resultOutcome?.status === 'unverified') {
      toastTimer.current = setTimeout(() => setResultOutcome(null), TOAST_DURATION_MS);
    }
    return clearToastTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultOutcome]);

  const viewRecord = useCallback(() => {
    if (resultOutcome?.status === 'unverified') {
      const index = photos.indexOf(resultOutcome.photo);
      closeResult();
      if (index >= 0) router.push({ pathname: '/claim/[index]', params: { index: String(index) } });
      return;
    }
    if (resultOutcome?.status === 'sealed') {
      const claimId = extractClaimId(resultOutcome.claimUrl);
      closeResult();
      if (claimId) router.push({ pathname: '/claim/real/[claimId]', params: { claimId } });
    }
  }, [resultOutcome, photos, router, closeResult]);

  const handleShutter = useCallback(async () => {
    if (shutterDisabled || pendingRef.current) return;
    pendingRef.current = true;
    setResultOutcome(null);
    const capturedAt = new Date().toISOString();
    // Fired alongside (not before) the BLE trigger so the phone and device frames land as close to
    // the same instant as this app can manage — there's no hardware-level shutter sync (see spec).
    if (!cameraRef.current) console.warn('[companion] cameraRef is null at shutter press');
    const companionCapture = cameraRef.current
      ?.takePictureAsync({ quality: 0.7 })
      .then((photo) => {
        if (photo?.uri) {
          // Not awaited: the Cloudinary upload runs on its own from here, independent of this
          // screen's lifecycle and of the (much slower) Pi mint pipeline sendCapture() kicks off
          // below — that's what makes the upload actually start "the second the image is clicked"
          // instead of only once the claim shows up.
          uploadCompanionPhoto(photo.uri, capturedAt);
        } else {
          console.warn('[companion] takePictureAsync returned no uri');
        }
      })
      .catch((err) => {
        // Best-effort — a failed phone-side capture just means no companion pairing card later.
        console.warn('[companion] takePictureAsync failed:', (err as Error).message);
      });
    await Promise.all([companionCapture, sendCapture()]);
  }, [shutterDisabled, sendCapture, uploadCompanionPhoto]);

  const handleGallery = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    const aspect = asset.width && asset.height ? asset.width / asset.height : 0.75;
    const photo = addUnverifiedPhoto({ uri: asset.uri, aspect });
    setResultOutcome({ status: 'unverified', photo });
  }, [addUnverifiedPhoto]);

  // This screen only makes sense with a Clip paired — a Hotshoe signs at its own shutter, not from the app.
  if (paired !== undefined && paired !== 'clip') return <Redirect href="/portal" />;

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <RadialGlow
          cx={0.5}
          cy={0.14}
          r={0.6}
          stops={[
            [0, 'rgba(231,88,28,.35)', 1],
            [0.7, 'rgba(231,88,28,0)', 1],
          ]}
        />
        <SafeAreaView style={styles.safe}>
          <View style={styles.permissionWrap}>
            <Text style={mono(11, { spacing: 0.2, color: Palette.orange })}>CAMERA ACCESS</Text>
            <Text style={[display(28, { color: Palette.bone, lineHeight: 26 }), styles.permissionTitle]}>
              Let Click Photo{'\n'}see through the lens.
            </Text>
            <Text style={body(12, { color: 'rgba(237,231,218,.55)', lineHeight: 17 })}>
              Veris Hotshoe needs camera access to frame a shot the Clip will capture and seal.
            </Text>
            <PillButton
              label={permission.canAskAgain ? 'ALLOW CAMERA ACCESS' : 'OPEN SETTINGS'}
              onPress={permission.canAskAgain ? requestPermission : () => Linking.openSettings()}
              backgroundColor={Palette.orange}
              textColor={Palette.espresso}
              arrow
              style={styles.permissionCta}
            />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const connectionLabel =
    connectionState === 'unsupported'
      ? 'CLICK PHOTO NEEDS ANDROID'
      : connectionState === 'connected'
        ? 'CLIP CONNECTED'
        : connectionState === 'connecting'
          ? 'CONNECTING…'
          : 'CLIP NOT CONNECTED';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <GestureDetector gesture={pinchGesture}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
          zoom={zoomDisplay}
          onCameraReady={() => setCameraReady(true)}
        />
      </GestureDetector>

      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]} pointerEvents="box-none">
        <BackButton variant="dark" onPress={() => router.replace('/portal')} />
        <Pressable
          onPress={() => setFlashIndex((i) => (i + 1) % FLASH_MODES.length)}
          hitSlop={10}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <GlassPanel
            variant="onDark"
            intensity={46}
            radius={Radius.pill}
            borderWidth={Border.thin}
            contentStyle={styles.flashPill}>
            <Text style={mono(9.5, { spacing: 0.12, color: Palette.bone })}>FLASH {flash.toUpperCase()}</Text>
          </GlassPanel>
        </Pressable>
      </View>

      <View style={[styles.statusRow, { top: insets.top + 62 }]} pointerEvents="box-none">
        <GlassPanel
          variant="onDark"
          intensity={46}
          radius={Radius.pill}
          borderWidth={Border.thin}
          contentStyle={styles.statusPill}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: connectionState === 'connected' ? Palette.green : Palette.orange },
            ]}
          />
          <Text style={mono(9, { spacing: 0.12, color: Palette.bone })}>{connectionLabel}</Text>
        </GlassPanel>
        {isBusy && <CaptureStagePill stage={stage} />}
        {connectionState === 'disconnected' && Platform.OS === 'android' && (
          <Pressable onPress={connect} hitSlop={8} style={styles.retryPress}>
            <Text style={mono(9.5, { spacing: 0.12, color: Palette.orange })}>RETRY</Text>
          </Pressable>
        )}
      </View>

      {paired === 'clip' && !isBusy && !resultOutcome && <ClipPipOverlay />}

      {zoomDisplay > 0.02 && (
        <View style={[styles.zoomBadge, { bottom: insets.bottom + 132 }]} pointerEvents="none">
          <GlassPanel
            variant="onDark"
            intensity={46}
            radius={Radius.pill}
            borderWidth={Border.thin}
            contentStyle={styles.zoomBadgeContent}>
            <Text style={mono(10, { spacing: 0.1, color: Palette.bone })}>{(1 + zoomDisplay * 7).toFixed(1)}×</Text>
          </GlassPanel>
        </View>
      )}

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 18 }]} pointerEvents="box-none">
        <Pressable onPress={handleGallery} hitSlop={10} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <GlassPanel
            variant="onDark"
            intensity={46}
            radius={Radius.pill}
            borderWidth={Border.thick}
            borderColor="rgba(237,231,218,.5)"
            contentStyle={styles.sideButton}>
            <GalleryIcon color={Palette.bone} />
          </GlassPanel>
        </Pressable>

        <Pressable
          onPress={handleShutter}
          onPressIn={shutterPress.onPressIn}
          onPressOut={shutterPress.onPressOut}
          disabled={shutterDisabled || !cameraReady}>
          <BrutalBlock
            backgroundColor={Palette.orange}
            borderColor={Palette.ink}
            offset={5}
            radius={Radius.pill}
            animatedStyle={shutterPress.style}
            style={shutterDisabled ? styles.shutterDisabled : undefined}
            contentStyle={styles.shutter}>
            <View style={styles.shutterInner} />
          </BrutalBlock>
        </Pressable>

        <Pressable
          onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
          hitSlop={10}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <GlassPanel
            variant="onDark"
            intensity={46}
            radius={Radius.pill}
            borderWidth={Border.thick}
            borderColor="rgba(237,231,218,.5)"
            contentStyle={styles.sideButton}>
            <Text style={styles.flipGlyph}>⟲</Text>
          </GlassPanel>
        </Pressable>
      </View>

      {(resultOutcome?.status === 'queued' || resultOutcome?.status === 'failed') && (
        <CaptureResultSheet outcome={resultOutcome} onDismiss={closeResult} />
      )}

      {(resultOutcome?.status === 'sealed' || resultOutcome?.status === 'unverified') && (
        <CaptureToast
          outcome={resultOutcome}
          bottomOffset={insets.bottom + 132}
          onView={viewRecord}
          onDismiss={closeResult}
        />
      )}
    </View>
  );
}

/**
 * Clip self-view PiP — NOT wired to a second camera; the Clip has no feed this app can read, so this
 * is a static placeholder standing in for where a real secondary preview would eventually sit.
 */
function ClipPipOverlay() {
  return (
    <View style={styles.pipWrap} pointerEvents="none">
      <BrutalBlock backgroundColor={Palette.onyx} borderColor={Palette.ink} offset={3} radius={Radius.xs} contentStyle={styles.pipContent}>
        <Text style={mono(8.5, { weight: 'semibold', spacing: 0.16, color: 'rgba(237,231,218,.6)' })}>CLIP</Text>
      </BrutalBlock>
    </View>
  );
}

function GalleryIcon({ color }: { color: string }) {
  return (
    <Svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={4} width={18} height={16} rx={2.5} />
      <Circle cx={8.5} cy={9.5} r={1.6} fill={color} stroke="none" />
      <Path d="M21 16l-5.5-5.5a2 2 0 0 0-2.8 0L3 20" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.espresso },
  safe: { flex: 1 },

  permissionWrap: { flex: 1, paddingHorizontal: 24, justifyContent: 'center', gap: 12 },
  permissionTitle: { marginTop: 2 },
  permissionCta: { marginTop: 10, alignSelf: 'flex-start' },

  topBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  flashPill: { paddingHorizontal: 13, paddingVertical: 10 },

  statusRow: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 7 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  retryPress: { paddingVertical: 4, paddingHorizontal: 4 },

  zoomBadge: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  zoomBadgeContent: { paddingHorizontal: 12, paddingVertical: 6 },

  bottomBar: {
    position: 'absolute',
    left: 28,
    right: 28,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideButton: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  flipGlyph: { fontSize: 22, color: Palette.bone, fontWeight: '600' },

  shutter: { width: 86, height: 86, alignItems: 'center', justifyContent: 'center' },
  shutterDisabled: { opacity: 0.35 },
  shutterInner: { width: 60, height: 60, borderRadius: 30, borderWidth: 3.5, borderColor: Palette.espresso },

  pipWrap: { position: 'absolute', right: 20, bottom: 112, width: '28%', aspectRatio: 3 / 4 },
  pipContent: { flex: 1, padding: 6, justifyContent: 'flex-start' },
});
