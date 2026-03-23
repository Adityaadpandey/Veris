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
