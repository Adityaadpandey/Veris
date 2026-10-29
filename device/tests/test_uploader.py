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
