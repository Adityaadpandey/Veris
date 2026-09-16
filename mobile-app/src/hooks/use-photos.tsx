import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { type Photo } from '@/constants/photos';
import { Tones } from '@/constants/theme';
import { extractClaimId } from '@/lib/claim-id';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const SEALED_CLAIMS_KEY = 'veris.archive.sealed-claims';

// Same web-fallback shim used by use-device.tsx / use-connection.tsx — expo-secure-store has no web implementation.
const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return window.localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string) {
    if (Platform.OS === 'web') return window.localStorage.setItem(key, value);
    return SecureStore.setItemAsync(key, value);
  },
};

let captureCounter = 0;

/** A gallery-picked frame, waiting to be added to the archive as an explicitly unverified import. */
export type CapturedSource = { uri: string; aspect: number };

/** A real Pi-sealed capture this phone has completed — the archive resolves live status for these by claim id. */
export type SealedEntry = { claimId: string; addedAt: number; device: 'clip' | 'hotshoe' };

/** Builds an "imported from your phone's library" frame around a picked photo. Never claims a hardware signature — there's no Clip/Hotshoe in this path, so every provenance field is left honestly empty. */
function buildUnverifiedPhoto(source: CapturedSource): Photo {
  captureCounter += 1;
  const now = new Date();
  const date = `${String(now.getDate()).padStart(2, '0')} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const cap = `${now.toTimeString().slice(0, 8)} IST`;

  return {
    img: { uri: source.uri },
    aspect: source.aspect,
    tone: Tones[captureCounter % Tones.length],
    code: `FRM_${9000 + captureCounter}`,
    date,
    place: 'BENGALURU / 12.97N',
    status: 'UNVERIFIED',
    res: '4032 × 3024 · HEIC',
    device: 'clip',
    cam: 'Phone library import',
    lens: '—',
    iso: '—',
    sh: '—',
    ap: '—',
    gps: '12.9716, 77.5946',
    cap,
    tid: '—',
    cont: '—',
    tx: 'NOT SIGNED',
    ed: '—',
    roy: '—',
    lic: '—',
    caption: 'Imported from phone library — not hardware-signed',
    tags: 'unverified gallery import phone bengaluru india',
    companion: null,
  };
}

type PhotosState = {
  photos: Photo[];
  /** Adds a gallery-picked frame to the archive, explicitly marked unverified (no hardware signature exists for it). Returns the new photo. */
  addUnverifiedPhoto: (source: CapturedSource) => Photo;
  /** Real, hardware-sealed captures this phone has completed — the archive resolves each one's live status by claim id. */
  sealedClaims: SealedEntry[];
  /** Records a real Pi capture (once it has a claim URL) into the archive. Deduped by claim id. */
  addSealedClaim: (claimUrl: string, device: 'clip' | 'hotshoe') => void;
};

const PhotosContext = createContext<PhotosState | null>(null);

export function PhotosProvider({ children }: { children: ReactNode }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [sealedClaims, setSealedClaims] = useState<SealedEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    storage
      .get(SEALED_CLAIMS_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setSealedClaims(parsed);
        } catch {
          // Corrupt/old value — treat as no history rather than crashing the archive.
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const addUnverifiedPhoto = useCallback((source: CapturedSource) => {
    const newPhoto = buildUnverifiedPhoto(source);
    setPhotos((prev) => [newPhoto, ...prev]);
    return newPhoto;
  }, []);

  const addSealedClaim = useCallback((claimUrl: string, device: 'clip' | 'hotshoe') => {
    const claimId = extractClaimId(claimUrl);
    if (!claimId) return;
    setSealedClaims((prev) => {
      if (prev.some((entry) => entry.claimId === claimId)) return prev;
      const next = [{ claimId, addedAt: Date.now(), device }, ...prev];
      storage.set(SEALED_CLAIMS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<PhotosState>(
    () => ({ photos, addUnverifiedPhoto, sealedClaims, addSealedClaim }),
    [photos, addUnverifiedPhoto, sealedClaims, addSealedClaim]
  );

  return <PhotosContext.Provider value={value}>{children}</PhotosContext.Provider>;
}

export function usePhotos() {
  const ctx = useContext(PhotosContext);
  if (!ctx) throw new Error('usePhotos must be used within a PhotosProvider');
  return ctx;
}
