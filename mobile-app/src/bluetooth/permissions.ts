import { PermissionsAndroid, Platform } from 'react-native';
import RNBluetoothClassic from 'react-native-bluetooth-classic';

/**
 * Every native call into react-native-bluetooth-classic — even just listing
 * bonded devices — throws if the adapter is off or BLUETOOTH_CONNECT hasn't
 * been granted yet on Android 12+. Run this first, anywhere before touching
 * the adapter (getBondedDevices, connect, etc).
 */
export async function ensureBluetoothReady(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (Platform.OS !== 'android') {
    return { ok: false, reason: 'Bluetooth needs an Android phone.' };
  }

  const enabled = await RNBluetoothClassic.isBluetoothEnabled();
  if (!enabled) {
    const turnedOn = await RNBluetoothClassic.requestBluetoothEnabled();
    if (!turnedOn) return { ok: false, reason: 'Bluetooth is off.' };
  }

  if (Platform.Version >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    ]);
    const granted = Object.values(results).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
    if (!granted) return { ok: false, reason: 'Bluetooth permission denied.' };
  }

  return { ok: true };
}
