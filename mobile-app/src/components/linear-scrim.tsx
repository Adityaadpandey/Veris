import { useId, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

type Props = {
  /** [offset 0..1, color, opacity][], top to bottom. */
  stops: [number, string, number][];
  style?: StyleProp<ViewStyle>;
};

/**
 * Absolutely-fills its container with a top-to-bottom linear gradient scrim.
 *
 * Sized from a measured `onLayout` pixel size rather than "100%" — on Android, percentage-sized
 * gradients render as a solid opaque fill instead of a gradient.
 */
export function LinearScrim({ stops, style }: Props) {
  const id = `scrim-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => setSize(e.nativeEvent.layout);

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }, style]} onLayout={onLayout}>
      {size.width > 0 && size.height > 0 && (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <LinearGradient id={id} x1="0%" y1="0%" x2="0%" y2="100%">
              {stops.map(([offset, color, opacity], i) => (
                <Stop key={i} offset={offset} stopColor={color} stopOpacity={opacity} />
              ))}
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.width} height={size.height} fill={`url(#${id})`} />
        </Svg>
      )}
    </View>
  );
}
