import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

const STORAGE_KEY = 'veris.hotshoe.digilocker';

// Same web-fallback shim used by use-connection.tsx — expo-secure-store has no web implementation.
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

export type DigilockerProfile = {
  name: string;
  docType: string;
};

type DigilockerState = {
  /** undefined while the persisted flag is still being read on launch. */
  verified: boolean | undefined;
  verifying: boolean;
  error: string | null;
  profile: DigilockerProfile | null;
  /** Resolves true on success, false on cancel/failure — screen decides what to do next. */
  startVerification: () => Promise<boolean>;
  reset: () => void;
};

const DigilockerContext = createContext<DigilockerState | null>(null);

/**
 * ---------------------------------------------------------------------------
 * BACKEND CONTRACT — implemented by server/ (see server/README.md).
 * ---------------------------------------------------------------------------
 * 1. POST {API_BASE_URL}/api/digilocker/session   body: { returnTo?: string }
 *      -> { authUrl: string, state: string }
 *    authUrl is DigiLocker's (via Setu) consent URL. `returnTo` (web only)
 *    is the page to bounce back to, since a browser tab can't be resumed
 *    via the app's custom URL scheme the way a native auth session can.
 *
 * 2. POST {API_BASE_URL}/api/digilocker/callback   body: { state: string }
 *      -> { verified: true, name: string, docType: string }
 *      -> { verified: false, reason: string }
 *    Backend exchanges the session id for the DigiLocker eKYC result
 *    server-side and only ever hands the app a boolean + display name.
 *    Aadhaar numbers / raw documents never reach the client.
 *
 * Set EXPO_PUBLIC_API_BASE_URL to point at a running instance of server/.
 * With it unset, verification falls back to a timed mock so the screen
 * stays demoable with zero setup.
 * ---------------------------------------------------------------------------
 */
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const REDIRECT_URI = Linking.createURL('digilocker-callback');

async function requestAuthSession(): Promise<{ id: string; success: boolean } | null> {
  if (!API_BASE_URL) {
    // --- Mock stand-in so the screen is demoable with no backend configured ---
    await new Promise((resolve) => setTimeout(resolve, 1400));
    return { id: 'mock-session', success: true };
  }

  const returnTo = Platform.OS === 'web' ? window.location.href.split('?')[0] : undefined;
  const session = (await fetch(`${API_BASE_URL}/api/digilocker/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnTo }),
  }).then((r) => r.json())) as { authUrl: string; state: string };

  if (Platform.OS === 'web') {
    // A plain browser tab can't be "resumed" — hand the whole page over to
    // DigiLocker; the server bounces it back to `returnTo` with the result
    // in the query string, picked up by consumePendingWebRedirect() below.
    window.location.href = session.authUrl;
    // Never resolves — the page navigates away before this matters.
    return new Promise(() => {});
  }

  const result = await WebBrowser.openAuthSessionAsync(session.authUrl, REDIRECT_URI);
  if (result.type !== 'success' || !result.url) return null;

  const { queryParams } = Linking.parse(result.url);
  const id = queryParams?.id as string | undefined;
  const success = queryParams?.success === 'true';
  if (!id) return null;

  return { id, success };
}

async function exchangeSession(id: string): Promise<DigilockerProfile> {
  if (!API_BASE_URL) {
    return { name: 'A. Sharma', docType: 'AADHAAR E-KYC' };
  }

  const result = (await fetch(`${API_BASE_URL}/api/digilocker/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: id }),
  }).then((r) => r.json())) as { verified: boolean; name?: string; docType?: string; reason?: string };

  if (!result.verified) throw new Error(result.reason ?? 'DigiLocker verification failed.');
  return { name: result.name ?? 'DigiLocker user', docType: result.docType ?? 'AADHAAR E-KYC' };
}

/**
 * Web only: after `requestAuthSession` hands the tab to DigiLocker, the
 * server redirects it back here with `?digilocker_id=&digilocker_success=`
 * in the URL instead of resolving a promise (the page fully reloaded, so
 * nothing in memory survived). Called once on provider mount.
 */
function consumePendingWebRedirect(): { id: string; success: boolean } | null {
  if (Platform.OS !== 'web' || !API_BASE_URL) return null;
  const params = new URLSearchParams(window.location.search);
  const id = params.get('digilocker_id');
  if (!id) return null;
  const success = params.get('digilocker_success') === 'true';

  params.delete('digilocker_id');
  params.delete('digilocker_success');
  const cleanQuery = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (cleanQuery ? `?${cleanQuery}` : ''));

  return { id, success };
}

export function DigilockerProvider({ children }: { children: ReactNode }) {
  const [verified, setVerified] = useState<boolean | undefined>(undefined);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<DigilockerProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    storage
      .get(STORAGE_KEY)
      .then((value) => {
        if (!cancelled) setVerified(value === '1');
      })
      .catch(() => {
        if (!cancelled) setVerified(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const finishVerification = useCallback(async (id: string): Promise<boolean> => {
    try {
      const result = await exchangeSession(id);
      setProfile(result);
      setVerified(true);
      await storage.set(STORAGE_KEY, '1');
      return true;
    } catch (err) {
      setError((err as Error).message ?? 'DigiLocker verification failed.');
      return false;
    }
  }, []);

  // Resume a web redirect that landed here after this provider had already
  // unmounted/remounted from the full page navigation. The state updates
  // below are pushed through a microtask so they run as an async callback
  // rather than synchronously in the effect body (avoids the cascading
  // synchronous-setState-in-effect footgun the pattern normally risks).
  useEffect(() => {
    const pending = consumePendingWebRedirect();
    if (!pending) return;

    void Promise.resolve().then(async () => {
      if (!pending.success) {
        setError('DigiLocker sign-in was cancelled.');
        return;
      }
      setVerifying(true);
      await finishVerification(pending.id);
      setVerifying(false);
    });
  }, [finishVerification]);

  const startVerification = useCallback(async (): Promise<boolean> => {
    setVerifying(true);
    setError(null);

    try {
      const session = await requestAuthSession();
      if (!session) throw new Error('DigiLocker sign-in was cancelled.');
      if (!session.success) throw new Error('DigiLocker sign-in was declined.');
      return await finishVerification(session.id);
    } catch (err) {
      setError((err as Error).message ?? 'DigiLocker verification failed.');
      setVerified(false);
      return false;
    } finally {
      setVerifying(false);
    }
  }, [finishVerification]);

  const reset = useCallback(() => {
    storage.remove(STORAGE_KEY).catch(() => {});
    setVerified(false);
    setProfile(null);
  }, []);

  const value = useMemo<DigilockerState>(
    () => ({ verified, verifying, error, profile, startVerification, reset }),
    [verified, verifying, error, profile, startVerification, reset]
  );

  return <DigilockerContext.Provider value={value}>{children}</DigilockerContext.Provider>;
}

export function useDigilocker() {
  const ctx = useContext(DigilockerContext);
  if (!ctx) throw new Error('useDigilocker must be used within a DigilockerProvider');
  return ctx;
}
