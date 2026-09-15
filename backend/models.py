from pydantic import BaseModel
from typing import Optional


class GPSData(BaseModel):
    latitude: float
    longitude: float


class CaptureMetadata(BaseModel):
    device_id: str
    image_hash: str       # hex SHA-256 from Pi (with or without 0x prefix)
    signature: str        # device attestation signature
    timestamp: int        # Unix epoch from Pi
    gps: GPSData


class CaptureResponse(BaseModel):
    token_id: int
    tx_hash: str
    image_hash: str
    authenticity_score: int
    ipfs_cid: str
    claim_url: str
    qr_code_base64: str


class VerifyResponse(BaseModel):
    token_id: int
    image_hash: str
    authenticity_score: int
    timestamp: int
    device_id: str
    ipfs_cid: str
    is_verified: bool
    tx_hash: Optional[str] = None


class ClaimResponse(BaseModel):
    success: bool
    token_id: int
    claimer_address: str
    tx_hash: str
