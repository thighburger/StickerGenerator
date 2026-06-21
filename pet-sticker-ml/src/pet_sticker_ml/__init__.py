"""반려동물 스티커 제작 품질 예측 ML 패키지.

서비스 흐름:
    이미지 → 특징 추출(features) → champion 모델 예측(predictor)
    → 예측/피드백 로그(logging_store) → FastAPI 서빙(api)

학습/운영 흐름:
    데이터(dataset) → MLflow 학습(train) → 챔피언 승격(model_promoter)
    → 챔피언 export(champion_export) → 롤백(rollback) / 재학습(retrain)
"""

__version__ = "0.1.0"
