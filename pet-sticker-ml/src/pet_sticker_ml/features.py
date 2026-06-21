"""이미지 특징 추출 + 문서화된 품질 점수 휴리스틱.

핵심: 학습용 합성 데이터(:mod:`dataset`)와 실제 추론(:func:`extract_features_from_image`)이
**동일한 특징 집합**(:data:`FEATURE_NAMES`)을 사용한다. 따라서 모델은 "이미지에서 뽑은 특징 →
제작 품질"이라는 실제 매핑을 학습하며, 업로드된 진짜 사진/시안에 그대로 적용된다.

품질 점수 휴리스틱(:func:`quality_score_from_features`)은 합성 데이터의 라벨을 만드는 근거이자
보고서에 명시할 라벨링 정책이다. 모델은 이 점수를 직접 보지 않고 특징만으로 클래스를 학습한다.
"""

from __future__ import annotations

from io import BytesIO

import cv2
import numpy as np
from PIL import Image

from .config import (
    QUALITY_CLASSES,
    SCORE_THRESHOLD_PASS,
    SCORE_THRESHOLD_RETOUCH,
)

# 학습·추론·로그가 공유하는 정규 특징 순서
FEATURE_NAMES = [
    "width",
    "height",
    "megapixels",
    "aspect_ratio",
    "brightness",
    "contrast",
    "sharpness",
    "colorfulness",
    "subject_ratio",
    "edge_density",
]

# 점수 휴리스틱 가중치 (합 = 1.0)
_SCORE_WEIGHTS = {
    "resolution": 0.25,
    "sharpness": 0.28,
    "brightness": 0.15,
    "contrast": 0.12,
    "subject": 0.12,
    "colorfulness": 0.08,
}


def _clip01(value: float) -> float:
    return float(min(1.0, max(0.0, value)))


def feature_goodness(features: dict[str, float]) -> dict[str, float]:
    """특징별 0~1 '좋음' 점수. 추천 문구에서 가장 약한 항목을 찾는 데 사용한다."""
    megapixels = features["megapixels"]
    sharpness = features["sharpness"]
    brightness = features["brightness"]
    contrast = features["contrast"]
    subject = features["subject_ratio"]
    colorfulness = features["colorfulness"]
    return {
        "resolution": _clip01((megapixels - 0.3) / (3.0 - 0.3)),
        "sharpness": _clip01((sharpness - 50.0) / (600.0 - 50.0)),
        # 밝기는 130 근처가 최적 (너무 어둡거나 밝으면 감점)
        "brightness": _clip01(1.0 - abs(brightness - 130.0) / 90.0),
        "contrast": _clip01((contrast - 20.0) / (70.0 - 20.0)),
        # 피사체 비율은 0.5 근처가 최적 (너무 작거나 꽉 차면 감점)
        "subject": _clip01(1.0 - abs(subject - 0.5) / 0.5),
        "colorfulness": _clip01((colorfulness - 8.0) / (45.0 - 8.0)),
    }


def quality_score_from_features(features: dict[str, float]) -> float:
    """특징 → 0~100 품질 점수 (문서화된 라벨링 정책)."""
    goodness = feature_goodness(features)
    score = sum(_SCORE_WEIGHTS[key] * goodness[key] for key in _SCORE_WEIGHTS)
    return round(100.0 * score, 2)


def score_to_label(score: float) -> str:
    """점수 → 3-클래스 라벨."""
    if score >= SCORE_THRESHOLD_PASS:
        return QUALITY_CLASSES[0]  # 제작 적합
    if score >= SCORE_THRESHOLD_RETOUCH:
        return QUALITY_CLASSES[1]  # 보정 권장
    return QUALITY_CLASSES[2]      # 재촬영 권장


def feature_vector(features: dict[str, float]) -> list[float]:
    """dict → FEATURE_NAMES 순서의 벡터."""
    return [float(features[name]) for name in FEATURE_NAMES]


def _estimate_subject_ratio(rgb: np.ndarray) -> float:
    """알파 채널이 없을 때 테두리 색을 배경으로 추정해 피사체 비율을 근사한다."""
    border = np.concatenate(
        [rgb[0, :, :], rgb[-1, :, :], rgb[:, 0, :], rgb[:, -1, :]], axis=0
    ).astype(np.float32)
    background = np.median(border, axis=0)
    distance = np.linalg.norm(rgb.astype(np.float32) - background, axis=2)
    return float((distance > 40.0).mean())


def extract_features_from_image(image_bytes: bytes) -> dict[str, float]:
    """이미지 바이트 → 특징 dict. PNG 투명 배경(시안)과 일반 사진 모두 처리한다."""
    pil = Image.open(BytesIO(image_bytes))
    has_alpha = pil.mode in ("RGBA", "LA") or (
        pil.mode == "P" and "transparency" in pil.info
    )
    rgba = np.asarray(pil.convert("RGBA"))
    height, width = rgba.shape[:2]
    rgb = rgba[..., :3]
    alpha = rgba[..., 3].astype(np.float32) / 255.0
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)

    brightness = float(gray.mean())
    contrast = float(gray.std())
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    rgb_f = rgb.astype(np.float32)
    rg = rgb_f[..., 0] - rgb_f[..., 1]
    yb = 0.5 * (rgb_f[..., 0] + rgb_f[..., 1]) - rgb_f[..., 2]
    colorfulness = float(
        np.sqrt(rg.std() ** 2 + yb.std() ** 2)
        + 0.3 * np.sqrt(rg.mean() ** 2 + yb.mean() ** 2)
    )

    if has_alpha and float(alpha.max()) > 0.0:
        subject_ratio = float((alpha > 0.1).mean())
    else:
        subject_ratio = _estimate_subject_ratio(rgb)

    edges = cv2.Canny(gray, 80, 200)
    edge_density = float((edges > 0).mean())

    return {
        "width": float(width),
        "height": float(height),
        "megapixels": round((width * height) / 1_000_000.0, 4),
        "aspect_ratio": round(width / max(height, 1), 4),
        "brightness": round(brightness, 3),
        "contrast": round(contrast, 3),
        "sharpness": round(sharpness, 3),
        "colorfulness": round(colorfulness, 3),
        "subject_ratio": round(subject_ratio, 4),
        "edge_density": round(edge_density, 4),
    }
