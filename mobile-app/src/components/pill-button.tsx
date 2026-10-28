import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { BrutalBlock } from '@/components/brutal-block';
import { Palette, Radius } from '@/constants/theme';
import { mono } from '@/constants/typography';
import { useBrutalPress } from '@/hooks/use-brutal-press';

type Props = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  backgroundColor: string;
  textColor: string;
  borderColor?: string;
  arrow?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

const OFFSET = 4;

/** The chunky offset-shadow CTA shared by onboarding, search, and claim — same radius/padding/shadow rhythm, caller supplies color. */
export function PillButton({
  label,
  onPress,
  disabled,
  backgroundColor,
  textColor,
  borderColor,
  arrow,
  fullWidth,
  style,
}: Props) {
  const { style: pressStyle, onPressIn, onPressOut } = useBrutalPress(OFFSET);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      style={[fullWidth && styles.fullWidth, style]}>
      <BrutalBlock
        backgroundColor={backgroundColor}
        borderColor={borderColor ?? Palette.ink}
        offset={OFFSET}
        radius={Radius.md}
        animatedStyle={pressStyle}
        contentStyle={[styles.base, disabled && styles.disabled]}>
        <Text style={mono(11, { weight: 'semibold', spacing: 0.16, color: textColor })}>{label}</Text>
        {arrow && <Text style={[styles.arrow, { color: textColor }]}>→</Text>}
      </BrutalBlock>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  disabled: { opacity: 0.55 },
  fullWidth: { alignSelf: 'stretch' },
  arrow: { fontSize: 14 },
});
