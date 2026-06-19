import json
from pathlib import Path

from pet_sticker_ml.model_runtime import predict_from_export, quality_label


MODEL_PATH = Path(__file__).resolve().parents[2] / "pet-sticker-next" / "lib" / "ml" / "sticker-quality-model.json"


def test_exported_model_scores_good_features_above_weak_features():
    model = json.loads(MODEL_PATH.read_text(encoding="utf-8"))
    good = {name: 0.95 for name in model["featureNames"]}
    weak = {name: 0.25 for name in model["featureNames"]}

    assert predict_from_export(model, good) > predict_from_export(model, weak)
    assert predict_from_export(model, good) >= 82
    assert predict_from_export(model, weak) < 65


def test_quality_labels_match_thresholds():
    assert quality_label(90) == "제작 적합"
    assert quality_label(70) == "보정 권장"
    assert quality_label(40) == "재촬영 권장"
