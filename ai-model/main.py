"""
multi_signal_verify.py - Multi-Signal Image Authenticity Verification
---------------------------------------------------------------------
5-signal fusion pipeline that checks a companion photo (candidate, e.g. a
phone photo submitted alongside a claim) against the hardware-verified
device capture (source of truth, e.g. a signed Pi/ESP camera image).

This mirrors the "device (source-of-truth) image vs. companion mobile
photo" terminology used in public-server/companionCapture.js -- the device
image is never the thing being verified, only the anchor everything else
is checked against.

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
import re
import json
import time
import base64
import cv2
import numpy as np
import imagehash
from PIL import Image, ImageFilter, ImageOps
from skimage.metrics import structural_similarity as ssim

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from openai import (
        OpenAI, APIConnectionError, APITimeoutError,
        RateLimitError, InternalServerError,
    )
    RETRYABLE_OPENAI_ERRORS = (
        APIConnectionError, APITimeoutError, RateLimitError, InternalServerError,
    )
except ImportError:
    OpenAI = None
    RETRYABLE_OPENAI_ERRORS = ()

# CLIP needs torch + transformers loaded, and the model weights alone are
# ~600MB in fp32 -- that blows past a 512MB instance (e.g. Render free tier)
# before a single image is processed. Off by default; set ENABLE_CLIP=1 on
# a box with enough headroom to bring the signal back.
ENABLE_CLIP = os.environ.get("ENABLE_CLIP") == "1"


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


def preprocess_truth_image(img: Image.Image) -> Image.Image:
    """Sharpen + auto-contrast the source-of-truth (hardware-verified)
    image to reduce the quality gap with the companion photo -- the
    hardware sensor is typically the weaker camera of the pair.

    Named "truth" rather than "device" to avoid colliding with the
    compute-device ("cpu"/"cuda") terminology used elsewhere in this file.
    """
    img = img.filter(ImageFilter.SHARPEN)
    arr = np.array(img).astype(np.float32)
    for c in range(3):
        lo, hi = arr[:, :, c].min(), arr[:, :, c].max()
        if hi > lo:
            arr[:, :, c] = (arr[:, :, c] - lo) / (hi - lo) * 255
    return Image.fromarray(arr.clip(0, 255).astype(np.uint8))


def preprocess_pair(companion: Image.Image, truth: Image.Image) -> dict:
    """
    Prepare the companion (candidate) / truth (source-of-truth, hardware
    capture) pair at the sizes each signal needs. Returns dict with resized
    PIL images ready for each signal.
    """
    truth = preprocess_truth_image(truth)
    return {
        "orb_companion": companion.resize((512, 512), Image.LANCZOS),
        "orb_truth": truth.resize((512, 512), Image.LANCZOS),
        "small_companion": companion.resize((256, 256), Image.LANCZOS),
        "small_truth": truth.resize((256, 256), Image.LANCZOS),
        "clip_companion": companion,
        "clip_truth": truth,
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
        try:
            from transformers import CLIPProcessor, CLIPModel
        except ImportError:
            raise ImportError("Run: pip install transformers")

        self.device = device
        self.model = CLIPModel.from_pretrained(self.MODEL_ID).to(device).eval()
        self.processor = CLIPProcessor.from_pretrained(self.MODEL_ID)

    def _encode(self, img: Image.Image) -> "torch.Tensor":
        import torch
        import torch.nn.functional as F

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
    Asks a GPT-4o-class vision model to forensically compare a candidate
    (companion) photo against the hardware-verified source-of-truth
    capture. This is the only signal in the pipeline that can catch
    localized compositing -- a person or object inserted into an otherwise
    real background -- because it was previously only asked "same scene?",
    which a composite trivially passes: it reuses the real background on
    purpose. It's now explicitly asked to look for tampering, not just
    scene match.
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

    _PROMPT = (
        "You are a forensic image analyst. Image 2 is a hardware-verified "
        "camera capture -- ground truth, unedited. Image 1 is a candidate "
        "photo submitted as allegedly showing the same real moment.\n\n"
        "Determine whether Image 1 is an authentic, unedited photo of the "
        "same real scene as Image 2, or whether it has been digitally "
        "altered -- e.g. a person or object inserted/composited in, a face "
        "swapped, or part of the image AI-generated. Differences in "
        "exposure, color grading, sharpness, and sensor noise between the "
        "two cameras are expected and NOT evidence of tampering on their "
        "own. Look specifically for: mismatched lighting/shadows between "
        "people or objects in the same frame, a rendering style or "
        "sharpness on one subject that doesn't match the rest of the "
        "scene, blending seams, or a person/object that could not "
        "plausibly have been photographed in that moment (e.g. a public "
        "figure appearing in an ordinary candid setting).\n\n"
        'Respond with ONLY a JSON object, no markdown fences: '
        '{"same_scene": true|false, "tampered": true|false, '
        '"confidence": 0.0-1.0, "reason": "<one sentence>"}'
    )

    def score(self, companion_img: Image.Image, truth_img: Image.Image,
              floor: float = 0.35) -> float:
        """
        A single reasoning-model pass isn't fully deterministic: the exact
        same pair of genuine, unedited photos has been observed to score
        confidence 0.30 ("tampered") on one call and 0.86 ("clean") on a
        retry with identical inputs. Since a score below `floor` hard-
        rejects in ImageVerifier, one unlucky response could reject a real
        photo -- so any result landing below the floor gets one
        confirmatory second opinion before it's trusted. Only a result
        both calls agree is below-floor gets returned as a confident
        reject. A first result that already clears the floor is trusted
        immediately; that's the common case and doesn't pay for a second
        call.
        """
        first = self._authenticity_confidence(self._judge(companion_img, truth_img))
        if first >= floor:
            return first

        second = self._authenticity_confidence(self._judge(companion_img, truth_img))
        if second < floor:
            return min(first, second)

        # The two calls disagree -- not the confident, repeatable signal a
        # hard reject needs. Trust the second (clean) read rather than
        # freeze on the first response's noise.
        return second

    def _judge(self, companion_img: Image.Image, truth_img: Image.Image) -> dict:
        raw = self._complete(companion_img, truth_img, self._PROMPT)
        return self._parse_json(raw)

    @staticmethod
    def _authenticity_confidence(data: dict) -> float:
        """Map the model's raw judgement to an authenticity confidence in
        [0, 1]. If it reports tampering (or a scene mismatch), "confidence"
        in the response means confidence-that-it's-fake, so it's capped
        low regardless of the raw number -- a confident "this is fake"
        (e.g. tampered=true, confidence=0.99) must score low, not high."""
        confidence = max(0.0, min(float(data.get("confidence", 0.0)), 1.0))
        if data.get("tampered", False) or not data.get("same_scene", False):
            return min(confidence, 0.3)
        return confidence

    def _complete(self, img1: Image.Image, img2: Image.Image, prompt: str,
                  max_completion_tokens: int = 600, max_retries: int = 2) -> str:
        """
        Two independent failure modes, two independent retries:

        1. Transient API errors (rate limit, timeout, connection drop, 5xx)
           -- retried with exponential backoff, same token budget.
        2. Reasoning models can spend the whole completion-token budget on
           internal reasoning and return empty content (finish_reason=
           "length", reasoning_tokens == budget) with nothing left for the
           actual answer -- retried with the budget doubled.
        """
        tokens = max_completion_tokens
        last_finish_reason = None

        for attempt in range(max_retries + 1):
            try:
                resp = self.client.chat.completions.create(
                    model=self.model,
                    max_completion_tokens=tokens,
                    messages=[{
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": self._to_data_url(img1)}},
                            {"type": "image_url", "image_url": {"url": self._to_data_url(img2)}},
                        ],
                    }],
                )
            except RETRYABLE_OPENAI_ERRORS:
                if attempt == max_retries:
                    raise
                time.sleep(2 ** attempt)
                continue

            content = resp.choices[0].message.content
            if content:
                return self._strip_markdown_fence(content)

            last_finish_reason = resp.choices[0].finish_reason
            tokens *= 2

        raise RuntimeError(
            f"OpenAI vision signal returned no content after "
            f"{max_retries + 1} attempts (finish_reason={last_finish_reason})"
        )

    @staticmethod
    def _strip_markdown_fence(content: str) -> str:
        raw = content.strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        return raw

    @staticmethod
    def _parse_json(raw: str) -> dict:
        """The prompt asks for JSON-only output, but a model can still wrap
        it in a stray sentence. Fall back to pulling out the first {...}
        block before giving up."""
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", raw, re.DOTALL)
            if not match:
                raise
            return json.loads(match.group(0))


# ------------------------------------------------------------------
#  IMAGE VERIFIER - MULTI-SIGNAL FUSION
# ------------------------------------------------------------------

SIGNAL_CONFIG = {
    "orb":           {"weight": 0.05, "floor": 0.00},
    "ssim_edge":     {"weight": 0.15, "floor": 0.10},
    "color_hist":    {"weight": 0.15, "floor": 0.05},
    "clip":          {"weight": 0.20, "floor": 0.40},
    "phash":         {"weight": 0.15, "floor": 0.20},
    "vision": {"weight": 0.30, "floor": 0.35},
}


class ImageVerifier:
    """
    Multi-signal image authenticity verifier.
    Combines 6 independent signals with weighted fusion and per-signal floors:
    5 pixel/embedding-level signals plus a GPT-4o-class vision judgment.

    Every check is directional: a companion (candidate) photo is scored
    against a source-of-truth capture from verified hardware. The truth
    image is always the anchor -- it's never the side being judged.
    """

    def __init__(self, device: str = "cpu", config: dict = None, use_openai: bool = True):
        self.config = config or SIGNAL_CONFIG
        self.clip = CLIPSignal(device=device) if ENABLE_CLIP else None
        self.use_openai = use_openai

        self.openai = None
        if use_openai:
            try:
                self.openai = OpenAIVisionSignal()
            except RuntimeError as e:
                print(f"[ImageVerifier] OpenAI vision signal disabled: {e}")

    def verify(self, companion_path: str, truth_path: str,
               threshold: float = 0.45) -> dict:
        """
        Check a companion (candidate) photo against the hardware-verified
        source-of-truth capture. truth_path is the anchor -- it's never the
        thing being judged, only what companion_path is judged against.
        """
        companion_img = load_image(companion_path)
        truth_img = load_image(truth_path)
        pair = preprocess_pair(companion_img, truth_img)

        signals = {
            "orb": signal_orb(pair["orb_companion"], pair["orb_truth"]),
            "ssim_edge": signal_ssim_edge(pair["small_companion"], pair["small_truth"]),
            "color_hist": signal_color_hist(pair["small_companion"], pair["small_truth"]),
            "phash": signal_phash(pair["small_companion"], pair["small_truth"]),
        }
        if self.clip is not None:
            signals["clip"] = self.clip.score(pair["clip_companion"], pair["clip_truth"])

        openai_error = None
        if self.openai is not None:
            try:
                signals["vision"] = self.openai.score(
                    pair["clip_companion"], pair["clip_truth"],
                    floor=self.config["vision"]["floor"],
                )
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

        # vision is the only signal that can catch a person/object
        # composited into an otherwise real background -- the other 5 are
        # global/coarse and pass a good composite (see main.py module
        # docstring). If the caller asked for it (use_openai=True) but it
        # didn't run this call -- no key, a transient API error, whatever --
        # don't let the remaining signals alone decide "authentic". Reject
        # and say why, instead of silently falling back to weaker checks.
        forensic_unavailable = self.use_openai and "vision" not in signals
        if forensic_unavailable and rejected_by is None:
            rejected_by = "vision_unavailable"

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
        if forensic_unavailable:
            result["forensic_signal_unavailable"] = True
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
            companion_p = os.path.join(data_dir, scene, "dslr.jpg")
            truth_p = os.path.join(data_dir, scene, "esp.jpg")
            if not (os.path.exists(companion_p) and os.path.exists(truth_p)):
                print(f"{scene:<16} {'MISSING':>6}")
                continue

            r = self.verify(companion_p, truth_p, threshold=threshold)
            s = r["signals"]
            gpt = f"{s['vision']:.3f}" if "vision" in s else "  n/a"
            clip = f"{s['clip']:.3f}" if "clip" in s else "  n/a"
            flag = "PASS" if r["authentic"] else f"FAIL({r['rejected_by'] or 'score'})"
            print(f"{scene:<16} {r['score']:>6.3f} {s['orb']:>6.3f} "
                  f"{s['ssim_edge']:>6.3f} {s['color_hist']:>6.3f} "
                  f"{clip:>6} {s['phash']:>6.3f} {gpt:>6} {flag:>8}")
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
            companion_p = os.path.join(data_dir, scene, "dslr.jpg")
            truth_p = os.path.join(data_dir, scene, "esp.jpg")
            if os.path.exists(companion_p) and os.path.exists(truth_p):
                r = self.verify(companion_p, truth_p, threshold=0.0)
                pos_scores.append(r["score"])

        neg_scores = []
        for i in range(len(scenes)):
            s1 = scenes[i]
            s2 = scenes[(i + 1) % len(scenes)]
            if s1 == s2:
                continue
            companion_p = os.path.join(data_dir, s1, "dslr.jpg")
            truth_p = os.path.join(data_dir, s2, "esp.jpg")
            if os.path.exists(companion_p) and os.path.exists(truth_p):
                r = self.verify(companion_p, truth_p, threshold=0.0)
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
    if ENABLE_CLIP:
        import torch
        DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    else:
        DEVICE = "cpu"
    DATA_DIR = "./data"
    COMPANION = os.path.join(DATA_DIR, "scene_001", "dslr.jpg")
    TRUTH = os.path.join(DATA_DIR, "scene_001", "esp.jpg")

    print(f"Device: {DEVICE}\n")

    verifier = ImageVerifier(device=DEVICE)

    # Diagnose all scenes
    verifier.diagnose(DATA_DIR)

    # Calibrate threshold
    threshold = verifier.calibrate(DATA_DIR)

    # Verify single pair
    print(f"\n-- Verify scene_001 (threshold={threshold}) --")
    result = verifier.verify(COMPANION, TRUTH, threshold=threshold)
    for k, v in result.items():
        print(f"  {k}: {v}")
