import RNBluetoothClassic, { type BluetoothDevice } from 'react-native-bluetooth-classic';

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

/**
 * Talks to the hotshoe unit's Pi over classic Bluetooth RFCOMM (SPP), not BLE.
 * Only looks at already-bonded devices — pairing itself is a one-time Android
 * OS Settings step done outside this app (see docs/spec/bluetooth.md).
 */
export class PiConnection {
  private device: BluetoothDevice | null = null;
  private dataSubscription: { remove(): void } | null = null;
  private disconnectSubscription: { remove(): void } | null = null;

  async findPairedPi(): Promise<BluetoothDevice | null> {
    const bonded = await RNBluetoothClassic.getBondedDevices();
    const prefix = DEVICE_NAME_PREFIX.toLowerCase();
    return bonded.find((d) => d.name?.toLowerCase().startsWith(prefix)) ?? null;
  }

  async connect(
    device: BluetoothDevice,
    onStatus: (status: PiStatusLine) => void,
    onDisconnected: () => void
  ): Promise<void> {
    const connected = await device.connect({ delimiter: '\n' });
    if (!connected) {
      throw new Error('Failed to connect to hotshoe');
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
