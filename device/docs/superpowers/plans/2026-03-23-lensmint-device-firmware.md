# LensMint Device Firmware Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement four Python firmware modules (`config.py`, `keygen.py`, `uploader.py`, `capture.py`) for a Raspberry Pi 5 camera that signs photos with ECDSA and mints them as NFTs via the LensMint backend API.

**Architecture:** Linear procedural design — no classes, no async. `capture.py` is the entry point: a top-to-bottom `main()` that calls private helpers (`_hash_and_sign`, `_get_gps`) and `uploader.upload_photo`. `keygen.py` is a standalone one-shot provisioning script. Helpers are extracted so they can be unit tested without hardware.

**Tech Stack:** Python 3.11, `picamera2` (camera, system apt package), `cryptography>=2.6` (ECDSA secp256k1), `requests` (HTTP), `gpsd-py3` (optional GPS)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `device/config.py` | Constants only — URLs, paths, flags, resolution |
| Create | `device/keygen.py` | One-shot ECDSA keypair generation |
| Create | `device/uploader.py` | Multipart HTTP POST to backend |
| Create | `device/capture.py` | 8-step capture pipeline + private helpers |
| Create | `device/requirements.txt` | Runtime dependencies (no picamera2 — apt only) |
| Create | `device/tests/__init__.py` | Makes tests a package |
| Create | `device/tests/test_uploader.py` | Unit tests for uploader (mocked requests) |
| Create | `device/tests/test_capture_helpers.py` | Unit tests for hash/sign helpers and GPS fallback |
| Create | `device/tests/test_keygen.py` | Unit tests for keygen (tmp dir) |
| Create | `device/tests/test_capture_main.py` | Unit tests for main() error paths |

---

## Task 1: Project scaffold and requirements

**Files:**
- Create: `device/requirements.txt`
- Create: `device/tests/__init__.py`

- [ ] **Step 1: Create `requirements.txt`**

```
cryptography>=2.6
requests>=2.31.0
gpsd-py3>=0.3.0
```

> Note: `picamera2` is installed system-wide on the Pi via `apt install python3-picamera2` — do not pin it here. `qrcode` is a backend responsibility; not needed on device.

- [ ] **Step 2: Create empty test package marker**

```python
# device/tests/__init__.py
```

- [ ] **Step 3: Commit**

```bash
git add device/requirements.txt device/tests/__init__.py
git commit -m "chore: scaffold device firmware project"
```

---

## Task 2: `config.py` — constants

**Files:**
- Create: `device/config.py`

- [ ] **Step 1: Write `config.py`**

```python
# config.py — runtime constants for LensMint device firmware

API_BASE_URL = "http://localhost:8000"

DEVICE_ID = "pi-cam-001"

PRIVATE_KEY_PATH = "/home/pi/.lensmint/private_key.pem"
PUBLIC_KEY_PATH  = "/home/pi/.lensmint/public_key.pem"

PHOTO_DIR = "/home/pi/lensmint_photos"

GPS_ENABLED = False

RESOLUTION = (2592, 1944)
```

- [ ] **Step 2: Verify it imports cleanly**

```bash
cd device && python -c "import config; print(config.RESOLUTION)"
```
Expected output: `(2592, 1944)`

- [ ] **Step 3: Commit**

```bash
git add device/config.py
git commit -m "feat: add config constants"
```

---

## Task 3: `uploader.py` — HTTP upload helper (TDD)

**Files:**
- Create: `device/uploader.py`
- Create: `device/tests/test_uploader.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_uploader.py
import json
import os
import sys
import pytest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import uploader


def _make_mock_response(status_code, json_data):
    mock = MagicMock()
    mock.status_code = status_code
    mock.ok = (200 <= status_code < 300)
    mock.json.return_value = json_data
    mock.text = json.dumps(json_data)
    return mock


# Exact 5-field metadata — no extra fields (backend uses Pydantic v2 no extra='ignore')
SAMPLE_METADATA = {
    "device_id": "pi-cam-001",
    "image_hash": "abc123",
    "signature": "3045deadbeef",
    "timestamp": 1742689200,
    "gps": {"latitude": 0.0, "longitude": 0.0},
}


def test_upload_photo_success(tmp_path):
    img = tmp_path / "photo.jpg"
    img.write_bytes(b"fakejpegbytes")

    response_data = {
        "token_id": 42,
        "tx_hash": "0xdeadbeef",
        "claim_url": "http://localhost:8000/api/photos/claim/42",
        "image_hash": "abc123",
        "authenticity_score": 90,
        "ipfs_cid": "Qm...",
        "qr_code_base64": "base64...",
    }
    mock_resp = _make_mock_response(200, response_data)

    with patch("uploader.requests.post", return_value=mock_resp) as mock_post:
        result = uploader.upload_photo(str(img), SAMPLE_METADATA)

    assert result["token_id"] == 42
    assert result["tx_hash"] == "0xdeadbeef"
    assert result["claim_url"] == "http://localhost:8000/api/photos/claim/42"

    call_kwargs = mock_post.call_args
    assert call_kwargs.kwargs["timeout"] == 30
    sent_metadata = json.loads(call_kwargs.kwargs["data"]["metadata"])
    assert sent_metadata == SAMPLE_METADATA


def test_upload_photo_non_2xx_raises(tmp_path):
    img = tmp_path / "photo.jpg"
    img.write_bytes(b"fakejpegbytes")

    mock_resp = _make_mock_response(502, {"detail": "upstream error"})

    with patch("uploader.requests.post", return_value=mock_resp):
        with pytest.raises(RuntimeError, match="502"):
            uploader.upload_photo(str(img), SAMPLE_METADATA)


def test_upload_photo_connection_error_raises(tmp_path):
    import requests as req_lib
    img = tmp_path / "photo.jpg"
    img.write_bytes(b"fakejpegbytes")

    with patch("uploader.requests.post", side_effect=req_lib.ConnectionError("refused")):
        with pytest.raises(RuntimeError, match="Connection error"):
            uploader.upload_photo(str(img), SAMPLE_METADATA)


def test_upload_photo_timeout_raises(tmp_path):
    import requests as req_lib
    img = tmp_path / "photo.jpg"
    img.write_bytes(b"fakejpegbytes")

    with patch("uploader.requests.post", side_effect=req_lib.Timeout("timed out")):
        with pytest.raises(RuntimeError, match="timed out"):
            uploader.upload_photo(str(img), SAMPLE_METADATA)
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd device && python -m pytest tests/test_uploader.py -v
```
Expected: 4 errors — `ModuleNotFoundError: No module named 'uploader'`

- [ ] **Step 3: Implement `uploader.py`**

```python
# uploader.py — HTTP upload helper for LensMint device firmware
import json

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
                files={"file": (image_path.split("/")[-1], f, "image/jpeg")},
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
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd device && python -m pytest tests/test_uploader.py -v
```
Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add device/uploader.py device/tests/test_uploader.py
git commit -m "feat: add uploader with multipart HTTP POST"
```

---

## Task 4: `keygen.py` — one-shot provisioning (TDD)

**Files:**
- Create: `device/keygen.py`
- Create: `device/tests/test_keygen.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_keygen.py
import importlib
import os
import sys
import pytest
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture(autouse=True)
def reload_keygen():
    """Clear keygen from sys.modules before each test so patches take effect."""
    sys.modules.pop("keygen", None)
    yield
    sys.modules.pop("keygen", None)


def test_keygen_creates_pem_files(tmp_path):
    priv_path = str(tmp_path / "private_key.pem")
    pub_path  = str(tmp_path / "public_key.pem")

    with patch.dict("sys.modules", {"keygen": None}):
        sys.modules.pop("keygen", None)

    with patch("config.PRIVATE_KEY_PATH", priv_path), \
         patch("config.PUBLIC_KEY_PATH",  pub_path):
        import keygen
        keygen.generate_keys()

    assert os.path.exists(priv_path)
    assert os.path.exists(pub_path)
    assert oct(os.stat(priv_path).st_mode)[-3:] == "600"


def test_keygen_prints_hex_pubkey(tmp_path, capsys):
    priv_path = str(tmp_path / "private_key.pem")
    pub_path  = str(tmp_path / "public_key.pem")

    with patch("config.PRIVATE_KEY_PATH", priv_path), \
         patch("config.PUBLIC_KEY_PATH",  pub_path):
        import keygen
        keygen.generate_keys()

    captured = capsys.readouterr()
    assert "Public key (hex):" in captured.out
    # uncompressed secp256k1 pubkey = 04 prefix + 64 bytes = 130 hex chars
    hex_line = [l for l in captured.out.splitlines() if l.startswith("04")][0]
    assert len(hex_line) == 130


def test_keygen_refuses_to_overwrite(tmp_path, capsys):
    priv_path = str(tmp_path / "private_key.pem")
    pub_path  = str(tmp_path / "public_key.pem")

    open(priv_path, "w").close()
    open(pub_path,  "w").close()

    with patch("config.PRIVATE_KEY_PATH", priv_path), \
         patch("config.PUBLIC_KEY_PATH",  pub_path):
        import keygen
        with pytest.raises(SystemExit) as exc_info:
            keygen.generate_keys()

    assert exc_info.value.code == 1
    assert "already exist" in capsys.readouterr().out
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd device && python -m pytest tests/test_keygen.py -v
```
Expected: errors — `ModuleNotFoundError: No module named 'keygen'`

- [ ] **Step 3: Implement `keygen.py`**

```python
# keygen.py — one-shot ECDSA secp256k1 key generation for LensMint device
# Requires: cryptography>=2.6
import os
import sys

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

from config import PRIVATE_KEY_PATH, PUBLIC_KEY_PATH


def generate_keys() -> None:
    if os.path.exists(PRIVATE_KEY_PATH) or os.path.exists(PUBLIC_KEY_PATH):
        print(
            f"Key files already exist at {PRIVATE_KEY_PATH} / {PUBLIC_KEY_PATH}. "
            "Delete them manually before re-generating."
        )
        sys.exit(1)

    private_key = ec.generate_private_key(ec.SECP256K1())
    public_key  = private_key.public_key()

    priv_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    )
    os.makedirs(os.path.dirname(os.path.abspath(PRIVATE_KEY_PATH)), exist_ok=True)
    with open(PRIVATE_KEY_PATH, "wb") as f:
        f.write(priv_pem)
    os.chmod(PRIVATE_KEY_PATH, 0o600)

    pub_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    with open(PUBLIC_KEY_PATH, "wb") as f:
        f.write(pub_pem)

    # Uncompressed point: 0x04 + 32-byte X + 32-byte Y = 65 bytes = 130 hex chars
    pub_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    print("Public key (hex):")
    print(pub_bytes.hex())
    print(f"\nPrivate key saved to: {PRIVATE_KEY_PATH}")
    print(f"Public key saved to:  {PUBLIC_KEY_PATH}")
    print("\nRegister the public key hex above with your LensMint contract.")


if __name__ == "__main__":
    generate_keys()
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd device && python -m pytest tests/test_keygen.py -v
```
Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add device/keygen.py device/tests/test_keygen.py
git commit -m "feat: add keygen for ECDSA secp256k1 provisioning"
```

---

## Task 5: `capture.py` private helpers (TDD)

**Files:**
- Create: `device/capture.py` (helpers only — `main()` added in Task 6)
- Create: `device/tests/test_capture_helpers.py`

**GPS test strategy:** All GPS tests patch `capture._gpsd_get_current` directly (not `sys.modules`). The `ImportError` path is tested by making `_gpsd_get_current` raise `ImportError`. This is consistent and reliable across environments.

- [ ] **Step 1: Write failing tests**

```python
# tests/test_capture_helpers.py
import hashlib
import os
import sys
import pytest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from cryptography.hazmat.primitives.asymmetric import ec


def _make_test_key():
    return ec.generate_private_key(ec.SECP256K1())


# ── _hash_and_sign ────────────────────────────────────────────────────────────

def test_hash_and_sign_returns_correct_image_hash():
    import capture
    image_bytes = b"hello lensmint"
    image_hash, _ = capture._hash_and_sign(image_bytes, _make_test_key())
    assert image_hash == hashlib.sha256(image_bytes).hexdigest()


def test_hash_and_sign_signature_is_der_hex():
    import capture
    _, signature = capture._hash_and_sign(b"test image data", _make_test_key())
    assert isinstance(signature, str)
    assert signature.startswith("30")   # DER sequence tag
    bytes.fromhex(signature)            # must be valid hex


def test_hash_and_sign_signature_verifiable():
    import capture
    from cryptography.hazmat.primitives.asymmetric import ec, utils
    from cryptography.hazmat.primitives import hashes

    image_bytes = b"verifiable content"
    private_key = _make_test_key()
    image_hash, signature = capture._hash_and_sign(image_bytes, private_key)

    raw_digest = hashlib.sha256(image_bytes).digest()
    # verify raises InvalidSignature on failure — should not raise
    private_key.public_key().verify(
        bytes.fromhex(signature),
        raw_digest,
        ec.ECDSA(utils.Prehashed(hashes.SHA256())),
    )


# ── _get_gps ──────────────────────────────────────────────────────────────────

def test_get_gps_returns_fallback_when_disabled():
    import capture
    with patch("capture.GPS_ENABLED", False):
        assert capture._get_gps() == {"latitude": 0.0, "longitude": 0.0}


def test_get_gps_returns_fallback_on_import_error():
    """gpsd-py3 not installed: _gpsd_get_current raises ImportError."""
    import capture
    with patch("capture.GPS_ENABLED", True), \
         patch("capture._gpsd_get_current", side_effect=ImportError("No module named 'gpsd'")):
        assert capture._get_gps() == {"latitude": 0.0, "longitude": 0.0}


def test_get_gps_returns_fallback_on_runtime_error():
    """gpsd running but no fix available."""
    import capture
    with patch("capture.GPS_ENABLED", True), \
         patch("capture._gpsd_get_current", side_effect=Exception("no fix")):
        assert capture._get_gps() == {"latitude": 0.0, "longitude": 0.0}


def test_get_gps_returns_coordinates_on_success():
    import capture
    mock_packet = MagicMock()
    mock_packet.lat = 37.7749
    mock_packet.lon = -122.4194

    with patch("capture.GPS_ENABLED", True), \
         patch("capture._gpsd_get_current", return_value=mock_packet):
        result = capture._get_gps()

    assert result == {"latitude": 37.7749, "longitude": -122.4194}
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd device && python -m pytest tests/test_capture_helpers.py -v
```
Expected: errors — `ModuleNotFoundError: No module named 'capture'`

- [ ] **Step 3: Implement `capture.py` (helpers only)**

```python
# capture.py — LensMint device firmware capture pipeline
# main() is in Task 6; helpers defined here first for TDD.
import hashlib
import os
import sys
import time

from cryptography.hazmat.primitives.asymmetric import ec, utils
from cryptography.hazmat.primitives import hashes, serialization

from config import (
    DEVICE_ID, PRIVATE_KEY_PATH, PHOTO_DIR,
    GPS_ENABLED, RESOLUTION,
)
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


# main() added in Task 6
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd device && python -m pytest tests/test_capture_helpers.py -v
```
Expected: `7 passed`

- [ ] **Step 5: Commit**

```bash
git add device/capture.py device/tests/test_capture_helpers.py
git commit -m "feat: add capture helpers (hash/sign, GPS fallback)"
```

---

## Task 6: `capture.py` — `main()` pipeline (TDD)

**Files:**
- Modify: `device/capture.py` (append `main()`)
- Create: `device/tests/test_capture_main.py`

- [ ] **Step 1: Write failing tests for `main()` error paths**

```python
# tests/test_capture_main.py
import os
import sys
import pytest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_main_exits_when_key_missing(tmp_path):
    import capture
    missing = str(tmp_path / "no_such_key.pem")
    with patch("capture.PRIVATE_KEY_PATH", missing):
        with pytest.raises(SystemExit) as exc_info:
            capture.main()
    assert exc_info.value.code == 1


def test_main_exits_on_zero_byte_image(tmp_path):
    """main() must exit 1 if the captured JPEG is empty."""
    import capture
    from cryptography.hazmat.primitives.asymmetric import ec

    # Write a real PEM key so step 1 passes
    private_key = ec.generate_private_key(ec.SECP256K1())
    from cryptography.hazmat.primitives import serialization
    pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    )
    key_file = tmp_path / "private_key.pem"
    key_file.write_bytes(pem)

    # Fake camera that writes an empty file
    def fake_camera_capture(image_path, photo_dir, resolution):
        open(image_path, "w").close()  # empty file
        return image_path

    with patch("capture.PRIVATE_KEY_PATH", str(key_file)), \
         patch("capture.PHOTO_DIR", str(tmp_path)), \
         patch("capture._run_camera", side_effect=lambda path: open(path, "wb").close()):
        with pytest.raises(SystemExit) as exc_info:
            capture.main()
    assert exc_info.value.code == 1


def test_main_exits_on_upload_error(tmp_path):
    """main() must exit 1 when uploader raises RuntimeError."""
    import capture
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization

    private_key = ec.generate_private_key(ec.SECP256K1())
    pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    )
    key_file = tmp_path / "private_key.pem"
    key_file.write_bytes(pem)

    # Fake camera that writes a real JPEG-like file
    real_bytes = b"\xff\xd8\xff" + b"x" * 1000  # minimal JPEG-ish bytes

    def fake_run_camera(path):
        with open(path, "wb") as f:
            f.write(real_bytes)

    with patch("capture.PRIVATE_KEY_PATH", str(key_file)), \
         patch("capture.PHOTO_DIR", str(tmp_path)), \
         patch("capture._run_camera", side_effect=fake_run_camera), \
         patch("capture._get_gps", return_value={"latitude": 0.0, "longitude": 0.0}), \
         patch("capture.uploader.upload_photo", side_effect=RuntimeError("backend down")):
        with pytest.raises(SystemExit) as exc_info:
            capture.main()
    assert exc_info.value.code == 1
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd device && python -m pytest tests/test_capture_main.py -v
```
Expected: FAIL — `AttributeError: module 'capture' has no attribute 'main'` (or `_run_camera`)

- [ ] **Step 3: Append `_run_camera` shim and `main()` to `capture.py`**

Add below the helpers (before end of file):

```python
# ── Camera shim ───────────────────────────────────────────────────────────────

def _run_camera(image_path: str) -> None:
    """Capture a still to image_path using picamera2. Isolated for testability."""
    from picamera2 import Picamera2  # guarded: only available on Pi
    cam = Picamera2()
    cam.configure(cam.create_still_configuration(main={"size": RESOLUTION}))
    cam.start()
    time.sleep(2)  # allow auto-exposure to settle
    cam.capture_file(image_path)
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

    # [3/8] Hash image
    print("[3/8] Computing SHA-256 hash...")
    with open(image_path, "rb") as f:
        image_bytes = f.read()
    if len(image_bytes) == 0:
        print("  ERROR: Captured image file is empty.")
        sys.exit(1)
    # Single call — both outputs derived from the same sha256 invocation inside helper
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
```

- [ ] **Step 4: Run all tests — expect PASS**

```bash
cd device && python -m pytest tests/ -v
```
Expected: all tests pass

- [ ] **Step 5: Confirm importable on dev machine (no picamera2 installed)**

```bash
cd device && python -c "import capture; print('OK')"
```
Expected: `OK` — picamera2 import is inside `_run_camera`, only called at runtime

- [ ] **Step 6: Commit**

```bash
git add device/capture.py device/tests/test_capture_main.py
git commit -m "feat: add 8-step capture pipeline main()"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run full test suite**

```bash
cd device && python -m pytest tests/ -v --tb=short
```
Expected: all tests pass, 0 failures

- [ ] **Step 2: Verify all four modules import cleanly**

```bash
cd device && python -c "import config, keygen, uploader, capture; print('All modules OK')"
```
Expected: `All modules OK`

- [ ] **Step 3: Dry-run keygen in tmp dir**

```bash
python -c "
import sys; sys.path.insert(0, 'device')
from unittest.mock import patch
with patch('config.PRIVATE_KEY_PATH', '/tmp/lm_test_priv.pem'), \
     patch('config.PUBLIC_KEY_PATH',  '/tmp/lm_test_pub.pem'):
    import keygen; keygen.generate_keys()
"
```
Expected: prints `Public key (hex):` followed by a 130-char hex starting with `04`

- [ ] **Step 4: Final commit**

```bash
git add -A device/
git commit -m "feat: complete LensMint device firmware"
```
