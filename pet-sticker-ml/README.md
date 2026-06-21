# pet-sticker-ml — 스티커 제작 품질 예측 ML 서비스

반려동물 사진/시안 이미지의 **인쇄 제작 품질**을 예측하는 scikit-learn 기반 ML 서비스다.
이미지에서 특징(해상도·선명도·밝기·대비·색감·피사체 비율 등)을 추출해 다음을 반환한다.

- 품질 점수 `0~100`
- 3-클래스 판정: `제작 적합` / `보정 권장` / `재촬영 권장`
- 개선 추천 문구
- 서빙 중인 챔피언 **모델 버전**

MLflow 로 실험/모델 버전을 관리하고, FastAPI 로 서빙하며, 예측/피드백 로그를 남긴다.

## 구성

```
src/pet_sticker_ml/
  config.py          설정(경로·모델명·임계값·MLflow URI)
  features.py        이미지 특징 추출 + 품질 점수 휴리스틱
  dataset.py         시드 고정 합성 학습 데이터(v1/v2)
  train.py           MLflow 학습(param·metric·artifact·model·레지스트리)
  champion_export.py 챔피언 포터블 export/load(model.pkl + metadata.json)
  model_promoter.py  macro-F1 개선 시에만 @champion 승격(+이전 모델 보관)
  rollback.py        이전 모델로 롤백
  retrain.py         데이터 변경→학습→승격 한 번에
  predictor.py       챔피언 추론(순수 로직)
  logging_store.py   예측/피드백 CSV 로깅 + 요약
  api.py             FastAPI 서비스
data/                합성 데이터 CSV(v1, v2)
champion/            서빙 중인 챔피언(model.pkl + metadata.json)
logs/                예측/피드백 로그(샘플만 커밋)
```

## 로컬 실행 (Python 3.12 권장)

> 로컬 시스템 Python 3.14 는 mlflow/sklearn 휠 문제로 사용하지 않는다.
> `uv` 또는 Homebrew 의 Python 3.12 로 가상환경을 만든다.

```bash
cd pet-sticker-ml
uv venv --python 3.12 .venv          # 또는: python3.12 -m venv .venv
uv pip install --python .venv/bin/python -r requirements-dev.txt
export PYTHONPATH=src                  # -m 실행 시 패키지 인식
```

## 주요 명령

```bash
# 데이터 생성
python -m pet_sticker_ml.dataset

# 학습 + MLflow 기록 + (없으면) 챔피언 부트스트랩
python -m pet_sticker_ml.train --bootstrap-champion

# MLflow UI (실험/모델 확인)
mlflow ui --backend-store-uri ./mlruns          # http://localhost:5000

# 추론 서비스 실행
uvicorn pet_sticker_ml.api:create_app --factory --host 0.0.0.0 --port 8000

# 재학습(데이터 v2) → 더 좋으면 챔피언 자동 교체
python -m pet_sticker_ml.retrain --data-version v2

# 롤백
python -m pet_sticker_ml.rollback --list
python -m pet_sticker_ml.rollback --to 1

# 테스트 / 린트
pytest
ruff check src tests
```

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/health` | 서비스/모델 상태 |
| POST | `/predict` | 이미지 업로드 → 품질 예측(+예측 로그) |
| POST | `/predict/features` | JSON 특징 → 품질 예측 |
| POST | `/feedback` | 사용자 피드백 저장(재학습 데이터) |
| GET | `/model/info` | 챔피언 모델 정보(버전·metric) |
| POST | `/model/reload` | 승격/롤백 후 챔피언 재로딩 |
| GET | `/logs/summary` | 예측/피드백 로그 요약 |

## Docker

```bash
docker build -t pet-sticker-ml ./pet-sticker-ml
docker run -p 8000:8000 pet-sticker-ml
curl http://localhost:8000/health
```

또는 저장소 루트에서 `docker compose up -d ml`.
