from fastapi.testclient import TestClient

from pet_sticker_ml.api import create_app
from pet_sticker_ml.config import QUALITY_CLASSES


def _client(trained_champion, tmp_path):
    app = create_app(champion_dir=trained_champion, log_dir=tmp_path)
    return TestClient(app)


def test_health(trained_champion, tmp_path):
    client = _client(trained_champion, tmp_path)
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["modelLoaded"] is True
    assert body["modelVersion"] == "v1"


def test_predict_features(trained_champion, tmp_path, sample_features):
    client = _client(trained_champion, tmp_path)
    response = client.post("/predict/features", json={"features": sample_features})
    assert response.status_code == 200
    body = response.json()
    assert 0.0 <= body["score"] <= 100.0
    assert body["qualityClass"] in QUALITY_CLASSES
    assert body["requestId"]
    assert body["modelVersion"] == "v1"


def test_predict_image(trained_champion, tmp_path, sample_image_bytes):
    client = _client(trained_champion, tmp_path)
    files = {"image": ("pet.png", sample_image_bytes, "image/png")}
    response = client.post("/predict", files=files)
    assert response.status_code == 200
    assert response.json()["qualityClass"] in QUALITY_CLASSES


def test_predict_features_missing(trained_champion, tmp_path):
    client = _client(trained_champion, tmp_path)
    response = client.post("/predict/features", json={"features": {"width": 100}})
    assert response.status_code == 400


def test_feedback(trained_champion, tmp_path):
    client = _client(trained_champion, tmp_path)
    response = client.post(
        "/feedback",
        json={
            "requestId": "req-1",
            "predictedClass": "제작 적합",
            "correctedClass": "보정 권장",
            "orderId": "STK-1",
        },
    )
    assert response.status_code == 200
    assert response.json()["stored"] is True


def test_model_info(trained_champion, tmp_path):
    client = _client(trained_champion, tmp_path)
    response = client.get("/model/info")
    assert response.status_code == 200
    body = response.json()
    assert body["modelVersion"] == "v1"
    assert body["featureNames"]
    assert body["classes"] == QUALITY_CLASSES


def test_logs_summary_after_predict(trained_champion, tmp_path, sample_features):
    client = _client(trained_champion, tmp_path)
    client.post("/predict/features", json={"features": sample_features})
    response = client.get("/logs/summary")
    assert response.status_code == 200
    assert response.json()["prediction_count"] >= 1
