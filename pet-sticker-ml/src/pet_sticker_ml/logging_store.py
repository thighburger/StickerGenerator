"""예측 로그 / 피드백 로그 저장 (CSV).

강의의 "예측 로깅 + 사용자 피드백 → 재학습 데이터" 패턴을 구현한다.
- prediction_log.csv: 시간·요청ID·소스·모델버전·점수·클래스·신뢰도 + 특징값
- feedback_log.csv: 시간·요청ID·주문ID·예측/교정 클래스 (재학습 데이터로 활용)
경로는 인자로 주입 가능(테스트/하네스는 임시 디렉터리 사용).
"""

from __future__ import annotations

import csv
import threading
from datetime import UTC, datetime
from pathlib import Path

from . import config
from .features import FEATURE_NAMES

_LOCK = threading.Lock()

PREDICTION_FIELDS = [
    "timestamp",
    "request_id",
    "source",
    "model_version",
    "score",
    "quality_class",
    "confidence",
    *FEATURE_NAMES,
]
FEEDBACK_FIELDS = [
    "timestamp",
    "request_id",
    "order_id",
    "model_version",
    "predicted_class",
    "corrected_class",
    "score",
    "note",
]


def _now() -> str:
    return datetime.now(UTC).isoformat()


def prediction_log_path(log_dir=None) -> Path:
    return Path(log_dir or config.LOG_DIR) / "prediction_log.csv"


def feedback_log_path(log_dir=None) -> Path:
    return Path(log_dir or config.LOG_DIR) / "feedback_log.csv"


def _append(path: Path, fields: list[str], row: dict) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    is_new = not path.exists()
    with _LOCK, path.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        if is_new:
            writer.writeheader()
        writer.writerow(row)
    return path


def append_prediction_log(result, request_id: str, source: str = "api", log_dir=None) -> Path:
    row = {
        "timestamp": _now(),
        "request_id": request_id,
        "source": source,
        "model_version": result.modelVersion,
        "score": result.score,
        "quality_class": result.qualityClass,
        "confidence": result.confidence,
    }
    for name in FEATURE_NAMES:
        row[name] = result.features.get(name)
    return _append(prediction_log_path(log_dir), PREDICTION_FIELDS, row)


def append_feedback_log(
    request_id: str,
    predicted_class: str,
    corrected_class: str,
    order_id: str | None = None,
    model_version: str | None = None,
    score: float | None = None,
    note: str | None = None,
    log_dir=None,
) -> Path:
    row = {
        "timestamp": _now(),
        "request_id": request_id,
        "order_id": order_id or "",
        "model_version": model_version or "",
        "predicted_class": predicted_class,
        "corrected_class": corrected_class,
        "score": score if score is not None else "",
        "note": note or "",
    }
    return _append(feedback_log_path(log_dir), FEEDBACK_FIELDS, row)


def _read(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def summarize_logs(log_dir=None, last_n: int = 10) -> dict:
    """예측/피드백 로그 요약 (관리자 화면/보고서용)."""
    pred_rows = _read(prediction_log_path(log_dir))
    fb_rows = _read(feedback_log_path(log_dir))

    class_counts: dict[str, int] = {}
    scores: list[float] = []
    for row in pred_rows:
        cls = row.get("quality_class", "")
        class_counts[cls] = class_counts.get(cls, 0) + 1
        try:
            scores.append(float(row["score"]))
        except (KeyError, ValueError, TypeError):
            pass

    corrections = sum(
        1 for row in fb_rows if row.get("predicted_class") != row.get("corrected_class")
    )
    return {
        "prediction_count": len(pred_rows),
        "class_counts": class_counts,
        "mean_score": round(sum(scores) / len(scores), 2) if scores else None,
        "feedback_count": len(fb_rows),
        "correction_count": corrections,
        "correction_rate": round(corrections / len(fb_rows), 3) if fb_rows else None,
        "recent_predictions": list(reversed(pred_rows[-last_n:])),
        "recent_feedback": list(reversed(fb_rows[-last_n:])),
    }
