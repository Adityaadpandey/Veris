#!/usr/bin/env python3
"""
Liveness check: is this a real scene shot live, and (when a phone photo exists) do both
photos show the same scene?

Order of engines:
  1. 0G Router vision call, only if ZEROG_ENABLED=true and key + model are set
  2. GPT, through the public server's /api/liveness (the check that already existed)
  3. neither answered -> status "pending". We never guess a verdict.

check_liveness() never raises, so a broken AI service can't block a capture.
"""

import os
import base64
import json
import time

import cv2
import requests

ZEROG_ENABLED = os.getenv('ZEROG_ENABLED', 'false').lower() == 'true'
ZEROG_API_KEY = os.getenv('ZEROG_API_KEY', '')
ZEROG_BASE_URL = os.getenv('ZEROG_BASE_URL', 'https://router-api.0g.ai/v1')
# no default: pick a vision model from the Router's model list (pc.0g.ai)
ZEROG_MODEL = os.getenv('ZEROG_MODEL', '')
ZEROG_VERIFY_TEE = os.getenv('ZEROG_VERIFY_TEE', 'false').lower() == 'true'
ZEROG_TIMEOUT = float(os.getenv('ZEROG_TIMEOUT', '25'))

PUBLIC_SERVER_URL = os.getenv('PUBLIC_SERVER_URL', 'https://api.veris.live')
DEVICE_API_SECRET = os.getenv('DEVICE_API_SECRET', '')
GPT_TIMEOUT = float(os.getenv('GPT_LIVENESS_TIMEOUT', '40'))

# longest side sent to the AI; the full 1080p+ jpeg only makes the call slower
MAX_SIDE = 1024

PROMPT = (
    "You check photos from a tamper-evident camera. Image 1 is the device photo"
    "{second}. Decide: live = true only if image 1 looks like a real scene photographed "
    "directly (false for a photo of a screen, a printed photo, or an AI-generated image)."
    "{consistent_rule} "
    'Reply with JSON only: {{"live": boolean, "consistent": boolean or null, '
    '"confidence": number 0 to 1, "reasons": [short strings]}}.'
)


def _jpeg_bytes(path):
    img = cv2.imread(str(path))
    if img is None:
        raise ValueError(f"cannot read image {path}")
    h, w = img.shape[:2]
    scale = MAX_SIDE / max(h, w)
    if scale < 1:
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode('.jpg', img, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ok:
        raise ValueError("jpeg encode failed")
    return buf.tobytes()


def _result(engine, parsed, companion, **extra):
    live = bool(parsed.get('live'))
    consistent = parsed.get('consistent') if companion else None
    consistent = None if consistent is None else bool(consistent)
    status = 'real' if live and consistent is not False else 'fake'
    return {
        'status': status,
        'engine': engine,
        'live': live,
        'consistent': consistent,
        'confidence': max(0.0, min(1.0, float(parsed.get('confidence') or 0))),
        'reasons': [str(r) for r in (parsed.get('reasons') or [])][:5],
        **extra,
    }


def _parse_json(text):
    text = text.strip()
    if text.startswith('```'):
        text = text.strip('`').removeprefix('json').strip()
    return json.loads(text)


def _check_0g(device_jpeg, companion_jpeg):
    parts = [{'type': 'text', 'text': PROMPT.format(
        second=" and image 2 is a phone photo taken at the same moment next to it" if companion_jpeg else "",
        consistent_rule=" consistent = true only if both images show the same real scene." if companion_jpeg
        else " Set consistent to null (there is no second image).")}]
    for jpeg in (device_jpeg, companion_jpeg):
        if jpeg:
            b64 = base64.b64encode(jpeg).decode()
            parts.append({'type': 'image_url', 'image_url': {'url': f'data:image/jpeg;base64,{b64}'}})

    body = {'model': ZEROG_MODEL, 'messages': [{'role': 'user', 'content': parts}]}
    if ZEROG_VERIFY_TEE:
        body['verify_tee'] = True

    resp = requests.post(f'{ZEROG_BASE_URL}/chat/completions', json=body, timeout=ZEROG_TIMEOUT,
                         headers={'Authorization': f'Bearer {ZEROG_API_KEY}'})
    resp.raise_for_status()  # 402 (no balance), 429, 5xx all land in the caller's fallback
    data = resp.json()
    trace = data.get('x_0g_trace') or {}
    parsed = _parse_json(data['choices'][0]['message']['content'])
    return _result('0g', parsed, companion_jpeg,
                   request_id=trace.get('request_id'), tee_verified=trace.get('tee_verified'))


def _check_gpt(device_jpeg, companion_jpeg):
    files = {'image': ('image.jpg', device_jpeg, 'image/jpeg')}
    if companion_jpeg:
        files['companion'] = ('companion.jpg', companion_jpeg, 'image/jpeg')
    headers = {'x-device-secret': DEVICE_API_SECRET} if DEVICE_API_SECRET else {}
    resp = requests.post(f'{PUBLIC_SERVER_URL}/api/liveness', files=files, headers=headers, timeout=GPT_TIMEOUT)
    resp.raise_for_status()
    return _result('gpt', resp.json(), companion_jpeg, request_id=None, tee_verified=None)


def check_liveness(device_image_path, companion_image_path=None):
    """Returns a dict with status 'real' | 'fake' | 'pending' plus engine, request_id, reasons."""
    started = time.time()
    errors = []
    try:
        device_jpeg = _jpeg_bytes(device_image_path)
        companion_jpeg = _jpeg_bytes(companion_image_path) if companion_image_path else None
    except Exception as e:
        return {'status': 'pending', 'engine': None, 'errors': [f'image: {e}'], 'elapsed_s': 0}

    engines = []
    if ZEROG_ENABLED and ZEROG_API_KEY and ZEROG_MODEL:
        engines.append(('0g', _check_0g))
    engines.append(('gpt', _check_gpt))

    for name, fn in engines:
        try:
            result = fn(device_jpeg, companion_jpeg)
            result['elapsed_s'] = round(time.time() - started, 1)
            if errors:
                result['errors'] = errors
            print(f"Liveness: {result['status']} via {name} request_id={result.get('request_id')}")
            return result
        except Exception as e:
            print(f"Liveness engine {name} failed: {e}")
            errors.append(f'{name}: {e}')

    return {'status': 'pending', 'engine': None, 'errors': errors, 'elapsed_s': round(time.time() - started, 1)}


if __name__ == '__main__':
    import sys
    print(json.dumps(check_liveness(*sys.argv[1:3]), indent=2))
