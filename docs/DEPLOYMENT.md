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

트리거는 **CI 워크플로의 완료**다(R31). 이전에는 `main` push에 직접 걸려 CI와
배포가 병렬로 시작했고, 테스트가 깨진 커밋도 승인만 있으면 배포됐다.

1. **guard**: `workflow_run.conclusion == 'success'`인지 확인하고, CI가 검증한
   커밋(`workflow_run.head_sha`)에서 `backend/**` 변경 여부를 판단한다.
   프론트 전용 커밋이면 이후 job이 모두 스킵된다(기존 `paths` 필터 대체 —
   `workflow_run`은 `paths`를 지원하지 않는다). `workflow_dispatch`는 항상 진행한다.
2. **build-and-push** (자동): NestJS / inference 이미지를 ECR에 push. tag = **commit SHA**
3. **release** (`environment: production` 승인 게이트):
   - RDS snapshot 백업 (`RDS_INSTANCE_ID` 설정 시)
   - migrate task: `migrate diff` + `migrate deploy` (실패 시 app rollout 중단)
   - worker(`ECS_SERVICE_WORKER` 설정 시) → NestJS → inference 순서로
     새 task revision 등록 후 ECS service 업데이트
   - `services-stable` 대기

CI가 실패하면 배포 워크플로 자체가 시작되지 않는다. 실패한 커밋을 강제로 배포해야
하면 `workflow_dispatch`로 `image_tag`를 지정해 수동 실행한다.

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
- `backend/docker/ecs/worker-task-definition.json` (R13 — 잡·스케줄러 전용)
- `backend/docker/ecs/inference-task-definition.json`
- `backend/docker/ecs/migrate-task-definition.json`

배포 전 `ACCOUNT_ID` / IAM role ARN / secret ARN을 실제 값으로 맞춘다.
워크플로는 ECR registry에서 ACCOUNT_ID를 추출해 템플릿을 치환한다.

컨테이너 실행 정책 (2026-08-12, R4/R19):

- 세 task definition 모두 `"user": "10001"` — 이미지도 비-root(`appuser`, uid 10001)로 실행한다.
  이미지를 바꿔도 task definition이 비-root를 강제한다.
- backend는 `"stopTimeout": 120`(Fargate 최대). SIGTERM에서 `app.close()` → Sentry flush →
  종료가 끝날 시간을 확보한다. **ALB target group의 deregistration delay를 stopTimeout보다
  작게(예: 30초) 설정해야** 종료 중인 태스크로 새 요청이 가지 않는다.

### GitHub 설정

**Secret**

- `AWS_ROLE_ARN` — OIDC로 assume할 IAM role (ECR push, ECS update, RDS snapshot)

**Variables** (Repository 또는 `production` Environment)

- `AWS_REGION` (기본 `ap-northeast-2`)
- `ECR_BACKEND_REPO` / `ECR_INFERENCE_REPO`
- `ECS_CLUSTER`
- `ECS_SERVICE_BACKEND` / `ECS_SERVICE_INFERENCE`
- `ECS_SERVICE_WORKER` — R13 워커 서비스. **비워 두면 워커 rollout을 건너뛴다**
- `ECS_MIGRATE_TASK_FAMILY` (기본 `todayskin-migrate`)
- `ECS_SUBNETS` — 쉼표 구분 subnet id
- `ECS_SECURITY_GROUPS` — 쉼표 구분 sg id
- `ECS_ASSIGN_PUBLIC_IP` — migrate task의 퍼블릭 IP 할당(기본 `ENABLED`).
  NAT gateway로 전환하면 `DISABLED`. R31 이전에는 job env로 전달되지 않아
  이 오버라이드가 동작하지 않았다.
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
- `OCTOMO_API_KEY` (R17 — 누락 시 `/health/ready`가 항상 not-ready이고 신규 가입·신규 디바이스
  로그인이 막힌다. 비밀이 아닌 `OCTOMO_ENDPOINT`·`OCTOMO_RECIPIENT_NUMBER`는 task definition의
  `environment`에 명시한다.)

> `getRequiredEnvKeys('production')`과 task definition의 `environment ∪ secrets` 키 집합은
> `src/config/task-definition-env.spec.ts`가 CI에서 대조한다 — 같은 종류의 누락은 테스트가 막는다.

IAM:

- **execution role**: ECR pull, Secrets Manager read, CloudWatch Logs create/put
- **backend task role**: S3 객체 읽기/쓰기(동의 이미지), (선택) KMS
- **inference task role**: 최소 권한 (로그 외 외부 리소스 불필요)
- **migrate task role**: RDS 네트워크 접근 + `DATABASE_URL` secret read

### 네트워크 구성 (2026-08-12 확정)

- **backend (ECS Fargate)**: **public subnet** 배치 · **NAT gateway 미사용** · **ALB 유지**.
  - 인그레스는 ALB(`:3000` → `/health` 등)가 담당.
  - 아웃바운드(정부 API · Gemini · Redis 등)는 퍼블릭 IP + 인터넷 게이트웨이(IGW) 경유 — NAT 불필요.
  - **ECS 프로비저닝 시** 서비스를 public subnet에 만들고 **`assignPublicIp=ENABLED`** 로 설정
    (NAT가 없으므로 태스크에 퍼블릭 IP가 있어야 ECR pull·아웃바운드가 동작).
  - migrate task는 워크플로가 `assignPublicIp=ENABLED`로 실행 (GitHub Variable `ECS_ASSIGN_PUBLIC_IP`로 오버라이드 가능).
- **inference (ECS Fargate)**: 기존 N13 정책 유지 — **내부망 전용** (SG reference rule로 backend만 접근,
  퍼블릭 IP · ALB/NLB 없음). backend와 같은 VPC 안에서만 호출. (inference도 public subnet에 두되
  퍼블릭 IP 미할당·인그레스 차단, 또는 VPC endpoint 구성은 인프라 생성 시 결정)
- **RDS**: 퍼블릭 접근 비활성화 유지 (DB는 애플리케이션에서만 접근).

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
  R32: `/metrics`도 `X-Inference-Key`를 요구하므로 Prometheus 등 스크레이퍼는 같은 헤더를 보내야
  한다. `/health`만 무인증이며 상태 문자열 외 정보를 담지 않는다(모델 미준비 시 503).

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

큰 테이블 인덱스 추가 (R33):

Prisma는 migration 파일을 트랜잭션 안에서 실행하므로 `CREATE INDEX CONCURRENTLY`를
migration에 쓸 수 없다(트랜잭션 블록에서 금지). 그래서 B4 migration의 모든
`CREATE INDEX`에는 `IF NOT EXISTS`가 붙어 있다. 행이 많아 잠금이 부담되는 테이블은
release **전에** psql로 미리 만들어두면 migration이 그 인덱스를 건너뛴다.

```bash
psql "$DATABASE_URL" -c \
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS "products_category_idx" ON "products"("category");'
```

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
- OTP 게이트웨이 `OCTOMO_API_KEY` (MO 인증 — 사용자가 문자를 보내면 수신 여부를 API로 검증, 발송 비용 0원. 가입: octomo.octoverse.kr)

### 스케줄러 리더 선출 (R3)

주기 작업(날씨 수집·soft delete 물리 삭제·S3 reconcile·잡 지표)은 모든 task에서
실행되면 정부 API 중복 호출과 되돌릴 수 없는 물리 삭제의 동시 실행을 일으킨다.
ECS service의 모든 task는 같은 task definition/env를 공유하므로 "1개만 true"는
환경변수로 표현할 수 없다 — 그래서 각 tick 진입 시 Redis 락으로 리더를 뽑는다.

- 락: `SET scheduler:{name}:leader {instanceId} NX PX {interval×1.5}`
- 락은 해제하지 않고 **TTL로 만료**시킨다. 작업이 끝날 때 풀면 같은 주기에 다른
  task가 이어서 실행한다.
- 리더 task가 작업 중 죽으면 최대 TTL(약 한 주기)만큼 건너뛴다. 모든 스케줄러
  작업이 다음 tick에서 복구되는 성격이라 이 손실을 허용한다.
- **`REDIS_URL`이 없으면 락 없이 실행한다.** 로컬·단일 인스턴스 동작을 유지하기
  위한 선택이므로, 운영에서 task를 2개 이상으로 늘릴 때 Redis는 필수다.
- 결과적으로 **desiredCount를 자유롭게 올릴 수 있다.**
  `WEATHER_COLLECTOR_ENABLED=false`는 이제 필수가 아니며, 정부 API 호출을 즉시
  끊는 킬 스위치로만 남는다.
- 호출 빈도 조정: `WEATHER_COLLECTION_INTERVAL_MS`(기본 1시간)·`REGION_STAGGER_MS`(3초)

### 워커 서비스 분리 (R13)

`JOB_ROLE`로 같은 이미지의 역할을 나눈다.

| 값 | HTTP | BullMQ Worker | 스케줄러 |
|---|---|---|---|
| `both` (기본) | O | O | O |
| `api` | O | X (enqueue만) | X |
| `worker` | O (헬스체크용) | O | O |

- task definition: `backend/docker/ecs/worker-task-definition.json`
  (`JOB_ROLE=worker`, `JOB_DISPATCHER=bullmq`, `JOB_WORKER_CONCURRENCY=4`)
- 배포 파이프라인은 GitHub Variable `ECS_SERVICE_WORKER`가 설정돼 있을 때만
  워커 rollout을 수행한다. 비어 있으면 스킵되므로 서비스 생성 전에도 안전하다.
- 워커 서비스는 **ALB 타깃 그룹에 등록하지 않는다.** HTTP는 ECS 컨테이너
  헬스체크(`/health`)만 받는다.

**전환 순서 (역순 금지)**

1. `ECS_SERVICE_WORKER` variable 설정 → 워커 서비스 생성(desiredCount 1) → 배포
2. 워커 로그에서 `BullMQ queues and workers started (JOB_ROLE=worker...)` 확인
3. 큐가 실제로 소비되는지 `job_metrics` 로그로 확인(waiting이 쌓이지 않음)
4. 그 다음에 backend task definition에 `JOB_ROLE=api`를 추가해 배포

API를 먼저 `api`로 내리면 워커가 생기기 전까지 잡이 큐에 쌓인 채 처리되지 않고
스케줄러도 멈춘다. `backend-task-definition.json`이 `api`가 아닌지 CI가 검사한다
(`task-definition-env.spec.ts`).

### 보존 정책 스윕 활성화 (R11)

append-only 테이블 정리는 `SoftDeletePurgeScheduler`(리더 선출 대상)에 붙어 있고,
**`RETENTION_SWEEP_MODE` 기본값은 `off`다.** 되돌릴 수 없는 DELETE이므로 코드 배포만으로
데이터가 사라지지 않는다. 켤 때는 다음 순서를 따른다.

1. `RETENTION_SWEEP_MODE=dry-run`으로 배포한다. 삭제하지 않고 대상 건수만 로그로 남는다.
   `retention_sweep {"mode":"dry-run","tables":{...}}` 로그에서 규모를 확인한다.
2. 건수가 예상과 다르면 보존 기간(`RETENTION_*_DAYS`)을 조정하고 1로 돌아간다.
3. RDS 스냅샷을 확보한다(자동 백업만으로는 PITR 창을 벗어난 복구가 어렵다).
4. `RETENTION_SWEEP_MODE=delete`로 배포한다. 최초 실행은 대상이 많으므로 테이블당
   `RETENTION_BATCH_SIZE`(기본 1000) × 20배치까지만 지우고 나머지는 다음 tick으로 넘긴다.
   `truncated` 배열이 빌 때까지 여러 tick이 걸린다.
5. `SOFT_DELETE_PURGE_INTERVAL_MS`(기본 1시간) 주기로 이어서 정리된다.

| 테이블 | 기본 보존 | 기준 컬럼 |
|---|---|---|
| `RefreshSession` | 7일 | `expiresAt` 또는 `revokedAt` |
| `AsyncJob` (COMPLETED/FAILED) | 30일 | `createdAt` |
| `AiCallReservation` (COMPLETED) | 1일 | `updatedAt` |
| `OtpCode` | 30일 | `expiresAt` |
| `OtpSendLog` | 30일 | `sentAt` |
| `WeatherSnapshot` | 400일 | `collectedAt` |

기준 컬럼은 만료·폐기 시점이므로 `RETENTION_REFRESH_SESSION_DAYS=7`은 "만료된 지 7일
지난 세션"을 뜻한다(토큰 수명 `REFRESH_TOKEN_EXPIRES_IN`을 줄이는 것이 아니다).
이 기간에는 R21 재사용 탐지가 폐기된 세션을 조회할 수 있어야 하므로 0으로 두지 않는다.
`WeatherSnapshot`은 개인 패턴 분석이 계절 1주기를 비교하므로 400일보다 줄이지 않는다.

### 제품 카탈로그 시드 반영 (R9)

카탈로그는 `ProductCatalogService`가 Redis에 **10분** TTL로 캐시한다(Redis 미가용 시
프로세스 내 캐시). 따라서 `prisma db seed`로 상품을 바꿔도 **최대 10분간 예전 목록이
보인다.** 즉시 반영하려면 시드 직후 관리자 토큰으로 캐시를 비운다.

```bash
curl -X POST https://<api-host>/admin/products/cache/invalidate \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>"
```

- ADMIN 전용이며 `product.catalog_cache_invalidated`로 감사 로그에 남는다.
- 캐시만 비우므로 실패해도 데이터는 안전하다 — 다음 요청이 DB에서 다시 읽는다.
- 인스턴스가 여러 개여도 Redis 키 하나를 지우므로 한 번만 호출하면 된다.
  (Redis 장애 중이라면 각 인스턴스의 프로세스 캐시는 TTL로 만료된다)

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
- ~~실제 SMS OTP 게이트웨이 연결~~ → OCTOMO MO 인증 적용 완료 (feature/otp-octomo-mo, 2026-08)
- S3 객체 삭제 실패 재처리와 orphan reconciliation 운영 작업
- 실제 AWS 계정에 ECR/ECS/RDS/Secrets/OIDC role 프로비저닝 (인프라 최초 1회)
