from pet_sticker_ml.config import QUALITY_CLASSES
from pet_sticker_ml.features import FEATURE_NAMES
from pet_sticker_ml.predictor import load_champion_predictor


def test_predict_from_features(trained_champion, sample_features):
    predictor = load_champion_predictor(trained_champion)
    result = predictor.predict(sample_features)
    assert 0.0 <= result.score <= 100.0
    assert result.qualityClass in QUALITY_CLASSES
    assert result.recommendation
    assert 0.0 <= result.confidence <= 1.0
    assert result.modelVersion == "v1"
    assert set(result.features.keys()) == set(FEATURE_NAMES)


def test_predict_from_image(trained_champion, sample_image_bytes):
    predictor = load_champion_predictor(trained_champion)
    result = predictor.predict_from_image(sample_image_bytes)
    assert result.qualityClass in QUALITY_CLASSES
    assert result.modelVersion == "v1"
