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
