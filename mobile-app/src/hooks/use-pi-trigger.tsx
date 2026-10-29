import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { PiConnection, type PiStatusLine } from '@/bluetooth/pi-connection';
import { ensureBluetoothReady } from '@/bluetooth/permissions';
import { CLAIM_SERVER_URL } from '@/constants/config';
import { useDevice } from '@/hooks/use-device';
import { usePhotos } from '@/hooks/use-photos';
import { extractClaimId } from '@/lib/claim-id';

// Same web-fallback shim used by use-photos.tsx / use-device.tsx — expo-secure-store has no web implementation.
const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return window.localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string | null) {
    if (Platform.OS === 'web') {
      if (value == null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
      return;
    }
    if (value == null) return SecureStore.deleteItemAsync(key);
    return SecureStore.setItemAsync(key, value);
  },
};

const PENDING_COMPANION_KEY = 'veris.capture.pending-companion';

/** An already-uploaded companion photo (see companion-capture-card.tsx) waiting for its claim to exist. */
export type PendingCompanion = { mobile_image_url: string; mobile_public_id: string; mobile_captured_at: string };

export type TriggerConnectionState = 'disconnected' | 'connecting' | 'connected' | 'unsupported';
export type TriggerStage =
  | 'idle'
  | 'capturing'
  | 'captured'
  | 'signed'
  | 'tethering'
  | 'uploading'
  | 'queued'
  | 'failed';

type PiTriggerState = {
  connectionState: TriggerConnectionState;
  deviceName: string | null;
  stage: TriggerStage;
  failedStage: string | null;
  claimUrl: string | null;
  log: string[];
  shutterDisabled: boolean;
  connect: () => Promise<void>;
  sendCapture: () => Promise<void>;
  /** Called by the capture screen the moment its own upload to Cloudinary lands — see companion-capture-card.tsx / capture.tsx. */
  registerCompanionUpload: (pending: PendingCompanion) => void;
};

const PiTriggerContext = createContext<PiTriggerState | null>(null);

/**
 * Owns the hotshoe's Pi-over-classic-Bluetooth session for the whole app
 * lifetime (see docs/spec/bluetooth.md) — mounted once in the root layout,
 * not per-screen. It used to be a plain hook called separately by
 * capture.tsx, trigger.tsx, and profile.tsx, each opening its own
 * connection; navigating away from whichever screen started a capture
 * disconnected that screen's session mid-pipeline (CAPTURING through
 * UPLOADING can take several seconds), so the terminal UPLOADED status —
 * and the claim it carries — was silently lost and never reached the
 * archive. Living here instead, the connection and the pipeline state
 * survive navigation, and the sealed claim is recorded the instant it
 * arrives regardless of which screen is on-screen at that moment.
 *
 * Android only — classic RFCOMM isn't available to third-party iOS apps,
 * so on any other platform this just reports 'unsupported' and never
 * touches the native module.
 */
export function PiTriggerProvider({ children }: { children: ReactNode }) {
  const { paired } = useDevice();
  const { addSealedClaim } = usePhotos();

  const connectionRef = useRef(new PiConnection());
  const [connectionState, setConnectionState] = useState<TriggerConnectionState>(
    Platform.OS === 'android' ? 'disconnected' : 'unsupported'
  );
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [stage, setStage] = useState<TriggerStage>('idle');
  const [failedStage, setFailedStage] = useState<string | null>(null);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  // A companion photo already uploaded to Cloudinary (see /api/companion/upload), waiting for the
  // Pi's own claim to finish minting so it can be linked. Persisted to disk (not just this ref) so
  // it survives an app restart during a QUEUED_OFFLINE capture's later automatic retry, and lives
  // here rather than on the capture screen so navigating away right after the shutter press — same
  // failure mode addSealedClaim was moved here to fix — never drops the pairing.
  const pendingCompanionRef = useRef<PendingCompanion | null>(null);

  useEffect(() => {
    storage.get(PENDING_COMPANION_KEY).then((raw) => {
      if (raw) {
        try {
          pendingCompanionRef.current = JSON.parse(raw);
        } catch {
          storage.set(PENDING_COMPANION_KEY, null).catch(() => {});
        }
      }
    });
  }, []);

  const appendLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-49), line]);
  }, []);

  const registerCompanionUpload = useCallback((pending: PendingCompanion) => {
    pendingCompanionRef.current = pending;
    storage.set(PENDING_COMPANION_KEY, JSON.stringify(pending)).catch(() => {});
  }, []);

  const clearPendingCompanion = useCallback(() => {
    pendingCompanionRef.current = null;
    storage.set(PENDING_COMPANION_KEY, null).catch(() => {});
  }, []);

  // Cheap now that the image itself is already uploaded (this just forwards its Cloudinary URL) —
  // so it's safe to retry a few times against a flaky connection instead of dropping the pairing.
  const linkCompanionCapture = useCallback(
    async (claimUrlValue: string, pending: PendingCompanion) => {
      const claimId = extractClaimId(claimUrlValue);
      if (!claimId) return;
      const attempts = 3;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          const res = await fetch(`${CLAIM_SERVER_URL}/api/claim/${claimId}/companion/link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pending),
          });
          const data = await res.json().catch(() => null);
          if (res.ok && data?.success) {
            appendLog('Companion photo linked');
            return;
          }
          appendLog(`Companion link rejected (${res.status})`);
        } catch (err) {
          appendLog(`Companion link failed: ${(err as Error).message}`);
        }
        if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    },
    [appendLog]
  );

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
          // Not necessarily tied to a CAPTURE this session started — a
          // previously queued-offline photo can retry and land here
          // unprompted. Always update the claim panel regardless.
          setStage('idle');
          setClaimUrl(status.claimUrl);
          appendLog(`Uploaded: ${status.claimUrl}`);
          if (pendingCompanionRef.current) {
            const pending = pendingCompanionRef.current;
            clearPendingCompanion();
            linkCompanionCapture(status.claimUrl, pending).catch(() => {});
          }
          break;
        case 'QUEUED_OFFLINE':
          setStage('queued');
          appendLog('Offline - saved, will upload automatically');
          break;
        case 'FAILED':
          // The pipeline is dead for this capture — there will never be a claim to link the
          // already-uploaded companion photo to, so drop it rather than let it wrongly attach
          // itself to whatever the next successful capture happens to be.
          setStage('failed');
          setFailedStage(status.stage);
          appendLog(`Failed: ${status.stage}`);
          clearPendingCompanion();
          break;
        case 'RAW':
          appendLog(status.text);
          break;
      }
    },
    [appendLog, linkCompanionCapture, clearPendingCompanion]
  );

  const connect = useCallback(async () => {
    if (Platform.OS !== 'android') return;

    const ready = await ensureBluetoothReady();
    if (!ready.ok) {
      appendLog(ready.reason);
      setConnectionState('disconnected');
      return;
    }

    setConnectionState('connecting');
    try {
      const device = await connectionRef.current.findPairedPi();
      if (!device) {
        appendLog('No paired hotshoe found - pair it in Android Bluetooth settings first');
        setConnectionState('disconnected');
        return;
      }

      await connectionRef.current.connect(device, handleStatus, () => {
        setConnectionState('disconnected');
        appendLog('Disconnected');
      });
      setConnectionState('connected');
      setDeviceName(device.name);
      appendLog(`Connected to ${device.name}`);
    } catch (err) {
      appendLog(`Connection failed: ${(err as Error).message}`);
      setConnectionState('disconnected');
    }
  }, [appendLog, handleStatus]);

  useEffect(() => {
    const connection = connectionRef.current;
    void (async () => {
      await connect();
    })();
    return () => {
      connection.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendCapture = useCallback(async () => {
    setClaimUrl(null);
    setFailedStage(null);
    try {
      await connectionRef.current.sendCapture();
    } catch (err) {
      appendLog(`Send failed: ${(err as Error).message}`);
    }
  }, [appendLog]);

  // Records every real capture into the archive the moment it uploads — independent of whichever
  // screen is mounted right now. addSealedClaim dedupes by claim id, so a reconnect that replays
  // the same claimUrl is a harmless no-op.
  useEffect(() => {
    if (!claimUrl) return;
    addSealedClaim(claimUrl, paired === 'hotshoe' ? 'hotshoe' : 'clip');
  }, [claimUrl, paired, addSealedClaim]);

  const isBusy = stage !== 'idle' && stage !== 'failed' && stage !== 'queued';
  const shutterDisabled = connectionState !== 'connected' || isBusy;

  const value = useMemo<PiTriggerState>(
    () => ({
      connectionState,
      deviceName,
      stage,
      failedStage,
      claimUrl,
      log,
      shutterDisabled,
      connect,
      sendCapture,
      registerCompanionUpload,
    }),
    [connectionState, deviceName, stage, failedStage, claimUrl, log, shutterDisabled, connect, sendCapture, registerCompanionUpload]
  );

  return <PiTriggerContext.Provider value={value}>{children}</PiTriggerContext.Provider>;
}

export function usePiTrigger() {
  const ctx = useContext(PiTriggerContext);
  if (!ctx) throw new Error('usePiTrigger must be used within a PiTriggerProvider');
  return ctx;
}
