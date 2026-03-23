# capture.py — LensMint device firmware capture pipeline
# main() is added in Task 6; helpers defined here first for TDD.
import hashlib
import os
import sys
import time

from cryptography.hazmat.primitives.asymmetric import ec, utils
from cryptography.hazmat.primitives import hashes, serialization

from config import DEVICE_ID, PRIVATE_KEY_PATH, PHOTO_DIR, GPS_ENABLED, RESOLUTION

import uploader


# ── GPS helpers ───────────────────────────────────────────────────────────────

def _gpsd_get_current():
    """Thin shim around gpsd.get_current() — isolated so tests can patch it."""
    import gpsd  # guarded: ImportError propagates to _get_gps
    gpsd.connect()
    return gpsd.get_current()


def _get_gps() -> dict:
    """Return GPS coord dict. Falls back to (0.0, 0.0) on any failure."""
    fallback = {"latitude": 0.0, "longitude": 0.0}
    if not GPS_ENABLED:
        return fallback
    try:
        packet = _gpsd_get_current()
        return {"latitude": packet.lat, "longitude": packet.lon}
    except Exception as exc:
        print(f"  [GPS] Warning: {exc} — using fallback coordinates", file=sys.stderr)
        return fallback


# ── Hash + sign helper ────────────────────────────────────────────────────────

def _hash_and_sign(image_bytes: bytes, private_key) -> tuple[str, str]:
    """Return (image_hash_hex, signature_der_hex).

    Single sha256 call: .digest() for signing, .hexdigest() for metadata.
    """
    h = hashlib.sha256(image_bytes)
    raw_digest = h.digest()   # 32 bytes — passed to key.sign(), never re-encoded
    image_hash = h.hexdigest()
    sig_der = private_key.sign(
        raw_digest,
        ec.ECDSA(utils.Prehashed(hashes.SHA256())),
    )
    return image_hash, sig_der.hex()


# ── Camera shim ───────────────────────────────────────────────────────────────

def _run_camera(image_path: str) -> None:
    """Capture a still to image_path using picamera2. Isolated for testability."""
    from picamera2 import Picamera2  # guarded: only available on Pi
    cam = Picamera2()
    cam.configure(cam.create_still_configuration(main={"size": RESOLUTION}))
    cam.start()
    try:
        time.sleep(2)  # allow auto-exposure to settle
        cam.capture_file(image_path)
    finally:
        cam.close()


# ── Main pipeline ─────────────────────────────────────────────────────────────

def main() -> None:
    # [1/8] Load private key
    print("[1/8] Loading private key...")
    if not os.path.exists(PRIVATE_KEY_PATH):
        print(f"  ERROR: Private key not found at {PRIVATE_KEY_PATH}")
        print("  Run keygen.py first to provision this device.")
        sys.exit(1)
    with open(PRIVATE_KEY_PATH, "rb") as f:
        private_key = serialization.load_pem_private_key(f.read(), password=None)
    print("  OK")

    # [2/8] Capture photo
    print("[2/8] Capturing photo...")
    os.makedirs(PHOTO_DIR, exist_ok=True)
    timestamp = int(time.time())
    image_path = os.path.join(PHOTO_DIR, f"{timestamp}.jpg")
    try:
        _run_camera(image_path)
    except Exception as exc:
        print(f"  ERROR: Camera capture failed: {exc}")
        sys.exit(1)
    print(f"  Saved to {image_path}")

    # [3/8] Hash image (single sha256 call via helper — both hash and sig derived together)
    print("[3/8] Computing SHA-256 hash...")
    with open(image_path, "rb") as f:
        image_bytes = f.read()
    if len(image_bytes) == 0:
        print("  ERROR: Captured image file is empty.")
        sys.exit(1)
    image_hash, signature = _hash_and_sign(image_bytes, private_key)
    print(f"  {image_hash}")

    # [4/8] Sign hash (already computed above by _hash_and_sign)
    print("[4/8] Signing hash with ECDSA...")
    print(f"  {signature[:32]}...")

    # [5/8] Get GPS
    print("[5/8] Getting GPS coordinates...")
    gps = _get_gps()
    print(f"  lat={gps['latitude']}, lon={gps['longitude']}")

    # [6/8] Build metadata
    print("[6/8] Building metadata...")
    metadata = {
        "device_id": DEVICE_ID,
        "image_hash": image_hash,
        "signature": signature,
        "timestamp": timestamp,
        "gps": gps,
    }
    print(f"  device_id={DEVICE_ID}, timestamp={timestamp}")

    # [7/8] Upload
    print("[7/8] Uploading to LensMint backend...")
    try:
        result = uploader.upload_photo(image_path, metadata)
    except RuntimeError as exc:
        print(f"  ERROR: Upload failed: {exc}")
        sys.exit(1)
    print("  Upload complete")

    # [8/8] Print result
    print("[8/8] Done!")
    print(f"\n  Token ID  : {result['token_id']}")
    print(f"  TX Hash   : {result['tx_hash']}")
    print(f"  Claim URL : {result['claim_url']}")


if __name__ == "__main__":
    main()
