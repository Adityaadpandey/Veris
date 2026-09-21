"""Safe-stop check: no AI answer -> 'pending', never a guessed verdict; retry resumes. Run: python3 test_pipeline.py"""
import os, tempfile, json
from unittest import mock

tmp = tempfile.mkdtemp()
os.environ['CAPTURE_DIR'] = os.path.join(tmp, 'captures')
import numpy as np, cv2
from ecdsa import SigningKey, SECP256k1
import hardware_identity as hi
import liveness, capture_pipeline as cp

ident = hi.HardwareIdentity.__new__(hi.HardwareIdentity)
ident.private_key = SigningKey.from_string(bytes(range(1, 33)), curve=SECP256k1)
ident.public_key = ident.private_key.get_verifying_key()
ident.address = ident._get_address()
ident.initialized = True

img = os.path.join(cp.CAPTURE_DIR, 'photo_test.jpg')
cv2.imwrite(img, np.random.randint(0, 255, (120, 160, 3), dtype=np.uint8))

# 1. every AI engine down -> pending, parked at stage 'liveness', nothing uploaded
# liveness.requests and cp.requests are the same module, so one patch covers both
with mock.patch.object(cp.requests, 'post', side_effect=ConnectionError('wifi off')) as upload:
    sig = cp.check_and_sign(ident, img)
    assert sig['verdict'] == 'pending', sig['verdict']
    assert cp.upload_and_create_claim(img, sig, 'cam')['status'] == 'pending'
    assert all(c.args[0].endswith('/api/liveness') for c in upload.call_args_list), 'must not upload'
entry = json.load(open(cp._pending_path_for(img)))
assert entry['stage'] == 'liveness'

# 2. wifi back: GPT answers, upload goes through, queue entry is removed
gpt = mock.Mock(status_code=200, json=lambda: {'live': True, 'consistent': None, 'confidence': .9, 'reasons': []})
ok = mock.Mock(status_code=200, json=lambda: {'success': True, 'claimUrl': 'u', 'claimId': 'c', 'imageId': 1})
def post(url, **kw):
    return gpt if url.endswith('/api/liveness') else ok
with mock.patch.object(cp.requests, 'post', side_effect=post), \
     mock.patch.object(cp, '_backend_reachable', return_value=True), \
     mock.patch.object(cp, 'get_location', return_value=None):
    out = cp.retry_pending_uploads(hardware_identity=ident)
assert out[0]['status'] == 'uploaded', out
assert not cp._pending_path_for(img).exists()
print('ok: pending then resumed')
