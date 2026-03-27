import { z } from "zod";
import type { Photo, ClaimResponse } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

// Raw backend shapes — FastAPI returns snake_case
const RawPhotoSchema = z.object({
  token_id: z.number(),
  image_hash: z.string(),
  authenticity_score: z.number().min(0).max(100),
  timestamp: z.number(), // Unix epoch (uint64 from chain)
  device_id: z.string(),
  ipfs_cid: z.string(),
  is_verified: z.boolean(),
  tx_hash: z.string().nullable().optional(),
});

function rawToPhoto(raw: z.infer<typeof RawPhotoSchema>): Photo {
  return {
    tokenId: String(raw.token_id),
    ipfsCid: raw.ipfs_cid,
    authenticityScore: raw.authenticity_score,
    // Convert Unix seconds → ISO 8601 string for formatTimestamp() in utils
    timestamp: new Date(raw.timestamp * 1000).toISOString(),
    deviceId: raw.device_id,
    imageHash: raw.image_hash,
  };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new ApiError(res.status, text);
  }
  const json = await res.json();
  return schema.parse(json);
}

export async function getPhotos(): Promise<Photo[]> {
  const rawList = await apiFetch("/api/photos", z.array(RawPhotoSchema));
  return rawList.map(rawToPhoto);
}

export async function getPhoto(tokenId: string): Promise<Photo> {
  const raw = await apiFetch(`/api/photos/verify/${tokenId}`, RawPhotoSchema);
  return rawToPhoto(raw);
}

export async function claimPhoto(
  tokenId: string,
  walletAddress: string
): Promise<ClaimResponse> {
  const url = `${API_URL}/api/photos/claim/${tokenId}?claimer_address=${encodeURIComponent(walletAddress)}`;
  const res = await fetch(url, { method: "POST" });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    let errorCode: ClaimResponse["errorCode"] = "unknown";
    if (text.toLowerCase().includes("already")) errorCode = "already_claimed";
    return { success: false, message: text, errorCode };
  }

  const json = await res.json();
  return { success: true, txHash: json.tx_hash };
}
