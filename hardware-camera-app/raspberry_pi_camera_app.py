#!/usr/bin/env python3

import os
import time
from datetime import datetime
from pathlib import Path
import threading
import numpy as np
import cv2
import hashlib
import json
import requests
from io import BytesIO
import logging
from logging import Filter

try:
    from hardware_identity import get_hardware_identity
    HARDWARE_IDENTITY_AVAILABLE = True
except ImportError:
    HARDWARE_IDENTITY_AVAILABLE = False
    print("Warning: hardware_identity module not available - running in demo mode")

os.environ['KIVY_NO_ARGS'] = '1'
os.environ['KIVY_LOG_LEVEL'] = os.getenv('KIVY_LOG_LEVEL', 'info')

from kivy.config import Config
Config.set('graphics', 'borderless', '1')
Config.set('graphics', 'window_state', 'maximized')
Config.set('graphics', 'fullscreen', os.getenv('KIVY_FULLSCREEN', 'auto'))
Config.set('kivy', 'log_level', os.getenv('KIVY_LOG_LEVEL', 'info'))

from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.floatlayout import FloatLayout
from kivy.uix.gridlayout import GridLayout
from kivy.uix.scrollview import ScrollView
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.uix.image import Image
from kivy.clock import Clock
from kivy.core.window import Window
from kivy.graphics.texture import Texture
from kivy.graphics import Color, Rectangle, RoundedRectangle, Line, Ellipse, PushMatrix, PopMatrix, Rotate
from kivy.animation import Animation
from kivy.uix.screenmanager import ScreenManager, Screen
import glob

# Camera imports
try:
    from picamera2 import Picamera2
    from picamera2.encoders import H264Encoder
    from picamera2.outputs import FileOutput
    CAMERA_AVAILABLE = True
except ImportError:
    CAMERA_AVAILABLE = False
    print("Warning: Picamera2 not available. Running in demo mode.")

try:
    import smbus2 as smbus
    UPS_AVAILABLE = True
except ImportError:
    UPS_AVAILABLE = False

class ThrottledFilter(Filter):
    def __init__(self, pattern, interval=30):
        super().__init__()
        self.pattern = pattern
        self.interval = interval
        self.last_log_time = {}
    
    def filter(self, record):
        message = record.getMessage()
        if self.pattern in message:
            key = self.pattern
            now = time.time()
            
            if key not in self.last_log_time:
                self.last_log_time[key] = now
                return True
            
            if now - self.last_log_time[key] >= self.interval:
                self.last_log_time[key] = now
                return True
            
            return False
        
        return True

logging.basicConfig(level=logging.INFO)

kivy_logger = logging.getLogger('kivy')
kivy_logger.setLevel(logging.INFO)

throttle_filter = ThrottledFilter('Execute job', interval=30)
kivy_logger.addFilter(throttle_filter)

for handler in logging.root.handlers:
    handler.addFilter(ThrottledFilter('Execute job', interval=30))

picamera2_logger = logging.getLogger('picamera2')
picamera2_logger.setLevel(logging.INFO)

CAPTURE_DIR = Path(os.getenv('CAPTURE_DIR', str(Path.home() / "captures")))
CAPTURE_DIR.mkdir(parents=True, exist_ok=True)

BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:5000')
CLAIM_POLL_INTERVAL = int(os.getenv('CLAIM_POLL_INTERVAL', '5'))

try:
    import qrcode
    QRCODE_AVAILABLE = True
except ImportError:
    QRCODE_AVAILABLE = False
    print("Warning: qrcode library not available. Install with: pip3 install qrcode[pil]")

PREVIEW_SIZE = tuple(map(int, os.getenv('PREVIEW_SIZE', '1920,1080').split(',')))
PREVIEW_FRAMERATE = float(os.getenv('PREVIEW_FRAMERATE', '30'))
PHOTO_SIZE = tuple(map(int, os.getenv('PHOTO_SIZE', '1920,1080').split(',')))
VIDEO_SIZE = tuple(map(int, os.getenv('VIDEO_SIZE', '1280,720').split(',')))

MIN_ZOOM = float(os.getenv('MIN_ZOOM', '1.0'))
MAX_ZOOM = float(os.getenv('MAX_ZOOM', '4.0'))
ZOOM_STEP = float(os.getenv('ZOOM_STEP', '0.5'))

CAMERA_ROTATION = int(os.getenv('CAMERA_ROTATION', '270'))

class ModernCard(FloatLayout):
    """Modern card component with glass-morphism effects and elevation."""

    def __init__(self, card_color=(0.08, 0.12, 0.18, 0.92), shadow_color=(0, 0, 0, 0.15),
                 border_color=(1, 1, 1, 0.08), radius=16, elevation=4, **kwargs):

        # Extract our custom parameters
        self._card_color = list(card_color)
        self._shadow_color = list(shadow_color)
        self._border_color = list(border_color)
        self._radius = radius
        self._elevation = elevation

        # Remove our custom parameters from kwargs
        kwargs.pop('card_color', None)
        kwargs.pop('shadow_color', None)
        kwargs.pop('border_color', None)
        kwargs.pop('elevation', None)

        super().__init__(**kwargs)

        with self.canvas.before:
            # Shadow layer (multiple shadows for depth)
            Color(*shadow_color)
            self._shadow1 = RoundedRectangle(
                pos=(self.x + elevation, self.y - elevation),
                size=self.size, radius=[radius]
            )
            self._shadow2 = RoundedRectangle(
                pos=(self.x + elevation//2, self.y - elevation//2),
                size=self.size, radius=[radius]
            )

            # Glass background layers
            Color(*self._card_color)
            self._background = RoundedRectangle(
                pos=self.pos, size=self.size, radius=[radius]
            )

            # Subtle gradient overlay
            gradient_color = [min(1.0, c + 0.05) for c in self._card_color[:3]] + [0.3]
            Color(*gradient_color)
            self._gradient = RoundedRectangle(
                pos=self.pos, size=(self.size[0], self.size[1] * 0.3), radius=[radius, radius, 0, 0]
            )

            # Border highlight
            Color(*self._border_color)
            self._border = Line(rounded_rectangle=(self.pos[0], self.pos[1], self.size[0], self.size[1], radius), width=1.2)

        self.bind(pos=self._update_graphics, size=self._update_graphics)

    def _update_graphics(self, *args):
        """Update all graphic elements when position or size changes."""
        if hasattr(self, '_shadow1'):
            self._shadow1.pos = (self.x + self._elevation, self.y - self._elevation)
            self._shadow1.size = self.size
            self._shadow2.pos = (self.x + self._elevation//2, self.y - self._elevation//2)
            self._shadow2.size = self.size
            self._background.pos = self.pos
            self._background.size = self.size
            self._gradient.pos = self.pos
            self._gradient.size = (self.size[0], self.size[1] * 0.3)
            self._border.rounded_rectangle = (self.pos[0], self.pos[1], self.size[0], self.size[1], self._radius)


class AnimatedLabel(Label):
    """Enhanced label with smooth animations and effects."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._original_color = self.color[:]
        self.animation_duration = 0.3

    def animate_in(self, effect='fade'):
        """Animate label entry with specified effect."""
        if effect == 'fade':
            self.opacity = 0
            anim = Animation(opacity=1, duration=self.animation_duration, t='out_cubic')
            anim.start(self)
        elif effect == 'slide_up':
            original_y = self.y
            self.y -= 30
            self.opacity = 0
            anim = Animation(y=original_y, opacity=1, duration=self.animation_duration, t='out_back')
            anim.start(self)

    def animate_out(self, effect='fade', callback=None):
        """Animate label exit with specified effect."""
        if effect == 'fade':
            anim = Animation(opacity=0, duration=self.animation_duration, t='in_cubic')
        elif effect == 'slide_down':
            anim = Animation(y=self.y - 30, opacity=0, duration=self.animation_duration, t='in_back')

        if callback:
            anim.on_complete = callback
        anim.start(self)

    def pulse_color(self, target_color, duration=0.8):
        """Pulse to a target color and back."""
        anim1 = Animation(color=target_color, duration=duration/2, t='in_out_cubic')
        anim2 = Animation(color=self._original_color, duration=duration/2, t='in_out_cubic')
        anim1.bind(on_complete=lambda *args: anim2.start(self))
        anim1.start(self)


class RoundedButton(Button):
    """Enhanced button with modern glass-morphism effects and smooth animations."""

    def __init__(self, btn_color=(0.15, 0.18, 0.25, 1), radius=12, glow_color=None,
                 shadow_elevation=3, **kwargs):

        # Extract our custom parameters before calling super().__init__
        self._btn_color = list(btn_color)
        self._original_color = list(btn_color)
        self._btn_radius = radius
        self._shadow_elevation = shadow_elevation
        self._glow_color = glow_color or [min(1.0, c + 0.4) for c in btn_color[:3]] + [0.6]

        # Remove our custom parameters from kwargs before passing to Button
        kwargs.pop('btn_color', None)
        kwargs.pop('glow_color', None)
        kwargs.pop('shadow_elevation', None)

        super().__init__(**kwargs)
        self.background_normal = ''
        self.background_down = ''
        self.background_color = (0, 0, 0, 0)
        self._color_instr = None
        self._rect_instr = None
        self._shadow_instr = None
        self._border_instr = None
        self._glow_instr = None
        self._intercepting = False
        self._pressed = False

        with self.canvas.before:
            # Shadow effect
            Color(0, 0, 0, 0.2)
            self._shadow_instr = RoundedRectangle(
                pos=(self.x + shadow_elevation, self.y - shadow_elevation),
                size=self.size, radius=[self._btn_radius]
            )

            # Optional glow effect (hidden by default)
            Color(*self._glow_color)
            self._glow_instr = RoundedRectangle(
                pos=(self.x - 4, self.y - 4),
                size=(self.size[0] + 8, self.size[1] + 8),
                radius=[self._btn_radius + 4]
            )
            self._glow_instr.pos = self.pos  # Hide glow initially

            # Main button background with subtle gradient effect
            Color(*self._btn_color)
            self._color_instr = Color(*self._btn_color)
            self._rect_instr = RoundedRectangle(
                pos=self.pos, size=self.size, radius=[self._btn_radius]
            )

            # Subtle gradient overlay for depth
            gradient_color = [min(1.0, c + 0.1) for c in self._btn_color[:3]] + [0.4]
            Color(*gradient_color)
            self._gradient_instr = RoundedRectangle(
                pos=self.pos,
                size=(self.size[0], self.size[1] * 0.4),
                radius=[self._btn_radius, self._btn_radius, 0, 0]
            )

            # Subtle border highlight
            Color(1, 1, 1, 0.15)
            self._border_instr = Line(
                rounded_rectangle=(self.pos[0], self.pos[1], self.size[0], self.size[1], self._btn_radius),
                width=1.0
            )

        self.bind(pos=self._sync_rect, size=self._sync_rect)
        self.fbind('background_color', self._on_background_color)

    def _sync_rect(self, *args):
        """Update all visual elements when button position or size changes."""
        if self._rect_instr:
            # Shadow
            self._shadow_instr.pos = (self.x + self._shadow_elevation, self.y - self._shadow_elevation)
            self._shadow_instr.size = self.size

            # Main button
            self._rect_instr.pos = self.pos
            self._rect_instr.size = self.size

            # Gradient overlay
            self._gradient_instr.pos = self.pos
            self._gradient_instr.size = (self.size[0], self.size[1] * 0.4)

            # Border
            self._border_instr.rounded_rectangle = (
                self.pos[0], self.pos[1], self.size[0], self.size[1], self._btn_radius
            )

            # Glow (positioned but hidden unless activated)
            self._glow_instr.pos = (self.x - 4, self.y - 4)
            self._glow_instr.size = (self.size[0] + 8, self.size[1] + 8)

    def _on_background_color(self, instance, value):
        """Handle background color changes for custom rendering."""
        if self._intercepting:
            return
        if list(value) != [0, 0, 0, 0]:
            self._btn_color = list(value)
            if self._color_instr:
                self._color_instr.rgba = self._btn_color
            self._intercepting = True
            self.background_color = (0, 0, 0, 0)
            self._intercepting = False

    def on_press(self):
        """Enhanced press animation with scale and glow effects."""
        if self._color_instr and not self._pressed:
            self._pressed = True

            # Create darker pressed color
            pressed_color = [c * 0.75 for c in self._original_color[:3]] + [self._original_color[3]]

            # Animate color change and subtle scale
            color_anim = Animation(duration=0.1, t='out_cubic')
            scale_anim = Animation(size=(self.size[0] * 0.96, self.size[1] * 0.96), duration=0.1, t='out_cubic')

            # Update color immediately for responsiveness
            self._color_instr.rgba = pressed_color
            scale_anim.start(self)

    def on_release(self):
        """Enhanced release animation returning to original state."""
        if self._color_instr and self._pressed:
            self._pressed = False

            # Animate back to original color and size
            color_anim = Animation(duration=0.15, t='out_back')
            scale_anim = Animation(
                size=(self.size[0] / 0.96, self.size[1] / 0.96),
                duration=0.15, t='out_back'
            )

            # Return to original color
            self._color_instr.rgba = self._original_color
            scale_anim.start(self)

    def enable_glow(self, duration=0.3):
        """Show glow effect with smooth animation."""
        if self._glow_instr:
            self._glow_instr.pos = (self.x - 4, self.y - 4)
            glow_anim = Animation(duration=duration, t='out_cubic')
            glow_anim.start(self)

    def disable_glow(self, duration=0.2):
        """Hide glow effect with smooth animation."""
        if self._glow_instr:
            # Move glow off-screen to hide it
            glow_anim = Animation(duration=duration, t='in_cubic')
            glow_anim.start(self)


class BatteryMonitor:

    def __init__(self):
        self.simulated = not UPS_AVAILABLE
        self.bus = None
        self.address = int(os.getenv('UPS_I2C_ADDRESS', '0x36'), 16)
        
        if not self.simulated:
            try:
                self.bus = smbus.SMBus(int(os.getenv('I2C_BUS', '1')))
                try:
                    self.bus.read_i2c_block_data(self.address, 0x04, 2)
                    print("Battery monitor: Waveshare UPS HAT detected")
                except:
                    print("Battery monitor: I2C device not responding, using simulation")
                    self.simulated = True
            except Exception as e:
                print(f"Battery monitor: Initialization failed ({e}), using simulation")
                self.simulated = True

    def get_battery_level(self):
        if self.simulated:
            import random
            return random.randint(75, 100)

        try:
            soc_data = self.bus.read_i2c_block_data(self.address, 0x06, 2)
            
            percentage = soc_data[0]
            if percentage > 100:
                percentage = 100
            
            return min(100, max(0, percentage))
            
        except Exception as e:
            print(f"Battery read error: {e}")
            return 85


class CameraController:

    def __init__(self):
        self.camera = None
        self.recording = False
        self.encoder = None
        self.current_zoom = MIN_ZOOM
        self.sensor_size = None
        self.initialized = False
        self.camera_id = None

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
                    import hashlib
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
                    import hashlib
                    props_str = str(sorted(sensor_props.items()))
                    props_str += f"|size:{self.sensor_size[0]}x{self.sensor_size[1]}"
                    self.camera_id = hashlib.sha256(props_str.encode()).hexdigest()[:16]
                    print(f"Camera ID generated from properties hash: {self.camera_id}")
                
            except Exception as e:
                self.sensor_size = (2592, 1944)
                print(f"Warning: Could not extract camera ID: {e}")
                import hashlib
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
                    cv2.imwrite(str(filename), cv2.cvtColor(array, cv2.COLOR_RGB2BGR))
                else:
                    request.save("main", str(filename))
            else:
                request.save("main", str(filename))
            
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

class CameraApp(App):

    def build(self):
        Window.show_cursor = os.getenv('SHOW_CURSOR', 'true').lower() == 'true'

        self.root_layout = FloatLayout()

        # ── Camera Preview (full screen) ─────────────────────────────
        self.preview_image = Image(
            size_hint=(1, 1),
            pos_hint={'x': 0, 'y': 0},
            allow_stretch=True,
            keep_ratio=False
        )
        self.root_layout.add_widget(self.preview_image)

        # ── Enhanced Cinematic Viewfinder ────────────────────────────
        self._vf_widget = FloatLayout(
            size_hint=(0.80, 0.65),
            pos_hint={'center_x': 0.5, 'center_y': 0.52}
        )
        self._vf_widget.bind(pos=self._update_cinematic_viewfinder, size=self._update_cinematic_viewfinder)
        self.root_layout.add_widget(self._vf_widget)

        # ── Top HUD Bar (Modern Glass Design) ───────────────────────
        self.top_card = ModernCard(
            card_color=(0.03, 0.04, 0.07, 0.90),
            border_color=(0, 0.83, 0.75, 0.18),
            size_hint=(1.0, 0.07),
            pos_hint={'center_x': 0.5, 'top': 1.0},
            radius=0,
            elevation=4
        )

        self.top_bar = BoxLayout(
            orientation='horizontal',
            size_hint=(0.96, 0.80),
            pos_hint={'center_x': 0.5, 'center_y': 0.5},
            spacing=10,
            padding=[20, 0]
        )

        # Enhanced brand label with glow effect
        _brand = AnimatedLabel(
            text='[b][color=00D4C0]VERIS[/color][/b]  [color=8890A0]CAM[/color]',
            markup=True,
            size_hint=(0.25, 1),
            halign='left', valign='middle',
            font_size='15sp',
            color=(0.95, 0.95, 0.98, 1)
        )
        _brand.bind(size=_brand.setter('text_size'))

        self.datetime_label = AnimatedLabel(
            text='',
            size_hint=(0.40, 1),
            halign='center', valign='middle',
            font_size='12sp',
            color=(0.55, 0.60, 0.72, 1)
        )
        self.datetime_label.bind(size=self.datetime_label.setter('text_size'))

        # Battery indicator - minimal and clean
        self.battery_label = AnimatedLabel(
            text='--- %',
            size_hint=(0.18, 1),
            halign='right', valign='middle',
            font_size='12sp',
            bold=True,
            color=(0.30, 0.90, 0.60, 1)
        )
        self.battery_label.bind(size=self.battery_label.setter('text_size'))

        # Fund button - subtle accent
        self.fund_button = RoundedButton(
            text='FUND',
            font_size='11sp',
            size_hint=(0.10, 0.70),
            btn_color=(0, 0.52, 0.47, 0.85),
            glow_color=(0, 0.83, 0.75, 0.4),
            radius=10,
            color=(0.85, 1.0, 0.95, 1),
            bold=True
        )
        self.fund_button.bind(on_press=self._show_funding_qr_button)

        self.top_bar.add_widget(_brand)
        self.top_bar.add_widget(self.datetime_label)
        self.top_bar.add_widget(self.battery_label)
        self.top_bar.add_widget(self.fund_button)
        self.top_card.add_widget(self.top_bar)
        self.root_layout.add_widget(self.top_card)

        # ── Modern Floating Control Panel ───────────────────────────
        self.control_card = ModernCard(
            card_color=(0.03, 0.04, 0.06, 0.92),
            border_color=(0, 0.83, 0.75, 0.10),
            size_hint=(1.0, 0.16),
            pos_hint={'center_x': 0.5, 'y': 0},
            radius=0,
            elevation=6
        )

        self.control_panel = BoxLayout(
            orientation='horizontal',
            size_hint=(0.94, 0.75),
            pos_hint={'center_x': 0.5, 'center_y': 0.52},
            spacing=12,
            padding=[12, 0]
        )

        # Gallery button - clean and minimal
        self.gallery_button = RoundedButton(
            text='GALLERY',
            font_size='12sp',
            size_hint=(0.15, 0.85),
            btn_color=(0.12, 0.15, 0.22, 0.95),
            glow_color=(0.25, 0.35, 0.55, 0.4),
            radius=14,
            color=(0.65, 0.75, 0.92, 1),
            bold=True
        )
        self.gallery_button.bind(on_press=self.open_gallery)

        # Video button - distinct red accent
        self.video_button = RoundedButton(
            text='REC',
            font_size='13sp',
            size_hint=(0.15, 0.85),
            btn_color=(0.38, 0.10, 0.10, 0.95),
            glow_color=(0.8, 0.3, 0.3, 0.4),
            radius=14,
            color=(1.0, 0.7, 0.7, 1),
            bold=True
        )
        self.video_button.bind(on_press=self.toggle_recording)

        # Central shutter button - clean circular design
        self.photo_button = RoundedButton(
            text='',
            font_size='14sp',
            size_hint=(0.32, 1),
            btn_color=(0.95, 0.96, 0.98, 1),
            glow_color=(0, 0.83, 0.75, 0.6),
            radius=40,
            color=(0.05, 0.08, 0.12, 1),
            shadow_elevation=8,
            bold=True
        )
        self.photo_button.bind(on_press=self.take_photo)
        self.photo_button.bind(pos=self._draw_shutter_ring, size=self._draw_shutter_ring)

        # Zoom controls - compact vertical stack
        zoom_layout = BoxLayout(orientation='vertical', size_hint=(0.14, 0.85), spacing=6)

        self.zoom_in_button = RoundedButton(
            text='+',
            font_size='18sp',
            btn_color=(0.12, 0.16, 0.24, 0.95),
            glow_color=(0.3, 0.4, 0.6, 0.4),
            radius=10,
            color=(0.75, 0.82, 0.95, 1),
            bold=True
        )
        self.zoom_in_button.bind(on_press=self.zoom_in)

        self.zoom_out_button = RoundedButton(
            text='-',
            font_size='22sp',
            btn_color=(0.12, 0.16, 0.24, 0.95),
            glow_color=(0.3, 0.4, 0.6, 0.4),
            radius=10,
            color=(0.75, 0.82, 0.95, 1),
            bold=True
        )
        self.zoom_out_button.bind(on_press=self.zoom_out)

        zoom_layout.add_widget(self.zoom_in_button)
        zoom_layout.add_widget(self.zoom_out_button)

        # Exit button - minimal, tucked away
        self.quit_button = RoundedButton(
            text='X',
            font_size='16sp',
            size_hint=(0.09, 0.85),
            btn_color=(0.22, 0.06, 0.06, 0.85),
            glow_color=(0.5, 0.15, 0.15, 0.3),
            radius=14,
            color=(0.85, 0.45, 0.45, 1),
            bold=True
        )
        self.quit_button.bind(on_press=self.quit_app)

        self.control_panel.add_widget(self.gallery_button)
        self.control_panel.add_widget(self.video_button)
        self.control_panel.add_widget(self.photo_button)
        self.control_panel.add_widget(zoom_layout)
        self.control_panel.add_widget(self.quit_button)
        self.control_card.add_widget(self.control_panel)
        self.root_layout.add_widget(self.control_card)

        # ── Enhanced Modern Status Toast ────────────────────────────
        self.status_card = ModernCard(
            card_color=(0.06, 0.08, 0.12, 0.94),
            border_color=(0, 0.83, 0.75, 0.25),
            size_hint=(None, None),
            size=(360, 46),
            pos_hint={'center_x': 0.5, 'y': 0.19},
            radius=23,
            elevation=6
        )

        self.status_label = AnimatedLabel(
            text='',
            size_hint=(0.92, 0.85),
            pos_hint={'center_x': 0.5, 'center_y': 0.5},
            font_size='14sp',
            bold=True,
            color=(1, 1, 1, 1),
            halign='center', valign='middle'
        )
        self.status_label.bind(size=self.status_label.setter('text_size'))
        self.status_card.add_widget(self.status_label)
        self.root_layout.add_widget(self.status_card)

        # Initially hide the status card
        self.status_card.opacity = 0

        # ── Modern QR Overlay with Glass Effect ─────────────────────
        self.qr_overlay = FloatLayout()
        self.qr_overlay.opacity = 0

        # Enhanced backdrop with blur simulation
        with self.qr_overlay.canvas.before:
            Color(0.02, 0.03, 0.06, 0.94)
            self.qr_bg = Rectangle(size=Window.size, pos=(0, 0))

        # QR card - centered, clean
        qr_main_card = ModernCard(
            card_color=(0.06, 0.08, 0.12, 0.97),
            border_color=(0, 0.83, 0.75, 0.30),
            size_hint=(0.55, 0.82),
            pos_hint={'center_x': 0.5, 'center_y': 0.5},
            radius=20,
            elevation=10
        )

        qr_inner = BoxLayout(
            orientation='vertical',
            size_hint=(0.90, 0.94),
            pos_hint={'center_x': 0.5, 'center_y': 0.5},
            spacing=14
        )

        self.qr_title = AnimatedLabel(
            text='Scan QR Code',
            font_size='20sp',
            bold=True,
            color=(0.92, 0.95, 1.0, 1),
            size_hint=(1, 0.10),
            halign='center', valign='middle'
        )
        self.qr_title.bind(size=self.qr_title.setter('text_size'))

        # QR code display area
        qr_image_container = ModernCard(
            card_color=(0.96, 0.96, 0.98, 0.98),
            border_color=(0, 0.83, 0.75, 0.4),
            size_hint=(1, 0.60),
            radius=14,
            elevation=2
        )

        self.qr_image = Image(
            size_hint=(0.9, 0.9),
            pos_hint={'center_x': 0.5, 'center_y': 0.5},
            allow_stretch=True,
            keep_ratio=True
        )
        qr_image_container.add_widget(self.qr_image)

        self.qr_status = AnimatedLabel(
            text='Waiting for wallet address...',
            font_size='12sp',
            color=(0.55, 0.62, 0.78, 1),
            size_hint=(1, 0.18),
            halign='center', valign='middle'
        )
        self.qr_status.bind(size=self.qr_status.setter('text_size'))

        qr_close = RoundedButton(
            text='CLOSE',
            font_size='14sp',
            size_hint=(1, 0.10),
            btn_color=(0.28, 0.10, 0.10, 0.95),
            glow_color=(0.6, 0.25, 0.25, 0.3),
            radius=12,
            color=(0.92, 0.60, 0.60, 1),
            bold=True
        )
        qr_close.bind(on_press=self.close_qr_overlay)

        qr_inner.add_widget(self.qr_title)
        qr_inner.add_widget(qr_image_container)
        qr_inner.add_widget(self.qr_status)
        qr_inner.add_widget(qr_close)

        qr_main_card.add_widget(qr_inner)
        self.qr_overlay.add_widget(qr_main_card)
        self.root_layout.add_widget(self.qr_overlay)

        # ── State Init ────────────────────────────────────────────────
        self.active_claims = {}
        self.cleared_mint_status = set()

        self.camera = CameraController()
        self.battery_monitor = BatteryMonitor()

        self.hardware_identity = None
        camera_id = None

        self.camera_ready = False
        self.balance_check_passed = False

        if CAMERA_AVAILABLE:
            try:
                if self.camera.initialize():
                    camera_id = self.camera.get_camera_id()
                    self.camera_ready = True
                    print("Camera initialized successfully")
                else:
                    self.show_status('Camera Initialization Failed', 'error', 5)
                    print("Camera initialization failed")
            except Exception as e:
                self.show_status('Camera Not Found', 'error', 5)
                print(f"Camera error: {e}")
                try:
                    if self.camera.camera is not None:
                        self.camera.cleanup()
                except:
                    pass
        else:
            self.show_status('Demo Mode - Picamera2 Not Installed', 'warning', 5)
            print("Picamera2 not available - demo mode")

        if HARDWARE_IDENTITY_AVAILABLE:
            try:
                self.hardware_identity = get_hardware_identity(camera_id=camera_id)

                # Automatically export key for backend to use
                self._export_device_key()

                # Print all hardware information on initialization
                self._print_hardware_info()
            except Exception as e:
                print(f"Warning: Could not initialize hardware identity: {e}")
                self.hardware_identity = None

        # Check balance and show funding QR if needed
        if self.hardware_identity:
            Clock.schedule_once(lambda dt: self._check_balance_and_setup(), 1)

        # Schedule UI startup animations
        Clock.schedule_once(self._startup_animations, 0.1)

        # Schedule UI updates with enhanced effects
        Clock.schedule_interval(self.update_datetime, 1.0)
        Clock.schedule_interval(self.update_battery, 5.0)

        return self.root_layout

    def _draw_shutter_ring(self, *args):
        """Draw a professional shutter ring on the capture button."""
        btn = self.photo_button
        if not hasattr(btn, '_shutter_canvas'):
            from kivy.graphics import InstructionGroup
            btn._shutter_canvas = InstructionGroup()
            btn.canvas.after.add(btn._shutter_canvas)
        btn._shutter_canvas.clear()
        cx = btn.x + btn.width / 2
        cy = btn.y + btn.height / 2
        r = min(btn.width, btn.height) * 0.35
        btn._shutter_canvas.add(Color(0, 0.83, 0.75, 0.9))
        btn._shutter_canvas.add(Line(circle=(cx, cy, r), width=3.0))
        btn._shutter_canvas.add(Color(0.2, 0.22, 0.28, 0.9))
        btn._shutter_canvas.add(Ellipse(pos=(cx - r * 0.55, cy - r * 0.55), size=(r * 1.1, r * 1.1)))
        btn._shutter_canvas.add(Color(0.95, 0.96, 0.98, 1))
        btn._shutter_canvas.add(Ellipse(pos=(cx - r * 0.4, cy - r * 0.4), size=(r * 0.8, r * 0.8)))

    def _startup_animations(self, dt):
        """Perform smooth startup animations for UI elements."""
        # Animate top card sliding in from top
        self.top_card.y += 60
        self.top_card.opacity = 0
        slide_anim = Animation(y=self.top_card.y - 60, opacity=1, duration=0.8, t='out_back')
        slide_anim.start(self.top_card)

        # Animate bottom control panel sliding in from bottom
        Clock.schedule_once(lambda dt: self._animate_control_panel(), 0.3)

        # Animate brand label
        Clock.schedule_once(lambda dt: self.datetime_label.animate_in('fade'), 0.6)

    def _animate_control_panel(self):
        """Animate control panel entrance."""
        self.control_card.y -= 80
        self.control_card.opacity = 0
        slide_anim = Animation(y=self.control_card.y + 80, opacity=1, duration=0.9, t='out_back')
        slide_anim.start(self.control_card)

    def show_status(self, message, status_type='info', duration=3):
        """Enhanced status display with smooth animations and color coding."""
        # Status colors - clear but not harsh
        if status_type == 'success':
            self.status_label.color = (0.30, 0.92, 0.55, 1)
            border_color = (0.30, 0.92, 0.55, 0.45)
        elif status_type == 'error':
            self.status_label.color = (0.95, 0.40, 0.40, 1)
            border_color = (0.95, 0.40, 0.40, 0.45)
        elif status_type == 'warning':
            self.status_label.color = (0.95, 0.78, 0.28, 1)
            border_color = (0.95, 0.78, 0.28, 0.45)
        else:  # info
            self.status_label.color = (0.80, 0.86, 0.98, 1)
            border_color = (0, 0.75, 0.68, 0.45)

        # Update border color
        self.status_card._border_color = list(border_color)
        if hasattr(self.status_card, '_border_instr'):
            self.status_card._border_instr.rgba = border_color

        # Set message and animate in
        self.status_label.text = message
        self.status_card.opacity = 0
        self.status_card.y -= 20

        # Slide up and fade in
        slide_anim = Animation(y=self.status_card.y + 20, opacity=1, duration=0.4, t='out_back')
        slide_anim.start(self.status_card)

        # Auto-hide after duration
        def hide_status(dt):
            fade_anim = Animation(opacity=0, duration=0.3, t='in_cubic')
            fade_anim.start(self.status_card)

        Clock.schedule_once(hide_status, duration)
    
    def _update_cinematic_viewfinder(self, widget, value):
        """Clean, minimal viewfinder overlay."""
        x, y = widget.pos
        w, h = widget.size
        bl = 28   # bracket arm length
        lw = 2.0  # line width
        widget.canvas.clear()

        with widget.canvas:
            # Corner brackets - clean white
            Color(1, 1, 1, 0.50)
            Line(points=[x, y + bl, x, y, x + bl, y], width=lw, cap='square', joint='miter')
            Line(points=[x + w - bl, y, x + w, y, x + w, y + bl], width=lw, cap='square', joint='miter')
            Line(points=[x, y + h - bl, x, y + h, x + bl, y + h], width=lw, cap='square', joint='miter')
            Line(points=[x + w - bl, y + h, x + w, y + h, x + w, y + h - bl], width=lw, cap='square', joint='miter')

            # Rule of thirds - very subtle
            Color(1, 1, 1, 0.08)
            v1_x = x + w / 3
            v2_x = x + (2 * w) / 3
            Line(points=[v1_x, y, v1_x, y + h], width=0.8)
            Line(points=[v2_x, y, v2_x, y + h], width=0.8)
            h1_y = y + h / 3
            h2_y = y + (2 * h) / 3
            Line(points=[x, h1_y, x + w, h1_y], width=0.8)
            Line(points=[x, h2_y, x + w, h2_y], width=0.8)

            # Center focus - teal crosshair, small and precise
            Color(0, 0.83, 0.75, 0.55)
            center_x, center_y = x + w / 2, y + h / 2
            gap = 6
            arm = 14
            Line(points=[center_x - arm, center_y, center_x - gap, center_y], width=1.5)
            Line(points=[center_x + gap, center_y, center_x + arm, center_y], width=1.5)
            Line(points=[center_x, center_y - arm, center_x, center_y - gap], width=1.5)
            Line(points=[center_x, center_y + gap, center_x, center_y + arm], width=1.5)

    def _check_balance_and_setup(self):
        """Check wallet balance and setup camera stream if sufficient."""
        def check_thread():
            try:
                # Check balance via backend
                response = requests.get(
                    f'{BACKEND_URL}/api/balance',
                    timeout=10
                )
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get('success'):
                        address = result.get('address')
                        eth_data = result.get('eth', {})
                        usdfc_data = result.get('usdfc', {})
                        
                        balance_eth = eth_data.get('balanceEth', 0)
                        has_enough_eth = eth_data.get('hasEnoughBalance', False)
                        needs_eth_funding = eth_data.get('needsFunding', False)
                        
                        balance_usdfc = usdfc_data.get('balanceUsdfc', 0)
                        has_enough_usdfc = usdfc_data.get('hasEnoughBalance', False)
                        needs_usdfc_funding = usdfc_data.get('needsFunding', False)
                        usdfc_available = usdfc_data.get('available', True)
                        
                        has_enough = result.get('hasEnoughBalance', False)
                        
                        # Always start camera stream - show QR overlay if balance is low
                        Clock.schedule_once(
                            lambda dt: self._start_camera_stream(),
                            0
                        )
                        
                        # Device registration depends only on ETH balance (for gas fees)
                        if has_enough_eth:
                            # ETH balance sufficient - register device
                            Clock.schedule_once(
                                lambda dt: self._try_register_device(),
                                1
                            )
                            self.balance_check_passed = True
                            print(f"✅ ETH balance sufficient: {balance_eth} ETH - Device registration will proceed")
                        else:
                            # ETH balance too low - show funding QR
                            Clock.schedule_once(
                                lambda dt: self._show_funding_qr(address, balance_eth, 'ETH'),
                                0.5
                            )
                            print(f"⚠️ ETH balance too low: {balance_eth} ETH (need 0.01 ETH) - Device registration skipped")
                        
                        # Show USDFC funding QR if needed (but don't block registration)
                        if needs_usdfc_funding and usdfc_available:
                            Clock.schedule_once(
                                lambda dt: self._show_funding_qr(address, balance_usdfc, 'USDFC'),
                                0.5
                            )
                            print(f"⚠️ USDFC balance too low: {balance_usdfc} USDFC (need 0.1 USDFC) - Filecoin uploads may fail")
                            
                            # Start balance polling
                            Clock.schedule_once(
                                lambda dt: self._start_balance_polling(address),
                                1
                            )
                    else:
                        # Balance check failed - try to start anyway
                        print(f"⚠️ Balance check failed, starting camera anyway")
                        Clock.schedule_once(
                            lambda dt: self._start_camera_stream(),
                            0
                        )
                else:
                    # Backend not available - start camera anyway
                    print(f"⚠️ Backend not available, starting camera anyway")
                    Clock.schedule_once(
                        lambda dt: self._start_camera_stream(),
                        0
                    )
            except Exception as e:
                print(f"⚠️ Error checking balance: {e}")
                # Start camera anyway if check fails
                Clock.schedule_once(
                    lambda dt: self._start_camera_stream(),
                    0
                )
        
        threading.Thread(target=check_thread, daemon=True).start()
    
    def _start_camera_stream(self):
        """Start camera preview stream with enhanced feedback."""
        if CAMERA_AVAILABLE and self.camera.initialized:
            # Show ready status with success animation
            self.show_status('Camera Ready!', 'success', 3)

            # Schedule preview updates
            Clock.schedule_interval(self.update_preview, 1.0 / 30.0)  # 30 FPS
            self.camera_ready = True

            # Add a subtle glow to the photo button to indicate readiness
            Clock.schedule_once(lambda dt: self.photo_button.enable_glow(0.5), 3.5)
            Clock.schedule_once(lambda dt: self.photo_button.disable_glow(0.5), 5.0)
        else:
            self.show_status('Camera not available - Demo mode', 'warning', 5)
    
    def _show_funding_qr_button(self, instance):
        if self.hardware_identity:
            hw_info = self.hardware_identity.get_hardware_info()
            address = hw_info['address']
            self._show_funding_qr(address, 0, 'ETH')
    
    def _show_funding_qr(self, address, current_balance, token_type='ETH'):
        """Show QR code for funding the wallet with enhanced presentation."""
        if not QRCODE_AVAILABLE:
            if token_type == 'ETH':
                self.show_status(f'Low Balance: {current_balance:.4f} ETH - Fund: {address}', 'warning', 10)
            else:
                self.show_status(f'Low Balance: {current_balance:.4f} {token_type} - Fund: {address}', 'warning', 10)
            return

        try:
            # Use plain address - MetaMask can scan it directly
            funding_data = address

            # Generate QR code
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_L,
                box_size=10,
                border=4,
            )
            qr.add_data(funding_data)
            qr.make(fit=True)

            # Create image
            img = qr.make_image(fill_color="black", back_color="white")

            # Convert to bytes
            img_bytes = BytesIO()
            img.save(img_bytes, format='PNG')
            img_bytes.seek(0)

            # Save to temp file
            temp_path = Path(CAPTURE_DIR) / "funding_qr.png"
            with open(temp_path, 'wb') as f:
                f.write(img_bytes.read())

            # Update QR overlay for funding with enhanced styling
            self.qr_image.source = str(temp_path)
            self.qr_image.reload()

            # Update title and status text with better formatting
            self.qr_title.text = 'Fund Your Wallet'
            min_amount = '0.01 ETH' if token_type == 'ETH' else '0.1 USDFC'
            self.qr_status.text = f'Low Balance: {current_balance:.4f} {token_type}\n\nWallet Address:\n{address[:22]}...\n{address[-20:]}\n\nScan with MetaMask\nSend {min_amount} or more'
            self.qr_status.color = (1, 0.85, 0.3, 1)  # Warm yellow

            # Show overlay with smooth animation
            self.qr_overlay.opacity = 0
            fade_anim = Animation(opacity=1, duration=0.6, t='out_cubic')
            fade_anim.start(self.qr_overlay)

            # Update main status with enhanced styling
            self.show_status('Funding Required for Full Features', 'warning', 0)

        except Exception as e:
            print(f"Error generating funding QR: {e}")
            self.show_status(f'Fund wallet: {address[:20]}...', 'warning', 8)
    
    def _start_balance_polling(self, address):
        """Poll balance until sufficient funds are available."""
        def poll_balance(dt):
            if self.balance_check_passed:
                return False  # Stop polling
            
            try:
                response = requests.get(
                    f'{BACKEND_URL}/api/balance',
                    timeout=5
                )
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get('success'):
                        eth_data = result.get('eth', {})
                        balance_eth = eth_data.get('balanceEth', 0)
                        has_enough_eth = eth_data.get('hasEnoughBalance', False)
                        
                        # Update status
                        self.qr_status.text = f'Current Balance: {balance_eth:.4f} ETH\n\nWaiting for 0.01+ ETH...'
                        
                        if has_enough_eth:
                            # ETH balance is now sufficient - register device!
                            print(f"✅ ETH balance sufficient: {balance_eth} ETH")
                            self.balance_check_passed = True
                            
                            # Hide QR overlay
                            Clock.schedule_once(
                                lambda dt: setattr(self.qr_overlay, 'opacity', 0),
                                0
                            )
                            
                            # Start camera stream
                            Clock.schedule_once(
                                lambda dt: self._start_camera_stream(),
                                0
                            )
                            
                            # Register device (only depends on ETH balance for gas fees)
                            if self.hardware_identity and self.camera.initialized:
                                Clock.schedule_once(
                                    lambda dt: self._try_register_device(),
                                    1
                                )
                            
                            # Update status
                            Clock.schedule_once(
                                lambda dt: setattr(self.status_label, 'text', 'Ready'),
                                0
                            )
                            Clock.schedule_once(
                                lambda dt: setattr(self.status_label, 'color', (0, 1, 0, 1)),
                                0
                            )
                            
                            return False  # Stop polling
                            
            except Exception as e:
                print(f"Balance polling error: {e}")
            
            return True  # Continue polling
        
        # Poll every 10 seconds
        Clock.schedule_interval(poll_balance, 10)
    
    def _try_register_device(self):
        """Ensure device is registered and active with backend."""
        print("\n📋 [KIVY] Device registration check starting...")
        
        if not self.hardware_identity:
            print("   ❌ Hardware identity not available")
            return
        
        if not self.camera.initialized:
            print("   ❌ Camera not initialized")
            return
        
        print("   ✅ Hardware identity and camera ready")
        
        def register_thread():
            try:
                print("   🔄 Getting hardware info...")
                hw_info = self.hardware_identity.get_hardware_info()
                device_address = hw_info['address']
                public_key = hw_info['public_key_hex']
                camera_id = self.camera.get_camera_id()
                
                # Generate device ID from hardware info
                device_id = f"{device_address[:8]}_{camera_id[:8]}"
                
                print(f"   📊 Device details:")
                print(f"      Address: {device_address}")
                print(f"      Device ID: {device_id}")
                print(f"      Camera ID: {camera_id}")
                
                # Use ensure-registered endpoint which handles:
                # 1. Check if registered - if not, register
                # 2. Check if active - if not, activate
                print(f"   🔄 Calling {BACKEND_URL}/api/device/ensure-registered...")
                response = requests.post(
                    f'{BACKEND_URL}/api/device/ensure-registered',
                    json={
                        'deviceAddress': device_address,
                        'publicKey': public_key,
                        'deviceId': device_id,
                        'cameraId': camera_id,
                        'model': 'Raspberry Pi',
                        'firmwareVersion': '1.0.0'
                    },
                    timeout=30
                )
                
                print(f"   📊 Response status: {response.status_code}")
                
                if response.status_code == 200:
                    result = response.json()
                    print(f"   📊 Response: {result}")
                    
                    if result.get('success'):
                        if result.get('registered') and result.get('activated'):
                            if result.get('registrationTx'):
                                print(f"✅ Device registered: {result.get('registrationTx')}")
                            if result.get('activationTx'):
                                print(f"✅ Device activated: {result.get('activationTx')}")
                            if not result.get('registrationTx') and not result.get('activationTx'):
                                print("✅ Device already registered and active")
                        else:
                            print(f"⚠️ Device status: registered={result.get('registered')}, activated={result.get('activated')}")
                    else:
                        print(f"⚠️ Registration failed: {result.get('error')}")
                else:
                    print(f"⚠️ Registration failed: HTTP {response.status_code}")
                    try:
                        error_data = response.json()
                        print(f"   Error details: {error_data}")
                    except:
                        print(f"   Response text: {response.text}")
                    
            except requests.exceptions.RequestException as e:
                print(f"❌ Network error during registration: {e}")
            except Exception as e:
                print(f"❌ Could not register device: {e}")
                import traceback
                print(f"   Traceback: {traceback.format_exc()}")
        
        threading.Thread(target=register_thread, daemon=True).start()

    def update_preview(self, dt):
        """Update camera preview frame with rotation support."""
        frame = self.camera.get_frame()

        if frame is not None:
            try:
                # Get frame dimensions
                if len(frame.shape) == 3:
                    height, width, channels = frame.shape
                else:
                    height, width = frame.shape
                    channels = 1

                # Apply rotation if configured
                if CAMERA_ROTATION != 0:
                    # Calculate number of 90-degree rotations (k parameter for np.rot90)
                    # rot90 rotates counter-clockwise, so we need to adjust
                    # 90° clockwise = 270° counter-clockwise = k=3
                    # 180° = k=2
                    # 270° clockwise = 90° counter-clockwise = k=1
                    if CAMERA_ROTATION == 90:
                        k = 3  # 90° clockwise = 270° counter-clockwise
                    elif CAMERA_ROTATION == 180:
                        k = 2
                    elif CAMERA_ROTATION == 270:
                        k = 1  # 270° clockwise = 90° counter-clockwise
                    else:
                        k = 0
                    
                    if k > 0:
                        frame = np.rot90(frame, k=k)
                        # Swap width and height after 90/270 degree rotation
                        if CAMERA_ROTATION in [90, 270]:
                            width, height = height, width

                # Flip vertically for Kivy (if needed)
                frame = frame[::-1, :, :]

                # Convert to bytes
                buf = frame.tobytes()

                # Determine color format based on channels
                if channels == 3:
                    colorfmt = 'rgb'
                elif channels == 4:
                    colorfmt = 'rgba'
                else:
                    colorfmt = 'luminance'

                # Create texture with correct dimensions after rotation
                texture = Texture.create(size=(width, height), colorfmt=colorfmt)
                texture.blit_buffer(buf, colorfmt=colorfmt, bufferfmt='ubyte')

                self.preview_image.texture = texture
            except Exception as e:
                print(f"Preview error: {e}")

    def update_datetime(self, dt):
        """Update date/time display."""
        now = datetime.now()
        self.datetime_label.text = now.strftime("%Y-%m-%d %H:%M:%S")

    def _export_device_key(self):
        """Export device key to file for backend to use."""
        try:
            import json
            from pathlib import Path
            
            if not self.hardware_identity:
                return
            
            # Get hardware info
            hw_info = self.hardware_identity.get_hardware_info()
            private_key_hex = self.hardware_identity.private_key.to_string().hex()
            
            # Export data
            export_data = {
                'privateKey': f'0x{private_key_hex}',
                'address': hw_info['address'],
                'cameraId': hw_info['camera_id'],
                'publicKey': hw_info['public_key_hex']
            }
            
            # Write to file
            export_file = Path(__file__).parent / '.device_key_export'
            with open(export_file, 'w') as f:
                json.dump(export_data, f, indent=2)
            
            print(f"✅ Device key exported to: {export_file}")
            print(f"   Address: {export_data['address']}")
            print(f"   Camera ID: {export_data['cameraId']}")
        except Exception as e:
            print(f"⚠️ Could not export device key: {e}")
    
    def _print_hardware_info(self):
        """Print all hardware information on initialization."""
        print("\n" + "=" * 60)
        print("HARDWARE IDENTITY INFORMATION")
        print("=" * 60)
        
        if self.hardware_identity:
            hw_info = self.hardware_identity.get_hardware_info()
            print(f"✓ Public Address: {hw_info['address']}")
            print(f"✓ Camera ID: {hw_info['camera_id'] or 'Not available'}")
            print(f"✓ Public Key: {hw_info['public_key_hex'][:32]}...{hw_info['public_key_hex'][-8:]}")
            print(f"✓ Salt Path: {hw_info['salt_path']}")
            print(f"✓ Initialized: {hw_info['initialized']}")
        else:
            print("✗ Hardware identity not available")
        
        if self.camera and self.camera.initialized:
            print(f"✓ Camera ID: {self.camera.get_camera_id()}")
            print(f"✓ Camera Initialized: {self.camera.initialized}")
        else:
            print("✗ Camera not initialized")
        
        print("=" * 60 + "\n")
    
    def update_battery(self, dt):
        """Update battery level display."""
        level = self.battery_monitor.get_battery_level()
        self.battery_label.text = f'{level} %'

        # Subtle color transitions based on level
        if level < 20:
            self.battery_label.color = (0.95, 0.30, 0.30, 1)
        elif level < 50:
            self.battery_label.color = (0.95, 0.80, 0.30, 1)
        else:
            self.battery_label.color = (0.30, 0.90, 0.60, 1)

    def take_photo(self, instance):
        """Photo capture with clear progressive status feedback."""
        # Immediate visual feedback
        instance.enable_glow()
        self._create_camera_flash()
        self.show_status('Capturing...', 'info', 2)

        def capture_thread():
            filename = self.camera.take_photo()

            if not filename:
                Clock.schedule_once(
                    lambda dt: self.show_status('Capture Failed', 'error', 3), 0)
                Clock.schedule_once(lambda dt: instance.disable_glow(), 1)
                return

            Clock.schedule_once(
                lambda dt: self.show_status('Captured  --  Signing...', 'info', 3), 0)

            # Sign image
            signature_info = None
            if self.hardware_identity:
                try:
                    signature_info = self._sign_image(filename)
                    if signature_info:
                        print(f"Image signed: {signature_info['address']}")
                        Clock.schedule_once(
                            lambda dt: self.show_status('Signed  --  Uploading...', 'info', 0), 0.3)
                except Exception as e:
                    print(f"Warning: Could not sign image: {e}")

            if signature_info:
                self._upload_and_create_claim(filename, signature_info)
            else:
                Clock.schedule_once(
                    lambda dt: self.show_status('Signing Failed', 'error', 3), 0)

            Clock.schedule_once(lambda dt: instance.disable_glow(), 1)

        threading.Thread(target=capture_thread, daemon=True).start()

    def _create_camera_flash(self):
        """Quick, subtle flash feedback on capture."""
        flash_overlay = FloatLayout(size_hint=(1, 1), pos_hint={'x': 0, 'y': 0})

        with flash_overlay.canvas:
            Color(1, 1, 1, 0.5)
            flash_rect = Rectangle(pos=(0, 0), size=Window.size)

        self.root_layout.add_widget(flash_overlay)

        flash_anim = Animation(opacity=0, duration=0.12, t='out_cubic')
        flash_anim.bind(on_complete=lambda *args: self.root_layout.remove_widget(flash_overlay))
        flash_anim.start(flash_overlay)
    
    def _get_location(self):
        """Fetch approximate location via IP geolocation. Returns dict or None."""
        try:
            resp = requests.get('http://ip-api.com/json?fields=lat,lon,city,regionName,country', timeout=4)
            if resp.status_code == 200:
                d = resp.json()
                parts = [d.get('city'), d.get('regionName'), d.get('country')]
                name = ', '.join(p for p in parts if p)
                return {'lat': d.get('lat'), 'lon': d.get('lon'), 'name': name}
        except Exception as e:
            print(f'⚠️ Could not get location: {e}')
        return None

    def _upload_and_create_claim(self, filename, signature_info):
        """Enhanced upload with smooth progress feedback."""
        # Check if offline - save to queue
        try:
            # Try to ping backend first with retry
            online = False
            for attempt in range(3):
                try:
                    requests.get(f'{BACKEND_URL}/health', timeout=2)
                    online = True
                    break
                except:
                    if attempt < 2:
                        time.sleep(1)
                    else:
                        online = False
        except:
            online = False
            print("⚠️ Backend offline - saving to queue")
            Clock.schedule_once(
                lambda dt: self.show_status('Offline - Saved Locally', 'warning', 4),
                0
            )
            return

        try:
            Clock.schedule_once(
                lambda dt: self.show_status('Uploading to Filecoin...', 'info', 0),
                0
            )

            # Read image file
            with open(filename, 'rb') as f:
                image_data = f.read()

            # Compute image hash
            image_hash = hashlib.sha256(image_data).hexdigest()

            # Get device info
            device_address = signature_info['address']
            camera_id = self.camera.get_camera_id() if self.camera.initialized else 'unknown'

            # Get location via IP geolocation (best-effort)
            location = self._get_location()

            # Prepare multipart form data
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

            # Upload to backend
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
                        # Store claim for polling
                        self.active_claims[claim_id] = image_id

                        # Show success with clear next step
                        Clock.schedule_once(
                            lambda dt: self.show_status('Uploaded -- Minting NFT...', 'success', 3),
                            0
                        )

                        # Display QR code for claiming editions
                        Clock.schedule_once(
                            lambda dt: self._show_qr_code(claim_url, claim_id),
                            2
                        )

                        # Start polling for claim status
                        Clock.schedule_once(
                            lambda dt: self._start_claim_polling(claim_id),
                            0
                        )
                    else:
                        Clock.schedule_once(
                            lambda dt: self.show_status('Saved (No Claim)', 'success', 3),
                            0
                        )
                else:
                    raise Exception(result.get('error', 'Upload failed'))
            else:
                raise Exception(f"HTTP {response.status_code}: {response.text}")

        except requests.exceptions.RequestException as e:
            print(f"Upload error: {e}")
            Clock.schedule_once(
                lambda dt: self.show_status('Upload Failed -- Check Connection', 'error', 4),
                0
            )
        except Exception as e:
            print(f"Error uploading: {e}")
            Clock.schedule_once(
                lambda dt: self.show_status('Upload Error', 'error', 3),
                0
            )
    
    def _generate_qr_image(self, data, out_path):
        """Generate QR code PNG to out_path. Tries local library first, then online API."""
        if QRCODE_AVAILABLE:
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_L,
                box_size=10,
                border=4,
            )
            qr.add_data(data)
            qr.make(fit=True)
            img = qr.make_image(fill_color="black", back_color="white")
            img_bytes = BytesIO()
            img.save(img_bytes, format='PNG')
            with open(out_path, 'wb') as f:
                f.write(img_bytes.getvalue())
            return True

        # Fallback: download from free QR API (no extra library needed)
        try:
            import urllib.request
            api_url = f"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data={urllib.request.quote(data, safe='')}"
            urllib.request.urlretrieve(api_url, out_path)
            return True
        except Exception as e:
            print(f"Online QR fallback failed: {e}")
            return False

    def _show_qr_code(self, claim_url, claim_id):
        """Display QR code overlay with smooth animations."""
        try:
            temp_path = Path(CAPTURE_DIR) / f"qr_{claim_id}.png"
            ok = self._generate_qr_image(claim_url, str(temp_path))

            print(f"QR Debug: Generated QR code: {ok}, Path: {temp_path}")

            if ok and temp_path.exists():
                self.qr_image.source = str(temp_path)
                self.qr_image.reload()
                print(f"QR Debug: QR image loaded successfully")
            else:
                self.qr_image.source = ''
                print(f"QR Debug: Failed to generate or load QR image")

            # Update content with enhanced styling
            self.qr_title.text = 'Scan to Claim NFT'
            self.qr_status.text = claim_url if not ok else 'Share this QR code to let others mint NFT editions'
            self.qr_status.color = (0.75, 0.82, 0.95, 1)

            print(f"QR Debug: About to show overlay")

            # Animate overlay appearance
            self.qr_overlay.opacity = 0

            # Simple fade-in first to test
            def show_overlay(dt):
                print(f"QR Debug: Setting overlay opacity to 1")
                self.qr_overlay.opacity = 1

            Clock.schedule_once(show_overlay, 0.1)

            # Show immediate status
            self.show_status('QR Code Ready - Check display', 'success', 3)

        except Exception as e:
            print(f"Error generating QR code: {e}")
            import traceback
            traceback.print_exc()

            # Show error and simple text fallback
            self.qr_title.text = 'NFT Claim URL'
            self.qr_status.text = f"URL: {claim_url}"
            self.qr_image.source = ''  # Clear any existing image

            # Still show the overlay with the URL text
            self.qr_overlay.opacity = 1
            self.show_status('QR generation failed - showing URL', 'warning', 5)

    def close_qr_overlay(self, instance):
        """Close QR code overlay with smooth animation."""
        fade_anim = Animation(opacity=0, duration=0.4, t='in_cubic')
        fade_anim.start(self.qr_overlay)
    
    def _start_claim_polling(self, claim_id):
        """Start polling for claim status."""
        def poll_claim(dt):
            if claim_id not in self.active_claims:
                return False  # Stop polling
            
            try:
                response = requests.get(
                    f'{BACKEND_URL}/api/claims/check',
                    params={'claim_id': claim_id},
                    timeout=5
                )
                
                if response.status_code == 200:
                    result = response.json()
                    
                    if result.get('success'):
                        status = result.get('status')
                        recipient = result.get('recipient_address')
                        
                        if status == 'claimed' and recipient:
                            self.qr_status.text = f'Address received\nMinting NFT to:\n{recipient[:10]}...{recipient[-8:]}'
                            self.qr_status.color = (0, 1, 0, 1)  # Green
                        elif status == 'completed':
                            token_id = result.get('token_id')
                            self.qr_status.text = f'Original Minted\nToken ID: {token_id}\n\nScan QR to mint editions'
                            self.qr_status.color = (0, 1, 0, 1)  # Green
                            
                            # Update status label
                            Clock.schedule_once(
                                lambda dt: setattr(self.status_label, 'text', f'Minted #{token_id}'),
                                0
                            )
                            
                            # Clear status label after 10 seconds (only once per claim)
                            if claim_id not in self.cleared_mint_status:
                                Clock.schedule_once(
                                    lambda dt: setattr(self.status_label, 'text', ''),
                                    10
                                )
                                self.cleared_mint_status.add(claim_id)
                            
                            # Keep QR code visible for others to mint editions
                            # Don't stop polling - keep showing QR for edition minting
                            # del self.active_claims[claim_id]
                            # return False
                        else:
                            self.qr_status.text = 'Waiting for wallet address...'
                            self.qr_status.color = (1, 1, 1, 1)  # White
                            
            except Exception as e:
                print(f"Polling error: {e}")
            
            return True  # Continue polling
        
        # Schedule polling
        Clock.schedule_interval(poll_claim, CLAIM_POLL_INTERVAL)
    
    def _sign_image(self, image_path):
        """
        Sign an image file with hardware identity.
        Creates a signature file alongside the image.
        
        Args:
            image_path: Path to image file
            
        Returns:
            dict: Signature information
        """
        if not self.hardware_identity:
            return None
        
        try:
            # Read image file and compute hash
            with open(image_path, 'rb') as f:
                image_data = f.read()
            
            # Compute SHA256 hash of image
            image_hash = hashlib.sha256(image_data).digest()
            image_hash_hex = image_hash.hex()
            
            # Sign the hash
            signature_info = self.hardware_identity.sign_hash(image_hash)
            signature_info['image_hash'] = image_hash_hex
            signature_info['image_path'] = str(image_path)
            signature_info['timestamp'] = datetime.now().isoformat()
            
            # Save signature to JSON file
            sig_path = Path(image_path).with_suffix('.sig.json')
            with open(sig_path, 'w') as f:
                json.dump(signature_info, f, indent=2)
            
            print(f"Signature saved: {sig_path}")
            return signature_info
            
        except Exception as e:
            print(f"Error signing image: {e}")
            return None

    def toggle_recording(self, instance):
        """Enhanced video recording with visual feedback."""
        if not self.camera.recording:
            # Start recording with visual feedback
            instance.enable_glow()
            filename = self.camera.start_recording()

            if filename:
                # Animate button state change
                instance.text = 'STOP'
                new_color = [0.8, 0.4, 0.1, 1]
                color_anim = Animation(duration=0.3, t='out_cubic')
                # Update button colors manually for recording state
                instance._btn_color = new_color
                if instance._color_instr:
                    instance._color_instr.rgba = new_color

                # Show recording status with pulsing effect
                self.show_status('REC', 'error', 0)  # Keep showing until stop

                # Make status pulse during recording
                def pulse_recording_status(dt):
                    if self.camera.recording and self.status_card.opacity > 0:
                        self.status_label.pulse_color((1, 0.2, 0.2, 1), 1.5)
                        return True  # Continue pulsing
                    return False

                Clock.schedule_interval(pulse_recording_status, 2.0)
            else:
                instance.disable_glow()
                self.show_status('Recording Failed', 'error', 3)
        else:
            # Stop recording
            self.camera.stop_recording()

            # Animate button back to original state
            instance.text = 'REC'
            original_color = [0.38, 0.10, 0.10, 0.95]
            instance._btn_color = original_color
            if instance._color_instr:
                instance._color_instr.rgba = original_color

            instance.disable_glow()
            self.show_status('Video Saved', 'success', 2)

    def zoom_in(self, instance):
        """Enhanced zoom with visual feedback."""
        instance.enable_glow(0.2)
        self.camera.zoom_in()

        # Show zoom level with smooth animation
        self.show_status(f'Zoom: {self.camera.current_zoom:.1f}x', 'info', 1.5)

        # Disable glow after short time
        Clock.schedule_once(lambda dt: instance.disable_glow(0.2), 0.3)

    def zoom_out(self, instance):
        """Enhanced zoom out with visual feedback."""
        instance.enable_glow(0.2)
        self.camera.zoom_out()

        # Show zoom level with smooth animation
        self.show_status(f'Zoom: {self.camera.current_zoom:.1f}x', 'info', 1.5)

        # Disable glow after short time
        Clock.schedule_once(lambda dt: instance.disable_glow(0.2), 0.3)

    def show_error(self, message):
        """Display error message using enhanced status system."""
        print(f"ERROR: {message}")
        self.show_status(f'Error: {message}', 'error', 5)

    def open_gallery(self, instance):
        """Open modern gallery view with enhanced styling."""
        # Add glow effect to button
        instance.enable_glow(0.3)

        # Create modern gallery overlay
        self.gallery_overlay = FloatLayout()

        # Enhanced backdrop
        with self.gallery_overlay.canvas.before:
            Color(0.02, 0.03, 0.06, 0.96)
            self.gallery_bg = Rectangle(size=Window.size, pos=(0, 0))

        # Gallery container - full screen, dark
        gallery_main_card = ModernCard(
            card_color=(0.04, 0.05, 0.08, 0.98),
            border_color=(0, 0.83, 0.75, 0.12),
            size_hint=(1, 1),
            pos_hint={'center_x': 0.5, 'center_y': 0.5},
            radius=0,
            elevation=0
        )

        gallery_container = BoxLayout(
            orientation='vertical',
            size_hint=(0.96, 0.96),
            pos_hint={'center_x': 0.5, 'center_y': 0.5},
            spacing=12,
            padding=[12, 12]
        )

        # Gallery top bar - minimal
        top_bar = BoxLayout(
            orientation='horizontal',
            size_hint=(1, 0.08),
            spacing=12,
            padding=[0, 4]
        )

        title = AnimatedLabel(
            text='[b][color=00D4C0]GALLERY[/color][/b]',
            markup=True,
            font_size='20sp',
            size_hint=(0.55, 1),
            halign='left', valign='middle',
            color=(0.92, 0.94, 0.98, 1),
        )
        title.bind(size=title.setter('text_size'))

        quit_gallery_button = RoundedButton(
            text='CAMERA',
            font_size='13sp',
            size_hint=(0.28, 0.85),
            btn_color=(0, 0.42, 0.38, 0.90),
            glow_color=(0, 0.7, 0.6, 0.3),
            radius=12,
            color=(0.75, 1.0, 0.92, 1),
            bold=True
        )
        quit_gallery_button.bind(on_press=self.quit_gallery)

        close_button = RoundedButton(
            text='X',
            font_size='16sp',
            size_hint=(0.12, 0.85),
            btn_color=(0.22, 0.08, 0.08, 0.90),
            glow_color=(0.5, 0.2, 0.2, 0.3),
            radius=12,
            color=(0.85, 0.50, 0.50, 1),
            bold=True
        )
        close_button.bind(on_press=self.close_gallery)

        top_bar.add_widget(title)
        top_bar.add_widget(quit_gallery_button)
        top_bar.add_widget(close_button)

        self.gallery_scroll_view = ScrollView(
            size_hint=(1, 0.92),
            bar_width=6,
            scroll_type=['bars', 'content'],
            bar_color=(0, 0.70, 0.63, 0.6),
            bar_inactive_color=(0.20, 0.24, 0.35, 0.3)
        )

        self.gallery_grid = GridLayout(
            cols=3,
            spacing=12,
            size_hint_y=None,
            padding=[6, 8]
        )
        self.gallery_grid.bind(minimum_height=self.gallery_grid.setter('height'))

        self.load_gallery_items()

        self.gallery_scroll_view.add_widget(self.gallery_grid)
        gallery_container.add_widget(top_bar)
        gallery_container.add_widget(self.gallery_scroll_view)

        gallery_main_card.add_widget(gallery_container)
        self.gallery_overlay.add_widget(gallery_main_card)

        # Animate gallery entrance
        self.gallery_overlay.opacity = 0
        self.root_layout.add_widget(self.gallery_overlay)

        # Smooth fade-in animation
        fade_anim = Animation(opacity=1, duration=0.5, t='out_cubic')
        fade_anim.start(self.gallery_overlay)

        # Animate title
        Clock.schedule_once(lambda dt: title.animate_in('slide_up'), 0.2)

        # Disable button glow after opening
        Clock.schedule_once(lambda dt: instance.disable_glow(0.3), 0.5)

    def load_gallery_items(self):
        """Load and display photos and videos with modern card styling."""
        # Clear existing items
        self.gallery_grid.clear_widgets()

        # Get all photos and videos
        photos = sorted(glob.glob(str(CAPTURE_DIR / "photo_*.jpg")), reverse=True)
        videos = sorted(glob.glob(str(CAPTURE_DIR / "video_*.h264")), reverse=True)

        all_media = []
        for photo in photos:
            all_media.append(('photo', photo))
        for video in videos:
            all_media.append(('video', video))

        # Sort by filename (which includes timestamp)
        all_media.sort(key=lambda x: x[1], reverse=True)

        if not all_media:
            no_files_card = ModernCard(
                card_color=(0.08, 0.12, 0.18, 0.6),
                border_color=(0, 0.83, 0.75, 0.2),
                size_hint_y=None,
                height=360,
                radius=18,
                elevation=2
            )

            no_files_label = AnimatedLabel(
                text='[b][color=00D4C0]EMPTY[/color][/b]\n\nNo captures yet\n\nTake a photo to get started',
                markup=True,
                font_size='22sp',
                halign='center', valign='middle',
                color=(0.45, 0.52, 0.68, 1),
                size_hint=(0.9, 0.9),
                pos_hint={'center_x': 0.5, 'center_y': 0.5}
            )
            no_files_label.bind(size=no_files_label.setter('text_size'))
            no_files_card.add_widget(no_files_label)
            self.gallery_grid.add_widget(no_files_card)

            # Animate the empty state message
            Clock.schedule_once(lambda dt: no_files_label.animate_in('fade'), 0.2)
            return

        for media_type, filepath in all_media:
            # Card for each media item
            item_card = ModernCard(
                card_color=(0.08, 0.10, 0.16, 0.90),
                border_color=(0.15, 0.18, 0.25, 0.5),
                size_hint_y=None,
                height=260,
                radius=12,
                elevation=3
            )

            item_layout = BoxLayout(
                orientation='vertical',
                size_hint=(0.92, 0.92),
                pos_hint={'center_x': 0.5, 'center_y': 0.5},
                spacing=6
            )

            if media_type == 'photo':
                thumb_container = ModernCard(
                    card_color=(0.12, 0.14, 0.18, 1),
                    border_color=(0.2, 0.22, 0.28, 0.6),
                    size_hint=(1, 0.85),
                    radius=10,
                    elevation=1
                )

                thumb_button = Button(
                    background_normal=filepath,
                    background_down=filepath,
                    size_hint=(0.94, 0.94),
                    pos_hint={'center_x': 0.5, 'center_y': 0.5},
                    border=(0, 0, 0, 0)
                )
                thumb_container.add_widget(thumb_button)
            else:
                thumb_container = RoundedButton(
                    text='VIDEO',
                    font_size='16sp',
                    btn_color=(0.12, 0.14, 0.20, 0.95),
                    glow_color=(0.3, 0.4, 0.6, 0.3),
                    radius=10,
                    size_hint=(1, 0.85),
                    color=(0.60, 0.70, 0.88, 1),
                    bold=True
                )
                thumb_button = thumb_container

            thumb_button.filepath = filepath
            thumb_button.media_type = media_type
            thumb_button.bind(on_press=self.view_media)

            # Enhanced timestamp label
            filename = os.path.basename(filepath)
            try:
                date_part = filename[6:14]
                time_part = filename[15:21]
                icon = 'PIC' if media_type == 'photo' else 'VID'
                label_text = (
                    f'{icon}  {date_part[:4]}-{date_part[4:6]}-{date_part[6:]}'
                    f'  {time_part[:2]}:{time_part[2:4]}'
                )
            except Exception:
                label_text = filename[6:21]

            label = AnimatedLabel(
                text=label_text,
                font_size='11sp',
                size_hint=(1, 0.15),
                color=(0.50, 0.58, 0.72, 1),
                halign='center', valign='middle',
                bold=False
            )
            label.bind(size=label.setter('text_size'))

            if media_type == 'photo':
                item_layout.add_widget(thumb_container)
            else:
                item_layout.add_widget(thumb_container)

            item_layout.add_widget(label)
            item_card.add_widget(item_layout)
            self.gallery_grid.add_widget(item_card)

    def view_media(self, instance):
        """View selected photo or video in full screen."""
        filepath = instance.filepath
        media_type = instance.media_type

        self.viewer_overlay = FloatLayout()

        with self.viewer_overlay.canvas.before:
            Color(0, 0, 0, 1)
            self.viewer_bg = Rectangle(size=Window.size, pos=(0, 0))

        viewer_container = BoxLayout(
            orientation='vertical',
            size_hint=(1, 1),
            spacing=0
        )

        if media_type == 'photo':
            media_widget = Image(
                source=filepath,
                allow_stretch=True,
                keep_ratio=True,
                size_hint=(1, 0.91)
            )
            media_widget.bind(on_touch_down=lambda w, t: True)
        else:
            media_widget = BoxLayout(
                orientation='vertical',
                size_hint=(1, 0.91),
                padding=50
            )
            video_info = Label(
                text=(
                    f'[b][color=00D4C0]VIDEO[/color][/b]\n\n'
                    f'{os.path.basename(filepath)}\n\n'
                    f'Recorded successfully'
                ),
                markup=True,
                font_size='20sp',
                halign='center', valign='middle',
                color=(0.72, 0.75, 0.85, 1),
            )
            video_info.bind(size=video_info.setter('text_size'))
            media_widget.add_widget(video_info)

        controls = BoxLayout(
            orientation='horizontal',
            size_hint=(1, 0.08),
            spacing=10,
            padding=[16, 6]
        )
        with controls.canvas.before:
            Color(0.03, 0.04, 0.06, 0.96)
            self._viewer_ctrl_bg = Rectangle(pos=controls.pos, size=controls.size)
        controls.bind(
            pos=lambda w, v: setattr(self._viewer_ctrl_bg, 'pos', v),
            size=lambda w, v: setattr(self._viewer_ctrl_bg, 'size', v)
        )

        back_button = RoundedButton(
            text='BACK',
            font_size='15sp',
            size_hint=(0.30, 1),
            btn_color=(0.11, 0.14, 0.24, 1),
            radius=12,
            color=(0.58, 0.70, 0.96, 1),
            bold=True
        )
        back_button.bind(on_press=lambda btn: self.close_viewer(btn))

        delete_button = RoundedButton(
            text='DELETE',
            font_size='15sp',
            size_hint=(0.28, 1),
            btn_color=(0.35, 0.08, 0.08, 1),
            radius=12,
            color=(0.95, 0.48, 0.48, 1),
            bold=True
        )
        delete_button.filepath = filepath
        delete_button.bind(on_press=self.delete_media)

        spacer = Label(size_hint=(0.42, 1))

        controls.add_widget(back_button)
        controls.add_widget(spacer)
        controls.add_widget(delete_button)

        viewer_container.add_widget(media_widget)
        viewer_container.add_widget(controls)

        self.viewer_overlay.add_widget(viewer_container)
        if hasattr(self, 'gallery_overlay'):
            self.gallery_overlay.opacity = 1
            self.gallery_overlay.add_widget(self.viewer_overlay)
        else:
            self.root_layout.add_widget(self.viewer_overlay)

    def close_viewer(self, instance):
        """Close media viewer and return to gallery grid."""
        print("Closing viewer and returning to gallery grid...")
        
        # Store reference to viewer overlay before removal
        viewer_to_remove = None
        if hasattr(self, 'viewer_overlay'):
            viewer_to_remove = self.viewer_overlay
        
        # Remove viewer overlay from wherever it is
        if viewer_to_remove:
            try:
                # Try to remove from gallery overlay first
                if hasattr(self, 'gallery_overlay') and viewer_to_remove.parent == self.gallery_overlay:
                    self.gallery_overlay.remove_widget(viewer_to_remove)
                    print("Removed viewer from gallery overlay")
                # Try to remove from root layout
                elif viewer_to_remove.parent == self.root_layout:
                    self.root_layout.remove_widget(viewer_to_remove)
                    print("Removed viewer from root layout")
                # Fallback: try to remove from children list
                elif hasattr(self, 'gallery_overlay') and viewer_to_remove in self.gallery_overlay.children:
                    self.gallery_overlay.remove_widget(viewer_to_remove)
                    print("Removed viewer from gallery overlay (fallback)")
                elif viewer_to_remove in self.root_layout.children:
                    self.root_layout.remove_widget(viewer_to_remove)
                    print("Removed viewer from root layout (fallback)")
            except Exception as e:
                print(f"Error removing viewer overlay: {e}")
            finally:
                # Clean up the viewer overlay reference
                if hasattr(self, 'viewer_overlay'):
                    del self.viewer_overlay
        
        # Ensure gallery grid is visible and properly displayed
        if hasattr(self, 'gallery_overlay'):
            # Make sure gallery overlay is visible and on top
            self.gallery_overlay.opacity = 1
            # Ensure gallery grid exists and is visible
            if hasattr(self, 'gallery_grid'):
                self.gallery_grid.opacity = 1
                # Make sure grid is enabled and can receive events
                self.gallery_grid.disabled = False
            # Ensure scroll view is also visible if it exists
            if hasattr(self, 'gallery_scroll_view'):
                self.gallery_scroll_view.opacity = 1
                self.gallery_scroll_view.disabled = False
            # Bring gallery overlay to front to ensure it's visible
            if self.gallery_overlay.parent:
                self.gallery_overlay.parent.remove_widget(self.gallery_overlay)
                self.root_layout.add_widget(self.gallery_overlay)
            print("Gallery grid should now be visible")

    def delete_media(self, instance):
        """Delete selected media file."""
        filepath = instance.filepath
        try:
            os.remove(filepath)
            print(f"Deleted: {filepath}")

            # Close viewer
            self.close_viewer(instance)

            # Reload gallery
            self.load_gallery_items()
        except Exception as e:
            print(f"Error deleting file: {e}")

    def quit_gallery(self, instance):
        """Quit gallery and return to camera view."""
        if hasattr(self, 'gallery_overlay'):
            self.root_layout.remove_widget(self.gallery_overlay)
            del self.gallery_overlay
        # Ensure camera preview is visible
        if hasattr(self, 'preview_image'):
            self.preview_image.opacity = 1
        print("Returned to camera view from gallery")

    def close_gallery(self, instance):
        """Close gallery view."""
        if hasattr(self, 'gallery_overlay'):
            self.root_layout.remove_widget(self.gallery_overlay)
            del self.gallery_overlay

    def quit_app(self, instance):
        """Quit the application cleanly."""
        print("Quitting application...")
        self.camera.cleanup()
        App.get_running_app().stop()

    def on_stop(self):
        """Clean up when app closes."""
        if self.camera:
            try:
                self.camera.cleanup()
            except:
                pass
        self.camera.cleanup()

if __name__ == '__main__':
    # Ensure capture directory exists
    CAPTURE_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Raspberry Pi Camera App")
    print("=" * 60)
    print(f"Capture directory: {CAPTURE_DIR}")
    print(f"Camera available: {CAMERA_AVAILABLE}")
    print(f"Battery monitor: {'Simulated' if not UPS_AVAILABLE else 'Real'}")
    print(f"Hardware identity: {'Available' if HARDWARE_IDENTITY_AVAILABLE else 'Not available'}")
    print("=" * 60)
    print("Initializing hardware identity and camera...")
    print("(Hardware details will be printed after initialization)")
    print("=" * 60 + "\n")

    # Run the app
    CameraApp().run()
