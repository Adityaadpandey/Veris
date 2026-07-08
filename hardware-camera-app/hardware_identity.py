#!/usr/bin/env python3

import os
import hashlib
import subprocess
import stat
from pathlib import Path

try:
    from nacl.signing import SigningKey, VerifyKey
    from nacl.exceptions import BadSignatureError
    NACL_AVAILABLE = True
except ImportError:
    NACL_AVAILABLE = False
    print("Warning: PyNaCl library not available. Install with: pip3 install pynacl")
    print("   Hardware signing features will be disabled")

try:
    import base58
    BASE58_AVAILABLE = True
except ImportError:
    BASE58_AVAILABLE = False
    print("Warning: base58 library not available. Install with: pip3 install base58")
    print("   Solana address encoding will be disabled")

SALT_PATH = os.getenv('SALT_PATH', '/boot/.device_salt')
SALT_BACKUP_PATH = Path(os.getenv('SALT_BACKUP_PATH', str(Path.home() / ".lensmint" / ".device_salt_backup")))

class HardwareIdentity:

    def __init__(self, camera_id=None):
        self.salt = None
        self.seed = None
        self.signing_key = None
        self.verify_key = None
        self.address = None
        self.initialized = False
        self.camera_id = camera_id

        if not NACL_AVAILABLE:
            raise RuntimeError("PyNaCl library required. Install with: pip3 install pynacl")
        if not BASE58_AVAILABLE:
            raise RuntimeError("base58 library required. Install with: pip3 install base58")

        self._initialize()

    def _initialize(self):
        try:
            self.salt = self._get_or_create_salt()
            hw_id = self._get_hardware_id()
            self.signing_key, self.verify_key = self._derive_key(hw_id, self.salt)
            self.address = self._get_address()

            self.initialized = True
            print(f"Hardware identity initialized. Address: {self.address[:16]}...")

        except Exception as e:
            print(f"Error initializing hardware identity: {e}")
            raise

    def _get_or_create_salt(self):
        if os.path.exists(SALT_PATH):
            try:
                with open(SALT_PATH, "rb") as f:
                    salt = f.read()
                if len(salt) == 32:
                    print(f"✓ Salt loaded from {SALT_PATH}")
                    return salt
            except PermissionError:
                print(f"⚠ Permission denied reading {SALT_PATH}, trying backup...")

        if SALT_BACKUP_PATH.exists():
            try:
                with open(SALT_BACKUP_PATH, "rb") as f:
                    salt = f.read()
                if len(salt) == 32:
                    print(f"✓ Salt loaded from backup: {SALT_BACKUP_PATH}")
                    return salt
            except Exception as e:
                print(f"⚠ Error reading backup salt: {e}")

        print("Creating new device salt...")
        salt = os.urandom(32)

        try:
            with open(SALT_PATH, "wb") as f:
                f.write(salt)
            os.chmod(SALT_PATH, stat.S_IRUSR | stat.S_IWUSR)
            print(f"✓ Salt saved to {SALT_PATH} (read-only)")
        except (PermissionError, OSError) as e:
            print(f"⚠ Cannot write to {SALT_PATH}: {e}")
            print("   Saving to user directory instead...")
            SALT_BACKUP_PATH.parent.mkdir(parents=True, exist_ok=True)
            with open(SALT_BACKUP_PATH, "wb") as f:
                f.write(salt)
            os.chmod(SALT_BACKUP_PATH, stat.S_IRUSR | stat.S_IWUSR)
            print(f"✓ Salt saved to backup: {SALT_BACKUP_PATH}")

        return salt

    def _get_hardware_id(self):
        identifiers = []

        if self.camera_id:
            identifiers.append(f"camera:{self.camera_id}")
            print(f"✓ Camera ID: {self.camera_id}")

        try:
            result = subprocess.run(
                ["cat", "/proc/cpuinfo"],
                capture_output=True,
                text=True,
                timeout=2
            )
            for line in result.stdout.split('\n'):
                if 'Serial' in line:
                    serial = line.split(':')[1].strip()
                    identifiers.append(f"serial:{serial}")
                    print(f"✓ CPU Serial: {serial[:16]}...")
                    break
        except Exception as e:
            print(f"⚠ Could not read CPU serial: {e}")

        for interface in ['wlan0', 'eth0']:
            try:
                mac_path = f"/sys/class/net/{interface}/address"
                if os.path.exists(mac_path):
                    with open(mac_path, 'r') as f:
                        mac = f.read().strip()
                        identifiers.append(f"mac:{mac}")
                        print(f"✓ MAC Address ({interface}): {mac}")
                        break
            except Exception as e:
                continue

        try:
            if os.path.exists("/etc/machine-id"):
                with open("/etc/machine-id", 'r') as f:
                    machine_id = f.read().strip()
                    identifiers.append(f"machine:{machine_id}")
                    print(f"✓ Machine ID: {machine_id[:16]}...")
        except Exception as e:
            pass

        if not identifiers:
            raise RuntimeError("Could not collect any hardware identifiers")

        hw_string = "|".join(identifiers)
        print(f"Hardware ID components: {len(identifiers)} found")

        return hw_string.encode('utf-8')

    def _derive_key(self, hw_id, salt):
        combined = hw_id + salt
        seed = hashlib.sha256(combined).digest()
        self.seed = seed
        signing_key = SigningKey(seed)
        verify_key = signing_key.verify_key
        return signing_key, verify_key

    def _get_address(self):
        # Solana-style address: base58-encoded 32-byte ed25519 verify key
        return base58.b58encode(bytes(self.verify_key)).decode()

    def sign_data(self, data):
        if not self.initialized:
            raise RuntimeError("Hardware identity not initialized")

        if isinstance(data, str):
            data = data.encode('utf-8')

        signature = self.signing_key.sign(data).signature
        return signature

    def sign_hash(self, data_hash):
        if not self.initialized:
            raise RuntimeError("Hardware identity not initialized")

        if isinstance(data_hash, str):
            # Assume hex string
            data_hash = bytes.fromhex(data_hash.replace('0x', ''))

        signature = self.signing_key.sign(data_hash).signature

        return {
            'signature': signature.hex(),
            'address': self.address,
            'algorithm': 'ED25519',
            'salt_path': SALT_PATH if os.path.exists(SALT_PATH) else str(SALT_BACKUP_PATH)
        }

    def verify_signature(self, data, signature):
        if not self.initialized:
            raise RuntimeError("Hardware identity not initialized")

        if isinstance(data, str):
            data = data.encode('utf-8')

        if isinstance(signature, str):
            signature = bytes.fromhex(signature.replace('0x', ''))

        try:
            self.verify_key.verify(data, signature)
            return True
        except BadSignatureError:
            return False
        except Exception:
            return False

    def get_public_key_hex(self):
        if not self.initialized:
            return None
        return bytes(self.verify_key).hex()

    def get_seed_hex(self):
        """Hex of the 32-byte ed25519 seed (backend rebuilds the keypair with Keypair.fromSeed)."""
        if not self.initialized:
            return None
        return self.seed.hex()

    def get_address(self):
        return self.address

    def get_camera_id(self):
        return self.camera_id

    def get_hardware_info(self):
        return {
            'address': self.address,
            'camera_id': self.camera_id,
            'public_key_hex': self.get_public_key_hex(),
            'salt_path': SALT_PATH if os.path.exists(SALT_PATH) else str(SALT_BACKUP_PATH),
            'initialized': self.initialized
        }

_hardware_identity = None

def get_hardware_identity(camera_id=None):
    global _hardware_identity
    if _hardware_identity is None:
        _hardware_identity = HardwareIdentity(camera_id=camera_id)
    elif camera_id is not None and _hardware_identity.camera_id != camera_id:
        _hardware_identity = HardwareIdentity(camera_id=camera_id)
    return _hardware_identity

if __name__ == '__main__':
    print("=" * 60)
    print("Hardware Identity Test (ed25519 / Solana)")
    print("=" * 60)

    try:
        # CAMERA_ID env lets the self-test run off-Pi, where no hardware
        # identifiers (CPU serial / MAC / machine-id) are available.
        hw_id = HardwareIdentity(camera_id=os.getenv('CAMERA_ID'))

        print(f"\n✓ Hardware Identity Initialized")
        print(f"  Address (base58): {hw_id.get_address()}")
        print(f"  Camera ID: {hw_id.get_camera_id() or 'Not provided'}")
        print(f"  Public Key: {hw_id.get_public_key_hex()}")

        # Address must decode back to the 32-byte verify key
        decoded = base58.b58decode(hw_id.get_address())
        assert decoded == bytes(hw_id.verify_key), "address does not decode to verify key"
        assert len(decoded) == 32, "decoded address is not 32 bytes"
        print(f"\n✓ Address decodes to 32-byte ed25519 public key")

        test_data = b"Hello, LensMint!"
        signature = hw_id.sign_data(test_data)
        assert isinstance(signature, bytes) and len(signature) == 64, "signature must be 64 bytes"
        print(f"\n✓ Test Signature Generated (64 bytes)")
        print(f"  Data: {test_data}")
        print(f"  Signature: {signature.hex()[:32]}...")

        is_valid = hw_id.verify_signature(test_data, signature)
        print(f"\n✓ Signature Verification: {'PASSED' if is_valid else 'FAILED'}")
        assert is_valid, "valid signature failed verification"

        tampered = hw_id.verify_signature(b"tampered data", signature)
        print(f"✓ Tampered Data Rejected: {'PASSED' if not tampered else 'FAILED'}")
        assert not tampered, "tampered data passed verification"

        test_hash = hashlib.sha256(b"test image data").digest()
        sig_info = hw_id.sign_hash(test_hash)
        assert sig_info['algorithm'] == 'ED25519'
        assert len(bytes.fromhex(sig_info['signature'])) == 64
        print(f"\n✓ Hash Signature Generated")
        print(f"  Algorithm: {sig_info['algorithm']}")
        print(f"  Address: {sig_info['address']}")

        # sign_hash signature must verify against the 32-byte hash message
        assert hw_id.verify_signature(test_hash, sig_info['signature'])
        print(f"✓ Hash Signature Verified")

        # Seed round-trip: SigningKey(seed) reproduces the same public key
        seed_hex = hw_id.get_seed_hex()
        assert len(bytes.fromhex(seed_hex)) == 32
        rebuilt = SigningKey(bytes.fromhex(seed_hex))
        assert bytes(rebuilt.verify_key) == bytes(hw_id.verify_key)
        print(f"✓ Seed round-trip reproduces the same keypair")

        print(f"\n{'=' * 60}\nALL SELF-TESTS PASSED\n{'=' * 60}")

    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        raise SystemExit(1)
