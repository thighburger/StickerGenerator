"""챔피언 모델 추론 (순수 로직, FastAPI 와 무관).

특징 dict 또는 이미지 바이트를 받아 품질 점수/클래스/추천/신뢰도/모델버전을 반환한다.
점수는 학습 평가와 동일하게 클래스 확률 가중합으로 계산한다.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

from . import config
from .champion_export import load_metadata, load_model, model_version_label
from .features import (
    FEATURE_NAMES,
    extract_features_from_image,
    feature_goodness,
    feature_vector,
)

_WEAK_TIPS = {
    "resolution": "사진 해상도가 낮습니다. 더 높은 해상도로 촬영/업로드하세요.",
    "sharpness": "초점이 흐립니다. 손떨림 없이 초점을 맞춰 다시 촬영하세요.",
    "brightness": "밝기가 적절하지 않습니다. 밝은 곳에서 촬영하면 좋습니다.",
    "contrast": "대비가 낮습니다. 배경과 피사체의 대비를 높여주세요.",
    "subject": "피사체 크기가 적절하지 않습니다. 화면을 적당히 채우도록 촬영하세요.",
    "colorfulness": "색감이 단조롭습니다. 자연광에서 촬영하면 색이 살아납니다.",
}


@dataclass
class QualityResult:
    score: float
    qualityClass: str
    recommendation: str
    confidence: float
    modelVersion: str
    features: dict

    def to_dict(self) -> dict:
        return asdict(self)


class ChampionPredictor:
    def __init__(self, model, metadata: dict | None):
        self.model = model
        self.metadata = metadata or {}
        self.classes = list(getattr(model, "classes_", config.QUALITY_CLASSES))
        self.version_label = model_version_label(self.metadata)

    def _recommendation(self, quality_class: str, features: dict) -> str:
        base = config.RECOMMENDATION_TEMPLATES.get(quality_class, "")
        if quality_class == config.QUALITY_CLASSES[0]:
            return base
        goodness = feature_goodness(features)
        weakest = min(goodness, key=goodness.get)
        tip = _WEAK_TIPS.get(weakest)
        return f"{base} {tip}" if tip else base

    def predict(self, features: dict) -> QualityResult:
        vector = np.array([feature_vector(features)], dtype=float)
        proba = self.model.predict_proba(vector)[0]
        idx = int(np.argmax(proba))
        quality_class = self.classes[idx]
        confidence = float(proba[idx])
        score = float(
            sum(
                proba[i] * config.CLASS_SCORE_WEIGHTS.get(self.classes[i], 0.0)
                for i in range(len(self.classes))
            )
        )
        return QualityResult(
            score=round(score, 2),
            qualityClass=quality_class,
            recommendation=self._recommendation(quality_class, features),
            confidence=round(confidence, 4),
            modelVersion=self.version_label,
            features={name: features[name] for name in FEATURE_NAMES},
        )

    def predict_from_image(self, image_bytes: bytes) -> QualityResult:
        return self.predict(extract_features_from_image(image_bytes))


def load_champion_predictor(champion_dir=None) -> ChampionPredictor:
    champion_dir = champion_dir or config.CHAMPION_DIR
    model = load_model(champion_dir)
    metadata = load_metadata(champion_dir)
    return ChampionPredictor(model, metadata)
