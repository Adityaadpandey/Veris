#!/usr/bin/env python3
"""
Classic Bluetooth RFCOMM/SPP server for the headless camera app.

Advertises a fixed SPP UUID under a fixed, recognizable device name so the
phone app can find the Pi without hardcoding a MAC address. Serves one
phone connection at a time; on disconnect it goes back to listening, so a
phone walking out of range (or its app being killed) doesn't require
restarting the Pi service.
"""

import os
import threading

try:
    import bluetooth
    BLUETOOTH_AVAILABLE = True
except ImportError:
    BLUETOOTH_AVAILABLE = False

SPP_UUID = "00001101-0000-1000-8000-00805F9B34FB"
DEVICE_NAME = os.getenv('BT_DEVICE_NAME', f"Veris-Cam-{os.getenv('DEVICE_ID', 'unknown')}")


class BluetoothTriggerServer:
    """
    Accepts a single RFCOMM/SPP connection at a time and dispatches
    newline-delimited commands to `on_command`. Progress can be streamed
    back to the currently connected phone via `send_status`.
    """

    def __init__(self, on_command, device_name=DEVICE_NAME):
        if not BLUETOOTH_AVAILABLE:
            raise RuntimeError("PyBluez not available - install with: pip3 install pybluez2")

        self.on_command = on_command
        self.device_name = device_name
        self._server_sock = None
        self._client_sock = None
        self._client_lock = threading.Lock()
        self._running = False

    def start(self):
        """Starts the accept loop in a background thread and returns it."""
        self._running = True
        thread = threading.Thread(target=self._accept_loop, daemon=True)
        thread.start()
        return thread

    def stop(self):
        self._running = False
        with self._client_lock:
            if self._client_sock is not None:
                try:
                    self._client_sock.close()
                except Exception:
                    pass
        if self._server_sock is not None:
            try:
                self._server_sock.close()
            except Exception:
                pass

    def send_status(self, line):
        """Best-effort: write a status line to the connected phone, if any."""
        with self._client_lock:
            if self._client_sock is None:
                return False
            try:
                self._client_sock.send((line.strip() + "\n").encode("utf-8"))
                return True
            except Exception as e:
                print(f"Bluetooth send_status error: {e}")
                return False

    def _accept_loop(self):
        self._server_sock = bluetooth.BluetoothSocket(bluetooth.RFCOMM)
        self._server_sock.bind(("", bluetooth.PORT_ANY))
        self._server_sock.listen(1)

        channel = self._server_sock.getsockname()[1]
        bluetooth.advertise_service(
            self._server_sock,
            self.device_name,
            service_id=SPP_UUID,
            service_classes=[SPP_UUID, bluetooth.SERIAL_PORT_CLASS],
            profiles=[bluetooth.SERIAL_PORT_PROFILE],
        )
        print(f"Bluetooth SPP server '{self.device_name}' listening on RFCOMM channel {channel}")

        while self._running:
            try:
                client_sock, client_info = self._server_sock.accept()
                print(f"Phone connected: {client_info}")
                with self._client_lock:
                    self._client_sock = client_sock
                self._serve_client(client_sock)
            except OSError:
                break
            except Exception as e:
                print(f"Bluetooth accept error: {e}")
            finally:
                with self._client_lock:
                    self._client_sock = None

    def _serve_client(self, client_sock):
        buffer = b""
        try:
            while self._running:
                data = client_sock.recv(1024)
                if not data:
                    break
                buffer += data
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    command = line.strip().decode("utf-8", errors="ignore")
                    if command:
                        self._dispatch(command)
        except Exception as e:
            print(f"Phone connection error: {e}")
        finally:
            try:
                client_sock.close()
            except Exception:
                pass
            print("Phone disconnected, waiting for next connection")

    def _dispatch(self, command):
        try:
            self.on_command(command)
        except Exception as e:
            print(f"Error handling command '{command}': {e}")
