import csv

from pet_sticker_ml.logging_store import (
    FEEDBACK_FIELDS,
    PREDICTION_FIELDS,
    append_feedback_log,
    append_prediction_log,
    feedback_log_path,
    prediction_log_path,
    summarize_logs,
)
from pet_sticker_ml.predictor import load_champion_predictor


def test_prediction_log_created(tmp_path, trained_champion, sample_features):
    predictor = load_champion_predictor(trained_champion)
    result = predictor.predict(sample_features)
    path = append_prediction_log(result, "req-1", source="test", log_dir=tmp_path)
    assert path.exists()
    with path.open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == 1
    assert set(PREDICTION_FIELDS).issubset(rows[0].keys())
    assert rows[0]["quality_class"] == result.qualityClass


def test_feedback_log_created(tmp_path):
    path = append_feedback_log(
        "req-1",
        predicted_class="제작 적합",
        corrected_class="보정 권장",
        order_id="STK-1",
        log_dir=tmp_path,
    )
    assert path.exists()
    with path.open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == 1
    assert set(FEEDBACK_FIELDS).issubset(rows[0].keys())


def test_summarize_logs(tmp_path, trained_champion, sample_features):
    predictor = load_champion_predictor(trained_champion)
    append_prediction_log(predictor.predict(sample_features), "req-1", log_dir=tmp_path)
    append_feedback_log("req-1", "제작 적합", "보정 권장", log_dir=tmp_path)
    summary = summarize_logs(log_dir=tmp_path)
    assert summary["prediction_count"] == 1
    assert summary["feedback_count"] == 1
    assert summary["correction_count"] == 1
    assert prediction_log_path(tmp_path).exists()
    assert feedback_log_path(tmp_path).exists()
