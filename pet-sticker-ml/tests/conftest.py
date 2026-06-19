"""테스트 공용 픽스처.

격리 원칙: 임시 디렉터리에 작은 챔피언 모델을 학습/export 해 사용한다. 커밋된 champion/ 이나
실행 로그에 의존하지 않으므로 신규 클론/CI 에서도 동일하게 통과한다.
"""

from __future__ import annotations

from io import BytesIO

import numpy as np
import pytest
from PIL import Image

from pet_sticker_ml.champion_export import build_metadata, export_model
from pet_sticker_ml.features import FEATURE_NAMES
from pet_sticker_ml.train import train_model


@pytest.fixture(scope="session")
def trained_champion(tmp_path_factory):
    champion_dir = tmp_path_factory.mktemp("champion")
    result = train_model(data_version="v1", seed=1, n_estimators=60)
    metadata = build_metadata(
        version=1,
        run_id="test-run",
        data_version="v1",
        metrics=result.metrics,
        params=result.params,
    )
    export_model(result.pipeline, metadata, champion_dir)
    return champion_dir


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
