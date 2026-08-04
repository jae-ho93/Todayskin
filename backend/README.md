# Todayskin Backend (NestJS)

FastAPI 기반 백엔드를 NestJS + TypeScript + PostgreSQL(Prisma) + Redis 구조로 전환하는 작업의 진행 중입니다.

현재 단계: **T13 — 테스트와 API 계약 (완료)**

## 실행

```bash
cd backend
cp .env.example .env   # DATABASE_URL 등 환경변수 설정
npm install
npm run prisma:generate
docker compose up -d   # 로컬 PostgreSQL (dev + test DB 자동 생성)
npm run prisma:migrate  # DB에 스키마 적용
npm run prisma:seed     # 전역 추천 템플릿·제품 카탈로그 seed
npm run start:dev
```

기본 포트는 3000입니다. `/health`에서 서버 상태를 확인하고, `/api/docs`에서 Swagger UI를 확인할 수 있습니다.

## 로컬 DB

`docker-compose.yml`은 개발용 PostgreSQL 컨테이너를 띄운다.
초기화 스크립트(`docker/postgres-init.sh`)가 dev 외에 test DB를 함께 생성한다.

```bash
docker compose up -d        # 실행 (dev + test DB 생성)
docker compose down         # 정지 (데이터 볼륨 유지)
docker compose down -v      # 정지 + 데이터 삭제 (init 스크립트 재실행 시)
```

### 환경별 DB 분리

| 환경 | DATABASE_URL |
|---|---|
| 개발 | `postgresql://todayskin:secret@localhost:5432/todayskin_dev` |
| 테스트 | `postgresql://todayskin:secret@localhost:5432/todayskin_test` |
| 운영 | 별도 관리 (컨테이너 외부, 별급 비밀번호) |

## 스크립트

| 스크립트 | 설명 |
|---|---|
| `npm run build` | TypeScript 컴파일 (`dist/`) |
| `npm run start:dev` | 개발 모드 실행 (watch) |
| `npm run start:prod` | `dist/main.js` 실행 |
| `npm test` | Jest 유닛 테스트 |
| `npm run test:e2e` | Jest e2e 테스트 |
| `npm run lint` | ESLint 실행 및 자동 수정 |
| `npm run prisma:generate` | Prisma Client 생성 |
| `npm run prisma:migrate` | 마이그레이션 생성·적용 (`migrate dev`) |
| `npm run prisma:seed` | seed 데이터 실행 (upsert, idempotent) |
| `npm run prisma:studio` | Prisma Studio 실행 |

## 테스트

단위 테스트와 e2e 테스트가 분리되어 있다.

### 단위 테스트

```bash
export DATABASE_URL=postgresql://todayskin:secret@localhost:5432/todayskin_test
export JWT_ACCESS_SECRET=test_access_secret_at_least_32_characters_long
export JWT_REFRESH_SECRET=test_refresh_secret_at_least_32_characters_long
npm test
```

 — Service/Guard 단위 로직을 Prisma/GeminiClient mock으로 검증.

### e2e 테스트

```bash
export DATABASE_URL=postgresql://todayskin:secret@localhost:5432/todayskin_test
export JWT_ACCESS_SECRET=e2e_access_secret_at_least_32_characters_long
export JWT_REFRESH_SECRET=e2e_refresh_secret_at_least_32_characters_long
export MOCK_INFERENCE=true
npm run test:e2e
```

 — 실제 PostgreSQL(test DB)에 대해 전체 HTTP 경로를 검증.
로 순차 실행하여 test DB race condition을 방지한다.

테스트 범위 (T13):
- Auth/USER/ADMIN 권한 + 소유권 (RolesGuard 단위, e2e 인증 경로)
- Migration/seed 멱등성 + 스키마 무결성
- Weather parser/fallback (UNAVAILABLE, 근접측정소 폴백)
- 추천 중복 생성 방지 (diagnosisId 기반)
- 진단 multipart 파일 검증 (필드, MIME, 크기, 중복)
- Pattern locked/ready (404 아닌 200 + LOCKED)
- 프론트 API response contract (camelCase, detail 필드)
- 운영 환경 mock fallback 비활성화 (GeminiClient.isMockEnabled)
- 날씨 지표 undefined + 추천 API 503 계약

## 환경변수

`backend/.env.example` 참조. T2 단계에서 `DATABASE_URL`은 필수(test 환경 제외).
`REDIS_URL`은 T12, JWT secret은 T3에서 required로 전환된다.

## 데이터 모델

```text
User
 ├─ RefreshSession
 ├─ Diagnosis
 │   ├─ SkinMetric (unique: diagnosisId + part)
 │   └─ WeatherSnapshot (nullable 지표, UV peak, source enum)
 ├─ Recommendation ─ RecommendationProduct ─ Product
 ├─ NotificationPreference (1:1)
 └─ ConsentRecord

RecommendationTemplate (전역 A등급 고정 문구)
```

- `User.gender` nullable enum(male/female) — 선택 입력, 모델 학습 전 미사용
- `WeatherSnapshot`은 모든 지표 nullable + `WeatherSource`(LIVE/CACHED/UNAVAILABLE)로 측정 불가 상태 표현
- `Product`에 날씨 기반 `reason`, `timing` 필드 포함
- 전역 추천 템플릿(A등급)과 사용자별 생성 추천(B/C등급)을 분리
- C등급 추천은 개인 패턴 기반이므로 seed에서 분리

## 구조

```text
backend/
├─ prisma/
│  ├─ schema.prisma          # Prisma 스키마 (PostgreSQL)
│  ├─ migrations/            # 마이그레이션
│  └─ seed.ts                # 전역 템플릿·제품 카탈로그 seed (upsert)
├─ prisma.config.ts          # Prisma 7 설정 (datasource URL, adapter)
├─ docker-compose.yml        # 로컬 PostgreSQL 컨테이너 (dev + test DB)
├─ docker/
│  └─ postgres-init.sh       # 컨테이너 초기화 시 test DB 생성
├─ src/
│  ├─ main.ts               # 부트스트랩, ValidationPipe, 예외 필터, CORS, Swagger
│  ├─ app.module.ts         # AppModule, ConfigModule, PrismaModule
│  ├─ config/
│  │  └─ env.validation.ts  # Joi 환경변수 검증 스키마
│  ├─ common/
│  │  ├─ exceptions/        # 공통 예외 응답 DTO
│  │  └─ filters/          # HttpExceptionFilter
│  ├─ prisma/
│  │  ├─ prisma.module.ts   # Global PrismaModule
│  │  ├─ prisma.service.ts  # PrismaClient 래퍼 (driver adapter)
│  │  └─ prisma.service.spec.ts  # 연결·모델 노출·seed 쿼리 테스트
│  └─ health/
│     ├─ health.module.ts
│     ├─ health.controller.ts  # GET /health
│     └─ dto/               # HealthResponseDto
```

기존 Python 코드(`backend/app/`)는 참조용으로 보존되어 있으며, 점진적으로 NestJS 모듈로 이식됩니다.

## Prisma 7 참고

이 프로젝트는 Prisma 7을 사용한다. Prisma 7에서는 datasource URL을 `schema.prisma`가 아닌 `prisma.config.ts`에서 관리하며, 런타임은 driver adapter(`@prisma/adapter-pg`)로 PostgreSQL에 연결한다. 마이그레이션은 `prisma migrate deploy` / `prisma migrate dev`로 실행한다.
