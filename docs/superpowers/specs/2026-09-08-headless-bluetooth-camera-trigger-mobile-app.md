# Headless Bluetooth Shutter Trigger — React Native App Requirements

**Date:** 2026-09-08
**Scope:** A separate React Native (Android) app, not in this repo. This doc is the handoff spec for that app.
**Companion doc:** `docs/superpowers/specs/2026-09-08-headless-bluetooth-camera-trigger-design.md` (Pi-side design — read that first for the overall architecture and status vocabulary).

---

## Purpose

Headless Pi camera units have no screen. This app is the only UI for triggering a capture and watching it progress through sign → tether → upload → claim. It talks to the Pi over classic Bluetooth RFCOMM (SPP), not BLE.

## Non-goals (v1)

- No live camera preview (the Pi's existing `stream_server.py` MJPEG stream is a separate, later integration).
- No gallery, mode switches, or settings beyond what's needed to trigger and watch a capture.
- No in-app pairing flow — pairing the phone with the Pi, and turning on Bluetooth tethering, are one-time manual Android OS steps (see "One-time setup" below).
- iOS is out of scope — classic Bluetooth RFCOMM isn't available to third-party iOS apps.

## One-time setup (manual, per phone+Pi pair)

Do this once, outside the app, before it will find anything to connect to:

1. On the phone: Settings → Bluetooth → pair with the Pi's advertised name (`Veris-Cam-<device-id>`).
2. On the phone: Settings → Network → Hotspot & tethering → turn on **Bluetooth tethering**. It only needs to be on at capture time — the Pi brings up the PAN link when it has something to upload.
3. Give the app Bluetooth permissions when Android prompts for them (see Permissions below).

## Dependencies

- `react-native-bluetooth-classic` — the only Bluetooth library needed; it wraps Android's classic Bluetooth (RFCOMM/SPP) APIs. iOS support in this library targets MFi `ExternalAccessory`, which doesn't apply here — this app is Android-only.

```bash
npm install react-native-bluetooth-classic
npx pod-install  # no-op for this Android-only app, but harmless if the RN project is universal
```

### Android permissions

Add to `android/app/src/main/AndroidManifest.xml`. Android 12+ (API 31+) uses the new runtime-requestable Bluetooth permissions; older versions need location permission because classic BT scanning is treated as a location signal:

```xml
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />
```

`BLUETOOTH_CONNECT` must be requested at runtime (Android 12+) before calling `getBondedDevices()` or `device.connect()` — request it on app launch or on first "Connect" tap, not buried in a settings screen the user may never open.

## Connection protocol

- Fixed SPP UUID: `00001101-0000-1000-8000-00805F9B34FB` (the library's classic-RFCOMM `connect()` uses this by default — no manual UUID wiring needed).
- Fixed, discoverable device name: `Veris-Cam-<device-id>`. The app finds the Pi by filtering the phone's *already-paired* devices by name — it does not run a fresh discovery scan each time, since the phone was paired with the Pi in the one-time setup step.
- Line protocol, `\n`-delimited in both directions:
  - App → Pi: `CAPTURE\n` (v1 has exactly one command).
  - Pi → App: status lines, vocabulary below.
- `react-native-bluetooth-classic`'s default connection options already use `DELIMITER: "\n"` and `CONNECTION_TYPE: "delimited"`, so `onDataReceived` naturally hands you one status line at a time — no manual buffering needed on the RN side (unlike the Pi's own server, which does its own line-buffering on raw socket bytes).

## Status vocabulary (from the design doc — implement exactly these)

| Status line | Meaning | UI treatment |
|---|---|---|
| `CAPTURING` | Photo capture started | Spinner, "Capturing..." |
| `CAPTURED` | Photo taken | "Captured" |
| `SIGNED` | Hardware signature applied | "Signed" |
| `TETHERING` | Bringing up Bluetooth PAN link | "Connecting to network..." |
| `UPLOADING` | Upload to Filecoin/backend in progress | "Uploading..." |
| `UPLOADED:<claimUrl>` | Upload + claim created | Show claim URL / QR, terminal success state |
| `QUEUED:offline` | No network within timeout; queued on the Pi for later auto-retry | "Saved — will upload automatically" (not an error) |
| `FAILED:capture` / `FAILED:signing` / `FAILED:upload` | Hard failure at that stage | Error state with the failed stage named |

Any other free-form line (the shared pipeline also forwards human-readable progress text, e.g. `Uploading to Filecoin...`) should just be appended to a scrolling status log rather than driving UI state — only the fixed tokens above should trigger state transitions.

Note that `QUEUED:offline` and a later successful retry are **not correlated back to this capture** in v1 — the Pi retries in the background and, if the phone happens to be connected when the retry succeeds, it will receive a *new*, unprompted `UPLOADED:<claimUrl>` line with no preceding `CAPTURE` from this session. The app's status parser must handle an `UPLOADED:` line arriving without having just sent `CAPTURE` (e.g. by always updating a "last claim" panel rather than assuming it's tied to the button press in progress).

## Screens

A single screen is sufficient for v1:

- **Connection indicator** (top): connected / connecting / disconnected, with the paired device name once known.
- **Shutter button**: disabled while disconnected or while a capture is already in progress; tapping sends `CAPTURE`.
- **Live status area**: current stage (from the fixed vocabulary) plus a scrolling log of raw lines received, for debugging in the field.
- **Claim panel**: appears on `UPLOADED:<claimUrl>` — show the URL and a QR code (any RN QR component, e.g. `react-native-qrcode-svg`) since there's no way to see the Pi's own screen.

## Sample code

The following is illustrative, matching `react-native-bluetooth-classic`'s documented API. Verify method names/options against the version pinned in `package.json` before shipping — the library's TypeScript types are the source of truth.

### `src/bluetooth/piConnection.ts`

```typescript
import RNBluetoothClassic, {
  BluetoothDevice,
} from 'react-native-bluetooth-classic';

const DEVICE_NAME_PREFIX = 'Veris-Cam-';

export type PiStatusLine =
  | { kind: 'CAPTURING' }
  | { kind: 'CAPTURED' }
  | { kind: 'SIGNED' }
  | { kind: 'TETHERING' }
  | { kind: 'UPLOADING' }
  | { kind: 'UPLOADED'; claimUrl: string }
  | { kind: 'QUEUED_OFFLINE' }
  | { kind: 'FAILED'; stage: string }
  | { kind: 'RAW'; text: string };

export function parseStatusLine(line: string): PiStatusLine {
  const trimmed = line.trim();

  if (trimmed === 'CAPTURING') return { kind: 'CAPTURING' };
  if (trimmed === 'CAPTURED') return { kind: 'CAPTURED' };
  if (trimmed === 'SIGNED') return { kind: 'SIGNED' };
  if (trimmed === 'TETHERING') return { kind: 'TETHERING' };
  if (trimmed === 'UPLOADING') return { kind: 'UPLOADING' };
  if (trimmed === 'QUEUED:offline') return { kind: 'QUEUED_OFFLINE' };

  if (trimmed.startsWith('UPLOADED:')) {
    return { kind: 'UPLOADED', claimUrl: trimmed.slice('UPLOADED:'.length) };
  }
  if (trimmed.startsWith('FAILED:')) {
    return { kind: 'FAILED', stage: trimmed.slice('FAILED:'.length) };
  }

  return { kind: 'RAW', text: trimmed };
}

export class PiConnection {
  private device: BluetoothDevice | null = null;
  private dataSubscription: { remove(): void } | null = null;
  private disconnectSubscription: { remove(): void } | null = null;

  async findPairedPi(): Promise<BluetoothDevice | null> {
    const bonded = await RNBluetoothClassic.getBondedDevices();
    return bonded.find((d) => d.name?.startsWith(DEVICE_NAME_PREFIX)) ?? null;
  }

  async connect(
    device: BluetoothDevice,
    onStatus: (status: PiStatusLine) => void,
    onDisconnected: () => void,
  ): Promise<void> {
    const connected = await device.connect({
      DELIMITER: '\n',
    });
    if (!connected) {
      throw new Error('Failed to connect to Pi');
    }

    this.device = device;

    this.dataSubscription = device.onDataReceived((event) => {
      onStatus(parseStatusLine(event.data));
    });

    this.disconnectSubscription = RNBluetoothClassic.onDeviceDisconnected(() => {
      this.cleanup();
      onDisconnected();
    });
  }

  async sendCapture(): Promise<void> {
    if (!this.device) {
      throw new Error('Not connected');
    }
    await this.device.write('CAPTURE\n');
  }

  async disconnect(): Promise<void> {
    await this.device?.disconnect();
    this.cleanup();
  }

  private cleanup(): void {
    this.dataSubscription?.remove();
    this.disconnectSubscription?.remove();
    this.dataSubscription = null;
    this.disconnectSubscription = null;
    this.device = null;
  }
}
```

### `src/screens/TriggerScreen.tsx`

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { PiConnection, PiStatusLine } from '../bluetooth/piConnection';

type ConnectionState = 'disconnected' | 'connecting' | 'connected';
type CaptureStage =
  | 'idle'
  | 'capturing'
  | 'captured'
  | 'signed'
  | 'tethering'
  | 'uploading'
  | 'queued'
  | 'failed';

async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android' || Platform.Version < 31) return true;

  const results = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
  ]);

  return Object.values(results).every(
    (r) => r === PermissionsAndroid.RESULTS.GRANTED,
  );
}

export function TriggerScreen() {
  const connectionRef = useRef(new PiConnection());
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('disconnected');
  const [stage, setStage] = useState<CaptureStage>('idle');
  const [failedStage, setFailedStage] = useState<string | null>(null);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const appendLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-49), line]);
  }, []);

  const handleStatus = useCallback(
    (status: PiStatusLine) => {
      switch (status.kind) {
        case 'CAPTURING':
          setStage('capturing');
          appendLog('Capturing...');
          break;
        case 'CAPTURED':
          setStage('captured');
          appendLog('Captured');
          break;
        case 'SIGNED':
          setStage('signed');
          appendLog('Signed');
          break;
        case 'TETHERING':
          setStage('tethering');
          appendLog('Connecting to network...');
          break;
        case 'UPLOADING':
          setStage('uploading');
          appendLog('Uploading...');
          break;
        case 'UPLOADED':
          setStage('idle');
          setClaimUrl(status.claimUrl);
          appendLog(`Uploaded: ${status.claimUrl}`);
          break;
        case 'QUEUED_OFFLINE':
          setStage('queued');
          appendLog('Offline - saved, will upload automatically');
          break;
        case 'FAILED':
          setStage('failed');
          setFailedStage(status.stage);
          appendLog(`Failed: ${status.stage}`);
          break;
        case 'RAW':
          appendLog(status.text);
          break;
      }
    },
    [appendLog],
  );

  const connect = useCallback(async () => {
    const granted = await requestBluetoothPermissions();
    if (!granted) {
      appendLog('Bluetooth permission denied');
      return;
    }

    setConnectionState('connecting');
    try {
      const device = await connectionRef.current.findPairedPi();
      if (!device) {
        appendLog('No paired Veris-Cam device found - pair it in Android Bluetooth settings first');
        setConnectionState('disconnected');
        return;
      }

      await connectionRef.current.connect(
        device,
        handleStatus,
        () => {
          setConnectionState('disconnected');
          appendLog('Disconnected');
        },
      );
      setConnectionState('connected');
      appendLog(`Connected to ${device.name}`);
    } catch (err) {
      appendLog(`Connection failed: ${(err as Error).message}`);
      setConnectionState('disconnected');
    }
  }, [appendLog, handleStatus]);

  useEffect(() => {
    connect();
    return () => {
      connectionRef.current.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleShutterPress = useCallback(async () => {
    setClaimUrl(null);
    setFailedStage(null);
    try {
      await connectionRef.current.sendCapture();
    } catch (err) {
      appendLog(`Send failed: ${(err as Error).message}`);
    }
  }, [appendLog]);

  const isBusy = stage !== 'idle' && stage !== 'failed' && stage !== 'queued';
  const shutterDisabled = connectionState !== 'connected' || isBusy;

  return (
    <View style={styles.container}>
      <Text style={styles.connectionLabel}>
        {connectionState === 'connected' && 'Connected'}
        {connectionState === 'connecting' && 'Connecting...'}
        {connectionState === 'disconnected' && 'Not connected'}
      </Text>

      <Pressable
        style={[styles.shutter, shutterDisabled && styles.shutterDisabled]}
        disabled={shutterDisabled}
        onPress={handleShutterPress}
      >
        <Text style={styles.shutterText}>Capture</Text>
      </Pressable>

      <Text style={styles.stage}>{stage}</Text>
      {failedStage && <Text style={styles.error}>Failed: {failedStage}</Text>}
      {claimUrl && <Text style={styles.claimUrl}>{claimUrl}</Text>}

      {connectionState === 'disconnected' && (
        <Pressable style={styles.retryButton} onPress={connect}>
          <Text>Retry connection</Text>
        </Pressable>
      )}

      <ScrollView style={styles.log}>
        {log.map((line, i) => (
          <Text key={i} style={styles.logLine}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  connectionLabel: { fontSize: 14, marginBottom: 12 },
  shutter: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: { backgroundColor: '#9ca3af' },
  shutterText: { color: 'white', fontWeight: '600' },
  stage: { textAlign: 'center', marginTop: 12, fontSize: 16 },
  error: { textAlign: 'center', color: '#dc2626', marginTop: 8 },
  claimUrl: { textAlign: 'center', color: '#16a34a', marginTop: 8 },
  retryButton: { alignSelf: 'center', marginTop: 12, padding: 8 },
  log: { flex: 1, marginTop: 16 },
  logLine: { fontSize: 12, color: '#6b7280' },
});
```

## Reconnection behavior

- The Pi's RFCOMM server always goes back to listening after a disconnect (see the design doc), so the app just needs to retry `connect()` — no coordination needed on the Pi side.
- `RNBluetoothClassic.onDeviceDisconnected` drives `connectionState` back to `disconnected` immediately; the sample above exposes a manual "Retry connection" button rather than auto-retrying in a loop, since a phone walking out of range and back in is a user-visible event worth a deliberate tap. An auto-retry-with-backoff can be added later if manual retry proves annoying in the field.
- `findPairedPi()` only looks at already-bonded devices — if pairing is somehow lost (e.g. Pi's Bluetooth stack was reset), the fix is redoing the one-time OS-level pairing step, not something this app can self-heal.

## Error handling

| Condition | App behavior |
|---|---|
| Bluetooth off | `RNBluetoothClassic.isBluetoothEnabled()` before connecting; if false, prompt the user to enable it (`requestBluetoothEnabled()`) rather than failing silently. |
| Permission denied | Show a persistent banner explaining Bluetooth permission is required, with a button to open app settings. |
| No paired Veris-Cam device found | Explicit message telling the user to pair via Android Bluetooth settings first (this app doesn't do pairing). |
| Connected, then dropped mid-capture | `onDeviceDisconnected` fires; any in-flight stage is abandoned in the UI (no status update will ever arrive) — surface this distinctly from a clean `FAILED:*` so the user knows to reconnect and possibly recapture, rather than assuming the photo failed cleanly. |
| `QUEUED:offline` | Not an error state — communicate that the photo is safe and will upload automatically, matching the Pi's own retry behavior. |

## Testing

Matches the design doc's testing section on the Pi side:

1. Before this app exists / during its early development: use a generic Android "Bluetooth terminal" app to send `CAPTURE` to the paired Pi and confirm the status sequence.
2. Once this app is buildable: normal trigger end-to-end, trigger with phone tethering off (confirm `QUEUED:offline` and that a *later* connection receives an unprompted `UPLOADED:<url>` once the Pi's background retry succeeds), and reconnect-after-drop (kill/reopen the app or walk out of Bluetooth range and back).
3. No screen on the Pi — all verification during development is either through this app or by SSHing into the Pi and tailing `headless-camera.service` logs (`journalctl -u headless-camera.service -f`).
