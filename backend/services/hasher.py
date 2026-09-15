import hashlib


def compute_sha256(data: bytes) -> str:
    """Returns lowercase 64-char hex SHA-256 digest (no 0x prefix)."""
    return hashlib.sha256(data).hexdigest()


def verify_sha256(data: bytes, expected_hex: str) -> bool:
    """Verify file bytes match the provided SHA-256 hex string."""
    clean = expected_hex.lower().removeprefix("0x")
    return compute_sha256(data) == clean


def hex_to_bytes32(hex_str: str) -> bytes:
    """Convert a 64-char hex string (with or without 0x) to 32 bytes for contract calls."""
    clean = hex_str.lower().removeprefix("0x")
    if len(clean) != 64:
        raise ValueError(f"Expected 64 hex chars for bytes32, got {len(clean)}")
    return bytes.fromhex(clean)


def bytes32_to_hex(b: bytes) -> str:
    """Convert 32 bytes to a 0x-prefixed hex string."""
    return "0x" + b.hex()
