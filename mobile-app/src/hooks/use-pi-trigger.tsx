import NetInfo from '@react-native-community/netinfo';
import { File } from 'expo-file-system';
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

/**
 * The phone's own shot, from the moment it's taken until it's linked to the Pi's claim. It starts
 * as just a local file; the upload fills in the two mobile_* fields, and the Pi's UPLOADED status
 * fills in claim_url. Each step is retried on its own, so a bad connection only delays things.
 */
export type PendingCompanion = {
  local_uri: string;
  mobile_captured_at: string;
  mobile_image_url?: string;
  mobile_public_id?: string;
  claim_url?: string;
};

const SYNC_RETRY_MS = 30000;
const REQUEST_TIMEOUT_MS = 45000;

/** fetch that gives up instead of hanging forever on a half-dead connection. */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

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
  /** Called by the capture screen the moment the phone's own frame is taken. Uploading and linking are handled (and retried) from here. */
  registerCompanionPhoto: (localUri: string, capturedAt: string) => void;
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

  // The phone's frame waiting to be uploaded and linked to the Pi's claim. Persisted to disk (not
  // just this ref) so a bad connection, an app restart or a QUEUED_OFFLINE capture's later retry
  // never loses it, and lives here rather than on the capture screen so navigating away right
  // after the shutter press doesn't drop the pairing either.
  const pendingCompanionRef = useRef<PendingCompanion | null>(null);
  const syncingRef = useRef(false);
  const syncAgainRef = useRef(false);

  const appendLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-49), line]);
  }, []);

  const savePending = useCallback((pending: PendingCompanion | null) => {
    pendingCompanionRef.current = pending;
    storage.set(PENDING_COMPANION_KEY, pending ? JSON.stringify(pending) : null).catch(() => {});
  }, []);

  // Only clears the exact capture that was synced, so a newer shot taken mid-sync is left alone.
  const clearPendingCompanion = useCallback(
    (capturedAt?: string) => {
      const cur = pendingCompanionRef.current;
      if (cur && (!capturedAt || cur.mobile_captured_at === capturedAt)) savePending(null);
    },
    [savePending]
  );

  // One pass over whatever is left to do: upload the photo, then link it once the claim exists.
  // A failed step just returns and stays on disk — it's retried by the timer below, when the
  // network comes back, and when the Pi reports its claim.
  const syncCompanion = useCallback(async () => {
    if (syncingRef.current) {
      syncAgainRef.current = true;
      return;
    }
    syncingRef.current = true;
    try {
      do {
        syncAgainRef.current = false;
        let pending = pendingCompanionRef.current;
        if (!pending) return;

        if (!pending.mobile_image_url || !pending.mobile_public_id) {
          try {
            const form = new FormData();
            form.append('mobile_image', new File(pending.local_uri));
            const res = await fetchWithTimeout(`${CLAIM_SERVER_URL}/api/companion/upload`, { method: 'POST', body: form });
            const data = await res.json().catch(() => null);
            if (res.ok && data?.success && data.mobile_image_url && data.mobile_public_id) {
              pending = { ...pending, mobile_image_url: data.mobile_image_url, mobile_public_id: data.mobile_public_id };
              if (pendingCompanionRef.current?.mobile_captured_at === pending.mobile_captured_at) {
                // Keep a claim_url that arrived while the upload was in flight.
                pending = { ...pending, claim_url: pendingCompanionRef.current.claim_url };
                savePending(pending);
              }
              appendLog('Companion photo uploaded');
            } else if (res.status >= 400 && res.status < 500) {
              appendLog(`Companion upload rejected (${res.status}), dropping it`);
              clearPendingCompanion(pending.mobile_captured_at);
              continue;
            } else {
              appendLog(`Companion upload failed (${res.status}), will retry`);
              continue;
            }
          } catch (err) {
            appendLog(`Companion upload failed: ${(err as Error).message}, will retry`);
            continue;
          }
        }

        const claimId = pending.claim_url ? extractClaimId(pending.claim_url) : null;
        if (!claimId) continue; // no claim yet, the Pi's UPLOADED status will trigger another pass

        try {
          const res = await fetchWithTimeout(`${CLAIM_SERVER_URL}/api/claim/${claimId}/companion/link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mobile_image_url: pending.mobile_image_url,
              mobile_public_id: pending.mobile_public_id,
              mobile_captured_at: pending.mobile_captured_at,
            }),
          });
          const data = await res.json().catch(() => null);
          if (res.ok && data?.success) {
            appendLog('Companion photo linked');
            clearPendingCompanion(pending.mobile_captured_at);
          } else if (res.status >= 400 && res.status < 500) {
            appendLog(`Companion link rejected (${res.status}), dropping it`);
            clearPendingCompanion(pending.mobile_captured_at);
          } else {
            appendLog(`Companion link failed (${res.status}), will retry`);
          }
        } catch (err) {
          appendLog(`Companion link failed: ${(err as Error).message}, will retry`);
        }
      } while (syncAgainRef.current);
    } finally {
      syncingRef.current = false;
    }
  }, [appendLog, savePending, clearPendingCompanion]);

  const registerCompanionPhoto = useCallback(
    (localUri: string, capturedAt: string) => {
      savePending({ local_uri: localUri, mobile_captured_at: capturedAt });
      syncCompanion().catch(() => {});
    },
    [savePending, syncCompanion]
  );

  // Pick up a photo left over from a previous run, then keep nudging it along: on a timer (covers
  // "connected but painfully slow") and the moment the network comes back.
  useEffect(() => {
    storage.get(PENDING_COMPANION_KEY).then((raw) => {
      if (raw && !pendingCompanionRef.current) {
        try {
          pendingCompanionRef.current = JSON.parse(raw);
          syncCompanion().catch(() => {});
        } catch {
          storage.set(PENDING_COMPANION_KEY, null).catch(() => {});
        }
      }
    });
    const timer = setInterval(() => {
      if (pendingCompanionRef.current) syncCompanion().catch(() => {});
    }, SYNC_RETRY_MS);
    const unsubscribe = NetInfo.addEventListener((net) => {
      if (net.isConnected && net.isInternetReachable !== false && pendingCompanionRef.current) {
        syncCompanion().catch(() => {});
      }
    });
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [syncCompanion]);

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
            savePending({ ...pendingCompanionRef.current, claim_url: status.claimUrl });
            syncCompanion().catch(() => {});
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
    [appendLog, savePending, syncCompanion, clearPendingCompanion]
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
      registerCompanionPhoto,
    }),
    [connectionState, deviceName, stage, failedStage, claimUrl, log, shutterDisabled, connect, sendCapture, registerCompanionPhoto]
  );

  return <PiTriggerContext.Provider value={value}>{children}</PiTriggerContext.Provider>;
}

export function usePiTrigger() {
  const ctx = useContext(PiTriggerContext);
  if (!ctx) throw new Error('usePiTrigger must be used within a PiTriggerProvider');
  return ctx;
}
