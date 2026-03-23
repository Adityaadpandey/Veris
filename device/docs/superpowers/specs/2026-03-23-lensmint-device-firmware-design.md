# LensMint Device Firmware Design
**Date:** 2026-03-23
**Status:** Reviewed

## Overview

Python 3.11 firmware for a Raspberry Pi 5 camera that captures photos, cryptographically signs them, and posts them to the LensMint backend for NFT minting on Base L2.

## File Structure

```
device/
├── config.py      # Constants only — no logic
├── keygen.py      # One-shot key generation
├── capture.py     # Main 8-step pipeline
└── uploader.py    # HTTP multipart upload helper
```

## Module Responsibilities

### config.py
Pure constants. No classes, no functions.
- `API_BASE_URL` — backend endpoint root
- `DEVICE_ID` — unique string identifier for this Pi
- `PRIVATE_KEY_PATH` / `PUBLIC_KEY_PATH` — PEM file paths
- `PHOTO_DIR` — directory to save captured photos locally (for debug)
- `GPS_ENABLED` — bool flag
- `RESOLUTION` — tuple `(2592, 1944)` — passed to picamera2 at capture time

### keygen.py
Run once during device provisioning.
- If key files already exist at `PRIVATE_KEY_PATH` / `PUBLIC_KEY_PATH`, print a warning and exit without overwriting (overwriting would invalidate the on-chain registered public key)
- Otherwise: generate ECDSA secp256k1 keypair using `cryptography` library (`cryptography >= 2.6` required)
- Save private key as PEM (mode `0o600`)
- Save public key as PEM
- Print uncompressed public key as hex for on-chain contract registration
- `PUBLIC_KEY_PATH` is written for provisioning/registration purposes only — it is not read by firmware at runtime

### capture.py
Linear `main()` function. Each step prints `[N/8] Description...` before executing.
`PHOTO_DIR` is created at startup if it does not exist (`os.makedirs(PHOTO_DIR, exist_ok=True)`).

NTP sync is a deployment prerequisite. Firmware does not validate the timestamp value.

**File naming:** captured JPEG is saved as `{PHOTO_DIR}/{timestamp}.jpg` where `timestamp` is the Unix epoch integer sampled in step 2. This path is stored in a local variable `image_path` and threaded through steps 3 and 7.

| Step | Action |
|------|--------|
| 1/8 | Load ECDSA private key from PEM |
| 2/8 | Capture photo via picamera2 at `RESOLUTION` (2s auto-exposure settle); record `timestamp = int(time.time())` immediately after capture; save JPEG to `{PHOTO_DIR}/{timestamp}.jpg` as `image_path` |
| 3/8 | Read `image_path` bytes; assert `len(image_bytes) > 0` (exit 1 if zero); compute one `sha256(image_bytes)` call: store `.digest()` as `raw_digest` and `.hexdigest()` as `image_hash` |
| 4/8 | Sign `raw_digest` with `key.sign(raw_digest, ec.ECDSA(utils.Prehashed(hashes.SHA256())))` (imports: `from cryptography.hazmat.primitives.asymmetric import ec, utils`; `from cryptography.hazmat.primitives import hashes`); encode DER output as `sig_der.hex()` stored as `signature` |
| 5/8 | If `GPS_ENABLED`: attempt gpsd query with 2s timeout (GPS import wrapped in `try/except ImportError` so firmware starts cleanly if `gpsd-py3` is not installed); on ImportError, timeout, or any exception fall back to `{"latitude": 0.0, "longitude": 0.0}`; if `GPS_ENABLED` is False skip directly to fallback |
| 6/8 | Build metadata dict: `{"device_id": DEVICE_ID, "image_hash": image_hash, "signature": signature, "timestamp": timestamp, "gps": gps}` — exactly these five keys, matching backend `CaptureMetadata` |
| 7/8 | POST `image_path` + metadata JSON to backend: call `uploader.upload_photo(image_path, metadata)` inside a `try/except RuntimeError` — on exception print error and `sys.exit(1)` |
| 8/8 | Print `token_id`, `tx_hash`, `claim_url` from response — other fields (`authenticity_score`, `ipfs_cid`, `qr_code_base64`) are intentionally ignored |

### uploader.py
Single public function:
```python
def upload_photo(image_path: str, metadata: dict) -> dict
```
- Serializes metadata with `json.dumps(metadata)` — caller must ensure all values are JSON-serializable primitives (str, int, float, dict, None)
- Multipart POST to `{API_BASE_URL}/api/photos/capture` with `timeout=30`
- `file` field: image bytes opened from `image_path`
- `metadata` field: JSON string as form field
- Returns parsed response JSON dict on success (2xx)
- On `requests.ConnectionError`, `requests.Timeout`, or non-2xx status: prints error and raises `RuntimeError`

## Data Contract

Metadata JSON sent to backend (matches `CaptureMetadata` exactly — no extra fields):
```json
{
  "device_id": "pi-cam-001",
  "image_hash": "a3f2...",
  "signature": "3045...",
  "timestamp": 1742689200,
  "gps": {"latitude": 0.0, "longitude": 0.0}
}
```

- `image_hash`: lowercase hex SHA-256 string, no `0x` prefix
- `signature`: DER-encoded ECDSA signature as lowercase hex string
- `timestamp`: Unix epoch integer, sampled immediately after capture (before GPS query)
- `gps`: always a dict `{"latitude": float, "longitude": float}` — never a tuple

## Crypto Details

Requires `cryptography >= 2.6` (`utils.Prehashed` was introduced in 2.6).

```python
from cryptography.hazmat.primitives.asymmetric import ec, utils
from cryptography.hazmat.primitives import hashes

h = hashlib.sha256(image_bytes)
raw_digest = h.digest()      # 32 bytes — passed to key.sign()
image_hash = h.hexdigest()   # hex string — sent in metadata

sig_der = key.sign(raw_digest, ec.ECDSA(utils.Prehashed(hashes.SHA256())))
signature = sig_der.hex()    # hex string — sent in metadata
```

Private key PEM file permissions: `0o600`.

## Dependencies

```
picamera2
cryptography>=2.6
requests
gpsd-py3      # optional at install time; import is guarded with try/except ImportError
```

## Error Handling

All failures print a clear error message and exit with code 1:
- Missing PEM file
- picamera2 capture failure
- Zero-byte image file after capture
- HTTP connection error, timeout, or non-2xx response

GPS failure is non-fatal: log a warning to stderr and continue with `{"latitude": 0.0, "longitude": 0.0}`.

## Out of Scope

- Retry logic for failed uploads
- Local photo database / deduplication
- TLS certificate pinning
- Watch-dog / auto-restart daemon
- QR code display on attached screen (backend returns `qr_code_base64`; firmware intentionally ignores it)
- Reporting `authenticity_score` or `ipfs_cid` locally
- Timestamp validation / NTP enforcement (NTP sync is a deployment prerequisite)
