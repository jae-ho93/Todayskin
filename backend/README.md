# Backend 구조

NestJS Modular Monolith(BFF·비즈니스) + `inference-service/` FastAPI(추론만).  
원칙: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) · 실행: [docs/SETUP.md](../docs/SETUP.md) · 배포: [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)

```text
요청 → Controller → Service → Prisma / Redis / 외부 Client
                ↘ Jobs(BullMQ|Inline) → Handler → Service
진단 이미지 → Diagnosis → InferenceProvider → FastAPI /infer (결과만)
동의 저장 시 → Storage → S3|Memory + DiagnosisImage 메타
```

## 디렉터리

```text
backend/
├─ src/
│  ├─ main.ts, app.module.ts     # 부트스트랩 · 모듈 조립
│  ├─ config/                    # env validation · registry
│  ├─ health/                    # /health, /live, /ready
│  ├─ prisma/ · redis/           # DB · 캐시/큐 연결
│  ├─ common/                    # guard, filter, logging, pagination, soft-delete, rate-limit
│  └─ modules/                   # 도메인 (아래 표)
├─ prisma/                       # schema · migrations · seed(+seed-data)
├─ test/                         # E2E
├─ inference-service/            # FastAPI · MobileNetV3 · landmarks (DB/인증 없음)
├─ docker/                       # ECS task · DEPLOYMENT · postgres-init
└─ docker-compose.yml            # postgres · redis · (+inference|backend profile)
```

## 모듈 맵 (`src/modules/`)

| 모듈 | 책임 |
|------|------|
| `auth` · `otp` | 가입/로그인/refresh/탈퇴, 소셜(Kakao·Google·Apple), OTP(SMS/mock) |
| `admin` | ADMIN API · 감사 로그 |
| `consent` · `storage` | 목적별 동의 게이트 · 이미지 S3/Memory · reconciliation |
| `diagnosis` | 업로드·검증 · InferenceProvider · 이력/캘린더 · landmarks |
| `weather` | 기상·대기질 Client · 캐시 · snapshot · 스케줄 수집 |
| `recommendations` · `products` · `gemini` | 추천/제품 · rec-fast-path(SWR·FALLBACK·LIVE job) · EvidencePolicy |
| `pattern` | 개인 패턴 LOCKED/READY |
| `notifications` | 알림 선호 · `pushDeliveryAvailable` |
| `jobs` | Inline/BullMQ dispatcher · `GET /jobs/:id` |
| `idempotency` | 외부 AI 호출 예약(중복 방지) |

모듈 안 관례: `*.controller` = HTTP, `*.service` = 도메인, `clients/`·`providers/` = 외부, `policies/` = 규칙, `dto/`·`enums/`.

## 데이터 · 런타임

- **진실 저장소:** PostgreSQL (`prisma/schema.prisma`). Soft Delete·FK는 스키마 상단 표.
- **Redis:** 날씨 캐시, BullMQ, (옵션) 분산 rate limit. 없으면 캐시 fallback + Inline jobs.
- **이미지:** `diagnosis_image_storage` 동의 시에만 영속. 운영 `S3_BUCKET` 필수.
- **추론 경계:** Nest만 호출. `INFERENCE_SHARED_SECRET` · FastAPI는 점수/등급/landmarks만.

## 어디를 볼까

| 궁금한 것 | 위치 |
|-----------|------|
| env 목록·필수 | `.env.example`, `src/config/env.registry.ts` |
| API 계약 | 개발 Swagger `/api/docs`, `test/*e2e*` |
| 스키마·시드 | `prisma/` |
| 활성 작업 보드 | [docs/BACKEND_TASKS.md](../docs/BACKEND_TASKS.md) |
| 완료 이력 | [docs/BACKEND_ARCHIVE.md](../docs/BACKEND_ARCHIVE.md) |
| 리팩토링 R1~R35 판단 근거 (완료 기록) | [docs/REFACTORING_BACKLOG.md](../docs/REFACTORING_BACKLOG.md) |
| 추론 서버 | `inference-service/README.md` |
