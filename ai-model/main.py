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


# ------------------------------------------------------------------
#  SIGNAL 2: SSIM ON EDGE MAPS
# ------------------------------------------------------------------

def signal_ssim_edge(img1: Image.Image, img2: Image.Image) -> float:
    """
    Canny edge detection on both images, then SSIM on the edge maps.
    Returns 0-1 score.
    """
    gray1 = cv2.cvtColor(np.array(img1), cv2.COLOR_RGB2GRAY)
    gray2 = cv2.cvtColor(np.array(img2), cv2.COLOR_RGB2GRAY)

    edges1 = cv2.Canny(gray1, 50, 150)
    edges2 = cv2.Canny(gray2, 50, 150)

    score = ssim(edges1, edges2)
    return max(0.0, min(score, 1.0))


# ------------------------------------------------------------------
#  SIGNAL 3: COLOR HISTOGRAM CORRELATION
# ------------------------------------------------------------------

def signal_color_hist(img1: Image.Image, img2: Image.Image,
                      bins: int = 32) -> float:
    """
    HSV histogram correlation between two images.
    Returns 0-1 score.
    """
    hsv1 = cv2.cvtColor(np.array(img1), cv2.COLOR_RGB2HSV)
    hsv2 = cv2.cvtColor(np.array(img2), cv2.COLOR_RGB2HSV)

    score = 0.0
    for ch in range(3):
        h1 = cv2.calcHist([hsv1], [ch], None, [bins], [0, 256])
        h2 = cv2.calcHist([hsv2], [ch], None, [bins], [0, 256])
        cv2.normalize(h1, h1)
        cv2.normalize(h2, h2)
        score += cv2.compareHist(h1, h2, cv2.HISTCMP_CORREL)

    avg = score / 3.0
    return max(0.0, min(avg, 1.0))


# ------------------------------------------------------------------
#  SIGNAL 4: CLIP SEMANTIC SIMILARITY
# ------------------------------------------------------------------

class CLIPSignal:
    """
    CLIP vision encoder cosine similarity.
    Loads model once, reuse for multiple comparisons.
    """
    MODEL_ID = "openai/clip-vit-base-patch32"

    def __init__(self, device: str = "cpu"):
        self.device = device
        self.model = CLIPModel.from_pretrained(self.MODEL_ID).to(device).eval()
        self.processor = CLIPProcessor.from_pretrained(self.MODEL_ID)

    def _encode(self, img: Image.Image) -> torch.Tensor:
        pixel_values = self.processor(
            images=img, return_tensors="pt"
        ).pixel_values.to(self.device)
        with torch.no_grad():
            vision_out = self.model.vision_model(pixel_values=pixel_values)
            feat = self.model.visual_projection(vision_out.pooler_output)
        return F.normalize(feat, p=2, dim=1)

    def score(self, img1: Image.Image, img2: Image.Image) -> float:
        e1 = self._encode(img1)
        e2 = self._encode(img2)
        sim = (e1 * e2).sum().item()
        return max(0.0, min(sim, 1.0))


# ------------------------------------------------------------------
#  SIGNAL 5: PERCEPTUAL HASH DISTANCE
# ------------------------------------------------------------------

def signal_phash(img1: Image.Image, img2: Image.Image,
                 hash_size: int = 8) -> float:
    """
    DCT-based perceptual hash. Returns 1 - (hamming_distance / hash_bits).
    Score of 1.0 = identical, 0.0 = maximally different.
    """
    h1 = imagehash.phash(img1, hash_size=hash_size)
    h2 = imagehash.phash(img2, hash_size=hash_size)
    max_dist = hash_size * hash_size  # 64 for hash_size=8
    dist = h1 - h2  # hamming distance
    return 1.0 - (dist / max_dist)
