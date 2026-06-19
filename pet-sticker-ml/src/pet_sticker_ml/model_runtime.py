"""Runtime helpers shared by tests and model export validation."""

from __future__ import annotations

from typing import Mapping, Sequence


def clamp(value: float, lower: float = 0.0, upper: float = 100.0) -> float:
    """Clamp a numeric value into a fixed range."""
    return max(lower, min(upper, value))


def predict_from_export(model: Mapping[str, object], features: Mapping[str, float]) -> float:
    """Evaluate the exported linear model JSON."""
    names = model["featureNames"]
    means = model["means"]
    scales = model["scales"]
    coefficients = model["coefficients"]
    intercept = float(model["intercept"])

    if not isinstance(names, Sequence):
        raise TypeError("featureNames must be a sequence.")

    score = intercept
    for index, name in enumerate(names):
        value = float(features[str(name)])
        mean = float(means[index])  # type: ignore[index]
        scale = float(scales[index]) or 1.0  # type: ignore[index]
        coefficient = float(coefficients[index])  # type: ignore[index]
        score += ((value - mean) / scale) * coefficient

    return round(clamp(score), 1)


def quality_label(score: float) -> str:
    """Map a score to the label used by the app."""
    if score >= 82:
        return "제작 적합"
    if score >= 65:
        return "보정 권장"
    return "재촬영 권장"
