"""FastAPI 요청/응답 스키마 (pydantic)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    modelLoaded: bool
    modelVersion: str | None = None


class PredictResponse(BaseModel):
    requestId: str
    score: float
    qualityClass: str
    recommendation: str
    confidence: float
    modelVersion: str
    features: dict


class FeatureRequest(BaseModel):
    features: dict = Field(..., description="FEATURE_NAMES 키를 모두 포함한 특징 dict")


class FeedbackRequest(BaseModel):
    requestId: str
    predictedClass: str
    correctedClass: str
    orderId: str | None = None
    modelVersion: str | None = None
    score: float | None = None
    note: str | None = None


class FeedbackResponse(BaseModel):
    stored: bool
    requestId: str
