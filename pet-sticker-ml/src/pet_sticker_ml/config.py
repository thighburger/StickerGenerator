"""중앙 설정 모듈.

경로/모델명/품질 클래스/로그 위치/MLflow tracking URI 를 한 곳에서 관리한다.
모든 경로는 환경변수로 덮어쓸 수 있어 Docker/CI/로컬에서 동일 코드로 동작한다.
강의의 ``config.py`` (MODEL_MODE 스위치 + ``models:/<name>@champion`` URI) 패턴을 따른다.
"""

from __future__ import annotations

import os
from pathlib import Path

# ---------------------------------------------------------------------------
# 경로
# ---------------------------------------------------------------------------
PACKAGE_ROOT = Path(__file__).resolve().parent          # .../src/pet_sticker_ml
PROJECT_ROOT = PACKAGE_ROOT.parents[1]                   # .../pet-sticker-ml


def _path_env(name: str, default: Path) -> Path:
    value = os.environ.get(name)
    return Path(value).expanduser().resolve() if value else default


DATA_DIR = _path_env("PET_STICKER_DATA_DIR", PROJECT_ROOT / "data")
CHAMPION_DIR = _path_env("CHAMPION_DIR", PROJECT_ROOT / "champion")
LOG_DIR = _path_env("LOG_DIR", PROJECT_ROOT / "logs")
MLRUNS_DIR = _path_env("MLRUNS_DIR", PROJECT_ROOT / "mlruns")
CANDIDATE_DIR = _path_env("CANDIDATE_DIR", PROJECT_ROOT / ".candidate")
MODEL_HISTORY_DIR = _path_env("MODEL_HISTORY_DIR", PROJECT_ROOT / "model_history")

PREDICTION_LOG = LOG_DIR / "prediction_log.csv"
FEEDBACK_LOG = LOG_DIR / "feedback_log.csv"
CHAMPION_MODEL_FILE = CHAMPION_DIR / "model.pkl"
CHAMPION_METADATA_FILE = CHAMPION_DIR / "metadata.json"

# ---------------------------------------------------------------------------
# MLflow
# ---------------------------------------------------------------------------
EXPERIMENT_NAME = os.environ.get("MLFLOW_EXPERIMENT_NAME", "pet-sticker-quality")
MODEL_NAME = os.environ.get("MLFLOW_MODEL_NAME", "pet-sticker-quality")
CHAMPION_ALIAS = "champion"
CHAMPION_MODEL_URI = f"models:/{MODEL_NAME}@{CHAMPION_ALIAS}"


def mlflow_tracking_uri() -> str:
    """기본은 로컬 파일스토어(서버 불필요, CI 재현성). 환경변수로 서버 지정 가능."""
    return os.environ.get("MLFLOW_TRACKING_URI", MLRUNS_DIR.as_uri())


# ``champion`` = export 된 포터블 아티팩트로 서빙(서버 불필요)
# ``registry`` = MLflow 레지스트리에서 직접 로드(서버 필요, 데모용)
MODEL_MODE = os.environ.get("MODEL_MODE", "champion")

# ---------------------------------------------------------------------------
# 품질 클래스 / 추천 문구
# ---------------------------------------------------------------------------
QUALITY_CLASSES = ["제작 적합", "보정 권장", "재촬영 권장"]
CLASS_TO_INDEX = {label: i for i, label in enumerate(QUALITY_CLASSES)}

# 클래스 확률 → 0~100 품질 점수 가중치 (학습 평가·추론에서 공통 사용)
CLASS_SCORE_WEIGHTS = {"제작 적합": 100.0, "보정 권장": 50.0, "재촬영 권장": 0.0}

# 점수 → 클래스 임계값 (라벨링 정책 v1 기본값)
SCORE_THRESHOLD_PASS = 70.0       # 이상이면 제작 적합
SCORE_THRESHOLD_RETOUCH = 45.0    # 이상~PASS 미만이면 보정 권장, 미만이면 재촬영 권장

RECOMMENDATION_TEMPLATES = {
    "제작 적합": "이미지 품질이 우수합니다. 추가 보정 없이 바로 제작 가능합니다.",
    "보정 권장": "제작은 가능하나 밝기·대비·선명도 보정을 권장합니다.",
    "재촬영 권장": "해상도가 낮거나 흐릿/어두워 인쇄 품질이 떨어질 수 있습니다. 재촬영을 권장합니다.",
}


def ensure_dirs() -> None:
    """런타임에 필요한 디렉터리를 보장한다."""
    for directory in (DATA_DIR, CHAMPION_DIR, LOG_DIR, MLRUNS_DIR):
        directory.mkdir(parents=True, exist_ok=True)
