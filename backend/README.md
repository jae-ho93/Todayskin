# Todayskin Backend (NestJS)

FastAPI 기반 백엔드를 NestJS + TypeScript + PostgreSQL(Prisma) + Redis 구조로 전환하는 작업의 진행 중입니다.

현재 단계: **T1 — NestJS 기본 구조**

## 실행

```bash
cd backend
cp .env.example .env   # 로컬 환경변수 파일 생성 (secret 없이 변수명만)
npm install
npm run start:dev
```

기본 포트는 3000입니다. `/health`에서 서버 상태를 확인하고, `/api/docs`에서 Swagger UI를 확인할 수 있습니다.

## 스크립트

| 스크립트 | 설명 |
|---|---|
| `npm run build` | TypeScript 컴파일 (`dist/`) |
| `npm run start:dev` | 개발 모드 실행 (watch) |
| `npm run start:prod` | `dist/main.js` 실행 |
| `npm test` | Jest 유닛 테스트 |
| `npm run test:e2e` | Jest e2e 테스트 |
| `npm run lint` | ESLint 실행 및 자동 수정 |

## 환경변수

`backend/.env.example` 참조. T1 단계에서 `DATABASE_URL`, `REDIS_URL`, JWT secret은 optional이며, T2/T3에서 required로 전환됩니다.

## 구조

```text
backend/src/
├─ main.ts                  # 부트스트랩, ValidationPipe, 예외 필터, CORS, Swagger
├─ app.module.ts            # AppModule, ConfigModule
├─ config/
│  └─ env.validation.ts     # Joi 환경변수 검증 스키마
├─ common/
│  ├─ exceptions/           # 공통 예외 응답 DTO
│  └─ filters/               # HttpExceptionFilter
└─ health/
   ├─ health.module.ts
   ├─ health.controller.ts  # GET /health
   └─ dto/                   # HealthResponseDto
```

기존 Python 코드(`backend/app/`)는 참조용으로 보존되어 있으며, 점진적으로 NestJS 모듈로 이식됩니다.
