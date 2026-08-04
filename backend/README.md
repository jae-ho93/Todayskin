# Todayskin Backend (NestJS)

FastAPI 기반 백엔드를 NestJS + TypeScript + PostgreSQL(Prisma) + Redis 구조로 전환하는 작업의 진행 중입니다.

현재 단계: **T2 — PostgreSQL + Prisma**

## 실행

```bash
cd backend
cp .env.example .env   # DATABASE_URL 등 환경변수 설정
npm install
npm run prisma:generate
docker compose up -d   # 로컬 PostgreSQL (선택)
npm run prisma:migrate  # DB에 스키마 적용
npm run prisma:seed     # 전역 추천 템플릿·제품 카탈로그 seed
npm run start:dev
```

기본 포트는 3000입니다. `/health`에서 서버 상태를 확인하고, `/api/docs`에서 Swagger UI를 확인할 수 있습니다.

## 로컬 DB

`docker-compose.yml`은 개발용 PostgreSQL 컨테이너를 띄운다.

```bash
docker compose up -d        # 실행
docker compose down         # 정지 (데이터 볼륨 유지)
docker compose down -v      # 정지 + 데이터 삭제
```

연결 문자열: `postgresql://todayskin:secret@localhost:5432/todayskin_dev`

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
| `npm run prisma:seed` | seed 데이터 실행 |
| `npm run prisma:studio` | Prisma Studio 실행 |

## 환경변수

`backend/.env.example` 참조. T2 단계에서 `DATABASE_URL`은 필수(test 환경 제외).
`REDIS_URL`은 T12, JWT secret은 T3에서 required로 전환된다.

## 구조

```text
backend/
├─ prisma/
│  ├─ schema.prisma          # Prisma 스키마 (PostgreSQL)
│  ├─ migrations/            # 마이그레이션
│  └─ seed.ts                # 전역 템플릿·제품 카탈로그 seed (upsert)
├─ prisma.config.ts          # Prisma 7 설정 (datasource URL, adapter)
├─ docker-compose.yml        # 로컬 PostgreSQL 컨테이너
├─ src/
│  ├─ main.ts               # 부트스트랩, ValidationPipe, 예외 필터, CORS, Swagger
│  ├─ app.module.ts         # AppModule, ConfigModule, PrismaModule
│  ├─ config/
│  │  └─ env.validation.ts  # Joi 환경변수 검증 스키마
│  ├─ common/
│  │  ├─ exceptions/        # 공통 예외 응답 DTO
│  │  └─ filters/           # HttpExceptionFilter
│  ├─ prisma/
│  │  ├─ prisma.module.ts   # Global PrismaModule
│  │  └─ prisma.service.ts  # PrismaClient 래퍼 (driver adapter)
│  └─ health/
│     ├─ health.module.ts
│     ├─ health.controller.ts  # GET /health
│     └─ dto/               # HealthResponseDto
```

기존 Python 코드(`backend/app/`)는 참조용으로 보존되어 있으며, 점진적으로 NestJS 모듈로 이식됩니다.

## Prisma 7 참고

이 프로젝트는 Prisma 7을 사용한다. Prisma 7에서는 datasource URL을 `schema.prisma`가 아닌 `prisma.config.ts`에서 관리하며, driver adapter(`@prisma/adapter-pg`)로 PostgreSQL에 연결한다.
