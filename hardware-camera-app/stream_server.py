import io
import socketserver
import threading
from http import server
from picamera2 import Picamera2
from picamera2.outputs import FileOutput
from picamera2.encoders import MJPEGEncoder

PORT = 8081

class StreamOutput(io.BufferedIOBase):
    def __init__(self):
        self.frame = None
        self.condition = threading.Condition()

    def write(self, buf):
        with self.condition:
            self.frame = buf
            self.condition.notify_all()

    def read(self):
        with self.condition:
            self.condition.wait()
            return self.frame


class StreamHandler(server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/stream':
            self.send_response(200)
            self.send_header('Age', '0')
            self.send_header('Cache-Control', 'no-cache, private')
            self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=frame')
            self.end_headers()
            try:
                while True:
                    frame = output.read()
                    self.wfile.write(b'--frame\r\n')
                    self.wfile.write(b'Content-Type: image/jpeg\r\n\r\n')
                    self.wfile.write(frame)
                    self.wfile.write(b'\r\n')
            except Exception:
                pass
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # suppress per-request logs


output = StreamOutput()
cam = Picamera2()
cam.configure(cam.create_video_configuration(main={'size': (1280, 720)}))
cam.start_recording(MJPEGEncoder(), FileOutput(output))

print(f"Camera stream running at http://0.0.0.0:{PORT}/stream")

with socketserver.TCPServer(('', PORT), StreamHandler) as httpd:
    httpd.serve_forever()
