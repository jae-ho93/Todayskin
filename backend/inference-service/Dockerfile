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

COPY . .

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:8000/health || exit 1

# Internal-only service; bind all interfaces inside the container/network.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
