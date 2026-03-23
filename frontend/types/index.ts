export interface Photo {
  tokenId: string;
  ipfsCid: string;
  authenticityScore: number; // 0–100
  timestamp: string;         // ISO 8601
  deviceId: string;
  imageHash?: string;        // bytes32 hex, present on verify detail
}

export interface ClaimRequest {
  tokenId: string;
  walletAddress: string;
}

export interface ClaimResponse {
  success: boolean;
  txHash?: string;
  message?: string;
  errorCode?: "already_claimed" | "contract_not_deployed" | "unknown";
}

export type ScoreTier = "authentic" | "uncertain" | "suspicious";
