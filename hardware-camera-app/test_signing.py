"""Checks that a Pi signature is recoverable by ethers.js on the backend. Run: python3 test_signing.py"""
import json, subprocess, sys
from pathlib import Path
from ecdsa import SigningKey, SECP256k1
import hardware_identity as hi

ident = hi.HardwareIdentity.__new__(hi.HardwareIdentity)
ident.private_key = SigningKey.from_string(bytes(range(1, 33)), curve=SECP256k1)
ident.public_key = ident.private_key.get_verifying_key()
ident.address = ident._get_address()
ident.initialized = True

backend = Path(__file__).parent.parent / "hardware-web3-service"
for i in range(20):  # both recovery ids show up across a few messages
    msg = f"hello veris {i}\nline two"
    sig = ident.sign_message(msg)["signature"]
    js = "import {ethers} from 'ethers';console.log(ethers.verifyMessage(process.argv[1],process.argv[2]))"
    out = subprocess.run(["node", "--input-type=module", "-e", js, msg, sig],
                         cwd=backend, capture_output=True, text=True)
    assert out.stdout.strip().lower() == ident.address.lower(), (i, out.stdout, out.stderr)
print("ok: 20 signatures recovered to the device address")

# the backend rebuilds the signed text with packet.js, so both builders must agree exactly
import capture_pipeline as cp
args = dict(image_hash="ab12", companion_hash=None, verdict="real", timestamp=1700000000000, nonce="n0", device_address="0xAbC")
py = cp.build_packet_message(**args)
js = ("import {buildPacketMessage as b} from './packet.js';process.stdout.write(b({imageHash:'ab12',companionHash:null,"
      "verdict:'real',timestamp:1700000000000,nonce:'n0',deviceAddress:'0xAbC'}))")
out = subprocess.run(["node", "--input-type=module", "-e", js], cwd=backend, capture_output=True, text=True)
assert out.stdout == py, (out.stdout, py)
print("ok: python and js packet text match")
