# syntax=docker/dockerfile:1.7
# Multi-stage build for Todayskin NestJS backend (T14).
# Node 22 LTS 기준 — CI와 동일 버전.

# ── deps: package-lock 기반 의존성 설치 ───────────────
FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci

# ── builder: TS 컴파일 + Prisma client 생성 ───────────
FROM node:22-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# prisma generate는 DB 연결 없이 동작 (prisma.config.ts 참조).
RUN npx prisma generate
RUN npm run build

# ── prod-deps: 운영 의존성만 재설치 ──────────────────
FROM node:22-slim AS prod-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ── runner: 최종 런타임 이미지 ───────────────────────
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl wget && rm -rf /var/lib/apt/lists/*

# R19: 비-root 실행. 컨테이너 내 RCE가 root로 이어지지 않게 한다.
RUN groupadd --system --gid 10001 appuser \
  && useradd --system --uid 10001 --gid 10001 --create-home appuser

# 운영 의존성 + 빌드 결과물 + Prisma client(migration 실행에 필요)
# 소유권을 appuser로 맞춘다 — entrypoint 실행과 prisma engine 캐시 접근에 필요하다.
COPY --from=prod-deps --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /app/dist ./dist
COPY --from=builder --chown=appuser:appuser /app/prisma ./prisma
COPY --from=builder --chown=appuser:appuser /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=appuser:appuser /app/docker/entrypoint.sh ./docker/entrypoint.sh
COPY --chown=appuser:appuser package.json ./
RUN chmod +x ./docker/entrypoint.sh

USER 10001

EXPOSE 3000

# 컨테이너 healthcheck: /health 엔드포인트 사용
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# N5: 운영은 release job이 migrate 후 rollout. 로컬/테스트만
# RUN_MIGRATIONS_ON_START=true 로 시작 시 migrate 허용.
# 시크릿은 Secrets Manager / 컨테이너 외부에서 주입 (.env 이미지 포함 금지).
ENTRYPOINT ["./docker/entrypoint.sh"]
