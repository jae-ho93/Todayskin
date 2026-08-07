# 배포 전략 (T14 / N5)

## 개요

NestJS 백엔드와 FastAPI inference-service를 Docker로 빌드하고,
로컬(Compose) · CI · 운영(ECS Fargate)에서 실행하는 방법을 정의한다.

## 로컬 개발

### DB + Redis만 실행 (기본)

```bash
cd backend
docker compose up -d
# DATABASE_URL=postgresql://todayskin:secret@localhost:5432/todayskin_dev
# REDIS_URL=redis://localhost:6379
```

### inference만 실행 (로컬 `nest start --watch`용)

```bash
cd backend
docker compose --profile inference up -d --build
# inference: http://localhost:8000/health
# .env: INFERENCE_SERVICE_URL=http://127.0.0.1:8000, MOCK_INFERENCE=false
```

### NestJS + inference 통합 환경

```bash
cd backend
docker compose --profile backend up -d --build
# 백엔드:    http://localhost:3000
# Swagger:   http://localhost:3000/api/docs
# health:    http://localhost:3000/health
# inference: http://localhost:8000/health
```

`backend` / `inference` 서비스는 profile로 분리되어 기본 `docker compose up`에는
포함되지 않는다. 로컬 개발에서는 `nest start --watch` + `--profile inference`를 권장한다.

로컬/테스트 컨테이너만 `RUN_MIGRATIONS_ON_START=true`로 시작 시 `prisma migrate deploy`를
허용한다. 운영 ECS 앱 task는 이 플래그를 `false`로 둔다.

## CI (GitHub Actions)

### PR / push 검증 — `.github/workflows/ci.yml`

`backend-build-test` job:

1. PostgreSQL 16 서비스 컨테이너 실행
2. `npm ci` → `prisma generate`
3. `CREATE DATABASE todayskin_shadow` (migration diff 검사용)
4. `prisma migrate diff --from-migrations --to-schema --exit-code`
5. `prisma migrate deploy`
6. `prisma db seed`
7. `npm run build`
8. `npm test` + `npm run test:e2e`
9. `npm run lint`

### 운영 CD — `.github/workflows/deploy-ecs.yml` (N5)

`main`에 `backend/**` 변경이 push되거나 `workflow_dispatch`일 때:

1. **build-and-push** (자동): NestJS / inference 이미지를 ECR에 push. tag = **commit SHA**
2. **release** (`environment: production` 승인 게이트):
   - RDS snapshot 백업 (`RDS_INSTANCE_ID` 설정 시)
   - migrate task: `migrate diff` + `migrate deploy` (실패 시 app rollout 중단)
   - NestJS / inference 각각 새 task revision 등록 후 ECS service 업데이트
   - `services-stable` 대기

## 운영 배포 (ECS Fargate)

### 확정 아키텍처

| 구성 | 역할 |
|---|---|
| ECR `todayskin-backend` | NestJS 이미지 (tag = commit SHA) |
| ECR `todayskin-inference` | FastAPI 추론 이미지 (tag = commit SHA) |
| ECS Fargate service (backend) | BFF + 비즈니스 로직 |
| ECS Fargate service (inference) | AI 추론 전용 (내부망) |
| RDS PostgreSQL | 운영 DB (앱 컨테이너 외부) |
| S3 | 동의 이미지 암호화 저장 |
| CloudWatch Logs | `/ecs/todayskin-backend`, `/ecs/todayskin-inference`, `/ecs/todayskin-migrate` |
| Secrets Manager | `todayskin/prod/*` secret 주입 |

Task definition 템플릿:

- `backend/docker/ecs/backend-task-definition.json`
- `backend/docker/ecs/inference-task-definition.json`
- `backend/docker/ecs/migrate-task-definition.json`

배포 전 `ACCOUNT_ID` / IAM role ARN / secret ARN을 실제 값으로 맞춘다.
워크플로는 ECR registry에서 ACCOUNT_ID를 추출해 템플릿을 치환한다.

### GitHub 설정

**Secret**

- `AWS_ROLE_ARN` — OIDC로 assume할 IAM role (ECR push, ECS update, RDS snapshot)

**Variables** (Repository 또는 `production` Environment)

- `AWS_REGION` (기본 `ap-northeast-2`)
- `ECR_BACKEND_REPO` / `ECR_INFERENCE_REPO`
- `ECS_CLUSTER`
- `ECS_SERVICE_BACKEND` / `ECS_SERVICE_INFERENCE`
- `ECS_MIGRATE_TASK_FAMILY` (기본 `todayskin-migrate`)
- `ECS_SUBNETS` — 쉼표 구분 subnet id
- `ECS_SECURITY_GROUPS` — 쉼표 구분 sg id
- `RDS_INSTANCE_ID` — 자동 snapshot용 (없으면 스냅샷 단계 skip)

**Environment**

- `production` — required reviewers로 승인 게이트 구성

### Secrets Manager 주입

앱 task definition의 `secrets[].valueFrom`이 컨테이너 env로 주입한다.
`.env` 파일을 이미지에 넣지 않는다.

필수 secret 예시 (`todayskin/prod/` prefix):

- `DATABASE_URL`, `REDIS_URL`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `KMA_API_KEY`, `AIRKOREA_API_KEY`, `GEMINI_API_KEY`
- `ALLOWED_ORIGINS`, `S3_BUCKET`, `INFERENCE_SERVICE_URL`, `INFERENCE_SHARED_SECRET`, `SENTRY_DSN`

IAM:

- **execution role**: ECR pull, Secrets Manager read, CloudWatch Logs create/put
- **backend task role**: S3 객체 읽기/쓰기(동의 이미지), (선택) KMS
- **inference task role**: 최소 권한 (로그 외 외부 리소스 불필요)
- **migrate task role**: RDS 네트워크 접근 + `DATABASE_URL` secret read

### 네트워크 보안 (N13)

inference-service는 **내부망 전용** 서비스다. 무제한 이미지 처리 endpoint로
노출되지 않도록 아래를 지킨다:

- **Security group**: inference task의 SG는 8000번 포트 ingress를 **backend task의 SG로만**
  허용한다 (SG reference rule). 인터넷 게이트웨이 / 퍼블릭 IP / ALB/NLB는 두지 않는다.
- **내부 인증**: `/infer`는 `X-Inference-Key`(shared secret `INFERENCE_SHARED_SECRET`)를
  요구한다. 같은 VPC 안에서도 backend만 호출 가능하다. secret 미설정 시 fail-closed(503).
- GitHub Variables `ECS_SECURITY_GROUPS`에는 backend/inference 각각의 SG id를 지정한다.
  (ECS service가 task에 연결된 SG를 그대로 사용하므로, 배포 시에도 SG reference rule이 유지된다.)
- `/health`는 (외부 ALB/헬스체크용으로) 열 수 있지만 `/infer`·`/metrics`는 내부망으로만 노출한다.

### RDS · S3 · CloudWatch

- **RDS**: `DATABASE_URL`만 주입. 스키마 변경은 release migrate task만 수행.
- **S3**: `S3_BUCKET` + task role. SSE-S3 또는 `S3_KMS_KEY_ID`. 운영에서 `S3_BUCKET` 누락 시 백엔드는 시작을 거부한다.
- **CloudWatch**: awslogs 드라이버. Pino JSON 로그가 스트림으로 수집된다. Sentry는 별도 DSN.

### Migration 전략

운영 migration은 **단일 release job**이 app rollout **전**에 실행한다.

1. RDS snapshot (가능하면)
2. `prisma migrate diff --from-migrations --to-schema --exit-code` (불일치 시 실패)
3. `prisma migrate deploy`
4. 성공 시에만 NestJS / inference service 업데이트

정책:

- **local/test만** 컨테이너 시작 시 migrate 허용 (`RUN_MIGRATIONS_ON_START=true`)
- 운영 앱 task는 `RUN_MIGRATIONS_ON_START=false`
- destructive 변경은 **expand/contract** migration으로 분리
- migration 실패 시 새 app rollout 중단
- Prisma는 down migration을 지원하지 않으므로 위험 변경은 되돌리는 새 migration을 추가
- migration 파일은 커밋하고 임의 수정/삭제 금지

### Rollback

이전 이미지로 롤백:

1. Actions → **Deploy ECS Fargate** → Run workflow
2. `image_tag` = 이전 성공 commit SHA (ECR에 존재하는 태그)
3. `skip_migrate` = `true` (이미 적용된 스키마를 다시 건드리지 않음)
4. `production` 환경 승인

스키마를 되돌려야 하면 skip_migrate 없이, 되돌리는 **새 migration**을 포함한 커밋으로
정상 release 경로를 탄다. RDS snapshot에서 복구하는 경우는 장애 대응 런북으로 별도 수행한다.

### 환경변수 주입 요약

운영 컨테이너에 `.env`를 포함하지 않는다. Secrets Manager + task role/env로 주입한다.
로컬 변수명 참고: `backend/.env.example`.

운영에서 반드시 false:

- `MOCK_GEMINI=false`
- `MOCK_INFERENCE=false`
- `RUN_MIGRATIONS_ON_START=false`

운영에서 반드시 설정:

- `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `S3_BUCKET` (Memory fallback 금지)
- `INFERENCE_SERVICE_URL`
- `INFERENCE_SHARED_SECRET` (inference 서비스와 동일한 값 — N13)
- 실제 SMS OTP 게이트웨이 구현 완료 후 `SMS_API_KEY`, `SMS_SENDER`, `SMS_ENDPOINT`

### 날씨 수집 스케줄러 (N21 싱글턴)

`WeatherCollectionScheduler`는 기상청/에어코리아를 주기적으로 호출한다. ECS task가
여러 개 뜨면 **각 task마다** 스케줄러가 실행되어 정부 API를 중복 호출하므로,
backend service의 **정확히 1개 task만** `WEATHER_COLLECTOR_ENABLED=true`로 유지한다:

- **한계**: ECS service의 모든 task는 같은 task definition/env를 공유하므로, 같은
  service 안에서는 "1개만 true"로 둘 수 없다. 실제로는 아래 중 하나로 운영한다.
  1. backend service를 **task 1개로 유지**(기본값 `WEATHER_COLLECTOR_ENABLED=true`)
  2. 또는 스케줄러 전용 task(service)를 별도로 두고 나머지 backend task는
     `WEATHER_COLLECTOR_ENABLED=false`로 설정
- `WEATHER_COLLECTION_INTERVAL_MS`(기본 1시간)·`REGION_STAGGER_MS`(3초)로 호출 빈도 조정
- task 수를 늘려야 하면 (2) 방식으로 전환한다. 모든 task가 true면 중복 호출이 계속된다.

### 헬스체크 (live / ready 분리 — N6)

- `GET /health` — 현재 Dockerfile / ECS healthcheck 기준
- `GET /health/live` · `GET /health/ready` — N6에서 분리 완료 (ready는 DB/config 필수, Redis 선택)
- inference: `GET /health`

## 이미지 빌드 (수동)

```bash
# NestJS
docker build -t todayskin-backend:$(git rev-parse HEAD) -f backend/Dockerfile backend

# inference
docker build -t todayskin-inference:$(git rev-parse HEAD) \
  -f backend/inference-service/Dockerfile backend/inference-service
```

## 후속 작업

- N6: health live/ready 분리, Soft Delete, pagination, env registry (완료)
- N7: 레거시 `backend/app/` FastAPI 정리 (완료) — CI는 NestJS + inference-service만 검증
- N8: 히스토리 캘린더 기능 (완료)
- 실제 SMS OTP 게이트웨이 연결과 timeout·재시도·전송 실패 정책
- S3 객체 삭제 실패 재처리와 orphan reconciliation 운영 작업
- 실제 AWS 계정에 ECR/ECS/RDS/Secrets/OIDC role 프로비저닝 (인프라 최초 1회)
