"""학습용 합성 데이터 생성.

실제 라벨링된 반려동물 사진 데이터셋이 없으므로, 특징값을 현실적인 분포에서 샘플링하고
:func:`features.quality_score_from_features` 휴리스틱 + 라벨 노이즈로 3-클래스 라벨을 만든다.
시드 고정으로 완전 재현 가능하며, ``v2`` 는 "사용자 피드백으로 라벨 노이즈를 줄이고 표본을
늘린" 재학습 시나리오를 표현한다(보고서의 재학습 전/후 비교 근거).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from .config import DATA_DIR, QUALITY_CLASSES
from .features import FEATURE_NAMES, quality_score_from_features

# 데이터 버전별 생성 파라미터
DATASET_PARAMS: dict[str, dict] = {
    # v1: 초기 라벨(노이즈 큼)
    "v1": {"n_samples": 1500, "seed": 42, "label_noise": 6.0,
           "pass_threshold": 70.0, "retouch_threshold": 45.0},
    # v2: 피드백 반영 → 표본 증가 + 라벨 노이즈 감소 (재학습 데모)
    "v2": {"n_samples": 2200, "seed": 7, "label_noise": 3.5,
           "pass_threshold": 70.0, "retouch_threshold": 45.0},
}
DATA_VERSIONS = list(DATASET_PARAMS)


def _label_from_score(score: float, pass_t: float, retouch_t: float) -> str:
    if score >= pass_t:
        return QUALITY_CLASSES[0]
    if score >= retouch_t:
        return QUALITY_CLASSES[1]
    return QUALITY_CLASSES[2]


def generate_dataset(
    version: str = "v1",
    seed: int | None = None,
    n_samples: int | None = None,
) -> pd.DataFrame:
    """버전별 합성 데이터프레임 생성 (FEATURE_NAMES + quality_score + label)."""
    if version not in DATASET_PARAMS:
        raise ValueError(f"알 수 없는 데이터 버전: {version} (가능: {DATA_VERSIONS})")
    params = DATASET_PARAMS[version]
    seed = params["seed"] if seed is None else seed
    n = params["n_samples"] if n_samples is None else n_samples
    rng = np.random.default_rng(seed)

    # 해상도: megapixels 를 로그정규로 샘플 후 종횡비로 width/height 유도
    aspect = np.clip(np.exp(rng.normal(0.0, 0.25, n)), 0.5, 2.0)
    megapixels = np.clip(rng.lognormal(np.log(2.0), 0.9, n), 0.05, 12.0)
    total_px = megapixels * 1_000_000.0
    width = np.sqrt(total_px * aspect)
    height = width / aspect

    brightness = np.clip(rng.normal(125.0, 40.0, n), 10.0, 250.0)
    contrast = np.clip(rng.normal(45.0, 18.0, n), 3.0, 90.0)
    sharpness = np.clip(rng.lognormal(np.log(250.0), 0.9, n), 5.0, 2000.0)
    colorfulness = np.clip(rng.normal(30.0, 14.0, n), 2.0, 90.0)
    subject_ratio = np.clip(rng.normal(0.45, 0.18, n), 0.02, 0.98)
    # edge_density 는 sharpness 와 양의 상관
    edge_density = np.clip(
        0.02 + sharpness / 4000.0 + rng.normal(0.0, 0.02, n), 0.0, 0.5
    )

    frame = pd.DataFrame(
        {
            "width": np.round(width).astype(int),
            "height": np.round(height).astype(int),
            "megapixels": np.round(megapixels, 4),
            "aspect_ratio": np.round(aspect, 4),
            "brightness": np.round(brightness, 3),
            "contrast": np.round(contrast, 3),
            "sharpness": np.round(sharpness, 3),
            "colorfulness": np.round(colorfulness, 3),
            "subject_ratio": np.round(subject_ratio, 4),
            "edge_density": np.round(edge_density, 4),
        }
    )

    clean_score = frame.apply(
        lambda row: quality_score_from_features(row.to_dict()), axis=1
    )
    noisy_score = np.clip(
        clean_score + rng.normal(0.0, params["label_noise"], n), 0.0, 100.0
    )
    frame["quality_score"] = np.round(clean_score, 2)
    frame["label"] = [
        _label_from_score(s, params["pass_threshold"], params["retouch_threshold"])
        for s in noisy_score
    ]
    # 컬럼 순서 고정
    return frame[[*FEATURE_NAMES, "quality_score", "label"]]


def csv_path(version: str) -> Path:
    return DATA_DIR / f"sticker_quality_{version}.csv"


def write_csv(frame: pd.DataFrame, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(path, index=False)
    return path


def load_dataset(version: str = "v1") -> pd.DataFrame:
    """커밋된 CSV 가 있으면 로드, 없으면 생성(완전 재현)."""
    path = csv_path(version)
    if path.exists():
        return pd.read_csv(path)
    return generate_dataset(version)


def main() -> None:
    """모든 버전의 CSV 를 data/ 에 생성한다."""
    for version in DATA_VERSIONS:
        frame = generate_dataset(version)
        path = write_csv(frame, csv_path(version))
        counts = frame["label"].value_counts().to_dict()
        print(f"[dataset] {version}: {len(frame)} rows -> {path}")
        print(f"          label 분포: {counts}")


if __name__ == "__main__":
    main()
