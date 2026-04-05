# Multi-Signal Image Verification Model

**Date:** 2026-04-05
**Status:** Approved
**Goal:** Replace single-CLIP image matching with a 5-signal fusion pipeline for robust dual-camera (DSLR + ESP) verification.

## Problem

The current model uses CLIP cosine similarity alone. CLIP matches *semantic concepts*, not visual fidelity — two different photos of "a park" score high, while the same scene from different cameras can score low. With only 11 training scenes, the fine-tuned adapter is unreliable. The system needs to prove two images depict the *exact same moment* from two cameras that differ in resolution, angle, exposure, and sometimes have motion blur.

## Architecture

```
Input: (dslr.jpg, esp.jpg)
    │
    ├─► Preprocessing (resize, sharpen ESP, normalize both)
    │
    ├─► Signal 1: ORB Keypoint Matching (geometric)      — 25%
    ├─► Signal 2: SSIM on Edge Maps (structural)          — 20%
    ├─► Signal 3: Color Histogram Correlation (color)     — 15%
    ├─► Signal 4: CLIP Cosine Similarity (semantic)       — 25%
    ├─► Signal 5: Perceptual Hash Distance (coarse)       — 15%
    │
    ├─► Weighted Fusion → authenticity_score (0.0 - 1.0)
    │
    └─► Decision: authentic if score >= 0.70
        Confidence: high (≥0.85), medium (≥0.70), low (<0.70)
```

Each signal is computed independently, returns a normalized 0–1 score, and has a minimum floor. If any single signal falls below its floor, the pair is rejected regardless of overall score.

## Signal Specifications

### Signal 1: ORB Keypoint Matching (weight: 25%, floor: 0.03)

- Detect up to 1000 ORB keypoints in each image (resized to 512×512)
- Match with BFMatcher using Hamming distance
- Apply Lowe's ratio test (threshold 0.75) to filter weak matches
- Run RANSAC homography to remove geometric outliers
- Score = `inlier_count / max(min_keypoints_detected, 1)`, capped at 1.0
- Catches: same physical objects and geometric consistency

### Signal 2: SSIM on Edge Maps (weight: 20%, floor: 0.15)

- Resize both images to 256×256, convert to grayscale
- Apply Canny edge detection
- Compute SSIM between the two edge maps
- Score = raw SSIM value (already 0–1 range)
- Catches: same structural layout and shapes

### Signal 3: Color Histogram Correlation (weight: 15%, floor: 0.10)

- Resize both to 256×256, convert to HSV
- Compute 3-channel histogram (32 bins per channel)
- Normalize histograms
- Score = `cv2.compareHist` with correlation method, clamped to 0–1
- Catches: same lighting conditions and color distribution

### Signal 4: CLIP Semantic Similarity (weight: 25%, floor: 0.40)

- Keep existing `CLIPVerifier._encode()` logic
- Preprocess ESP image with existing `preprocess_esp()` (sharpen + auto-contrast)
- Score = cosine similarity between CLIP embeddings (0–1)
- Catches: same scene concept and content

### Signal 5: Perceptual Hash Distance (weight: 15%, floor: 0.25)

- Compute 64-bit DCT-based perceptual hash for both images
- Score = `1 - (hamming_distance / 64)`
- Catches: coarse visual similarity, fast rejection of obvious mismatches

## Preprocessing

1. **ESP enhancement** — existing `preprocess_esp()` (sharpen + auto-contrast)
2. **Resize** — 512×512 for ORB, 256×256 for SSIM/histogram/pHash, CLIP uses its own processor
3. **Color normalization** — ensure RGB consistently (handle BGR from OpenCV)

## Public API

Single class `ImageVerifier` replaces `CLIPVerifier`:

```python
verifier = ImageVerifier(device="cpu")

result = verifier.verify("dslr.jpg", "esp.jpg")
# {
#   "authentic": True,
#   "score": 0.82,
#   "confidence": "medium",
#   "signals": {
#     "orb": 0.74,
#     "ssim_edge": 0.68,
#     "color_hist": 0.91,
#     "clip": 0.88,
#     "phash": 0.81
#   },
#   "rejected_by": None
# }

verifier.diagnose("./data")       # table across all scenes
verifier.calibrate("./data")      # find optimal threshold + weights
```

## File Changes

- `ai-model/main.py` — rewrite with `ImageVerifier` class and all 5 signals
- `ai-model/run.py` — update to use `ImageVerifier`
- No new files needed

## Dependencies

Add to existing requirements:
- `opencv-python` — ORB, SSIM, histogram, Canny
- `imagehash` — perceptual hashing

Keep existing: `torch`, `transformers`, `Pillow`, `numpy`

## Why Multi-Signal

| Attack vector | Single CLIP | Multi-signal |
|--------------|-------------|-------------|
| Different photo, same concept | Passes (same semantics) | Fails (ORB, SSIM, pHash) |
| Tampered image, same structure | May pass | Fails (color hist, pHash) |
| AI-generated lookalike | Passes (high semantic sim) | Fails (ORB geometry, edge SSIM) |
| Downscaled/re-encoded original | Uncertain | Passes (all signals robust to quality loss) |

No single signal can be gamed without failing at least one other check.
