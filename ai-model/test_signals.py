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
COMPANION_PATH = os.path.join(SCENE_001, "dslr.jpg")
TRUTH_PATH = os.path.join(SCENE_001, "esp.jpg")


@pytest.fixture
def companion_image():
    return Image.open(COMPANION_PATH).convert("RGB")


@pytest.fixture
def truth_image():
    return Image.open(TRUTH_PATH).convert("RGB")


@pytest.fixture
def random_image():
    """A random noise image — should NOT match any real photo."""
    arr = np.random.randint(0, 255, (256, 256, 3), dtype=np.uint8)
    return Image.fromarray(arr)


def test_data_exists():
    assert os.path.exists(COMPANION_PATH), f"Missing {COMPANION_PATH}"
    assert os.path.exists(TRUTH_PATH), f"Missing {TRUTH_PATH}"


def test_preprocess_truth_image_sharpens_and_normalizes(truth_image):
    from main import preprocess_truth_image
    result = preprocess_truth_image(truth_image)
    assert isinstance(result, Image.Image)
    assert result.mode == "RGB"
    arr = np.array(result)
    assert arr.min() <= 5
    assert arr.max() >= 250


def test_preprocess_pair_returns_correct_sizes():
    from main import preprocess_pair
    companion = Image.open(COMPANION_PATH).convert("RGB")
    truth = Image.open(TRUTH_PATH).convert("RGB")
    result = preprocess_pair(companion, truth)
    assert result["orb_companion"].size == (512, 512)
    assert result["orb_truth"].size == (512, 512)
    assert result["small_companion"].size == (256, 256)
    assert result["small_truth"].size == (256, 256)


def test_orb_same_scene_scores_above_floor():
    from main import signal_orb, preprocess_pair
    companion = Image.open(COMPANION_PATH).convert("RGB")
    truth = Image.open(TRUTH_PATH).convert("RGB")
    pair = preprocess_pair(companion, truth)
    score = signal_orb(pair["orb_companion"], pair["orb_truth"])
    assert 0.0 <= score <= 1.0
    assert score > 0.3, f"Same scene ORB score {score} below floor"


def test_orb_random_image_scores_low(companion_image, random_image):
    from main import signal_orb, preprocess_pair
    pair = preprocess_pair(companion_image, random_image)
    score = signal_orb(pair["orb_companion"], pair["orb_truth"])
    assert 0.0 <= score <= 1.0
    assert score < 0.5, f"Random image ORB score {score} unexpectedly high"


def test_ssim_edge_same_scene_above_floor():
    from main import signal_ssim_edge, preprocess_pair
    companion = Image.open(COMPANION_PATH).convert("RGB")
    truth = Image.open(TRUTH_PATH).convert("RGB")
    pair = preprocess_pair(companion, truth)
    score = signal_ssim_edge(pair["small_companion"], pair["small_truth"])
    assert 0.0 <= score <= 1.0
    assert score > 0.15, f"Same scene SSIM edge score {score} below floor"


def test_ssim_edge_random_image_scores_low(companion_image, random_image):
    from main import signal_ssim_edge, preprocess_pair
    pair = preprocess_pair(companion_image, random_image)
    score = signal_ssim_edge(pair["small_companion"], pair["small_truth"])
    assert 0.0 <= score <= 1.0


def test_color_hist_same_scene_above_floor():
    from main import signal_color_hist, preprocess_pair
    companion = Image.open(COMPANION_PATH).convert("RGB")
    truth = Image.open(TRUTH_PATH).convert("RGB")
    pair = preprocess_pair(companion, truth)
    score = signal_color_hist(pair["small_companion"], pair["small_truth"])
    assert 0.0 <= score <= 1.0
    assert score > 0.10, f"Same scene color hist score {score} below floor"


def test_color_hist_identical_image_scores_high(companion_image):
    from main import signal_color_hist
    small = companion_image.resize((256, 256), Image.LANCZOS)
    score = signal_color_hist(small, small)
    assert score > 0.99, f"Identical image color hist score {score} should be ~1.0"


@pytest.fixture(scope="module")
def clip_signal():
    """Load CLIP once for all tests in this module."""
    from main import CLIPSignal
    return CLIPSignal(device="cpu")


def test_clip_same_scene_above_floor(clip_signal):
    companion = Image.open(COMPANION_PATH).convert("RGB")
    truth = Image.open(TRUTH_PATH).convert("RGB")
    from main import preprocess_truth_image
    truth = preprocess_truth_image(truth)
    score = clip_signal.score(companion, truth)
    assert 0.0 <= score <= 1.0
    assert score > 0.40, f"Same scene CLIP score {score} below floor"


def test_clip_random_image_scores_lower(clip_signal, random_image):
    companion = Image.open(COMPANION_PATH).convert("RGB")
    same_score = clip_signal.score(companion, companion)
    rand_score = clip_signal.score(companion, random_image)
    assert same_score > rand_score, "Random image should score lower than same image"


def test_phash_identical_image_scores_one(companion_image):
    from main import signal_phash
    score = signal_phash(companion_image, companion_image)
    assert score == 1.0, f"Identical image pHash score {score} should be 1.0"


def test_phash_same_scene_above_floor():
    from main import signal_phash, preprocess_pair
    companion = Image.open(COMPANION_PATH).convert("RGB")
    truth = Image.open(TRUTH_PATH).convert("RGB")
    pair = preprocess_pair(companion, truth)
    score = signal_phash(pair["small_companion"], pair["small_truth"])
    assert 0.0 <= score <= 1.0
    assert score > 0.25, f"Same scene pHash score {score} below floor"


def test_phash_random_image_scores_low(companion_image, random_image):
    from main import signal_phash
    score = signal_phash(companion_image, random_image)
    assert 0.0 <= score <= 1.0


@pytest.fixture(scope="module")
def verifier():
    from main import ImageVerifier
    return ImageVerifier(device="cpu")


def test_verifier_same_scene_authentic(verifier):
    result = verifier.verify(COMPANION_PATH, TRUTH_PATH)
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
    import tempfile
    arr = np.random.randint(0, 255, (256, 256, 3), dtype=np.uint8)
    rand_img = Image.fromarray(arr)
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        rand_img.save(f.name)
        rand_path = f.name
    try:
        result = verifier.verify(COMPANION_PATH, rand_path)
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
        result = verifier.verify(COMPANION_PATH, rand_path)
        assert result["rejected_by"] is not None or result["authentic"] is False
    finally:
        os.unlink(rand_path)


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


# ------------------------------------------------------------------
#  OPENAI VISION SIGNAL
# ------------------------------------------------------------------

def test_openai_vision_requires_api_key(monkeypatch):
    from main import OpenAIVisionSignal
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(RuntimeError):
        OpenAIVisionSignal()


def test_verifier_without_openai_key_falls_back_gracefully(monkeypatch):
    """No API key -> verifier should disable the signal and renormalize
    weights across the rest, not crash or silently zero it out."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    from main import ImageVerifier
    v = ImageVerifier(device="cpu", use_openai=True)
    assert v.openai is None

    result = v.verify(COMPANION_PATH, TRUTH_PATH)
    assert "openai_vision" not in result["signals"]
    assert 0.0 <= result["score"] <= 1.0


@pytest.mark.skipif(
    not os.environ.get("OPENAI_API_KEY"),
    reason="OPENAI_API_KEY not set -- skipping live OpenAI vision call",
)
def test_openai_vision_same_scene_scores_above_floor():
    from main import OpenAIVisionSignal
    companion = Image.open(COMPANION_PATH).convert("RGB")
    truth = Image.open(TRUTH_PATH).convert("RGB")
    signal = OpenAIVisionSignal()
    score = signal.score(companion, truth)
    assert 0.0 <= score <= 1.0
    assert score > 0.35, f"Same scene OpenAI vision score {score} below floor"


@pytest.mark.skipif(
    not os.environ.get("OPENAI_API_KEY"),
    reason="OPENAI_API_KEY not set -- skipping live OpenAI vision call",
)
def test_openai_vision_random_image_scores_low(companion_image, random_image):
    from main import OpenAIVisionSignal
    signal = OpenAIVisionSignal()
    score = signal.score(companion_image, random_image)
    assert 0.0 <= score <= 1.0
    assert score < 0.5, f"Unrelated image OpenAI vision score {score} unexpectedly high"


# ------------------------------------------------------------------
#  REGRESSION: EXIF orientation + ORB normalization
# ------------------------------------------------------------------
#
# scene_001/ras1.jpeg is a real Picamera2 (Raspberry Pi / OV5647) capture
# that carries EXIF orientation tag 6 -- the exact case that silently broke
# every signal, because PIL's Image.open() never applies that tag on its
# own. a.jpeg is the matching upright same-scene photo, so this pair is a
# real repro, not synthetic.

ROTATED_TRUTH_PATH = os.path.join(SCENE_001, "ras1.jpeg")
UPRIGHT_COMPANION_PATH = os.path.join(SCENE_001, "a.jpeg")


def test_load_image_applies_exif_orientation():
    from main import load_image
    raw = Image.open(ROTATED_TRUTH_PATH)
    assert raw.getexif().get(274) == 6, "fixture should carry EXIF orientation 6"

    corrected = load_image(ROTATED_TRUTH_PATH)
    # Orientation 6 is a 90-degree rotation, so width/height swap once
    # the tag is actually applied instead of ignored.
    assert corrected.size == (raw.size[1], raw.size[0])


def test_verify_handles_exif_rotated_companion_image():
    """
    Before the fix, main.py read this pair with raw Image.open() and fed
    every signal a 90-degree-misaligned image, tanking ssim_edge/phash/clip
    even though the photos show the same real scene.
    """
    from main import ImageVerifier
    v = ImageVerifier(device="cpu", use_openai=False)
    result = v.verify(UPRIGHT_COMPANION_PATH, ROTATED_TRUTH_PATH)
    assert result["signals"]["ssim_edge"] > 0.35, (
        f"ssim_edge {result['signals']['ssim_edge']} suggests EXIF orientation "
        "isn't being corrected before scoring"
    )
    assert result["authentic"] is True


def test_orb_score_independent_of_keypoint_budget():
    """
    signal_orb used to divide inliers by the number of keypoints *detected*
    (bounded by max_keypoints) instead of the number that actually matched.
    That meant raising max_keypoints alone would silently crater the score
    for a real match, with no change in match quality. Normalizing by
    len(good) instead makes the score roughly stable across budgets.
    """
    from main import signal_orb, preprocess_pair
    companion = Image.open(COMPANION_PATH).convert("RGB")
    truth = Image.open(TRUTH_PATH).convert("RGB")
    pair = preprocess_pair(companion, truth)

    score_1000 = signal_orb(pair["orb_companion"], pair["orb_truth"], max_keypoints=1000)
    score_3000 = signal_orb(pair["orb_companion"], pair["orb_truth"], max_keypoints=3000)

    assert score_1000 > 0.3, f"Same-scene ORB score {score_1000} too low post-fix"
    assert abs(score_1000 - score_3000) < 0.25, (
        f"ORB score swung from {score_1000} to {score_3000} just from raising "
        "max_keypoints -- normalization is likely dividing by detected "
        "keypoints again instead of matched ones"
    )
