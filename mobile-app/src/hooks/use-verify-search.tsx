import { File, UploadType } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';

import { CLAIM_SERVER_URL } from '@/constants/config';

/** Shape of the `verdict` object from POST /api/search (see public-server/server.js). */
export type VerifyVerdict = {
  type: 'authentic_original' | 'altered_copy' | 'no_match';
  tier?: 'recompressed' | 'structural_edit' | 'possible_match' | 'possible_match_semantic';
  message: string;
  claim_id?: string;
  claim_url?: string;
  token_id?: string | number | null;
  confidence?: number;
  hash_coverage?: number;
  bit_distance?: number | null;
  visual_match?: number;
  original_cid?: string | null;
  hash_decode_failed?: boolean;
  hash_warning?: string;
  changes?: {
    summary?: string | null;
    items?: string[];
    change_type?: string | null;
  };
};

export type VerifyAiHint = {
  likely_ai_generated: boolean;
  note?: string | null;
};

export type VerifySimilarResult = {
  claim_id: string;
  claim_url?: string;
  token_id?: string | number | null;
  cid?: string | null;
  created_at?: string | null;
  description?: string | null;
  tags?: string[];
  similarity: number;
  visual_similarity?: number | null;
  content_similarity?: number;
};

type VerifyResult = {
  verdict: VerifyVerdict;
  aiHint: VerifyAiHint | null;
  queryDescription: string | null;
  similar: VerifySimilarResult[];
};

export type VerifyState =
  | { phase: 'idle' }
  | { phase: 'running'; previewUri: string; previewAspect: number }
  | ({ phase: 'done'; previewUri: string; previewAspect: number } & VerifyResult)
  | { phase: 'error'; previewUri: string; previewAspect: number; message: string };

const IDLE: VerifyState = { phase: 'idle' };

/** Drives the real reverse-image check against the hosted claim server — same endpoint owner-portal's SearchPage uses. */
export function useVerifySearch() {
  const [state, setState] = useState<VerifyState>(IDLE);

  const runVerify = useCallback(async (asset: ImagePicker.ImagePickerAsset) => {
    // Falls back to a square box when the picker doesn't report dimensions, so the preview
    // never has to guess-crop a photo it hasn't measured.
    const previewAspect = asset.width && asset.height ? asset.width / asset.height : 1;
    setState({ phase: 'running', previewUri: asset.uri, previewAspect });

    try {
      // expo-file-system's File does the multipart request natively (no hand-built FormData
      // part needed) and matches multer's `upload.single('image')` field name on the server.
      const file = new File(asset.uri);
      const result = await file.upload(`${CLAIM_SERVER_URL}/api/search`, {
        uploadType: UploadType.MULTIPART,
        fieldName: 'image',
        mimeType: asset.mimeType,
      });
      const data = JSON.parse(result.body);
      if (!data.success) throw new Error(data.error || 'Verification failed');

      setState({
        phase: 'done',
        previewUri: asset.uri,
        previewAspect,
        verdict: data.verdict,
        aiHint: data.ai_hint ?? null,
        queryDescription: data.query_description ?? null,
        similar: data.similar ?? data.results ?? [],
      });
    } catch (err) {
      setState({
        phase: 'error',
        previewUri: asset.uri,
        previewAspect,
        message: err instanceof Error ? err.message : 'Verification failed',
      });
    }
  }, []);

  const pickFromLibrary = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset) runVerify(asset);
  }, [runVerify]);

  const pickFromCamera = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset) runVerify(asset);
  }, [runVerify]);

  const reset = useCallback(() => setState(IDLE), []);

  return { state, pickFromLibrary, pickFromCamera, reset };
}
