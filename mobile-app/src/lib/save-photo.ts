import { Platform } from 'react-native';

export type SaveResult = { ok: true } | { ok: false; reason: 'unsupported' | 'denied' | 'error' };

/**
 * Saves a local file:// uri to the device photo library.
 *
 * `expo-media-library`'s top-level class exports subclass a native binding
 * that doesn't exist on web, so it must never be statically imported — a
 * plain `import` crashes the web/SSR bundle even if the call is guarded at
 * runtime. Loading it with `require()` inside this native-only branch keeps
 * the module out of the web evaluation path entirely.
 */
export async function saveToPhotoLibrary(uri: string): Promise<SaveResult> {
  if (Platform.OS === 'web') return { ok: false, reason: 'unsupported' };

  // eslint-disable-next-line @typescript-eslint/no-require-imports -- must stay lazy, see comment above
  const MediaLibrary = require('expo-media-library') as typeof import('expo-media-library');
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') return { ok: false, reason: 'denied' };
    await MediaLibrary.saveToLibraryAsync(uri);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
