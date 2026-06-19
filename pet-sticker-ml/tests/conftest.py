"""테스트 공용 픽스처."""

from __future__ import annotations

from io import BytesIO

import numpy as np
import pytest
from PIL import Image

from pet_sticker_ml.features import FEATURE_NAMES


@pytest.fixture
def sample_image_bytes():
    rng = np.random.default_rng(0)
    arr = rng.integers(40, 220, (640, 480, 3), dtype=np.uint8)
    buffer = BytesIO()
    Image.fromarray(arr).save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def sample_features():
    values = [1200, 1000, 1.2, 1.2, 130, 45, 300, 30, 0.5, 0.1]
    return dict(zip(FEATURE_NAMES, values, strict=True))
