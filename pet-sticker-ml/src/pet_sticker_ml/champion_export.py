"""챔피언 모델 포터블 export/load.

MLflow 서버 없이도 서빙할 수 있도록 학습된 sklearn 파이프라인을 ``model.pkl`` 로,
메타데이터(버전·metric·featureNames 등)를 ``metadata.json`` 으로 저장한다.
FastAPI 서비스는 이 디렉터리만 읽어 모델을 로드한다 → CI/Docker 재현성 보장.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import joblib

from .config import (
    CHAMPION_ALIAS,
    MODEL_NAME,
    QUALITY_CLASSES,
    SCORE_THRESHOLD_PASS,
    SCORE_THRESHOLD_RETOUCH,
)
from .features import FEATURE_NAMES

MODEL_FILENAME = "model.pkl"
METADATA_FILENAME = "metadata.json"


def build_metadata(
    *,
    version: int,
    run_id: str | None,
    data_version: str,
    metrics: dict,
    params: dict,
    trained_at: str | None = None,
    extra: dict | None = None,
) -> dict:
    """챔피언 메타데이터 dict 생성."""
    metadata = {
        "modelName": MODEL_NAME,
        "alias": CHAMPION_ALIAS,
        "version": int(version),
        "runId": run_id,
        "dataVersion": data_version,
        "featureNames": FEATURE_NAMES,
        "classes": QUALITY_CLASSES,
        "scoreThresholds": {
            "pass": SCORE_THRESHOLD_PASS,
            "retouch": SCORE_THRESHOLD_RETOUCH,
        },
        "metrics": metrics,
        "params": params,
        "trainedAt": trained_at or datetime.now(UTC).isoformat(),
    }
    if extra:
        metadata.update(extra)
    return metadata


def export_model(pipeline, metadata: dict, target_dir: Path) -> Path:
    """파이프라인 + 메타데이터를 target_dir 에 저장."""
    target = Path(target_dir)
    target.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, target / MODEL_FILENAME)
    (target / METADATA_FILENAME).write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return target


def load_metadata(source_dir: Path) -> dict | None:
    path = Path(source_dir) / METADATA_FILENAME
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def load_model(source_dir: Path):
    path = Path(source_dir) / MODEL_FILENAME
    if not path.exists():
        raise FileNotFoundError(
            f"챔피언 모델이 없습니다: {path}. 먼저 `python -m pet_sticker_ml.train --bootstrap-champion` 실행."
        )
    return joblib.load(path)


def model_version_label(metadata: dict | None) -> str:
    """표시용 모델 버전 문자열 (예: v3)."""
    if not metadata:
        return "unknown"
    return f"v{metadata.get('version', '?')}"
