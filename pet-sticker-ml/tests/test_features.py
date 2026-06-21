import math

from pet_sticker_ml.config import QUALITY_CLASSES
from pet_sticker_ml.features import (
    FEATURE_NAMES,
    extract_features_from_image,
    quality_score_from_features,
    score_to_label,
)


def test_extract_returns_all_features(sample_image_bytes):
    features = extract_features_from_image(sample_image_bytes)
    assert set(FEATURE_NAMES).issubset(features.keys())
    for name in FEATURE_NAMES:
        assert math.isfinite(features[name])
    assert features["sharpness"] >= 0
    assert 0.0 <= features["subject_ratio"] <= 1.0
    assert 0.0 <= features["edge_density"] <= 1.0


def test_extract_is_deterministic(sample_image_bytes):
    first = extract_features_from_image(sample_image_bytes)
    second = extract_features_from_image(sample_image_bytes)
    assert first == second


def test_quality_score_in_range(sample_features):
    score = quality_score_from_features(sample_features)
    assert 0.0 <= score <= 100.0
    assert score_to_label(score) in QUALITY_CLASSES


def test_score_to_label_thresholds():
    assert score_to_label(95.0) == QUALITY_CLASSES[0]
    assert score_to_label(55.0) == QUALITY_CLASSES[1]
    assert score_to_label(10.0) == QUALITY_CLASSES[2]
