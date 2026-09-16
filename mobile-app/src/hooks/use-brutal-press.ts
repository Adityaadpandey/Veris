import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/**
 * Shared "press into the surface" physics for brutalist controls: the front
 * layer translates toward its offset hard-shadow until it fully covers it,
 * reading as the block being pressed flush. Pair with BrutalBlock/GlassPanel's
 * `offset` so the translate distance matches the shadow distance exactly.
 */
export function useBrutalPress(offset = 5) {
  const pressed = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: pressed.value * offset },
      { translateY: pressed.value * offset },
    ],
  }));

  const onPressIn = () => {
    pressed.value = withTiming(1, { duration: 90 });
  };
  const onPressOut = () => {
    pressed.value = withTiming(0, { duration: 220 });
  };

  // `pressed` itself is exposed so a control that needs to fold press feedback into a
  // larger combined animated style (e.g. alongside an unrelated mount/appear animation)
  // can do so in one `useAnimatedStyle` without duplicating this hook's own logic.
  return { style, onPressIn, onPressOut, pressed };
}
