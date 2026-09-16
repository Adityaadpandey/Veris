import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrutalBlock } from '@/components/brutal-block';
import { GlassPanel } from '@/components/glass-panel';
import { Border, Palette, Radius } from '@/constants/theme';
import { mono } from '@/constants/typography';
import { useBrutalPress } from '@/hooks/use-brutal-press';

export type DockTab = 'portal' | 'search' | 'capture' | 'monitor';

type CellTab = 'portal' | 'search' | 'monitor';

const BASE_TABS: { key: CellTab; label: string }[] = [
  { key: 'portal', label: 'CERTIFICATES' },
  { key: 'search', label: 'VERIFY' },
];
const MONITOR_TAB: { key: CellTab; label: string } = { key: 'monitor', label: 'MONITOR' };

const EASE         = Easing.bezier(0.34, 1.28, 0.42, 1);
const BAR_HEIGHT   = 68;
const CHIP_INSET   = 6; // margin of the sliding indicator chip within its cell
const CAPTURE_SIZE = 72; // diameter of the popped-up shutter button
const CAPTURE_OFFSET = 5; // BrutalBlock shadow offset, doubles as the press-travel distance

export function Dock({
  active,
  showCapture,
  showMonitor,
  onChange,
}: {
  active: DockTab;
  /** True once a VERIS Clip is paired — adds the popped-up "Click Photo" shutter button. A paired Hotshoe (or no device) keeps the navbar identical. */
  showCapture?: boolean;
  /** True once a VERIS Hotshoe is paired — adds a third "Monitor" cell to the bar itself (not a popped-up button, unlike capture). */
  showMonitor?: boolean;
  onChange: (tab: DockTab) => void;
}) {
  const insets      = useSafeAreaInsets();
  const TABS        = showMonitor ? [MONITOR_TAB, ...BASE_TABS] : BASE_TABS;
  const cellPct     = 100 / TABS.length;
  const index       = TABS.findIndex((t) => t.key === active);
  const progress    = useSharedValue(Math.max(0, index));
  const captureOn   = active === 'capture';
  const captureScale = useSharedValue(showCapture ? 1 : 0.7);
  // Press-into-shadow physics for the capture FAB — same shared hook every other
  // BrutalBlock control uses, offset matched to the block's own `offset` below.
  const { onPressIn: onCapturePressIn, onPressOut: onCapturePressOut, pressed: capturePressed } =
    useBrutalPress(CAPTURE_OFFSET);

  useEffect(() => {
    // Only animate the chip when a real tab is active — stay put while on
    // capture so it doesn't jump to "portal" every time the shutter opens.
    if (index >= 0) {
      progress.value = withTiming(index, { duration: 420, easing: EASE });
    }
  }, [index, progress]);

  useEffect(() => {
    if (showCapture) {
      captureScale.value = withSpring(1, { damping: 9, stiffness: 160 });
    }
  }, [showCapture, captureScale]);

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: `${progress.value * 100}%` }],
  }));

  // Combines useBrutalPress's press-into-shadow translate with the unrelated mount-in
  // "pop" spring — one merged style since BrutalBlock's `animatedStyle` takes a single value.
  const captureStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: capturePressed.value * CAPTURE_OFFSET },
      { translateY: capturePressed.value * CAPTURE_OFFSET },
      { scale: captureScale.value },
    ],
  }));

  return (
    <View
      style={[styles.container, { bottom: insets.bottom + 14 }]}
      pointerEvents="box-none">
      <GlassPanel
        variant="onDark"
        intensity={46}
        radius={Radius.lg}
        borderWidth={Border.thick}
        borderColor={Palette.ink}
        shadow={Palette.ink}
        shadowOffset={6}
        contentStyle={styles.bar}>
        {/* Sliding active-tab chip — the brutalist indicator inside the glass bar */}
        <Animated.View style={[styles.chipTrack, { width: `${cellPct}%` }, slideStyle]} pointerEvents="none">
          <View style={styles.chip} />
        </Animated.View>

        <View style={styles.row}>
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            return (
              <Pressable
                key={tab.key}
                onPress={() => onChange(tab.key)}
                style={styles.cell}
                hitSlop={6}>
                <DockIcon tab={tab.key} on={isActive} />
                <Text
                  style={mono(9, {
                    weight:  'semibold',
                    spacing: 0.14,
                    color:   isActive ? Palette.ink : 'rgba(237,231,218,0.42)',
                  })}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </GlassPanel>

      {showCapture && (
        <View style={styles.captureWrap} pointerEvents="box-none">
          <Pressable
            onPress={() => onChange('capture')}
            onPressIn={onCapturePressIn}
            onPressOut={onCapturePressOut}
            hitSlop={6}>
            <BrutalBlock
              backgroundColor={captureOn ? Palette.ink : Palette.orange}
              borderColor={Palette.ink}
              offset={CAPTURE_OFFSET}
              radius={Radius.pill}
              animatedStyle={captureStyle}
              contentStyle={styles.captureButton}>
              <CaptureIcon on={captureOn} />
            </BrutalBlock>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function DockIcon({ tab, on }: { tab: CellTab; on: boolean }) {
  const color = on ? Palette.ink : 'rgba(237,231,218,0.42)';
  const size  = 20;

  if (tab === 'portal') {
    return (
      <Svg viewBox="0 0 24 24" width={size} height={size} fill={color}>
        <Path d="M11.3 2.6a1 1 0 0 1 1.4 0l8 7.1a1 1 0 0 1 .3.75V20a1.4 1.4 0 0 1-1.4 1.4h-4.2V15a1.2 1.2 0 0 0-1.2-1.2h-4a1.2 1.2 0 0 0-1.2 1.2v6.4H4.4A1.4 1.4 0 0 1 3 20v-9.55a1 1 0 0 1 .33-.74Z" />
      </Svg>
    );
  }
  if (tab === 'monitor') {
    return (
      <Svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round">
        <Path d="M3 13h3.6l1.8-5.5L12 18l2.4-9 1.6 4h4.4" />
      </Svg>
    );
  }
  return (
    <Svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={2.4}
      strokeLinecap="round">
      <Circle cx={10.6} cy={10.6} r={6.6} />
      <Path d="M15.6 15.6 21 21" />
    </Svg>
  );
}

function CaptureIcon({ on }: { on: boolean }) {
  const color = on ? Palette.orange : Palette.ink;
  const size  = 28;

  return (
    <Svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round">
      <Path d="M4 8h3.2l1.4-2h6.8l1.4 2H20a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <Circle cx={12} cy={13.4} r={3.4} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left:     18,
    right:    18,
  },

  bar: {
    height: BAR_HEIGHT,
  },

  row: {
    flex:          1,
    flexDirection: 'row',
  },

  cell: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    gap:             4,
  },

  // Sliding track that carries the indicator chip across the bar — width set per-instance from cellPct.
  chipTrack: {
    position: 'absolute',
    left:     0,
    top:      0,
    bottom:   0,
    padding:  CHIP_INSET,
  },

  chip: {
    flex:            1,
    borderRadius:    Radius.sm,
    backgroundColor: Palette.orange,
    borderWidth:     Border.thin,
    borderColor:     Palette.ink,
  },

  // Popped-up shutter button — centered over the bar, half sunk into it,
  // half rising above it (Snapchat-style camera FAB).
  captureWrap: {
    position:   'absolute',
    left:       '50%',
    marginLeft: -CAPTURE_SIZE / 2,
    bottom:     BAR_HEIGHT - CAPTURE_SIZE / 2,
    width:      CAPTURE_SIZE,
    height:     CAPTURE_SIZE,
  },

  captureButton: {
    width:           CAPTURE_SIZE,
    height:          CAPTURE_SIZE,
    alignItems:      'center',
    justifyContent:  'center',
  },
});
