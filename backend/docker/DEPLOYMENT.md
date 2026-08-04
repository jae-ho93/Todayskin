# 배포 전략 (T14)

## 개요

NestJS 백엔드를 Docker 컨테이너로 빌드하고, 로컬/CI/운영 환경에서 실행하는 방법을 정의한다.

## 로컬 개발

### DB + Redis만 실행 (기본)

```bash
cd backend
docker compose up -d
# DATABASE_URL=postgresql://todayskin:secret@localhost:5432/todayskin_dev
# REDIS_URL=redis://localhost:6379
```

### 백엔드 포함 전체 통합 환경

```bash
cd backend
docker compose --profile backend up -d --build
# 백엔드: http://localhost:3000
# Swagger: http://localhost:3000/api/docs
# health:  http://localhost:3000/health
```

`backend` 서비스는 `profiles: ["backend"]`로 설정되어 있어 기본 `docker compose up`에는 포함되지 않는다. 로컬 개발에서는 `nest start --watch`로 소스를 직접 실행하는 것을 권장한다.

## CI (GitHub Actions)

`.github/workflows/ci.yml`의 `backend-build-test` job:

1. PostgreSQL 16 서비스 컨테이너 실행
2. `npm ci` → `prisma generate`
3. `CREATE DATABASE todayskin_shadow` (migration diff 검사용)
4. `prisma migrate diff --from-migrations --to-schema --exit-code` (스키마-migration 불일치 시 exit 2로 실패)
5. `prisma migrate deploy` (DB에 migration 적용)
6. `prisma db seed`
7. `npm run build`
8. `npm test` + `npm run test:e2e`
9. `npm run lint`

## 운영 배포 전략 (권장)

### 이미지 빌드 및 Push

```bash
docker build -t ghcr.io/<org>/todayskin-backend:$(git rev-parse --short HEAD) .
docker push ghcr.io/<org>/todayskin-backend:$(git rev-parse --short HEAD)
```

### 환경변수 주입

운영 환경에서는 컨테이너 외부에서 시크릿을 주입한다. `.env` 파일을 컨테이너에 포함하지 않는다.

필수 환경변수 (`.env.example` 참조):

- `DATABASE_URL` — 운영 PostgreSQL 연결 문자열 (별급 비밀번호)
- `REDIS_URL` — 운영 Redis (requirepass 필수)
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — `openssl rand -base64 48`로 생성
- `KMA_API_KEY`, `AIRKOREA_API_KEY`, `GEMINI_API_KEY` — 공공데이터포털 / Google AI Studio 키
- `ALLOWED_ORIGINS` — 운영 도메인 (예: `https://app.todayskin.kr`)
- `MOCK_GEMINI=false`, `MOCK_INFERENCE=false` — 운영에서 반드시 false

### 배포 방식 (예정)

아직 확정되지 않음. 후보:

- **단일 서버 + docker compose**: 가장 단순. 서버에서 `docker compose pull && docker compose up -d`
- **컨테이너 오케스트레이션 (ECS/Fly.io/Cloud Run)**: 자동 스케일링. 이미지만 push하면 플랫폼이 배포
- **Kubernetes**: 장기적으로. 현재 규모에서는 오버엔지니어링

현재 단계에서는 단일 서버 + docker compose를 추천한다. 트래픽 증가 후 오케스트레이션으로 전환.

### Migration 전략

- 컨테이너 시작 시 `prisma migrate deploy` 자동 실행 (Dockerfile CMD)
- 운영 DB에서는 배포 전 별도 백업 권장
- rollback migration은 Prisma가 지원하지 않으므로, 위험한 변경은 새 migration을 추가해 되돌린다
- migration 파일은 커밋하고 임의 수정/삭제 금지 (BACKEND_TASKS.md 협업 규칙)

### 헬스체크

- `/health` 엔드포인트 (`GET /health` → `{ "status": "ok" }`)
- Dockerfile HEALTHCHECK가 30초 간격으로 호출
- 로드밸런서/오케스트레이터의 헬스체크에 동일 엔드포인트 사용

## 보류

- Python AI 서버 컨테이너: 모델 학습 완료 후 별도 작업
- Redis AI 작업 큐: Python 서버와 실제 비동기 추론 필요 시 추가
- 자동 배포 (CD): CI 통과 후 자동 push/deploy는 운영 인프라 확정 후 설정
