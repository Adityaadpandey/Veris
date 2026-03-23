import json
import logging
import httpx
from config import get_settings

logger = logging.getLogger(__name__)

PINATA_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS"


async def upload_to_ipfs(image_bytes: bytes, filename: str, metadata: dict) -> str:
    """
    Upload image bytes to Pinata IPFS.
    Returns the IPFS CID string.
    Raises httpx.HTTPStatusError on API failure.
    """
    settings = get_settings()

    pinata_metadata = {
        "name": filename,
        "keyvalues": {k: str(v) for k, v in metadata.items()},
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            PINATA_URL,
            headers={
                "pinata_api_key": settings.pinata_api_key,
                "pinata_secret_api_key": settings.pinata_secret_api_key,
            },
            files={"file": (filename, image_bytes, "image/jpeg")},
            data={"pinataMetadata": json.dumps(pinata_metadata)},
        )
        response.raise_for_status()

    cid: str = response.json()["IpfsHash"]
    logger.info("Uploaded %s to IPFS: %s", filename, cid)
    return cid
