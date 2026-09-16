import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { PiConnection } from '@/bluetooth/pi-connection';
import { ensureBluetoothReady } from '@/bluetooth/permissions';

const DEVICE_KEY = 'veris.hotshoe.device';
const PAIRING_SEEN_KEY = 'veris.hotshoe.device.pairing-seen';

// Same web-fallback shim used by use-connection.tsx / use-digilocker.tsx — expo-secure-store has no web implementation.
const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return window.localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string) {
    if (Platform.OS === 'web') return window.localStorage.setItem(key, value);
    return SecureStore.setItemAsync(key, value);
  },
  async remove(key: string) {
    if (Platform.OS === 'web') return window.localStorage.removeItem(key);
    return SecureStore.deleteItemAsync(key);
  },
};

export type DeviceKind = 'hotshoe' | 'clip';

type DeviceState = {
  /** undefined while the persisted value is still being read on launch. */
  paired: DeviceKind | null | undefined;
  /** Has the user ever been through /pairing (paired or explicitly skipped)? undefined while loading. */
  pairingSeen: boolean | undefined;
  /** Which device is mid-handshake, if any. */
  pairing: DeviceKind | null;
  /** Resolves ok:true once persisted, or ok:false with a reason to show the user. */
  pair: (kind: DeviceKind) => Promise<{ ok: true } | { ok: false; reason: string }>;
  skip: () => Promise<void>;
  unpair: () => void;
  /** Drives the first-run PairingModal prompt rendered from the (app) layout. */
  promptVisible: boolean;
  openPrompt: () => void;
  closePrompt: () => void;
};

const DeviceContext = createContext<DeviceState | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [paired, setPaired] = useState<DeviceKind | null | undefined>(undefined);
  const [pairingSeen, setPairingSeen] = useState<boolean | undefined>(undefined);
  const [pairing, setPairing] = useState<DeviceKind | null>(null);
  const [promptVisible, setPromptVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    storage
      .get(DEVICE_KEY)
      .then((value) => {
        if (!cancelled) setPaired(value === 'hotshoe' || value === 'clip' ? value : null);
      })
      .catch(() => {
        if (!cancelled) setPaired(null);
      });
    storage
      .get(PAIRING_SEEN_KEY)
      .then((value) => {
        if (!cancelled) setPairingSeen(value === '1');
      })
      .catch(() => {
        if (!cancelled) setPairingSeen(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openPrompt = useCallback(() => setPromptVisible(true), []);

  const pair = useCallback(async (kind: DeviceKind) => {
    setPairing(kind);

    // Hotshoe and Clip are the same Pi unit over classic Bluetooth — only the
    // physical mount differs. Pairing itself happens once in Android's own
    // Bluetooth settings, not here — this just confirms that step's been done.
    const ready = await ensureBluetoothReady();
    if (!ready.ok) {
      setPairing(null);
      return { ok: false as const, reason: ready.reason };
    }
    let device;
    try {
      device = await new PiConnection().findPairedPi();
    } catch (err) {
      setPairing(null);
      return { ok: false as const, reason: `Bluetooth error: ${(err as Error).message}` };
    }
    if (!device) {
      setPairing(null);
      return {
        ok: false as const,
        reason: 'No VERIS unit found — pair it in Android Bluetooth settings first, then try again.',
      };
    }

    await storage.set(DEVICE_KEY, kind);
    await storage.set(PAIRING_SEEN_KEY, '1');
    setPaired(kind);
    setPairingSeen(true);
    setPairing(null);
    return { ok: true as const };
  }, []);

  const skip = useCallback(async () => {
    await storage.set(PAIRING_SEEN_KEY, '1');
    setPairingSeen(true);
  }, []);

  const unpair = useCallback(() => {
    storage.remove(DEVICE_KEY).catch(() => {});
    setPaired(null);
  }, []);

  const closePrompt = useCallback(() => setPromptVisible(false), []);

  const value = useMemo<DeviceState>(
    () => ({ paired, pairingSeen, pairing, pair, skip, unpair, promptVisible, openPrompt, closePrompt }),
    [paired, pairingSeen, pairing, pair, skip, unpair, promptVisible, openPrompt, closePrompt]
  );

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function useDevice() {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error('useDevice must be used within a DeviceProvider');
  return ctx;
}
