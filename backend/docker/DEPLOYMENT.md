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

### 배포 방식 (확정: ECS Fargate)

운영은 AWS ECS Fargate를 기준으로 한다.

- **NestJS / FastAPI 각각 별도 Fargate task**: 역할 분리 유지, 독립 스케일링
- **이미지**: ECR에 push, tag는 commit SHA 고정
- **DB**: AWS RDS PostgreSQL (애플리케이션 컨테이너 외부)
- **객체 저장**: S3 (동의한 이미지 암호화 저장)
- **로그/지표**: CloudWatch (Pino JSON 로그, Sentry 에러 트래킹 병행)
- **secret**: Secrets Manager 주입 (.env 파일 컨테이너 포함 금지)

배포 파이프라인 (N5):

1. CI(build/test/migration diff) 통과 → ECR image push (자동)
2. release job: 백업 → migration diff → migrate deploy (단일 job, app rollout 전)
3. app rollout: NestJS / FastAPI 각각 Fargate 새 task revision 교체
4. production deploy는 승인 게이트 + 이전 image rollback 절차

### Migration 전략

운영 migration은 단일 release job이 app rollout 전 실행한다 (N5).

- **release job**: 백업 → migration diff → migrate deploy → app rollout 시작
- **local/test만** 컨테이너 시작 시 migrate deploy 허용 (Dockerfile CMD)
- destructive 변경은 expand/contract migration으로 분리
- migration 실패 시 새 app rollout 중단
- rollback migration은 Prisma가 지원하지 않으므로, 위험한 변경은 새 migration을 추가해 되돌린다
- migration 파일은 커밋하고 임의 수정/삭제 금지 (BACKEND_TASKS.md 협업 규칙)

### 헬스체크 (live / ready 분리 — N6)

- `GET /health/live` — 프로세스 liveness (event loop 정상 여부). Dockerfile HEALTHCHECK용
- `GET /health/ready` — readiness. DB·필수 config·migration 상태 확인. 로드밸런서 트래픽 게이트
- Redis와 날씨/Gemini 외부 API는 선택적/요청별 의존성 → readiness를 무조건 실패시키지 않음
- 각 상태와 HTTP code를 문서화

## 개발 환경 (docker-compose)

개발은 Docker Compose로 NestJS, FastAPI(inference-service), PostgreSQL, Redis를 함께 운영한다.
현재 compose에 inference-service 통합은 N5 작업 (현재는 postgres + redis + backend만).

## 후속 작업

운영 배포/CD 자동화, inference-service 컨테이너 통합, BullMQ 비동기 job은
BACKEND_TASKS.md N0~N6에 정리되어 있다.
