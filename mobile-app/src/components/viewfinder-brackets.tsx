import { StyleSheet, View } from 'react-native';

type Props = {
  color?: string;
  inset?: number;
};

/** Four camera-viewfinder corner marks — the recurring "shutter" motif on full-bleed screens. */
export function ViewfinderBrackets({ color = 'rgba(231,88,28,.4)', inset = 16 }: Props) {
  return (
    <>
      <View
        pointerEvents="none"
        style={[styles.bracket, { top: inset, left: inset, borderTopWidth: 1.5, borderLeftWidth: 1.5, borderColor: color }]}
      />
      <View
        pointerEvents="none"
        style={[styles.bracket, { top: inset, right: inset, borderTopWidth: 1.5, borderRightWidth: 1.5, borderColor: color }]}
      />
      <View
        pointerEvents="none"
        style={[styles.bracket, { bottom: inset, left: inset, borderBottomWidth: 1.5, borderLeftWidth: 1.5, borderColor: color }]}
      />
      <View
        pointerEvents="none"
        style={[styles.bracket, { bottom: inset, right: inset, borderBottomWidth: 1.5, borderRightWidth: 1.5, borderColor: color }]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bracket: { position: 'absolute', width: 16, height: 16 },
});
