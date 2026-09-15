import { z } from "zod";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

// --- Zod schemas ---

export const PhotoSchema = z.object({
  tokenId: z.string(),
  ipfsCid: z.string(),
  authenticityScore: z.number().min(0).max(100),
  timestamp: z.string(),
  deviceId: z.string(),
  imageHash: z.string().optional(),
});

export const PhotoArraySchema = z.array(PhotoSchema);

export const ClaimResponseSchema = z.object({
  success: z.boolean(),
  txHash: z.string().optional(),
  message: z.string().optional(),
  errorCode: z
    .enum(["already_claimed", "contract_not_deployed", "unknown"])
    .optional(),
});

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// --- Fetch helpers ---

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

export async function getPhotos() {
  return apiFetch("/photos", PhotoArraySchema);
}

export async function getPhoto(tokenId: string) {
  return apiFetch(`/photos/${tokenId}`, PhotoSchema);
}

export async function claimPhoto(tokenId: string, walletAddress: string) {
  return apiFetch("/claim", ClaimResponseSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokenId, walletAddress }),
  });
}
