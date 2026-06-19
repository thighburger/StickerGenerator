"""하네스용 ML 런타임 검증 스크립트.

임시 디렉터리에서 학습/로그를 수행해 커밋된 champion/ 과 실행 로그를 건드리지 않는다.
각 검증 결과를 JSON 으로 stdout 에 출력하고, final-harness.mjs 가 이를 파싱한다.
PYTHONPATH=pet-sticker-ml/src 로 실행된다.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

results: dict[str, str] = {}


def _ok(*keys: str) -> None:
    for key in keys:
        results[key] = "ok"


def _fail(reason: str, *keys: str) -> None:
    for key in keys:
        results[key] = f"fail: {reason}"


def main() -> None:
    tmp = Path(tempfile.mkdtemp(prefix="harness_"))

    from pet_sticker_ml import config
    from pet_sticker_ml.champion_export import load_metadata
    from pet_sticker_ml.features import FEATURE_NAMES

    # 1) 챔피언 export 존재/유효
    try:
        meta = load_metadata(config.CHAMPION_DIR)
        assert meta is not None, "champion metadata 없음"
        assert meta.get("alias") == "champion", "alias != champion"
        assert meta.get("featureNames"), "featureNames 비어있음"
        assert (config.CHAMPION_DIR / "model.pkl").exists(), "model.pkl 없음"
        _ok("champion_export")
    except Exception as exc:  # noqa: BLE001
        _fail(str(exc), "champion_export")

    # 2) MLflow 학습 실행 + param/metric/artifact 기록
    try:
        tracking = (tmp / "mlruns").as_uri()
        from pet_sticker_ml.train import run_training

        summary = run_training(
            data_version="v1",
            n_estimators=40,
            tracking_uri=tracking,
            candidate_dir=tmp / "candidate",
        )
        import mlflow
        from mlflow.tracking import MlflowClient

        mlflow.set_tracking_uri(tracking)
        client = MlflowClient()
        run = client.get_run(summary["run_id"])
        assert len(run.data.params) >= 1, "param 미기록"
        _ok("train_run", "mlflow_params")
        assert "macro_f1" in run.data.metrics, "macro_f1 metric 미기록"
        _ok("mlflow_metrics")
        artifacts = [a.path for a in client.list_artifacts(run.info.run_id)]
        assert "features.json" in artifacts and "model" in artifacts, f"artifact 미기록: {artifacts}"
        _ok("mlflow_artifacts")
    except Exception as exc:  # noqa: BLE001
        _fail(str(exc), "train_run", "mlflow_params", "mlflow_metrics", "mlflow_artifacts")

    # 3) 챔피언 추론 + 예측/피드백 로그 생성
    try:
        from pet_sticker_ml.logging_store import (
            append_feedback_log,
            append_prediction_log,
        )
        from pet_sticker_ml.predictor import load_champion_predictor

        predictor = load_champion_predictor(config.CHAMPION_DIR)
        features = dict(zip(FEATURE_NAMES, [1200, 1000, 1.2, 1.2, 130, 45, 300, 30, 0.5, 0.1], strict=True))
        result = predictor.predict(features)
        assert 0 <= result.score <= 100 and result.modelVersion, "예측 결과 비정상"
        _ok("predict")

        log_dir = tmp / "logs"
        pred_path = append_prediction_log(result, "harness-1", source="harness", log_dir=log_dir)
        assert pred_path.exists() and len(pred_path.read_text(encoding="utf-8").splitlines()) >= 2, "예측 로그 미생성"
        _ok("prediction_log")

        fb_path = append_feedback_log("harness-1", "제작 적합", "보정 권장", log_dir=log_dir)
        assert fb_path.exists() and len(fb_path.read_text(encoding="utf-8").splitlines()) >= 2, "피드백 로그 미생성"
        _ok("feedback_log")
    except Exception as exc:  # noqa: BLE001
        _fail(str(exc), "predict", "prediction_log", "feedback_log")

    # 4) 모델 정보 API (FastAPI TestClient, 인프로세스)
    try:
        from fastapi.testclient import TestClient

        from pet_sticker_ml.api import create_app

        app = create_app(champion_dir=config.CHAMPION_DIR, log_dir=tmp / "logs2")
        client = TestClient(app)
        health = client.get("/health")
        assert health.status_code == 200 and health.json()["modelLoaded"], "health 비정상"
        info = client.get("/model/info")
        assert info.status_code == 200 and info.json().get("modelVersion"), "model/info 비정상"
        _ok("model_info_api")
    except Exception as exc:  # noqa: BLE001
        _fail(str(exc), "model_info_api")

    print(json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    os.environ.setdefault("PYTHONWARNINGS", "ignore")
    main()
