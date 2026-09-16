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
import io
import json
import base64
import cv2
import torch
import torch.nn.functional as F
import numpy as np
import imagehash
from PIL import Image, ImageFilter, ImageOps
from skimage.metrics import structural_similarity as ssim

try:
    from transformers import CLIPProcessor, CLIPModel
except ImportError:
    raise ImportError("Run: pip install transformers")

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


# ------------------------------------------------------------------
#  PREPROCESSING
# ------------------------------------------------------------------

def load_image(path: str) -> Image.Image:
    """
    Open an image and bake in its EXIF orientation.

    Cameras (the Pi's OV5647 in particular) write an EXIF orientation tag
    instead of rotating the pixel data. PIL's Image.open() ignores that tag,
    so a portrait shot stored sideways stays sideways in the pixel array --
    every downstream signal then compares against a 90-degree-rotated image
    and scores garbage. exif_transpose() applies the tag so pixels match
    what the photo actually looks like.
    """
    return ImageOps.exif_transpose(Image.open(path)).convert("RGB")


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

    # Score is the fraction of *matched* keypoints RANSAC accepts as
    # geometrically consistent -- not a fraction of total keypoints
    # detected. ORB always returns up to max_keypoints regardless of scene
    # content, so dividing by that count instead of len(good) made the
    # score collapse toward zero for every cross-camera pair: two different
    # sensors rarely produce more than a few dozen matching descriptors out
    # of a thousand detected, even for a perfect same-scene match.
    inliers = int(mask.sum())
    score = inliers / max(len(good), 1)
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
    return float(max(0.0, min(score, 1.0)))


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
    return float(max(0.0, min(avg, 1.0)))


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
    return float(1.0 - (dist / max_dist))


# ------------------------------------------------------------------
#  SIGNAL 6: OPENAI VISION JUDGMENT
# ------------------------------------------------------------------

class OpenAIVisionSignal:
    """
    Asks a GPT-4o-class vision model whether two photos show the same
    physical scene, shot by different cameras (DSLR vs a cheap embedded
    sensor). This catches cases the pixel-level signals miss -- e.g. a
    reused/staged photo that happens to share color and edge statistics
    with the real capture, or a genuine same-scene pair that pixel signals
    undervalue because of exposure/lens differences.
    """

    def __init__(self, api_key: str = None, model: str = None):
        if OpenAI is None:
            raise RuntimeError("openai package not installed. Run: pip install openai")
        api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY not set")
        self.model = model or os.environ.get("OPENAI_VISION_MODEL", "gpt-5.6-luna")
        self.client = OpenAI(api_key=api_key)

    @staticmethod
    def _to_data_url(img: Image.Image, max_side: int = 768, quality: int = 80) -> str:
        img = img.copy()
        img.thumbnail((max_side, max_side), Image.LANCZOS)
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="JPEG", quality=quality)
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        return f"data:image/jpeg;base64,{b64}"

    def score(self, img1: Image.Image, img2: Image.Image) -> float:
        prompt = (
            "You are comparing two photos that may show the same physical scene, "
            "captured moments apart by two different cameras (one a DSLR, one a "
            "cheap embedded camera). Ignore differences in exposure, color grading, "
            "sharpness, and sensor noise -- those are expected. Judge only whether "
            "the underlying scene, subject, and framing match.\n\n"
            'Respond with ONLY a JSON object, no markdown fences: '
            '{"same_scene": true|false, "confidence": 0.0-1.0, "reason": "<one sentence>"}'
        )
        resp = self.client.chat.completions.create(
            model=self.model,
            max_completion_tokens=300,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": self._to_data_url(img1)}},
                    {"type": "image_url", "image_url": {"url": self._to_data_url(img2)}},
                ],
            }],
        )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        data = json.loads(raw)

        confidence = max(0.0, min(float(data.get("confidence", 0.0)), 1.0))
        if not data.get("same_scene", False):
            confidence = min(confidence, 0.3)
        return confidence


# ------------------------------------------------------------------
#  IMAGE VERIFIER - MULTI-SIGNAL FUSION
# ------------------------------------------------------------------

SIGNAL_CONFIG = {
    "orb":           {"weight": 0.05, "floor": 0.00},
    "ssim_edge":     {"weight": 0.15, "floor": 0.10},
    "color_hist":    {"weight": 0.15, "floor": 0.05},
    "clip":          {"weight": 0.20, "floor": 0.40},
    "phash":         {"weight": 0.15, "floor": 0.20},
    "openai_vision": {"weight": 0.30, "floor": 0.35},
}


class ImageVerifier:
    """
    Multi-signal image authenticity verifier.
    Combines 6 independent signals with weighted fusion and per-signal floors:
    5 pixel/embedding-level signals plus a GPT-4o-class vision judgment.
    """

    def __init__(self, device: str = "cpu", config: dict = None, use_openai: bool = True):
        self.config = config or SIGNAL_CONFIG
        self.clip = CLIPSignal(device=device)

        self.openai = None
        if use_openai:
            try:
                self.openai = OpenAIVisionSignal()
            except RuntimeError as e:
                print(f"[ImageVerifier] OpenAI vision signal disabled: {e}")

    def verify(self, dslr_path: str, esp_path: str,
               threshold: float = 0.45) -> dict:
        dslr_img = load_image(dslr_path)
        esp_img = load_image(esp_path)
        pair = preprocess_pair(dslr_img, esp_img)

        signals = {
            "orb": signal_orb(pair["orb_dslr"], pair["orb_esp"]),
            "ssim_edge": signal_ssim_edge(pair["small_dslr"], pair["small_esp"]),
            "color_hist": signal_color_hist(pair["small_dslr"], pair["small_esp"]),
            "clip": self.clip.score(pair["clip_dslr"], pair["clip_esp"]),
            "phash": signal_phash(pair["small_dslr"], pair["small_esp"]),
        }

        openai_error = None
        if self.openai is not None:
            try:
                signals["openai_vision"] = self.openai.score(pair["clip_dslr"], pair["clip_esp"])
            except Exception as e:
                openai_error = str(e)

        # Signals that didn't run (no key, or a transient API failure) are
        # excluded rather than silently scored as 0 -- their weight is
        # redistributed proportionally across the signals that did run.
        active_config = {k: self.config[k] for k in signals}
        weight_total = sum(cfg["weight"] for cfg in active_config.values())

        # Check floors — reject if any signal is below its minimum
        rejected_by = None
        for name, value in signals.items():
            floor = active_config[name]["floor"]
            if value < floor:
                rejected_by = name
                break

        # Weighted fusion (renormalized if a signal was skipped)
        score = sum(
            signals[name] * active_config[name]["weight"]
            for name in signals
        ) / weight_total
        score = round(float(score), 4)

        authentic = rejected_by is None and score >= threshold
        confidence = ("high" if score >= 0.85 else
                      "medium" if score >= threshold else "low")

        result = {
            "authentic": authentic,
            "score": score,
            "confidence": confidence,
            "threshold": threshold,
            "rejected_by": rejected_by,
            "signals": {k: round(v, 4) for k, v in signals.items()},
        }
        if openai_error:
            result["openai_error"] = openai_error
        return result

    def diagnose(self, data_dir: str, threshold: float = 0.45) -> list:
        """Run verification on all scene pairs and print a summary table."""
        scenes = sorted([
            d for d in os.listdir(data_dir)
            if os.path.isdir(os.path.join(data_dir, d))
        ])

        results = []
        print(f"\n{'Scene':<16} {'Score':>6} {'ORB':>6} {'SSIM':>6} "
              f"{'Color':>6} {'CLIP':>6} {'pHash':>6} {'GPT':>6} {'Result':>8}")
        print("-" * 80)

        for scene in scenes:
            dslr_p = os.path.join(data_dir, scene, "dslr.jpg")
            esp_p = os.path.join(data_dir, scene, "esp.jpg")
            if not (os.path.exists(dslr_p) and os.path.exists(esp_p)):
                print(f"{scene:<16} {'MISSING':>6}")
                continue

            r = self.verify(dslr_p, esp_p, threshold=threshold)
            s = r["signals"]
            gpt = f"{s['openai_vision']:.3f}" if "openai_vision" in s else "  n/a"
            flag = "PASS" if r["authentic"] else f"FAIL({r['rejected_by'] or 'score'})"
            print(f"{scene:<16} {r['score']:>6.3f} {s['orb']:>6.3f} "
                  f"{s['ssim_edge']:>6.3f} {s['color_hist']:>6.3f} "
                  f"{s['clip']:>6.3f} {s['phash']:>6.3f} {gpt:>6} {flag:>8}")
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

        recommended = 0.45
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
