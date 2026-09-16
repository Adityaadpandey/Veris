#!/usr/bin/env python3
"""
Shared capture -> sign -> upload -> claim pipeline.

Used by both the touchscreen Kivy app (raspberry_pi_camera_app.py) and the
headless Bluetooth entrypoint (headless_camera_app.py). Has no Kivy import
so it can run under either.

Callers pass a `status_callback(message, level='info', duration=3)` for
progress reporting instead of this module touching any UI directly - the
Kivy app forwards it into `Clock.schedule_once(show_status, ...)`, the
headless app forwards it down the Bluetooth socket.
"""

import os
import time
import json
import hashlib
from datetime import datetime
from pathlib import Path

import numpy as np
import cv2
import requests

try:
    from picamera2 import Picamera2
    from picamera2.encoders import H264Encoder
    CAMERA_AVAILABLE = True
except ImportError:
    CAMERA_AVAILABLE = False

try:
    import piexif
    PIEXIF_AVAILABLE = True
except ImportError:
    PIEXIF_AVAILABLE = False

CAPTURE_DIR = Path(os.getenv('CAPTURE_DIR', str(Path.home() / "captures")))
CAPTURE_DIR.mkdir(parents=True, exist_ok=True)

PENDING_DIR = CAPTURE_DIR.parent / "pending"
PENDING_DIR.mkdir(parents=True, exist_ok=True)

BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:5000')

PREVIEW_SIZE = tuple(map(int, os.getenv('PREVIEW_SIZE', '1920,1080').split(',')))
PREVIEW_FRAMERATE = float(os.getenv('PREVIEW_FRAMERATE', '30'))
PHOTO_SIZE = tuple(map(int, os.getenv('PHOTO_SIZE', '1920,1080').split(',')))
VIDEO_SIZE = tuple(map(int, os.getenv('VIDEO_SIZE', '1280,720').split(',')))

MIN_ZOOM = float(os.getenv('MIN_ZOOM', '1.0'))
MAX_ZOOM = float(os.getenv('MAX_ZOOM', '4.0'))
ZOOM_STEP = float(os.getenv('ZOOM_STEP', '0.5'))

CAMERA_ROTATION = int(os.getenv('CAMERA_ROTATION', '-90'))


def _noop_callback(message, level='info', duration=3):
    pass


def _current_utc_offset_str():
    """Pi's current local UTC offset, EXIF format ("+05:30"). Reflects whatever timezone the
    system clock is actually set to right now (DST-aware), not a hardcoded assumption."""
    offset = datetime.now().astimezone().utcoffset()
    total_minutes = int(offset.total_seconds() // 60)
    sign = '+' if total_minutes >= 0 else '-'
    total_minutes = abs(total_minutes)
    return f"{sign}{total_minutes // 60:02d}:{total_minutes % 60:02d}"


def _stamp_capture_offset(filename):
    """Adds OffsetTime/OffsetTimeOriginal/OffsetTimeDigitized to a just-saved JPEG so its
    DateTimeOriginal (already written by libcamera as naive local wall-clock time, no timezone
    marker) is no longer ambiguous to any downstream reader — a UTC-timezone server previously had
    no way to tell that timestamp apart from a genuine UTC one, and silently misread it as UTC,
    producing a false multi-hour gap equal to the Pi's real UTC offset. Best-effort: a stamping
    failure shouldn't fail the capture, since the fallback logic on the server side still handles
    an unstamped photo correctly for every device deployed today.
    """
    if not PIEXIF_AVAILABLE:
        return
    try:
        offset_str = _current_utc_offset_str().encode()
        exif_dict = piexif.load(str(filename))
        exif_dict['Exif'][piexif.ExifIFD.OffsetTimeOriginal] = offset_str
        exif_dict['Exif'][piexif.ExifIFD.OffsetTime] = offset_str
        exif_dict['Exif'][piexif.ExifIFD.OffsetTimeDigitized] = offset_str
        piexif.insert(piexif.dump(exif_dict), str(filename))
    except Exception as e:
        print(f"Warning: could not stamp EXIF timezone offset: {e}")


class CameraController:

    def __init__(self):
        self.camera = None
        self.recording = False
        self.encoder = None
        self.current_zoom = MIN_ZOOM
        self.sensor_size = None
        self.initialized = False
        self.camera_id = None
        self.still_config = None

    def initialize(self):
        if not CAMERA_AVAILABLE:
            raise RuntimeError("Picamera2 not available")

        if self.camera is not None:
            try:
                if self.initialized:
                    self.camera.stop()
                self.camera.close()
            except:
                pass
            self.camera = None
            self.initialized = False

        try:
            time.sleep(0.5)

            self.camera = Picamera2()
            try:
                config = self.camera.create_video_configuration(
                    main={"size": PREVIEW_SIZE},
                    controls={"FrameRate": PREVIEW_FRAMERATE},
                    buffer_count=4,
                )
                self.camera.configure(config)
                print(f"Camera configured: preview {PREVIEW_SIZE[0]}x{PREVIEW_SIZE[1]} @ {PREVIEW_FRAMERATE}fps")

                try:
                    if os.getenv('PHOTO_SIZE'):
                        self.still_config = self.camera.create_still_configuration(
                            main={"size": PHOTO_SIZE}
                        )
                    else:
                        self.still_config = self.camera.create_still_configuration()
                    still_size = self.still_config["main"].get("size", "sensor-native")
                    print(f"Still config prepared at {still_size} (switched in for capture)")
                except Exception as e:
                    print(f"Warning: could not build still config ({e}); stills will use preview stream")
                    self.still_config = None
            except Exception as e:
                print(f"Warning: could not apply preview config ({e}), falling back to defaults")
            self.camera.start()

            try:
                sensor_props = self.camera.camera_properties
                self.sensor_size = sensor_props.get('PixelArraySize', (2592, 1944))

                self.camera_id = None

                camera_parts = []

                if 'Model' in sensor_props and sensor_props.get('Model'):
                    camera_parts.append(f"model:{sensor_props['Model']}")

                if 'SensorName' in sensor_props and sensor_props.get('SensorName'):
                    camera_parts.append(f"sensor:{sensor_props['SensorName']}")

                if 'LensName' in sensor_props and sensor_props.get('LensName'):
                    camera_parts.append(f"lens:{sensor_props['LensName']}")

                try:
                    import subprocess
                    result = subprocess.run(
                        ['cat', '/proc/device-tree/camera0/compatible'],
                        capture_output=True,
                        text=True,
                        timeout=1
                    )
                    if result.returncode == 0 and result.stdout.strip():
                        camera_parts.append(f"compatible:{result.stdout.strip()}")
                except:
                    pass

                if camera_parts:
                    camera_id_str = "|".join(camera_parts)
                    self.camera_id = hashlib.sha256(camera_id_str.encode()).hexdigest()[:16]
                    print(f"Camera ID generated from properties: {self.camera_id}")
                    print(f"  Camera info: {camera_id_str[:80]}...")

                if not self.camera_id:
                    try:
                        import subprocess
                        result = subprocess.run(
                            ['libcamera-hello', '--list-cameras'],
                            capture_output=True,
                            text=True,
                            timeout=2
                        )
                        if result.returncode == 0 and result.stdout:
                            for line in result.stdout.split('\n'):
                                if 'serial' in line.lower():
                                    parts = line.split()
                                    for i, part in enumerate(parts):
                                        if 'serial' in part.lower() and ':' in part:
                                            serial_part = part.split(':')[-1] if ':' in part else part.split('=')[-1]
                                            if serial_part and len(serial_part) > 3:
                                                self.camera_id = serial_part.strip(':,=')
                                                break
                                    if self.camera_id:
                                        break
                    except:
                        pass

                if not self.camera_id:
                    props_str = str(sorted(sensor_props.items()))
                    props_str += f"|size:{self.sensor_size[0]}x{self.sensor_size[1]}"
                    self.camera_id = hashlib.sha256(props_str.encode()).hexdigest()[:16]
                    print(f"Camera ID generated from properties hash: {self.camera_id}")

            except Exception as e:
                self.sensor_size = (2592, 1944)
                print(f"Warning: Could not extract camera ID: {e}")
                fallback = hashlib.sha256(f"camera_{time.time()}".encode()).hexdigest()[:16]
                self.camera_id = fallback

            self.initialized = True
            print(f"Camera started")
            return True

        except Exception as e:
            print(f"Error initializing camera: {e}")
            return False

    def get_frame(self):
        if not self.initialized or self.camera is None:
            return None

        try:
            frame = self.camera.capture_array()
            return frame
        except Exception as e:
            return None

    def take_photo(self):
        if not self.initialized:
            return None

        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = CAPTURE_DIR / f"photo_{timestamp}.jpg"

            if self.still_config is not None:
                request = self.camera.switch_mode_and_capture_request(self.still_config)
            else:
                request = self.camera.capture_request()

            if CAMERA_ROTATION != 0:
                array = request.make_array("main")
                if CAMERA_ROTATION == 90:
                    k = 3
                elif CAMERA_ROTATION == 180:
                    k = 2
                elif CAMERA_ROTATION == 270:
                    k = 1
                else:
                    k = 0
                if k > 0:
                    array = np.rot90(array, k=k)
                    cv2.imwrite(str(filename), cv2.cvtColor(array, cv2.COLOR_RGB2BGR),
                                [int(cv2.IMWRITE_JPEG_QUALITY), 95])
                else:
                    request.save("main", str(filename))
                    _stamp_capture_offset(filename)
            else:
                request.save("main", str(filename))
                _stamp_capture_offset(filename)

            request.release()

            print(f"Photo saved: {filename}")
            return str(filename)

        except Exception as e:
            print(f"Error taking photo: {e}")
            return None

    def start_recording(self):
        if not self.initialized or self.recording:
            return None

        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = CAPTURE_DIR / f"video_{timestamp}.h264"

            self.encoder = H264Encoder(bitrate=int(os.getenv('VIDEO_BITRATE', '10000000')))
            self.camera.start_recording(self.encoder, str(filename))

            self.recording = True
            print(f"Recording started: {filename}")
            return str(filename)

        except Exception as e:
            print(f"Error starting recording: {e}")
            return None

    def stop_recording(self):
        if not self.recording:
            return

        try:
            self.camera.stop_recording()
            self.recording = False
            print("Recording stopped")
            self.camera.start()

        except Exception as e:
            print(f"Error stopping recording: {e}")
            self.recording = False

    def zoom_in(self):
        self.current_zoom = min(MAX_ZOOM, self.current_zoom + ZOOM_STEP)
        self._apply_zoom()

    def zoom_out(self):
        self.current_zoom = max(MIN_ZOOM, self.current_zoom - ZOOM_STEP)
        self._apply_zoom()

    def _apply_zoom(self):
        if not self.initialized or self.sensor_size is None:
            return

        try:
            width, height = self.sensor_size

            crop_width = int(width / self.current_zoom)
            crop_height = int(height / self.current_zoom)

            x = (width - crop_width) // 2
            y = (height - crop_height) // 2

            self.camera.set_controls({
                "ScalerCrop": (x, y, crop_width, crop_height)
            })

            print(f"Zoom level: {self.current_zoom}x")

        except Exception as e:
            print(f"Error applying zoom: {e}")

    def get_camera_id(self):
        return self.camera_id

    def cleanup(self):
        if self.recording:
            self.stop_recording()

        if self.camera is not None:
            try:
                self.camera.stop()
                self.camera.close()
            except:
                pass


def get_location():
    """Fetch approximate location via IP geolocation. Returns dict or None."""
    try:
        resp = requests.get('http://ip-api.com/json?fields=lat,lon,city,regionName,country', timeout=4)
        if resp.status_code == 200:
            d = resp.json()
            parts = [d.get('city'), d.get('regionName'), d.get('country')]
            name = ', '.join(p for p in parts if p)
            return {'lat': d.get('lat'), 'lon': d.get('lon'), 'name': name}
    except Exception as e:
        print(f'Could not get location: {e}')
    return None


def sign_image(hardware_identity, image_path):
    """
    Sign an image file with hardware identity.
    Creates a signature file alongside the image.

    Args:
        hardware_identity: a HardwareIdentity instance (or None - returns None)
        image_path: Path to image file

    Returns:
        dict: Signature information, or None on failure
    """
    if not hardware_identity:
        return None

    try:
        with open(image_path, 'rb') as f:
            image_data = f.read()

        image_hash = hashlib.sha256(image_data).digest()
        image_hash_hex = image_hash.hex()

        signature_info = hardware_identity.sign_hash(image_hash)
        signature_info['image_hash'] = image_hash_hex
        signature_info['image_path'] = str(image_path)
        signature_info['timestamp'] = datetime.now().isoformat()

        sig_path = Path(image_path).with_suffix('.sig.json')
        with open(sig_path, 'w') as f:
            json.dump(signature_info, f, indent=2)

        print(f"Signature saved: {sig_path}")
        return signature_info

    except Exception as e:
        print(f"Error signing image: {e}")
        return None


def _pending_path_for(filename):
    stem = Path(filename).stem
    return PENDING_DIR / f"{stem}.json"


def _enqueue_pending(filename, signature_info, camera_id):
    pending_path = _pending_path_for(filename)
    with open(pending_path, 'w') as f:
        json.dump({
            'filename': str(filename),
            'signature_info': signature_info,
            'camera_id': camera_id,
        }, f, indent=2)
    print(f"Queued for retry: {pending_path}")


def _backend_reachable():
    for attempt in range(3):
        try:
            requests.get(f'{BACKEND_URL}/health', timeout=2)
            return True
        except:
            if attempt < 2:
                time.sleep(1)
    return False


def upload_and_create_claim(filename, signature_info, camera_id, status_callback=None):
    """
    Upload a captured photo and create its claim.

    Returns a dict describing the outcome:
      {'status': 'uploaded', 'claim_url': str, 'claim_id': str, 'image_id': str}
      {'status': 'no_claim', 'image_id': str}      -- uploaded, backend returned no claim
      {'status': 'queued'}                          -- offline or upload failed; queued to retry

    status_callback(message, level='info', duration=3) is called with
    human-readable progress, mirroring the Kivy app's old show_status calls.
    """
    status_callback = status_callback or _noop_callback

    if not _backend_reachable():
        print("Backend offline - saving to queue")
        status_callback('Offline - Saved Locally', 'warning', 4)
        _enqueue_pending(filename, signature_info, camera_id)
        return {'status': 'queued'}

    try:
        status_callback('Uploading to Filecoin...', 'info', 0)

        with open(filename, 'rb') as f:
            image_data = f.read()

        image_hash = hashlib.sha256(image_data).hexdigest()

        device_address = signature_info['address']
        location = get_location()

        files = {'image': (os.path.basename(filename), image_data, 'image/jpeg')}
        data = {
            'imageHash': image_hash,
            'signature': signature_info['signature'],
            'cameraId': camera_id,
            'deviceAddress': device_address,
            'latitude': str(location['lat']) if location else '',
            'longitude': str(location['lon']) if location else '',
            'locationName': location['name'] if location else ''
        }

        response = requests.post(
            f'{BACKEND_URL}/api/images/upload',
            files=files,
            data=data,
            timeout=60
        )

        if response.status_code == 200:
            result = response.json()

            if result.get('success'):
                claim_url = result.get('claimUrl') or result.get('qrCodeUrl')
                claim_id = result.get('claimId')
                image_id = result.get('imageId')

                if claim_url and claim_id:
                    status_callback('Uploaded -- Minting NFT...', 'success', 3)
                    return {
                        'status': 'uploaded',
                        'claim_url': claim_url,
                        'claim_id': claim_id,
                        'image_id': image_id,
                    }
                else:
                    status_callback('Saved (No Claim)', 'success', 3)
                    return {'status': 'no_claim', 'image_id': image_id}
            else:
                raise Exception(result.get('error', 'Upload failed'))
        else:
            raise Exception(f"HTTP {response.status_code}: {response.text}")

    except requests.exceptions.RequestException as e:
        print(f"Upload error: {e}")
        status_callback('Upload Failed -- Check Connection', 'error', 4)
        _enqueue_pending(filename, signature_info, camera_id)
        return {'status': 'queued'}
    except Exception as e:
        print(f"Error uploading: {e}")
        status_callback('Upload Error', 'error', 3)
        _enqueue_pending(filename, signature_info, camera_id)
        return {'status': 'queued'}


def retry_pending_uploads(status_callback=None):
    """
    Scan the on-disk retry queue and retry each entry. Removes a queue file
    on successful upload; leaves it in place (or lets upload_and_create_claim
    rewrite it) if still offline.

    Returns the list of outcome dicts (same shape as upload_and_create_claim)
    for entries that were retried.
    """
    status_callback = status_callback or _noop_callback

    outcomes = []
    for pending_path in sorted(PENDING_DIR.glob('*.json')):
        try:
            with open(pending_path, 'r') as f:
                entry = json.load(f)
        except Exception as e:
            print(f"Could not read pending entry {pending_path}: {e}")
            continue

        if not Path(entry['filename']).exists():
            print(f"Pending image missing on disk, dropping entry: {pending_path}")
            pending_path.unlink(missing_ok=True)
            continue

        result = upload_and_create_claim(
            entry['filename'],
            entry['signature_info'],
            entry['camera_id'],
            status_callback=status_callback,
        )
        outcomes.append(result)

        if result.get('status') in ('uploaded', 'no_claim'):
            pending_path.unlink(missing_ok=True)

    return outcomes
