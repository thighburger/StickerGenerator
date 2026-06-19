프로젝트 보고서-기말
날짜: 2026-03-18, 학번: 202101257, 이름: 김미수
1. 프로젝트 개요
- 프로젝트 이름
- 프로젝트 목적
- GitHub 주소 (public 공개 필수)
- 배포 주소 및 캡쳐
- MLflow Tracking Server 주소 및 캡쳐
2. 소프트웨어 주요 기능
1) 사용자가 이용할 수 있는 핵심 기능
2) ML 모델이 사용되는 위치
3) 입력 데이터와 출력 결과
등등 해당 소프트웨어의 서비스와 ML 기능을 분리해 작성
3. 실행 환경
사용 OS 및 버전: Windows 11
Git/GitHub
Docker
MLFlow
배포 환경
4. 전체 MLOps 파이프라인 구조
- 코드 변경 흐름
- 모델 학습 흐름
- 모델 등록/반영 흐름
- 서비스 운영 흐름
5. Git 기반 개발 과정
- 개발 흐름: 어떻게 개발을 진행했는가?
- 커밋 전략: 커밋 기준과 메시지 규칙
- 브랜치 사용 여부
6. CI/CD 구성
- GitHub Actions 구성
- 테스트/빌드/배포 자동화 여부
- workflow 주요 단계 설명
- 실행 결과 캡쳐
7. Docker 기반 환경 구성
- Dockerfile 설명: 주요 설정
- 실행 방법
8. ML 모델 구성
- 사용 데이터
- 모델 종류
- 학습 코드 설명
- 평가 지표
- 초기 모델과 신규 모델 비교
8. MLFlow 기반 실험 관리
- MLflow Tracking 사용 여부
- 기록한 항목: parameter, metric, artifact, model
- 실험 결과 및 화면 캡쳐
- 가장 좋은 모델 선정 기준
9. 모델 등록 및 서비스 반영
- 모델 저장 방식
- 서비스가 모델을 불러오는 방식
- 신규 모델 반영 방법
- 자동 반영/수동 반영 중 어떤 방식을 왜 사용했는지
10. 재학습 또는 모델 개선 과정
- 어떤 이유로 어떻게 재학습 했는가
- 데이터/코드/파라미터 중 무엇이 바뀌었는가
- 재학습 전 후 성능 비교
- 모델 교체 결과
11. 운영 로그 및 문제 대응
- 서비스 로그 확인
- 예측 요청 로그
- 모델 정보 확인
- 일부로 발생시킨 문제 1개 이상 및 원인 분석, 해결 방법
12. 롤백 및 이전 모델 관리
- 이전 모델 보관 여부
- 이전 모델로 되돌리는 방법
- 모델 버전 관리 화면 또는 코드 설명
13. 전체 파이프라인 동작 흐름
- 코드 수정 후 서비스 반영까지
- 데이터 변경 후 재학습까지
- 모델 변경 후 운영 반영까지 
14. 문제 해결 경험
- 발생한 문제와 원인, 해결 방법을 기술 (최소 1개 이상)
15. 느낀 점 및 개선 방향
- MLOps 관점에서 배운 점
- 개선하고 싶은 부분
- 수업 피드백
참고 자료
참고한 문서, 링크, 강의 등
# 스티커 생성 서비스 최종 프로젝트 보고서

작성일: 2026-06-19  
저장소: https://github.com/thighburger/StickerGenerator  
작업 브랜치: `feature/final-mlops-pipeline`

## 1. 프로젝트 개요

본 프로젝트는 중간 프로젝트에서 구현한 반려동물 스티커 생성 웹 서비스를 기반으로 ML 기능과 MLOps 운영 흐름을 추가한 최종 프로젝트이다.

중간 프로젝트의 핵심 기능은 사용자가 반려동물 사진을 업로드하면 remove.bg API로 배경을 제거하고, 브라우저 Canvas에서 A6 스티커 시안 PNG를 생성한 뒤 주문 정보를 저장하는 것이었다.

최종 프로젝트에서는 여기에 **스티커 품질 점수 예측 모델**을 추가했다. 모델은 업로드 이미지와 생성된 시안의 특징을 기반으로 제작 적합도를 예측하고, 서비스 화면과 주문 운영 화면에 결과를 반영한다.

## 2. 최종 목표

- 기존 DevOps 기반 Next.js 서비스에 ML 기능 추가
- MLflow 기반 실험, metric, parameter, artifact 기록
- GitHub Actions에서 테스트, 빌드, 모델 학습, Docker build 자동화
- champion 모델을 서비스에 반영하고 rollback 가능한 구조 구성
- 예측 로그와 사용자 피드백 로그를 저장하여 운영 상태 확인 가능
- 최종 보고서에는 전체 코드 스크린샷 대신 핵심 구조와 실행 결과 중심으로 정리

## 3. 추가된 ML 기능

### 3.1 스티커 품질 점수 예측

사용자가 시안을 생성하면 브라우저에서 cutout 이미지를 분석해 아래 특징을 계산한다.

- 해상도 점수
- 종횡비 균형
- 밝기 균형
- 대비 점수
- 윤곽/엣지 점수
- 투명 영역 기반 피사체 비율
- A6 시트 채움률

이 특징 벡터를 `pet-sticker-next/lib/ml/sticker-quality-model.json`의 champion 모델에 넣어 0-100점의 품질 점수를 계산한다.

서비스 화면에는 다음 정보가 표시된다.

- AI 품질 점수
- 제작 적합 / 보정 권장 / 재촬영 권장 라벨
- 모델 버전
- 사진 개선 추천 문구
- 사용자 피드백 버튼

주문 저장 시 품질 리포트가 `order.json`에 함께 저장되고, 관리자 화면에서도 주문별 AI 품질 점수와 모델 버전을 확인할 수 있다.

## 4. 수업 내용 반영

강의 자료의 흐름을 다음과 같이 프로젝트에 반영했다.

- DevOps 파이프라인: Git/GitHub -> CI -> Docker -> 배포/운영 로그
- MLOps 파이프라인: MLflow 실험 기록 -> GitHub Actions 자동 학습 -> champion 모델 반영 -> feedback/log 기반 운영
- MLflow 로컬 실습: run 단위로 parameter, metric, artifact 기록
- GitHub Actions 자동 훈련: 코드 검증 후 모델 학습을 실행하고 학습 artifact 업로드
- 모델 운영 전략: champion 모델, versioned model registry, rollback 스크립트 구성
- 사용자 피드백과 모니터링: prediction log와 feedback log를 CSV로 저장

## 5. 전체 파이프라인

```text
개발 브랜치 작업
-> 기능 단위 커밋
-> GitHub PR 생성
-> GitHub Actions CI 실행
   -> Next.js typecheck/build
   -> Python ML 테스트
   -> MLflow 모델 학습
   -> 학습 artifact 업로드
   -> Docker 이미지 build 검증
-> PR merge
-> Vercel Git 연동 배포
-> 사용자 시안 생성
-> ML 품질 예측
-> prediction/feedback/order 로그 저장
```

## 6. 하네스 및 루프 엔지니어링

품질을 반복적으로 끌어올리기 위해 루트에 `scripts/final-harness.mjs`를 추가했다.

하네스의 역할:

- 최종 보고서와 champion 모델 파일 존재 확인
- Python ML 코드 문법 검사
- ML 의존성이 설치된 환경에서는 pytest 실행
- MLflow 학습 dry-run 실행
- Next.js typecheck 실행
- `--full` 모드에서 Next production build와 Docker build 실행
- 각 단계 timeout 적용으로 검증 루프가 무한 대기하지 않도록 방지

실행 명령:

```bash
node scripts/final-harness.mjs
node scripts/final-harness.mjs --full
```

현재 로컬 환경은 macOS Desktop/iCloud의 dataless 파일이 감지되어 Next typecheck/build가 preflight에서 빠르게 중단된다. 이는 중간 프로젝트 때 발견한 문제와 같은 계열이며, GitHub Actions의 Ubuntu 환경에서는 dataless 문제가 없도록 CI 검증을 구성했다.

## 7. MLflow 모델 관리

ML 하네스 위치:

```text
pet-sticker-ml/
```

주요 파일:

- `src/pet_sticker_ml/train.py`: MLflow 학습, metric 기록, 모델 export, champion 비교/승격
- `src/pet_sticker_ml/rollback.py`: 이전 모델 버전으로 rollback
- `src/pet_sticker_ml/features.py`: 학습용 bootstrap feature dataset 생성
- `model-registry/sticker-quality/`: versioned model과 champion metadata 보관
- `tests/`: feature/model runtime 테스트

학습 시 기록되는 항목:

- parameter: seed, sample 수, alpha, feature 수
- metric: MAE, RMSE, R2
- artifact: feature schema, sklearn model, exported JSON model

초기 champion 모델:

```text
version: 2026-06-19-bootstrap
servedBy: pet-sticker-next/lib/ml/sticker-quality-model.json
```

## 8. 재학습 및 모델 반영

재학습 명령:

```bash
python -m pip install -r pet-sticker-ml/requirements.txt
PYTHONPATH=pet-sticker-ml/src python -m pet_sticker_ml.train
```

재학습 후 동작:

- MLflow run 생성
- 새 모델 버전 JSON 생성
- 기존 champion과 metric 비교
- 조건을 만족하면 app-facing 모델 JSON으로 자동 반영

Rollback 명령:

```bash
PYTHONPATH=pet-sticker-ml/src python -m pet_sticker_ml.rollback --version 2026-06-19-bootstrap
```

이 구조를 통해 코드 수정 없이 운영 모델을 이전 버전으로 되돌릴 수 있다.

## 9. CI/CD 자동화

GitHub Actions 파일:

```text
.github/workflows/ci.yml
```

자동 실행 조건:

- push
- pull_request

자동화 작업:

- Node.js 20 기반 Next.js 의존성 설치
- TypeScript 검사
- Next.js production build
- Python 3.12 기반 ML 의존성 설치
- pytest 실행
- MLflow 학습 실행
- MLflow/model artifact 업로드
- Docker image build 검증

수업의 `code test -> train -> artifact` 흐름을 반영하여, 코드 검증이 깨지면 모델 학습 단계로 넘어가지 않도록 job을 구성했다.

## 10. Docker 패키징

기존 Dockerfile은 유지하되, champion 모델 JSON이 Next 앱 내부에 포함되도록 구성했다.

Docker build:

```bash
cd pet-sticker-next
docker build -t pet-sticker-next .
```

Docker run:

```bash
docker run --rm -p 3000:3000 -e REMOVE_BG_API_KEY=your_key pet-sticker-next
```

컨테이너에는 Next.js 앱과 현재 champion 모델이 같이 들어가므로, 동일한 이미지에서 동일한 ML 예측 결과를 재현할 수 있다.

## 11. 배포 및 운영

배포는 중간 프로젝트와 동일하게 Vercel Git 연동을 기준으로 한다.

운영 환경 변수:

```env
REMOVE_BG_API_KEY=...
ORDER_STORAGE_DIR=...
QUALITY_LOG_DIR=...
```

운영 로그:

- 예측 로그: `quality-predictions.csv`
- 사용자 피드백 로그: `quality-feedback.csv`
- 주문 로그: `order.json`

Vercel 환경에서는 파일 시스템이 영구 저장소가 아니므로 기본 로그 위치는 `/tmp/pet-sticker-quality-logs`이다. 장기 운영에서는 Supabase, S3, Cloud Storage 같은 외부 저장소로 확장하는 것이 적절하다.

## 12. Git 기반 개발 과정

작업 브랜치:

```text
feature/final-mlops-pipeline
```

커밋은 다음 단위로 나눈다.

- MLflow 학습 하네스와 champion 모델 추가
- Next.js 앱에 품질 점수, prediction/feedback log, 주문 저장 연동
- CI/Docker/문서/최종 보고서 정리

PR 생성 후 GitHub Actions 통과 여부를 확인하고 main에 병합한다.

## 13. 검증 항목

로컬 검증:

- Python ML 코드 문법 검사 통과
- `node scripts/final-harness.mjs` 실행 결과 보고서/model registry/모델 JSON 존재 확인 통과
- 하네스 스크립트 문법 검사 통과
- app-facing champion model JSON 로드 확인 통과
- `npm run typecheck`는 dataless preflight에서 빠르게 중단됨
- `scripts/final-harness.mjs`로 반복 검증 가능
- 로컬 Python 환경에는 pytest, mlflow, sklearn이 설치되어 있지 않아 ML 테스트/학습 dry-run은 하네스에서 SKIP 처리됨

CI 검증:

- Next typecheck/build
- ML pytest
- MLflow training
- artifact upload
- Docker build

운영 검증:

- 시안 생성 후 AI 품질 점수 표시
- prediction log 저장
- feedback log 저장
- 주문 저장 시 qualityReport 포함
- 관리자 주문 화면에서 모델 버전 확인

## 14. 문제 해결

문제 1: 로컬 macOS dataless 파일로 인한 타입체크 대기

- 원인: Desktop/iCloud 최적화로 일부 파일이 dataless 상태가 됨
- 해결: `pretypecheck`를 추가하여 typecheck 전에 preflight를 실행하고, 무한 대기 대신 빠르게 실패하도록 변경

문제 2: ML 모델을 Next/Vercel 런타임에 어떻게 연결할지

- 원인: Vercel 배포 환경에서 Python ML 모델을 실시간 로드하면 런타임 구성이 복잡해짐
- 해결: 학습은 Python/MLflow에서 수행하고, 서비스는 export된 JSON champion 모델을 TypeScript로 추론

문제 3: 운영 로그와 개인정보

- 원인: 품질 로그에 이미지 파일이나 개인정보를 직접 남기면 운영 리스크가 커짐
- 해결: prediction/feedback 로그에는 score, label, modelVersion, feature summary만 저장

## 15. 향후 개선 방향

- 실제 주문 결과와 사용자 피드백을 학습 데이터로 반영
- 외부 저장소를 사용한 운영 로그 영구 보관
- Vercel 로그 또는 외부 대시보드 기반 운영 모니터링 강화
- 모델 drift 기준을 추가하여 자동 champion 교체 조건 고도화
- 결제 API와 주문 DB 연동
