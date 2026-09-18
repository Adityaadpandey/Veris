import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrutalBlock } from '@/components/brutal-block';
import { PillButton } from '@/components/pill-button';
import type { Photo } from '@/constants/photos';
import { Palette, Radius } from '@/constants/theme';
import { body, display, mono } from '@/constants/typography';

export type CaptureOutcome =
  | { status: 'sealed'; claimUrl: string }
  | { status: 'queued' }
  | { status: 'failed'; stage: string }
  | { status: 'unverified'; photo: Photo };

type FullScreenOutcome = Extract<CaptureOutcome, { status: 'queued' | 'failed' }>;

type Props = {
  outcome: FullScreenOutcome;
  onDismiss: () => void;
};

/**
 * Full-screen hand-off for the two outcomes worth a hard stop: `queued` is a
 * real capture the Pi saved offline to upload later, `failed` is a real
 * hardware failure at a named stage. `sealed`/`unverified` hand off through
 * the small self-dismissing CaptureToast instead, since neither needs to
 * block the next shot.
 */
export function CaptureResultSheet({ outcome, onDismiss }: Props) {
  const translateY = useSharedValue(60);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withTiming(0, { duration: 340, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(1, { duration: 260 });
  }, [opacity, translateY]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.wrap, sheetStyle]}>
      <BrutalBlock
        backgroundColor={Palette.espresso}
        borderColor={Palette.ink}
        radius={Radius.lg}
        offset={0}
        style={styles.card}
        contentStyle={styles.cardContent}>
        <SafeAreaView style={styles.safe}>
          {outcome.status === 'queued' ? (
            <QueuedContent onDismiss={onDismiss} />
          ) : (
            <FailedContent stage={outcome.stage} onDismiss={onDismiss} />
          )}
        </SafeAreaView>
      </BrutalBlock>
    </Animated.View>
  );
}

function QueuedContent({ onDismiss }: { onDismiss: () => void }) {
  return (
    <View style={styles.content}>
      <View style={styles.flaggedBody}>
        <BrutalBlock
          backgroundColor={Palette.cream}
          borderColor={Palette.ink}
          offset={3}
          radius={Radius.pill}
          style={styles.badgeWrap}
          contentStyle={styles.badge}>
          <Text style={mono(10.5, { weight: 'semibold', spacing: 0.12, color: Palette.espresso })}>SAVED OFFLINE</Text>
        </BrutalBlock>

        <Text style={[display(26, { color: Palette.bone, lineHeight: 25 }), styles.title]}>Queued for upload.</Text>
        <Text style={[body(13, { color: 'rgba(237,231,218,.65)', lineHeight: 18.5 }), styles.subtitle]}>
          The Pi has no signal right now. This frame is saved and will sign and upload automatically once it&apos;s back
          online.
        </Text>
      </View>

      <PillButton label="OK" onPress={onDismiss} backgroundColor={Palette.orange} textColor={Palette.espresso} arrow fullWidth />
    </View>
  );
}

function FailedContent({ stage, onDismiss }: { stage: string; onDismiss: () => void }) {
  return (
    <View style={styles.content}>
      <View style={styles.flaggedBody}>
        <BrutalBlock
          backgroundColor={Palette.orange}
          borderColor={Palette.ink}
          offset={3}
          radius={Radius.pill}
          style={styles.badgeWrap}
          contentStyle={styles.badge}>
          <Text style={mono(10.5, { weight: 'semibold', spacing: 0.12, color: Palette.espresso })}>⚠ NOT SEALED</Text>
        </BrutalBlock>

        <Text style={[display(26, { color: Palette.bone, lineHeight: 25 }), styles.title]}>Capture failed.</Text>
        <Text style={[body(13, { color: 'rgba(237,231,218,.65)', lineHeight: 18.5 }), styles.subtitle]}>
          Failed at {stage.toUpperCase()}.
        </Text>
      </View>

      <PillButton label="RETAKE" onPress={onDismiss} backgroundColor={Palette.orange} textColor={Palette.espresso} arrow fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 40,
  },
  card: { flex: 1 },
  cardContent: {
    flex: 1,
    borderBottomWidth: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  safe: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 22, paddingTop: 26, paddingBottom: 20 },
  flaggedBody: { flex: 1, justifyContent: 'center' },
  badgeWrap: { alignSelf: 'flex-start' },
  badge: { paddingHorizontal: 14, paddingVertical: 9 },
  title: { marginTop: 16, textTransform: 'uppercase' },
  subtitle: { marginTop: 8, maxWidth: 300 },
});
