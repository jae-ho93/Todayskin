# Todayskin Backend

NestJS를 메인 백엔드로, `inference-service/`의 FastAPI를 이미지 추론 서버로 분리한 구조입니다. NestJS가 인증, 동의, 진단, 추천, 날씨, 데이터 영속화와 운영 정책을 담당하고 FastAPI는 추론 결과만 반환합니다.

현재 T0~T14와 N0~N8이 반영되어 있습니다. 실제 SMS OTP 게이트웨이 연결과 AWS 계정 리소스 프로비저닝은 후속 작업입니다.

## 로컬 실행

```bash
cd backend
npm install
cp .env.example .env

# .env의 DATABASE_URL, JWT secret 등을 개발값으로 설정
docker compose up -d
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run start:dev
```

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/api/docs` (개발·테스트 환경만)
- 호환 health: `GET /health`
- liveness/readiness: `GET /health/live`, `GET /health/ready`

FastAPI 추론 서버까지 실행하려면 다음 중 하나를 사용합니다.

```bash
# 로컬 NestJS + 컨테이너 inference-service
npm run start:dev
docker compose --profile inference up -d --build

# PostgreSQL, Redis, NestJS, inference-service 통합 실행
docker compose --profile backend up -d --build
```

## 주요 스크립트

| 명령 | 용도 |
|---|---|
| `npm run build` | NestJS TypeScript 빌드 |
| `npm run start:dev` | 개발 서버(watch) |
| `npm run start:prod` | 빌드 결과 실행 |
| `npm test` | Jest 단위 테스트 |
| `npm run test:e2e` | PostgreSQL 기반 E2E 테스트 |
| `npm run test:cov` | 커버리지 포함 단위 테스트 |
| `npm run lint` | ESLint 검사(자동 수정 없음) |
| `npm run prisma:generate` | Prisma Client 생성 |
| `npm run prisma:migrate` | 개발 DB migration 적용 |
| `npm run prisma:seed` | 추천 템플릿·제품 seed(upsert) |
| `npm run audit:ci` | high 이상 npm 취약점 검사 |

## 구조

```text
backend/
├─ src/
│  ├─ main.ts                 # Validation, CORS, Helmet, Swagger, 예외 필터
│  ├─ app.module.ts           # 전역 모듈 조립과 rate limit
│  ├─ config/                 # 환경변수 스키마와 registry
│  ├─ health/                 # health/live/ready
│  ├─ prisma/                 # Prisma 연결
│  ├─ redis/                  # 선택적 Redis 연결
│  ├─ common/                 # guard, decorator, logging, pagination, soft delete
│  └─ modules/
│     ├─ auth, otp, admin
│     ├─ consent, storage
│     ├─ diagnosis, weather
│     ├─ recommendations, products, pattern
│     ├─ notifications, gemini
│     └─ jobs                 # Inline/BullMQ dispatcher와 상태 조회
├─ prisma/                    # schema, migrations, seed
├─ test/                      # E2E 테스트
├─ inference-service/         # FastAPI + MobileNetV3 + MediaPipe landmarks
├─ docker/                    # 로컬 초기화, ECS task definition, 배포 문서
└─ docker-compose.yml
```

## 핵심 정책

### 인증과 권한

- Access/Refresh JWT를 분리하고 Refresh Token은 해시로 저장·회전합니다.
- 가입과 로그인은 OTP 검증 기록을 소비합니다.
- 개발·테스트는 allowlist 기반 mock OTP를 사용할 수 있습니다.
- 운영 `SmsOtpProvider`의 실제 게이트웨이 HTTP 호출은 아직 구현되지 않았으므로 운영 공개 전 완료해야 합니다.
- ADMIN API는 `RolesGuard`와 감사 로그를 사용합니다.

### 이미지와 동의

- `diagnosis_image_processing` 활성 동의가 있어야 진단할 수 있습니다.
- `diagnosis_image_storage` 동의가 있을 때만 이미지와 landmarks를 저장·노출합니다.
- 개발·테스트는 `S3_BUCKET`이 없으면 Memory store를 사용할 수 있습니다.
- 운영은 `S3_BUCKET`이 필수이며 Memory fallback을 허용하지 않습니다.
- 철회·탈퇴 시 객체 삭제가 실패하면 DB 참조를 보존하고 요청을 실패시켜 재시도할 수 있게 합니다.

### 비동기 작업

`JOB_DISPATCHER=auto`가 기본입니다.

- `REDIS_URL` 있음: BullMQ queue/worker, 재시도, DLQ
- `REDIS_URL` 없음: Inline dispatcher
- `JOB_DISPATCHER=inline|bullmq`: 동작을 명시적으로 고정

추천 생성, 패턴 분석, 알림 발송은 job API로 요청하고 `jobId`를 polling해 결과를 확인할 수 있습니다.

### Soft Delete

탈퇴 시 PII를 즉시 스크럽하고 이미지 원본을 삭제하며, 진단은 익명화한 뒤 보존 기간 후 User만 purge합니다. FK 정책은 `prisma/schema.prisma`, 결정 근거는 `decision.md`를 따릅니다.

## 주요 API

| 영역 | API |
|---|---|
| 인증 | `POST /auth/signup`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/withdraw` |
| OTP | `POST /otp/send`, `/otp/verify` |
| 동의 | `GET /consents`, `POST /consents` |
| 진단 | `POST /diagnosis`, `GET /diagnosis/latest`, `/history` |
| 캘린더 | `GET /diagnosis/history/:date`, `/diagnosis/score-series` |
| 추천 | `GET /recommendations`, `POST /recommendations/generate` |
| 제품 | `GET /products`, `POST /products/weather-based` |
| 패턴 | `GET /diagnosis/pattern` |
| 날씨 | `GET /weather` |
| 알림 | 알림 설정 조회·수정과 비동기 발송 |
| 작업 | enqueue 응답의 `jobId` 상태 조회 |
| 운영 | `GET /health/live`, `/health/ready`, ADMIN 사용자·purge API |

정확한 요청·응답 계약은 개발 환경 Swagger와 E2E 테스트를 기준으로 합니다.

## 테스트

```bash
cd backend
npm test

DATABASE_URL=postgresql://todayskin:secret@localhost:5432/todayskin_test \
JWT_ACCESS_SECRET=test_access_secret_at_least_32_characters_long \
JWT_REFRESH_SECRET=test_refresh_secret_at_least_32_characters_long \
MOCK_INFERENCE=true \
npm run test:e2e
```

E2E는 실제 test DB를 사용하고 `backend/test/jest-e2e.json`에 따라 순차 실행합니다.

## 운영

GitHub Actions가 NestJS와 inference-service 이미지를 ECR에 push하고, 승인 후 migration task와 ECS Fargate 배포를 수행합니다. 운영 절차와 rollback은 [docker/DEPLOYMENT.md](docker/DEPLOYMENT.md)를 참고합니다.

운영에서 최소한 다음을 별도 secret/config로 주입합니다.

- `DATABASE_URL`, `REDIS_URL`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `S3_BUCKET`, `INFERENCE_SERVICE_URL`
- 외부 API와 관측성 설정
- 실제 SMS 게이트웨이 설정(구현 완료 후)

환경변수 전체 목록은 `.env.example`, 정책은 `src/config/env.registry.ts`를 기준으로 합니다.
