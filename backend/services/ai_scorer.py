import logging
import httpx
from config import get_settings

logger = logging.getLogger(__name__)

HIVE_URL = "https://api.thehive.ai/api/v2/task/sync"


async def score_image(image_bytes: bytes, filename: str = "image.jpg") -> tuple[int, bool]:
    """
    Call Hive AI deepfake detection and return (authenticity_score 0-100, is_fallback).

    authenticity_score = probability image is real × 100.
    is_fallback=True when the API is unavailable and heuristic scoring is used.
    """
    settings = get_settings()

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                HIVE_URL,
                headers={"Authorization": f"token {settings.hive_api_key}"},
                files={"media": (filename, image_bytes, "image/jpeg")},
            )
            response.raise_for_status()
            data = response.json()

        score = _parse_hive_response(data)
        return score, False

    except httpx.HTTPStatusError as exc:
        logger.warning("Hive AI returned HTTP %s, using fallback scoring", exc.response.status_code)
    except httpx.TimeoutException:
        logger.warning("Hive AI request timed out, using fallback scoring")
    except Exception as exc:
        logger.warning("Hive AI unavailable (%s), using fallback scoring", exc)

    return _heuristic_score(image_bytes), True


def _parse_hive_response(data: dict) -> int:
    """Extract authenticity score (0-100) from Hive API response."""
    try:
        classes: list[dict] = data["status"][0]["response"]["output"][0]["classes"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError(f"Unexpected Hive response structure: {exc}") from exc

    # Prefer "real" / "not_deepfake" class directly
    for cls in classes:
        if cls.get("class") in ("real", "not_deepfake"):
            return _clamp(int(cls["score"] * 100))

    # Fallback: 1 - deepfake probability
    for cls in classes:
        if cls.get("class") in ("deepfake", "ai_generated"):
            return _clamp(int((1.0 - cls["score"]) * 100))

    raise ValueError("No usable class found in Hive response")


def _heuristic_score(image_bytes: bytes) -> int:
    """
    Simple heuristic when Hive AI is unavailable.
    Uses file size as a rough proxy for image complexity.
    All scores are in a neutral-positive range to avoid false rejections.
    """
    size = len(image_bytes)
    if size > 3_000_000:
        return 80
    elif size > 1_000_000:
        return 75
    elif size > 300_000:
        return 70
    else:
        return 65


def _clamp(value: int) -> int:
    return max(0, min(100, value))
