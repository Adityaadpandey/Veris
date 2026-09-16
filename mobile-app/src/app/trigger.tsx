import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { ViewfinderBrackets } from '@/components/viewfinder-brackets';
import { Palette } from '@/constants/theme';
import { mono } from '@/constants/typography';
import { usePiTrigger, type TriggerStage } from '@/hooks/use-pi-trigger';

const STAGE_LABEL: Record<TriggerStage, string> = {
  idle: 'READY · TAP TO CAPTURE',
  capturing: 'CAPTURING…',
  captured: 'CAPTURED',
  signed: 'SIGNED',
  tethering: 'CONNECTING TO NETWORK…',
  uploading: 'UPLOADING…',
  queued: 'SAVED — WILL UPLOAD AUTOMATICALLY',
  failed: 'FAILED',
};

export default function TriggerScreen() {
  const router = useRouter();
  const { connectionState, deviceName, stage, failedStage, claimUrl, log, shutterDisabled, connect, sendCapture } =
    usePiTrigger();

  // PiTriggerProvider connects once at app boot and never retries on its own after that —
  // opening this screen is the natural moment to retry if that first attempt didn't land.
  useEffect(() => {
    if (connectionState === 'disconnected') connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectionLabel =
    connectionState === 'unsupported'
      ? 'HOTSHOE TRIGGER NEEDS ANDROID'
      : connectionState === 'connected'
        ? `CONNECTED · ${deviceName ?? 'HOTSHOE'}`
        : connectionState === 'connecting'
          ? 'CONNECTING…'
          : 'NOT CONNECTED';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe}>
        <ViewfinderBrackets />
        <BackButton onPress={() => router.back()} style={styles.back} />

        <View style={styles.header}>
          <Text style={mono(10, { spacing: 0.18, color: 'rgba(237,231,218,.5)' })}>{connectionLabel}</Text>
          {connectionState === 'disconnected' && Platform.OS === 'android' && (
            <Pressable onPress={connect} hitSlop={8}>
              <Text style={mono(10, { spacing: 0.14, color: Palette.orange })}>RETRY</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.frame}>
          {claimUrl ? (
            <View style={styles.claimBlock}>
              <Text style={mono(11, { spacing: 0.2, color: Palette.orange })}>✓ UPLOADED</Text>
              <View style={styles.qrWrap}>
                <QRCode value={claimUrl} size={168} backgroundColor={Palette.bone} color={Palette.ink} />
              </View>
              <Text style={mono(10, { spacing: 0.1, color: 'rgba(237,231,218,.55)' })} numberOfLines={1}>
                {claimUrl}
              </Text>
            </View>
          ) : (
            <Text style={mono(10, { spacing: 0.16, color: 'rgba(237,231,218,.4)' })}>{STAGE_LABEL[stage]}</Text>
          )}
          {failedStage && (
            <Text style={mono(10, { spacing: 0.14, color: Palette.orange })}>FAILED: {failedStage.toUpperCase()}</Text>
          )}
        </View>

        <View style={styles.controls}>
          <Pressable
            onPress={sendCapture}
            disabled={shutterDisabled}
            style={[styles.shutter, shutterDisabled && styles.shutterDisabled]}>
            <View style={styles.shutterCore} />
          </Pressable>
        </View>

        <ScrollView style={styles.log} contentContainerStyle={styles.logContent}>
          {log.map((line, i) => (
            <Text key={i} style={mono(9.5, { spacing: 0.08, color: 'rgba(237,231,218,.4)', lineHeight: 15 })}>
              {line}
            </Text>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.charcoal },
  safe: { flex: 1 },
  back: { marginTop: 34, marginLeft: 22 },
  header: {
    marginTop: 20,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  frame: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 30,
  },
  claimBlock: { alignItems: 'center', gap: 14 },
  qrWrap: { padding: 14, backgroundColor: Palette.bone, borderRadius: 16 },
  controls: { paddingHorizontal: 30, paddingBottom: 24, alignItems: 'center' },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: Palette.bone,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: { opacity: 0.35 },
  shutterCore: { width: 58, height: 58, borderRadius: 29, backgroundColor: Palette.orange },
  log: { maxHeight: 120, marginTop: 4 },
  logContent: { paddingHorizontal: 22, paddingBottom: 20, gap: 3 },
});
