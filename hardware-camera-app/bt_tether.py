#!/usr/bin/env python3
"""
Thin wrapper around Bluetooth PAN (BNEP) networking. Brings up `bnep0` by
running `bt-pan client <phone_mac>` and waits for a DHCP lease.

Requires the phone to already be paired/trusted (one-time `bluetoothctl`
step) and to have Bluetooth tethering turned on when a photo needs to go
out. This module never raises on a missing link - callers treat a `False`
return as "still offline" and fall back to the retry queue.
"""

import subprocess
import time

BNEP_INTERFACE = "bnep0"


def _interface_has_ip(interface=BNEP_INTERFACE):
    try:
        result = subprocess.run(
            ["ip", "-4", "addr", "show", interface],
            capture_output=True, text=True, timeout=3,
        )
        return result.returncode == 0 and "inet " in result.stdout
    except Exception:
        return False


def ensure_link(phone_mac, timeout=10):
    """
    Ensures `bnep0` has an IP, bringing up Bluetooth PAN to `phone_mac` if
    it isn't already up. Returns True once a DHCP lease is present, False
    if it never comes up within `timeout` seconds.
    """
    if _interface_has_ip():
        return True

    try:
        subprocess.Popen(
            ["bt-pan", "client", phone_mac],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    except FileNotFoundError:
        print("bt-pan not found - is bluez-tools installed?")
        return False
    except Exception as e:
        print(f"Error starting bt-pan client: {e}")
        return False

    deadline = time.time() + timeout
    while time.time() < deadline:
        if _interface_has_ip():
            return True
        time.sleep(1)

    return False
