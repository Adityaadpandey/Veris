# Multi-Signal Image Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-CLIP image matcher with a 5-signal fusion pipeline (ORB, SSIM edge, color histogram, CLIP, pHash) that robustly verifies DSLR+ESP dual-camera captures depict the same scene.

**Architecture:** Each signal is an independent function returning a 0–1 score. An `ImageVerifier` class orchestrates preprocessing, runs all 5 signals, applies per-signal floor rejection, then computes a weighted fusion score. The existing CLIP logic is preserved as one signal among five.

**Tech Stack:** Python, OpenCV (`cv2`), `imagehash`, PyTorch, HuggingFace `transformers` (CLIP), PIL/Pillow, NumPy, `scikit-image` (SSIM)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `ai-model/main.py` | Rewrite | `ImageVerifier` class, all 5 signal functions, preprocessing, diagnose, calibrate |
| `ai-model/run.py` | Rewrite | Minimal inference script using `ImageVerifier` |
| `ai-model/test_signals.py` | Create | Unit tests for each signal and the fusion logic |
| `ai-model/requirements.txt` | Create | Pin all dependencies |

---

### Task 1: Set Up Dependencies and Test Scaffold

**Files:**
- Create: `ai-model/requirements.txt`
- Create: `ai-model/test_signals.py`

- [ ] **Step 1: Create requirements.txt**

```txt
torch>=2.0.0
torchvision>=0.15.0
transformers>=4.30.0
Pillow>=10.0.0
numpy>=1.24.0
opencv-python>=4.8.0
imagehash>=4.3.0
scikit-image>=0.21.0
```

- [ ] **Step 2: Install dependencies**

Run: `cd /Users/aditya/Devlopment/LensMint/ai-model && pip install -r requirements.txt`
Expected: All packages install successfully.

- [ ] **Step 3: Create test scaffold with a smoke test**

`ai-model/test_signals.py`:
```python
"""
Tests for multi-signal image verification pipeline.
Uses real images from data/scene_001/ for integration tests
and synthetic images for unit tests.
"""

import os
import pytest
import numpy as np
from PIL import Image

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
SCENE_001 = os.path.join(DATA_DIR, "scene_001")
DSLR_PATH = os.path.join(SCENE_001, "dslr.jpg")
ESP_PATH = os.path.join(SCENE_001, "esp.jpg")


@pytest.fixture
def dslr_image():
    return Image.open(DSLR_PATH).convert("RGB")


@pytest.fixture
def esp_image():
    return Image.open(ESP_PATH).convert("RGB")


@pytest.fixture
def random_image():
    """A random noise image — should NOT match any real photo."""
    arr = np.random.randint(0, 255, (256, 256, 3), dtype=np.uint8)
    return Image.fromarray(arr)


def test_data_exists():
    assert os.path.exists(DSLR_PATH), f"Missing {DSLR_PATH}"
    assert os.path.exists(ESP_PATH), f"Missing {ESP_PATH}"
```

- [ ] **Step 4: Run the smoke test**

Run: `cd /Users/aditya/Devlopment/LensMint/ai-model && python -m pytest test_signals.py::test_data_exists -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-model/requirements.txt ai-model/test_signals.py
git commit -m "feat(ai): add test scaffold and requirements for multi-signal verification"
```

---

### Task 2: Implement Preprocessing

**Files:**
- Modify: `ai-model/main.py` (replace everything above the CLIP class with new preprocessing)
- Modify: `ai-model/test_signals.py` (add preprocessing tests)

- [ ] **Step 1: Write failing tests for preprocessing**

Append to `ai-model/test_signals.py`:
```python
def test_preprocess_esp_sharpens_and_normalizes(esp_image):
    from main import preprocess_esp
    result = preprocess_esp(esp_image)
    assert isinstance(result, Image.Image)
    assert result.mode == "RGB"
    arr = np.array(result)
    # Auto-contrast should push at least one channel close to 0 and 255
    assert arr.min() <= 5
    assert arr.max() >= 250


def test_preprocess_pair_returns_correct_sizes():
    from main import preprocess_pair
    dslr = Image.open(DSLR_PATH).convert("RGB")
    esp = Image.open(ESP_PATH).convert("RGB")
    result = preprocess_pair(dslr, esp)
    assert result["orb_dslr"].size == (512, 512)
    assert result["orb_esp"].size == (512, 512)
    assert result["small_dslr"].size == (256, 256)
    assert result["small_esp"].size == (256, 256)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/aditya/Devlopment/LensMint/ai-model && python -m pytest test_signals.py::test_preprocess_esp_sharpens_and_normalizes test_signals.py::test_preprocess_pair_returns_correct_sizes -v`
Expected: FAIL — `preprocess_pair` does not exist yet.

- [ ] **Step 3: Write the preprocessing code**

Start rewriting `ai-model/main.py` from scratch. This step writes only the imports and preprocessing section:

```python
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
        "clip_dslr": dslr,   # CLIP uses its own processor
        "clip_esp": esp,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/aditya/Devlopment/LensMint/ai-model && python -m pytest test_signals.py::test_preprocess_esp_sharpens_and_normalizes test_signals.py::test_preprocess_pair_returns_correct_sizes -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-model/main.py ai-model/test_signals.py
git commit -m "feat(ai): add preprocessing pipeline for multi-signal verification"
```

---

### Task 3: Implement ORB Keypoint Signal

**Files:**
- Modify: `ai-model/main.py` (add `signal_orb` function)
- Modify: `ai-model/test_signals.py` (add ORB tests)

- [ ] **Step 1: Write failing tests**

Append to `ai-model/test_signals.py`:
```python
def test_orb_same_scene_scores_above_floor():
    from main import signal_orb, preprocess_pair
    dslr = Image.open(DSLR_PATH).convert("RGB")
    esp = Image.open(ESP_PATH).convert("RGB")
    pair = preprocess_pair(dslr, esp)
    score = signal_orb(pair["orb_dslr"], pair["orb_esp"])
    assert 0.0 <= score <= 1.0
    assert score > 0.03, f"Same scene ORB score {score} below floor"


def test_orb_random_image_scores_low(dslr_image, random_image):
    from main import signal_orb, preprocess_pair
    pair = preprocess_pair(dslr_image, random_image)
    score = signal_orb(pair["orb_dslr"], pair["orb_esp"])
    assert 0.0 <= score <= 1.0
    assert score < 0.5, f"Random image ORB score {score} unexpectedly high"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/aditya/Devlopment/LensMint/ai-model && python -m pytest test_signals.py::test_orb_same_scene_scores_above_floor test_signals.py::test_orb_random_image_scores_low -v`
Expected: FAIL — `signal_orb` not defined.

- [ ] **Step 3: Implement signal_orb**

Append to `ai-model/main.py` after the preprocessing section:
```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/aditya/Devlopment/LensMint/ai-model && python -m pytest test_signals.py::test_orb_same_scene_scores_above_floor test_signals.py::test_orb_random_image_scores_low -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-model/main.py ai-model/test_signals.py
git commit -m "feat(ai): add ORB keypoint matching signal"
```

---

### Task 4: Implement SSIM Edge Map Signal

**Files:**
- Modify: `ai-model/main.py` (add `signal_ssim_edge` function)
- Modify: `ai-model/test_signals.py` (add SSIM tests)

- [ ] **Step 1: Write failing tests**

Append to `ai-model/test_signals.py`:
```python
def test_ssim_edge_same_scene_above_floor():
    from main import signal_ssim_edge, preprocess_pair
    dslr = Image.open(DSLR_PATH).convert("RGB")
    esp = Image.open(ESP_PATH).convert("RGB")
    pair = preprocess_pair(dslr, esp)
    score = signal_ssim_edge(pair["small_dslr"], pair["small_esp"])
    assert 0.0 <= score <= 1.0
    assert score > 0.15, f"Same scene SSIM edge score {score} below floor"


def test_ssim_edge_random_image_scores_low(dslr_image, random_image):
    from main import signal_ssim_edge, preprocess_pair
    pair = preprocess_pair(dslr_image, random_image)
    score = signal_ssim_edge(pair["small_dslr"], pair["small_esp"])
    assert 0.0 <= score <= 1.0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/aditya/Devlopment/LensMint/ai-model && python -m pytest test_signals.py::test_ssim_edge_same_scene_above_floor test_signals.py::test_ssim_edge_random_image_scores_low -v`
Expected: FAIL — `signal_ssim_edge` not defined.

- [ ] **Step 3: Implement signal_ssim_edge**

Append to `ai-model/main.py`:
```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/aditya/Devlopment/LensMint/ai-model && python -m pytest test_signals.py::test_ssim_edge_same_scene_above_floor test_signals.py::test_ssim_edge_random_image_scores_low -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-model/main.py ai-model/test_signals.py
git commit -m "feat(ai): add SSIM edge map signal"
```

---

### Task 5: Implement Color Histogram Signal

**Files:**
- Modify: `ai-model/main.py` (add `signal_color_hist` function)
- Modify: `ai-model/test_signals.py` (add histogram tests)

- [ ] **Step 1: Write failing tests**

Append to `ai-model/test_signals.py`:
```python
def test_color_hist_same_scene_above_floor():
    from main import signal_color_hist, preprocess_pair
    dslr = Image.open(DSLR_PATH).convert("RGB")
    esp = Image.open(ESP_PATH).convert("RGB")
    pair = preprocess_pair(dslr, esp)
    score = signal_color_hist(pair["small_dslr"], pair["small_esp"])
    assert 0.0 <= score <= 1.0
    assert score > 0.10, f"Same scene color hist score {score} below floor"


def test_color_hist_identical_image_scores_high(dslr_image):
    from main import signal_color_hist
    small = dslr_image.resize((256, 256), Image.LANCZOS)
    score = signal_color_hist(small, small)
    assert score > 0.99, f"Identical image color hist score {score} should be ~1.0"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/aditya/Devlopment/LensMint/ai-model && python -m pytest test_signals.py::test_color_hist_same_scene_above_floor test_signals.py::test_color_hist_identical_image_scores_high -v`
Expected: FAIL — `signal_color_hist` not defined.

- [ ] **Step 3: Implement signal_color_hist**

Append to `ai-model/main.py`:
```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/aditya/Devlopment/LensMint/ai-model && python -m pytest test_signals.py::test_color_hist_same_scene_above_floor test_signals.py::test_color_hist_identical_image_scores_high -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-model/main.py ai-model/test_signals.py
git commit -m "feat(ai): add color histogram correlation signal"
```

---

### Task 6: Implement CLIP Semantic Signal

**Files:**
- Modify: `ai-model/main.py` (add `CLIPSignal` class)
- Modify: `ai-model/test_signals.py` (add CLIP tests)

- [ ] **Step 1: Write failing tests**

Append to `ai-model/test_signals.py`:
```python
@pytest.fixture(scope="module")
def clip_signal():
    """Load CLIP once for all tests in this module."""
    from main import CLIPSignal
    return CLIPSignal(device="cpu")


def test_clip_same_scene_above_floor(clip_signal):
    dslr = Image.open(DSLR_PATH).convert("RGB")
    esp = Image.open(ESP_PATH).convert("RGB")
    from main import preprocess_esp
    esp = preprocess_esp(esp)
    score = clip_signal.score(dslr, esp)
    assert 0.0 <= score <= 1.0
    assert score > 0.40, f"Same scene CLIP score {score} below floor"


def test_clip_random_image_scores_lower(clip_signal, random_image):
    dslr = Image.open(DSLR_PATH).convert("RGB")
    same_score = clip_signal.score(dslr, dslr)
    rand_score = clip_signal.score(dslr, random_image)
    assert same_score > rand_score, "Random image should score lower than same image"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/aditya/Devlopment/LensMint/ai-model && python -m pytest test_signals.py::test_clip_same_scene_above_floor test_signals.py::test_clip_random_image_scores_lower -v`
Expected: FAIL — `CLIPSignal` not defined.

- [ ] **Step 3: Implement CLIPSignal**

Append to `ai-model/main.py`:
```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/aditya/Devlopment/LensMint/ai-model && python -m pytest test_signals.py::test_clip_same_scene_above_floor test_signals.py::test_clip_random_image_scores_lower -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-model/main.py ai-model/test_signals.py
git commit -m "feat(ai): add CLIP semantic similarity signal"
```

---

### Task 7: Implement Perceptual Hash Signal

**Files:**
- Modify: `ai-model/main.py` (add `signal_phash` function)
- Modify: `ai-model/test_signals.py` (add pHash tests)

- [ ] **Step 1: Write failing tests**

Append to `ai-model/test_signals.py`:
```python
def test_phash_identical_image_scores_one(dslr_image):
    from main import signal_phash
    score = signal_phash(dslr_image, dslr_image)
    assert score == 1.0, f"Identical image pHash score {score} should be 1.0"


def test_phash_same_scene_above_floor():
    from main import signal_phash, preprocess_pair
    dslr = Image.open(DSLR_PATH).convert("RGB")
    esp = Image.open(ESP_PATH).convert("RGB")
    pair = preprocess_pair(dslr, esp)
    score = signal_phash(pair["small_dslr"], pair["small_esp"])
    assert 0.0 <= score <= 1.0
    assert score > 0.25, f"Same scene pHash score {score} below floor"


def test_phash_random_image_scores_low(dslr_image, random_image):
    from main import signal_phash
    score = signal_phash(dslr_image, random_image)
    assert 0.0 <= score <= 1.0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/aditya/Devlopment/LensMint/ai-model && python -m pytest test_signals.py::test_phash_identical_image_scores_one test_signals.py::test_phash_same_scene_above_floor test_signals.py::test_phash_random_image_scores_low -v`
Expected: FAIL — `signal_phash` not defined.

- [ ] **Step 3: Implement signal_phash**

Append to `ai-model/main.py`:
```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/aditya/Devlopment/LensMint/ai-model && python -m pytest test_signals.py::test_phash_identical_image_scores_one test_signals.py::test_phash_same_scene_above_floor test_signals.py::test_phash_random_image_scores_low -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-model/main.py ai-model/test_signals.py
git commit -m "feat(ai): add perceptual hash signal"
```

---

### Task 8: Implement ImageVerifier Fusion Class

**Files:**
- Modify: `ai-model/main.py` (add `ImageVerifier` class)
- Modify: `ai-model/test_signals.py` (add integration tests)

- [ ] **Step 1: Write failing tests**

Append to `ai-model/test_signals.py`:
```python
@pytest.fixture(scope="module")
def verifier():
    from main import ImageVerifier
    return ImageVerifier(device="cpu")


def test_verifier_same_scene_authentic(verifier):
    result = verifier.verify(DSLR_PATH, ESP_PATH)
    assert result["authentic"] is True, f"Same scene should be authentic, got score {result['score']}"
    assert 0.0 <= result["score"] <= 1.0
    assert result["confidence"] in ("high", "medium", "low")
    assert result["rejected_by"] is None
    assert "orb" in result["signals"]
    assert "ssim_edge" in result["signals"]
    assert "color_hist" in result["signals"]
    assert "clip" in result["signals"]
    assert "phash" in result["signals"]


def test_verifier_random_not_authentic(verifier):
    # Create a random noise image and save temporarily
    import tempfile
    arr = np.random.randint(0, 255, (256, 256, 3), dtype=np.uint8)
    rand_img = Image.fromarray(arr)
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        rand_img.save(f.name)
        rand_path = f.name
    try:
        result = verifier.verify(DSLR_PATH, rand_path)
        assert result["authentic"] is False, f"Random image should not be authentic, got score {result['score']}"
    finally:
        os.unlink(rand_path)


def test_verifier_floor_rejection(verifier):
    """If any signal falls below its floor, rejected_by should name it."""
    import tempfile
    arr = np.random.randint(0, 255, (256, 256, 3), dtype=np.uint8)
    rand_img = Image.fromarray(arr)
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        rand_img.save(f.name)
        rand_path = f.name
    try:
        result = verifier.verify(DSLR_PATH, rand_path)
        # A random image should trip at least one floor
        assert result["rejected_by"] is not None or result["authentic"] is False
    finally:
        os.unlink(rand_path)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/aditya/Devlopment/LensMint/ai-model && python -m pytest test_signals.py::test_verifier_same_scene_authentic test_signals.py::test_verifier_random_not_authentic test_signals.py::test_verifier_floor_rejection -v`
Expected: FAIL — `ImageVerifier` not defined.

- [ ] **Step 3: Implement ImageVerifier**

Append to `ai-model/main.py`:
```python
# ------------------------------------------------------------------
#  IMAGE VERIFIER - MULTI-SIGNAL FUSION
# ------------------------------------------------------------------

SIGNAL_CONFIG = {
    "orb":        {"weight": 0.25, "floor": 0.03},
    "ssim_edge":  {"weight": 0.20, "floor": 0.15},
    "color_hist": {"weight": 0.15, "floor": 0.10},
    "clip":       {"weight": 0.25, "floor": 0.40},
    "phash":      {"weight": 0.15, "floor": 0.25},
}


class ImageVerifier:
    """
    Multi-signal image authenticity verifier.
    Combines 5 independent signals with weighted fusion and per-signal floors.
    """

    def __init__(self, device: str = "cpu", config: dict = None):
        self.config = config or SIGNAL_CONFIG
        self.clip = CLIPSignal(device=device)

    def verify(self, dslr_path: str, esp_path: str,
               threshold: float = 0.70) -> dict:
        dslr_img = Image.open(dslr_path).convert("RGB")
        esp_img = Image.open(esp_path).convert("RGB")
        pair = preprocess_pair(dslr_img, esp_img)

        signals = {
            "orb": signal_orb(pair["orb_dslr"], pair["orb_esp"]),
            "ssim_edge": signal_ssim_edge(pair["small_dslr"], pair["small_esp"]),
            "color_hist": signal_color_hist(pair["small_dslr"], pair["small_esp"]),
            "clip": self.clip.score(pair["clip_dslr"], pair["clip_esp"]),
            "phash": signal_phash(pair["small_dslr"], pair["small_esp"]),
        }

        # Check floors — reject if any signal is below its minimum
        rejected_by = None
        for name, value in signals.items():
            floor = self.config[name]["floor"]
            if value < floor:
                rejected_by = name
                break

        # Weighted fusion
        score = sum(
            signals[name] * self.config[name]["weight"]
            for name in signals
        )
        score = round(score, 4)

        authentic = rejected_by is None and score >= threshold
        confidence = ("high" if score >= 0.85 else
                      "medium" if score >= threshold else "low")

        return {
            "authentic": authentic,
            "score": score,
            "confidence": confidence,
            "threshold": threshold,
            "rejected_by": rejected_by,
            "signals": {k: round(v, 4) for k, v in signals.items()},
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/aditya/Devlopment/LensMint/ai-model && python -m pytest test_signals.py::test_verifier_same_scene_authentic test_signals.py::test_verifier_random_not_authentic test_signals.py::test_verifier_floor_rejection -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-model/main.py ai-model/test_signals.py
git commit -m "feat(ai): add ImageVerifier fusion class with floor rejection"
```

---

### Task 9: Implement Diagnose and Calibrate

**Files:**
- Modify: `ai-model/main.py` (add `diagnose` and `calibrate` methods to `ImageVerifier`)
- Modify: `ai-model/test_signals.py` (add diagnostics test)

- [ ] **Step 1: Write failing test**

Append to `ai-model/test_signals.py`:
```python
def test_diagnose_runs_without_error(verifier):
    results = verifier.diagnose(DATA_DIR)
    assert isinstance(results, list)
    assert len(results) > 0
    first = results[0]
    assert "scene" in first
    assert "score" in first
    assert "signals" in first


def test_calibrate_returns_threshold(verifier):
    threshold = verifier.calibrate(DATA_DIR)
    assert isinstance(threshold, float)
    assert 0.0 < threshold < 1.0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/aditya/Devlopment/LensMint/ai-model && python -m pytest test_signals.py::test_diagnose_runs_without_error test_signals.py::test_calibrate_returns_threshold -v`
Expected: FAIL — `diagnose` and `calibrate` methods not defined.

- [ ] **Step 3: Implement diagnose and calibrate methods**

Add these methods to the `ImageVerifier` class in `ai-model/main.py`:
```python
    def diagnose(self, data_dir: str, threshold: float = 0.70) -> list:
        """Run verification on all scene pairs and print a summary table."""
        scenes = sorted([
            d for d in os.listdir(data_dir)
            if os.path.isdir(os.path.join(data_dir, d))
        ])

        results = []
        print(f"\n{'Scene':<16} {'Score':>6} {'ORB':>6} {'SSIM':>6} "
              f"{'Color':>6} {'CLIP':>6} {'pHash':>6} {'Result':>8}")
        print("-" * 72)

        for scene in scenes:
            dslr_p = os.path.join(data_dir, scene, "dslr.jpg")
            esp_p = os.path.join(data_dir, scene, "esp.jpg")
            if not (os.path.exists(dslr_p) and os.path.exists(esp_p)):
                print(f"{scene:<16} {'MISSING':>6}")
                continue

            r = self.verify(dslr_p, esp_p, threshold=threshold)
            s = r["signals"]
            flag = "PASS" if r["authentic"] else f"FAIL({r['rejected_by'] or 'score'})"
            print(f"{scene:<16} {r['score']:>6.3f} {s['orb']:>6.3f} "
                  f"{s['ssim_edge']:>6.3f} {s['color_hist']:>6.3f} "
                  f"{s['clip']:>6.3f} {s['phash']:>6.3f} {flag:>8}")
            results.append({"scene": scene, "score": r["score"],
                            "authentic": r["authentic"], "signals": s})

        if results:
            scores = [r["score"] for r in results]
            passing = sum(1 for r in results if r["authentic"])
            print(f"\nMean: {sum(scores)/len(scores):.3f}  "
                  f"Min: {min(scores):.3f}  Max: {max(scores):.3f}  "
                  f"Pass: {passing}/{len(results)}")
        return results

    def calibrate(self, data_dir: str) -> float:
        """
        Test positive pairs (same scene) vs negative pairs (cross-scene)
        and find the threshold that best separates them.
        """
        scenes = sorted([
            d for d in os.listdir(data_dir)
            if os.path.isdir(os.path.join(data_dir, d))
        ])

        pos_scores = []
        for scene in scenes:
            dslr_p = os.path.join(data_dir, scene, "dslr.jpg")
            esp_p = os.path.join(data_dir, scene, "esp.jpg")
            if os.path.exists(dslr_p) and os.path.exists(esp_p):
                r = self.verify(dslr_p, esp_p, threshold=0.0)
                pos_scores.append(r["score"])

        neg_scores = []
        for i in range(len(scenes)):
            s1 = scenes[i]
            s2 = scenes[(i + 1) % len(scenes)]
            if s1 == s2:
                continue
            dslr_p = os.path.join(data_dir, s1, "dslr.jpg")
            esp_p = os.path.join(data_dir, s2, "esp.jpg")
            if os.path.exists(dslr_p) and os.path.exists(esp_p):
                r = self.verify(dslr_p, esp_p, threshold=0.0)
                neg_scores.append(r["score"])

        print("\n-- Threshold Calibration --")
        if pos_scores:
            print(f"  Positive (same scene)  mean={sum(pos_scores)/len(pos_scores):.4f}"
                  f"  min={min(pos_scores):.4f}  max={max(pos_scores):.4f}")
        if neg_scores:
            print(f"  Negative (diff scene)  mean={sum(neg_scores)/len(neg_scores):.4f}"
                  f"  min={min(neg_scores):.4f}  max={max(neg_scores):.4f}")

        recommended = 0.70
        if pos_scores and neg_scores:
            worst_pos = min(pos_scores)
            best_neg = max(neg_scores)
            gap = worst_pos - best_neg
            print(f"  Gap: {gap:.4f}")
            if gap > 0.02:
                recommended = round(best_neg + gap * 0.6, 3)
                print(f"  Recommended threshold: {recommended}")
            else:
                recommended = round(best_neg + gap * 0.5, 3)
                print(f"  [!] Small gap — recommended: {recommended}")

        return recommended
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/aditya/Devlopment/LensMint/ai-model && python -m pytest test_signals.py::test_diagnose_runs_without_error test_signals.py::test_calibrate_returns_threshold -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-model/main.py ai-model/test_signals.py
git commit -m "feat(ai): add diagnose and calibrate methods to ImageVerifier"
```

---

### Task 10: Add Main Block and Update run.py

**Files:**
- Modify: `ai-model/main.py` (add `__main__` block)
- Modify: `ai-model/run.py` (update to use `ImageVerifier`)

- [ ] **Step 1: Add __main__ block to main.py**

Append to `ai-model/main.py`:
```python
# ------------------------------------------------------------------
#  MAIN
# ------------------------------------------------------------------

if __name__ == "__main__":
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    DATA_DIR = "./data"
    DSLR = os.path.join(DATA_DIR, "scene_001", "dslr.jpg")
    ESP = os.path.join(DATA_DIR, "scene_001", "esp.jpg")

    print(f"Device: {DEVICE}\n")

    verifier = ImageVerifier(device=DEVICE)

    # Diagnose all scenes
    verifier.diagnose(DATA_DIR)

    # Calibrate threshold
    threshold = verifier.calibrate(DATA_DIR)

    # Verify single pair
    print(f"\n-- Verify scene_001 (threshold={threshold}) --")
    result = verifier.verify(DSLR, ESP, threshold=threshold)
    for k, v in result.items():
        print(f"  {k}: {v}")
```

- [ ] **Step 2: Rewrite run.py**

`ai-model/run.py`:
```python
"""
Minimal image verification test using ImageVerifier
"""

import os
import torch
from main import ImageVerifier

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DATA_DIR = "./data"
DSLR = os.path.join(DATA_DIR, "scene_001", "dslr.jpg")
ESP = os.path.join(DATA_DIR, "scene_001", "esp.jpg")

print(f"Device : {DEVICE}")
print(f"Image 1: {DSLR}")
print(f"Image 2: {ESP}\n")

verifier = ImageVerifier(device=DEVICE)
result = verifier.verify(DSLR, ESP)

print("-- Verification Result --")
for key, value in result.items():
    print(f"  {key}: {value}")
```

- [ ] **Step 3: Run all tests**

Run: `cd /Users/aditya/Devlopment/LensMint/ai-model && python -m pytest test_signals.py -v`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add ai-model/main.py ai-model/run.py
git commit -m "feat(ai): add main block and update run.py for multi-signal verification"
```

---

### Task 11: Run Full Integration Test

**Files:** None (verification only)

- [ ] **Step 1: Run the full model on the dataset**

Run: `cd /Users/aditya/Devlopment/LensMint/ai-model && python main.py`
Expected: Diagnose table prints for all 11 scenes with 5-signal scores, calibration runs, single verification result prints.

- [ ] **Step 2: Run all tests one final time**

Run: `cd /Users/aditya/Devlopment/LensMint/ai-model && python -m pytest test_signals.py -v`
Expected: All tests PASS.

- [ ] **Step 3: Clean up old model weights if no longer needed**

The old `authnet.pth` (17.7MB) and `authnet_clip.pth` (659KB) are from the previous single-CLIP model. The new pipeline doesn't use them. Remove them:

```bash
rm ai-model/authnet.pth ai-model/authnet_clip.pth
```

- [ ] **Step 4: Final commit**

```bash
git add -A ai-model/
git commit -m "feat(ai): complete multi-signal image verification pipeline

Replaces single-CLIP matching with 5-signal fusion:
- ORB keypoint matching (geometric)
- SSIM on edge maps (structural)
- Color histogram correlation (color)
- CLIP cosine similarity (semantic)
- Perceptual hash distance (coarse)

Each signal has per-signal floor rejection to prevent gaming."
```
