# uploader.py — HTTP upload helper for LensMint device firmware
import json
import os

import requests

from config import API_BASE_URL


def upload_photo(image_path: str, metadata: dict) -> dict:
    """POST image + metadata to backend. Returns parsed response dict.

    Raises RuntimeError on connection error, timeout, or non-2xx status.
    metadata must contain exactly: device_id, image_hash, signature, timestamp, gps.
    """
    url = f"{API_BASE_URL}/api/photos/capture"
    try:
        with open(image_path, "rb") as f:
            response = requests.post(
                url,
                files={"file": (os.path.basename(image_path), f, "image/jpeg")},
                data={"metadata": json.dumps(metadata)},
                timeout=30,
            )
    except requests.Timeout as exc:
        raise RuntimeError(f"Upload timed out: {exc}") from exc
    except requests.ConnectionError as exc:
        raise RuntimeError(f"Connection error reaching {url}: {exc}") from exc

    if not response.ok:
        raise RuntimeError(
            f"Backend returned {response.status_code}: {response.text}"
        )

    return response.json()
