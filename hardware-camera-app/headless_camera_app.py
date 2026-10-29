#!/usr/bin/env python3
"""
Headless entrypoint for Pi units with no touchscreen.

The shutter trigger comes from a paired Android phone over classic
Bluetooth (RFCOMM/SPP) instead of an on-screen button, and progress goes
back down the same socket instead of onto a display. The phone's mobile
data, shared over Bluetooth PAN tethering, is used for the upload/sign/
claim network calls when the Pi has no other internet access.

Env vars:
  PHONE_MAC       Paired phone's Bluetooth MAC address (for PAN tethering).
                   If unset, tethering is skipped and uploads rely on
                   whatever network the Pi already has.
  TETHER_TIMEOUT  Seconds to wait for a PAN DHCP lease before giving up
                   and falling back to the retry queue (default 10).
  RETRY_INTERVAL  Seconds between background retries of queued uploads
                   (default 300).
  BT_DEVICE_NAME  Bluetooth device name to advertise (default
                   Veris-Cam-<DEVICE_ID>).

One-time setup (per Pi + phone pair, done manually):
  1. Pair the phone with the Pi:
       bluetoothctl
       > agent on
       > default-agent
       > scan on            # find the phone, then Ctrl-C
       > pair   <phone-MAC>
       > trust  <phone-MAC>
  2. On the phone: turn on Bluetooth tethering (Settings > Network >
     Hotspot & tethering > Bluetooth tethering).
  3. Set PHONE_MAC to the phone's MAC address in this app's environment
     (e.g. in the .env file loaded by headless-camera.service).

No pairing UI is provided on either end - see headless-camera.service for
running this as a systemd unit.
"""

import os
import sys
import time
import threading

from capture_pipeline import (
    CameraController,
    CAMERA_AVAILABLE,
    sign_image,
    upload_and_create_claim,
    retry_pending_uploads,
)
from bt_trigger_server import BluetoothTriggerServer
import bt_tether

try:
    from hardware_identity import get_hardware_identity
    HARDWARE_IDENTITY_AVAILABLE = True
except ImportError:
    HARDWARE_IDENTITY_AVAILABLE = False

PHONE_MAC = os.getenv('PHONE_MAC')
TETHER_TIMEOUT = int(os.getenv('TETHER_TIMEOUT', '10'))
RETRY_INTERVAL = int(os.getenv('RETRY_INTERVAL', '300'))


class HeadlessCameraApp:

    def __init__(self):
        self.camera = CameraController()
        self.hardware_identity = None
        self.server = BluetoothTriggerServer(on_command=self._handle_command)
        self._capture_lock = threading.Lock()

    def start(self):
        if not CAMERA_AVAILABLE:
            print("Warning: Picamera2 not available - running in demo mode")
        elif not self.camera.initialize():
            print("Warning: camera failed to initialize")

        if HARDWARE_IDENTITY_AVAILABLE:
            try:
                self.hardware_identity = get_hardware_identity(camera_id=self.camera.get_camera_id())
            except Exception as e:
                print(f"Warning: could not initialize hardware identity: {e}")

        if not PHONE_MAC:
            print("Warning: PHONE_MAC not set - Bluetooth PAN tethering will be skipped")

        self.server.start()

        # Drain any backlog from a previous offline period, then keep
        # retrying on a timer in case the phone reconnects with tethering
        # on without a new CAPTURE happening.
        retry_pending_uploads(status_callback=self._status)
        self._start_retry_timer()

        print("Headless camera app ready, waiting for phone connections")
        while True:
            time.sleep(3600)

    def _start_retry_timer(self):
        def loop():
            while True:
                time.sleep(RETRY_INTERVAL)
                retry_pending_uploads(status_callback=self._status)
        threading.Thread(target=loop, daemon=True).start()

    def _status(self, message, level='info', duration=3):
        """Forwards the shared pipeline's free-form progress text to the
        phone, alongside the fixed vocabulary tokens sent around it."""
        self.server.send_status(message)

    def _handle_command(self, command):
        if command == "CAPTURE":
            with self._capture_lock:
                self._do_capture()
        else:
            print(f"Unknown command: {command}")

    def _do_capture(self):
        self.server.send_status("CAPTURING")
        filename = self.camera.take_photo()
        if not filename:
            self.server.send_status("FAILED:capture")
            return
        self.server.send_status("CAPTURED")

        signature_info = sign_image(self.hardware_identity, filename)
        if not signature_info:
            self.server.send_status("FAILED:signing")
            return
        self.server.send_status("SIGNED")

        if PHONE_MAC:
            self.server.send_status("TETHERING")
            bt_tether.ensure_link(PHONE_MAC, timeout=TETHER_TIMEOUT)

        self.server.send_status("UPLOADING")
        camera_id = self.camera.get_camera_id() if self.camera.initialized else 'unknown'
        result = upload_and_create_claim(filename, signature_info, camera_id, status_callback=self._status)

        status = result.get('status')
        if status == 'uploaded':
            self.server.send_status(f"UPLOADED:{result['claim_url']}")
        elif status == 'no_claim':
            self.server.send_status("UPLOADED:")
        elif status == 'queued':
            self.server.send_status("QUEUED:offline")
        else:
            self.server.send_status("FAILED:upload")


def main():
    app = HeadlessCameraApp()
    try:
        app.start()
    except KeyboardInterrupt:
        print("Shutting down")
        app.server.stop()
        app.camera.cleanup()
        sys.exit(0)


if __name__ == "__main__":
    main()
