"""FastAPI 추론 서비스.

엔드포인트:
- GET  /health         서비스/모델 상태 (Docker healthcheck)
- POST /predict         이미지 업로드 → 품질 예측 + 예측 로그
- POST /predict/features JSON 특징 → 품질 예측 + 예측 로그 (테스트/배치용)
- POST /feedback        사용자 피드백 저장 (재학습 데이터)
- GET  /model/info      챔피언 모델 정보(버전·metric·featureNames)
- POST /model/reload    승격/롤백 후 챔피언 재로딩
- GET  /logs/summary    예측/피드백 로그 요약 (관리자 화면)

create_app() 은 champion_dir/log_dir 를 주입받아 테스트에서 격리 실행할 수 있다.
"""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile

from . import __version__, config
from .champion_export import load_metadata
from .features import FEATURE_NAMES, extract_features_from_image
from .logging_store import append_feedback_log, append_prediction_log, summarize_logs
from .predictor import load_champion_predictor
from .schemas import (
    FeatureRequest,
    FeedbackRequest,
    FeedbackResponse,
    HealthResponse,
    PredictResponse,
)


def create_app(champion_dir=None, log_dir=None) -> FastAPI:
    app = FastAPI(
        title="Pet Sticker Quality ML",
        version=__version__,
        description="반려동물 스티커 제작 품질 예측 추론 서비스 (champion 모델 서빙)",
    )
    app.state.champion_dir = Path(champion_dir) if champion_dir else config.CHAMPION_DIR
    app.state.log_dir = Path(log_dir) if log_dir else config.LOG_DIR
    app.state.predictor = None

    def get_predictor():
        if app.state.predictor is None:
            app.state.predictor = load_champion_predictor(app.state.champion_dir)
        return app.state.predictor

    # 시작 시 eager 로드 (없으면 요청 시 503)
    try:
        get_predictor()
    except Exception as exc:  # noqa: BLE001
        print(f"[api] 챔피언 로드 실패(요청 시 503 반환): {exc}")

    def _predict_and_log(features: dict, source: str) -> PredictResponse:
        try:
            predictor = get_predictor()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=503, detail=f"모델 미로딩: {exc}") from exc
        result = predictor.predict(features)
        request_id = uuid.uuid4().hex[:12]
        append_prediction_log(result, request_id, source=source, log_dir=app.state.log_dir)
        return PredictResponse(requestId=request_id, **result.to_dict())

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        loaded = app.state.predictor is not None
        version = app.state.predictor.version_label if loaded else None
        return HealthResponse(status="ok", modelLoaded=loaded, modelVersion=version)

    @app.post("/predict", response_model=PredictResponse)
    async def predict(image: UploadFile = File(...)) -> PredictResponse:
        data = await image.read()
        try:
            features = extract_features_from_image(data)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=f"이미지 처리 실패: {exc}") from exc
        return _predict_and_log(features, source="image")

    @app.post("/predict/features", response_model=PredictResponse)
    def predict_features(request: FeatureRequest) -> PredictResponse:
        missing = [name for name in FEATURE_NAMES if name not in request.features]
        if missing:
            raise HTTPException(status_code=400, detail=f"누락된 특징: {missing}")
        return _predict_and_log(request.features, source="features")

    @app.post("/feedback", response_model=FeedbackResponse)
    def feedback(request: FeedbackRequest) -> FeedbackResponse:
        append_feedback_log(
            request_id=request.requestId,
            predicted_class=request.predictedClass,
            corrected_class=request.correctedClass,
            order_id=request.orderId,
            model_version=request.modelVersion,
            score=request.score,
            note=request.note,
            log_dir=app.state.log_dir,
        )
        return FeedbackResponse(stored=True, requestId=request.requestId)

    @app.get("/model/info")
    def model_info() -> dict:
        metadata = load_metadata(app.state.champion_dir)
        if not metadata:
            raise HTTPException(status_code=503, detail="챔피언 메타데이터가 없습니다.")
        return {**metadata, "modelVersion": f"v{metadata.get('version')}"}

    @app.post("/model/reload")
    def reload_model() -> dict:
        app.state.predictor = None
        try:
            get_predictor()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return {"reloaded": True, "modelVersion": app.state.predictor.version_label}

    @app.get("/logs/summary")
    def logs_summary() -> dict:
        return summarize_logs(log_dir=app.state.log_dir)

    @app.post("/admin/retrain")
    def admin_retrain() -> dict:
        # 데이터 v2 로 재학습 → 평가 → 개선 시 챔피언 승격 → 챔피언 reload.
        # 운영 대시보드의 "재학습 트리거" 버튼이 호출한다.
        before = load_metadata(app.state.champion_dir)
        before_f1 = before.get("metrics", {}).get("macro_f1") if before else None
        try:
            from .retrain import retrain as run_retrain

            decision = run_retrain(data_version="v2", min_delta=0.0, regenerate=True)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"재학습 실패: {exc}") from exc

        app.state.predictor = None
        try:
            get_predictor()
        except Exception as exc:  # noqa: BLE001
            print(f"[api] 재학습 후 챔피언 reload 경고: {exc}")
        after = load_metadata(app.state.champion_dir)
        return {
            "promoted": bool(decision.get("promotion", {}).get("promoted")),
            "previous_macro_f1": before_f1,
            "new_macro_f1": after.get("metrics", {}).get("macro_f1") if after else None,
            "champion_version": after.get("version") if after else None,
            "dataVersion": after.get("dataVersion") if after else None,
        }

    return app
