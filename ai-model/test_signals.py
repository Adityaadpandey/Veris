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
