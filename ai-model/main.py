"""
multi_signal_verify.py - Multi-Signal Image Authenticity Verification
---------------------------------------------------------------------
5-signal fusion pipeline for dual-camera (DSLR + ESP) verification.

Signals:
  1. ORB keypoint matching (geometric)
  2. SSIM on edge maps (structural)
  3. Color histogram correlation (color)
  4. CLIP cosine similarity (semantic)
  5. Perceptual hash distance (coarse)

Usage:
  python main.py                # runs diagnose + calibrate on ./data
  pip install -r requirements.txt
"""

import os
import cv2
import torch
import torch.nn.functional as F
import numpy as np
import imagehash
from PIL import Image, ImageFilter
from skimage.metrics import structural_similarity as ssim

try:
    from transformers import CLIPProcessor, CLIPModel
except ImportError:
    raise ImportError("Run: pip install transformers")


# ------------------------------------------------------------------
#  PREPROCESSING
# ------------------------------------------------------------------

def preprocess_esp(img: Image.Image) -> Image.Image:
    """Sharpen + auto-contrast the ESP image to reduce quality gap."""
    img = img.filter(ImageFilter.SHARPEN)
    arr = np.array(img).astype(np.float32)
    for c in range(3):
        lo, hi = arr[:, :, c].min(), arr[:, :, c].max()
        if hi > lo:
            arr[:, :, c] = (arr[:, :, c] - lo) / (hi - lo) * 255
    return Image.fromarray(arr.clip(0, 255).astype(np.uint8))


def preprocess_pair(dslr: Image.Image, esp: Image.Image) -> dict:
    """
    Prepare image pair at the sizes each signal needs.
    Returns dict with resized PIL images ready for each signal.
    """
    esp = preprocess_esp(esp)
    return {
        "orb_dslr": dslr.resize((512, 512), Image.LANCZOS),
        "orb_esp": esp.resize((512, 512), Image.LANCZOS),
        "small_dslr": dslr.resize((256, 256), Image.LANCZOS),
        "small_esp": esp.resize((256, 256), Image.LANCZOS),
        "clip_dslr": dslr,
        "clip_esp": esp,
    }
