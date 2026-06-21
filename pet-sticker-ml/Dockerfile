# 스티커 품질 ML 추론 서비스 (FastAPI + champion 모델)
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/src \
    MODEL_MODE=champion \
    LOG_DIR=/app/logs

# scikit-learn(OpenMP) 런타임 의존성
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 소스 + 서빙에 필요한 챔피언/데이터 복사
COPY src ./src
COPY champion ./champion
COPY data ./data

RUN useradd -m appuser \
    && mkdir -p /app/logs \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["uvicorn", "pet_sticker_ml.api:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
