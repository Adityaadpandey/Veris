import base64
import io
import json
import logging

import qrcode
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from web3 import Web3

from config import get_settings
from models import CaptureMetadata, CaptureResponse, ClaimResponse, VerifyResponse
from services import ai_scorer, blockchain, hasher, ipfs_uploader

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/photos", tags=["photos"])


# ─── GET /api/photos ─────────────────────────────────────────────────────────


@router.get("", response_model=list[VerifyResponse])
async def list_photos():
    """Return all minted photos by scanning on-chain PhotoMinted events."""
    try:
        photos = await blockchain.get_all_photos()
    except Exception as exc:
        logger.error("list_photos failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Blockchain error: {exc}")
    return [VerifyResponse(**p) for p in photos]


# ─── POST /api/photos/capture ────────────────────────────────────────────────


@router.post("/capture", response_model=CaptureResponse)
async def capture_photo(
    file: UploadFile = File(..., description="Photo captured by the Raspberry Pi"),
    metadata: str = Form(..., description="JSON string with device_id, image_hash, signature, timestamp, gps"),
):
    # 1. Parse metadata
    try:
        meta = CaptureMetadata.model_validate(json.loads(metadata))
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid metadata JSON: {exc}")

    # 2. Read uploaded file
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    # 3. Verify SHA-256 hash
    if not hasher.verify_sha256(image_bytes, meta.image_hash):
        raise HTTPException(
            status_code=400,
            detail="image_hash does not match SHA-256 of the uploaded file",
        )

    # 4. Validate hash length before bytes32 conversion
    try:
        image_hash_bytes = hasher.hex_to_bytes32(meta.image_hash)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # 5. AI deepfake scoring
    filename = file.filename or "photo.jpg"
    authenticity_score, is_fallback = await ai_scorer.score_image(image_bytes, filename)
    if is_fallback:
        logger.warning("Using fallback authenticity score for device %s", meta.device_id)

    # 6. Upload to Pinata IPFS
    try:
        ipfs_cid = await ipfs_uploader.upload_to_ipfs(
            image_bytes,
            filename,
            {
                "device_id": meta.device_id,
                "timestamp": meta.timestamp,
                "gps_lat": meta.gps.latitude,
                "gps_lon": meta.gps.longitude,
            },
        )
    except Exception as exc:
        logger.error("IPFS upload failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"IPFS upload failed: {exc}")

    # 7. Mint NFT on Base L2
    try:
        token_id, tx_hash = await blockchain.mint_proof(
            image_hash_bytes,
            authenticity_score,
            ipfs_cid,
            meta.device_id,
        )
    except Exception as exc:
        logger.error("Blockchain mint failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Blockchain mint failed: {exc}")

    # 8. Build claim URL and QR code
    settings = get_settings()
    claim_url = f"{settings.frontend_url}/claim/{token_id}"
    qr_code_base64 = _generate_qr_base64(claim_url)

    return CaptureResponse(
        token_id=token_id,
        tx_hash=tx_hash,
        image_hash="0x" + meta.image_hash.lower().removeprefix("0x"),
        authenticity_score=authenticity_score,
        ipfs_cid=ipfs_cid,
        claim_url=claim_url,
        qr_code_base64=qr_code_base64,
    )


# ─── GET /api/photos/verify/{token_id} ───────────────────────────────────────


@router.get("/verify/{token_id}", response_model=VerifyResponse)
async def verify_photo(token_id: int):
    try:
        data = await blockchain.get_photo_data(token_id)
    except LookupError:
        raise HTTPException(status_code=404, detail=f"Token {token_id} not found")
    except Exception as exc:
        logger.error("get_photo_data failed for token %d: %s", token_id, exc)
        raise HTTPException(status_code=502, detail=f"Blockchain error: {exc}")

    return VerifyResponse(**data)


# ─── POST /api/photos/claim/{token_id} ───────────────────────────────────────


@router.post("/claim/{token_id}", response_model=ClaimResponse)
async def claim_photo(
    token_id: int,
    claimer_address: str = Query(..., description="Ethereum wallet address of the claimer"),
):
    # Validate Ethereum address
    try:
        claimer_address = Web3.to_checksum_address(claimer_address)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Ethereum address")

    try:
        tx_hash = await blockchain.claim_photo(token_id, claimer_address)
    except LookupError:
        raise HTTPException(status_code=404, detail=f"Token {token_id} not found")
    except Exception as exc:
        if "TokenDoesNotExist" in str(exc):
            raise HTTPException(status_code=404, detail=f"Token {token_id} not found")
        logger.error("claim_photo failed for token %d: %s", token_id, exc)
        raise HTTPException(status_code=502, detail=f"Blockchain error: {exc}")

    return ClaimResponse(
        success=True,
        token_id=token_id,
        claimer_address=claimer_address,
        tx_hash=tx_hash,
    )


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _generate_qr_base64(url: str) -> str:
    """Generate a QR code PNG for the given URL and return it as a base64 string."""
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()
