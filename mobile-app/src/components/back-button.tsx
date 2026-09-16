import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { GlassPanel } from '@/components/glass-panel';
import { Border, Palette, Radius } from '@/constants/theme';
import { useBrutalPress } from '@/hooks/use-brutal-press';

type Props = {
  onPress: () => void;
  /** 'dark' for screens on a dark background, 'light' for screens on cream. */
  variant?: 'dark' | 'light';
  style?: StyleProp<ViewStyle>;
};

const OFFSET = 3;

/** The frosted circular back control repeated across wallet, search, and claim. */
export function BackButton({ onPress, variant = 'dark', style }: Props) {
  const dark = variant === 'dark';
  const { style: pressStyle, onPressIn, onPressOut } = useBrutalPress(OFFSET);

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} hitSlop={10} style={[styles.press, style]}>
      <GlassPanel
        variant={dark ? 'onDark' : 'onLight'}
        intensity={dark ? 46 : 60}
        radius={Radius.pill}
        borderWidth={Border.thick}
        borderColor={dark ? 'rgba(237,231,218,.55)' : Palette.ink}
        shadow={dark ? 'rgba(0,0,0,.6)' : Palette.ink}
        shadowOffset={OFFSET}
        contentStyle={styles.size}
        animatedStyle={pressStyle}>
        <Text style={[styles.arrow, { color: dark ? Palette.bone : Palette.ink }]}>←</Text>
      </GlassPanel>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Explicit alignSelf so this never stretches to fill a column-flex parent's
  // width (e.g. sitting directly in a SafeAreaView, with no row wrapper) —
  // it must always size to its own 42px content regardless of context.
  press: { alignSelf: 'flex-start' },
  size: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  arrow: { fontSize: 17, fontWeight: '600' },
});
