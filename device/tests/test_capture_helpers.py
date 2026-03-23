# tests/test_capture_helpers.py
import hashlib
import os
import sys
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
