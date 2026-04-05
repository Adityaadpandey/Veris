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


# ------------------------------------------------------------------
#  SIGNAL 1: ORB KEYPOINT MATCHING
# ------------------------------------------------------------------

def signal_orb(img1: Image.Image, img2: Image.Image,
               max_keypoints: int = 1000, ratio_thresh: float = 0.75) -> float:
    """
    ORB keypoint detection + BFMatcher + RANSAC homography.
    Returns 0-1 score based on inlier ratio.
    """
    gray1 = cv2.cvtColor(np.array(img1), cv2.COLOR_RGB2GRAY)
    gray2 = cv2.cvtColor(np.array(img2), cv2.COLOR_RGB2GRAY)

    orb = cv2.ORB_create(nfeatures=max_keypoints)
    kp1, des1 = orb.detectAndCompute(gray1, None)
    kp2, des2 = orb.detectAndCompute(gray2, None)

    if des1 is None or des2 is None or len(kp1) < 4 or len(kp2) < 4:
        return 0.0

    bf = cv2.BFMatcher(cv2.NORM_HAMMING)
    raw_matches = bf.knnMatch(des1, des2, k=2)

    # Lowe's ratio test
    good = []
    for m, n in raw_matches:
        if m.distance < ratio_thresh * n.distance:
            good.append(m)

    if len(good) < 4:
        return 0.0

    # RANSAC homography to filter outliers
    pts1 = np.float32([kp1[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    pts2 = np.float32([kp2[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    _, mask = cv2.findHomography(pts1, pts2, cv2.RANSAC, 5.0)

    if mask is None:
        return 0.0

    inliers = int(mask.sum())
    min_kp = min(len(kp1), len(kp2))
    score = inliers / max(min_kp, 1)
    return min(score, 1.0)
