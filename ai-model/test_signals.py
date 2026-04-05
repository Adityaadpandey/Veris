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


def test_preprocess_esp_sharpens_and_normalizes(esp_image):
    from main import preprocess_esp
    result = preprocess_esp(esp_image)
    assert isinstance(result, Image.Image)
    assert result.mode == "RGB"
    arr = np.array(result)
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
