import { Image } from 'expo-image';
import { useId, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { Photo } from '@/constants/photos';

type Props = {
  photo: Photo;
  /** Fixed pixel height — use for uniform grid/list tiles. Omit and pass `dynamic` instead to size by the photo's own aspect ratio. */
  height?: number;
  /** Size by `photo.aspect` instead of a fixed height — the tile grows/shrinks with the image's real proportions. */
  dynamic?: boolean;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/** Photo tile with the design's diagonal tone wash — a stand-in for the CSS `linear-gradient(158deg, …)` scrim laid under (in the original, over-via-multiply) each frame. */
export function PhotoThumb({ photo, height, dynamic, radius = 0, style }: Props) {
  const sizeStyle = dynamic ? { width: '100%' as const, aspectRatio: photo.aspect } : { height };
  return (
    <View style={[sizeStyle, { borderRadius: radius, overflow: 'hidden' }, style]}>
      <Image source={photo.img} style={StyleSheet.absoluteFill} contentFit="cover" />
      <ToneWash colors={photo.tone} />
    </View>
  );
}

/**
 * Sized from a measured `onLayout` pixel size rather than "100%", and given a per-instance id via
 * `useId()` rather than a shared literal — on Android, percentage-sized gradients (and gradients
 * sharing one `id` across several sibling `<Svg>` trees, as every grid tile did here) render as a
 * solid opaque fill instead of a gradient.
 */
function ToneWash({ colors }: { colors: readonly [string, string, string] }) {
  const id = `tone-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => setSize(e.nativeEvent.layout);

  return (
    <View
      style={[StyleSheet.absoluteFill, { opacity: 0.32, pointerEvents: 'none' }]}
      onLayout={onLayout}>
      {size.width > 0 && size.height > 0 && (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <LinearGradient id={id} x1="0%" y1="0%" x2="68%" y2="100%">
              <Stop offset="0%" stopColor={colors[1]} />
              <Stop offset="52%" stopColor={colors[0]} />
              <Stop offset="100%" stopColor={colors[2]} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.width} height={size.height} fill={`url(#${id})`} />
        </Svg>
      )}
    </View>
  );
}
