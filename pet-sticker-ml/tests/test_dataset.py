import pandas as pd

from pet_sticker_ml.config import QUALITY_CLASSES
from pet_sticker_ml.dataset import DATA_VERSIONS, generate_dataset
from pet_sticker_ml.features import FEATURE_NAMES


def test_columns_and_labels():
    frame = generate_dataset("v1")
    assert list(frame.columns) == [*FEATURE_NAMES, "quality_score", "label"]
    assert set(frame["label"]).issubset(set(QUALITY_CLASSES))
    assert frame["quality_score"].between(0, 100).all()


def test_reproducible_with_seed():
    first = generate_dataset("v1")
    second = generate_dataset("v1")
    pd.testing.assert_frame_equal(first, second)


def test_v2_has_more_samples_than_v1():
    assert len(generate_dataset("v2")) > len(generate_dataset("v1"))


def test_all_versions_generate():
    for version in DATA_VERSIONS:
        frame = generate_dataset(version)
        assert len(frame) > 0
        # 세 클래스가 모두 존재해야 학습 가능
        assert set(frame["label"]) == set(QUALITY_CLASSES)
