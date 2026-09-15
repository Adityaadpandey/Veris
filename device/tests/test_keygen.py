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

    (tmp_path / "private_key.pem").touch()
    (tmp_path / "public_key.pem").touch()

    with patch("config.PRIVATE_KEY_PATH", priv_path), \
         patch("config.PUBLIC_KEY_PATH",  pub_path):
        import keygen
        with pytest.raises(SystemExit) as exc_info:
            keygen.generate_keys()

    assert exc_info.value.code == 1
    assert "already exist" in capsys.readouterr().out
