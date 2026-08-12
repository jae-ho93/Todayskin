# syntax=docker/dockerfile:1.7
# Todayskin FastAPI inference service (N5).
# CPU image for ECS Fargate. Model assets are baked into the image.
FROM python:3.11-slim AS runner

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000

RUN apt-get update && apt-get install -y --no-install-recommends \
      libglib2.0-0 \
      libgomp1 \
      libgl1 \
      wget \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
# Prefer CPU wheels when available to keep Fargate images smaller.
RUN (pip install --no-cache-dir torch==2.9.0 torchvision==0.24.0 \
      --index-url https://download.pytorch.org/whl/cpu \
    || pip install --no-cache-dir torch==2.9.0 torchvision==0.24.0) \
  && pip install --no-cache-dir -r requirements.txt

# R19: 비-root 실행. 이 서비스는 사용자가 업로드한 이미지를 네이티브 디코더로
# 파싱하므로 공격 표면이 넓다 — root로 돌릴 이유가 없다.
RUN groupadd --system --gid 10001 appuser \
  && useradd --system --uid 10001 --gid 10001 --create-home appuser

# R19: `COPY . .` 대신 런타임에 필요한 소스와 모델 자산만 복사한다
# (tests/, __pycache__, 로컬 venv를 이미지에 넣지 않는다).
COPY --chown=appuser:appuser *.py ./
COPY --chown=appuser:appuser assets ./assets

USER 10001

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:8000/health || exit 1

# Internal-only service; bind all interfaces inside the container/network.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
