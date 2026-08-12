# Todayskin Backend Tasks — 완료 이력 (Archive)

> **보관 문서.** 완료된 작업을 기록으로 보존한다. 계획·진행 중 작업은
> [`docs/BACKEND_TASKS.md`](BACKEND_TASKS.md), 리팩토링 제안은
> [`docs/REFACTORING_BACKLOG.md`](REFACTORING_BACKLOG.md)에 있다.
> 아키텍처 원칙은 [`docs/ARCHITECTURE.md`](ARCHITECTURE.md), 협업 규칙은 `CONTRIBUTING.md`가 기준이다.
>
> 공통 완료 정의: 기능이 모듈 경계 안에 구현, migration·seed 재현 가능, 인증·권한·소유권 검사,
> 성공/실패 테스트, 기존 프론트 계약 검증, secret 미포함, PR 리뷰 후 `main` 병합.

## 완료 작업

### 전환 (FastAPI → NestJS)

### T0. 협업 환경 정리

브랜치: `chore/backend-collaboration-setup`

- [x] `main` 직접 push 금지 규칙 문서화
- [x] PR 승인 최소 1명과 CI 성공 후 merge 규칙 문서화
- [x] 브랜치·커밋·PR 규칙을 `CONTRIBUTING.md`로 공유
- [x] `.env`, `.env.bak`, SQLite DB, IDE/로컬 인덱스 ignore 확인
- [x] `backend/.env.example`에 secret 없이 필요한 변수명 정리
- [x] 담당자와 수정 파일 범위를 Issue에 기록하는 규칙 추가
- [x] Issue와 PR 연결 템플릿 추가
- [x] PR CI workflow 추가

### T1. NestJS 기본 구조

브랜치: `feature/backend-nest-init`

- [x] NestJS, `AppModule`, `HealthModule` 초기화
- [x] `GET /health` 구현
- [x] `ConfigModule`과 환경변수 검증
- [x] 전역 `ValidationPipe`와 공통 예외 응답 설정
- [x] CORS 허용 목록 환경변수화
- [x] build/test 스크립트와 Swagger 기반 마련

### T2. PostgreSQL + Prisma

브랜치: `feature/prisma-postgres-schema`

- [x] PostgreSQL 로컬 실행 방식 결정
- [x] `DATABASE_URL` 연결 및 `PrismaService` 구현
- [x] `schema.prisma`, migration, `prisma/seed.ts` 작성
- [x] 제품·추천 템플릿 seed를 upsert로 구현
- [x] 개발/테스트/운영 DB 분리
- [x] NestJS 시작 시 자동 `create_all` 사용 금지
- [x] 기존 SQLite 데이터 보존 및 중복 데이터 처리 정책 결정
- [x] `User.gender` nullable enum(`male`, `female`) 반영
- [x] `WeatherSnapshot`에 UV peak와 측정 불가 상태 반영
- [x] 날씨 기반 생성 제품의 `reason`, `timing` 저장 여부 결정 (DB 비저장, 응답만. 카탈로그 Product에는 reason/timing 컬럼 존재)

### T3. JWT 인증과 USER/ADMIN

브랜치: `feature/jwt-refresh-auth`

- [x] 회원가입·로그인·로그아웃 API 이식
- [x] Access JWT 발급
- [x] Refresh Token 회전·폐기·해시 저장
- [x] `JwtStrategy`, `JwtAuthGuard` 구현
- [x] `USER`, `ADMIN` enum과 `RolesGuard` 구현
- [x] 현재 사용자 decorator 구현
- [x] ADMIN 전용 운영 API 보호 (N2 AdminModule로 구현)
- [x] 진단·추천 조회 시 사용자 소유권 검사 (Diagnosis/Recommendation Service userId 검사 + ForbiddenException)
- [x] 인증 실패와 권한 부족 상태 코드 구분

### T4. 기존 Auth/User API 호환

브랜치: `feature/migrate-auth-user-api`

- [x] `/auth/signup`, `/auth/login`, `/auth/logout` 이식 (auth.controller.ts, refresh/me 포함)
- [x] 전화번호·이름·생년월일 검증 규칙 유지 (signup.dto.ts Validation)
- [x] `Authorization: Bearer ...` 계약 유지 (JwtAuthGuard + Swagger addBearerAuth)
- [x] 에러 응답 형식 통일 (HttpExceptionFilter)
- [x] Expo 로그인/회원가입 통합 테스트 (auth.e2e-spec.ts, api-contract.e2e-spec.ts)

### T5. Weather 모듈

브랜치: `feature/migrate-weather-api`

- [x] `WeatherController`, `WeatherService` 구현
- [x] `KmaClient`, `AirKoreaClient`, 측정소 Client 분리
- [x] 지역 선택과 좌표 처리 이식
- [x] UV, PM2.5, PM10, 오존, CAI, NO2, SO2, CO 파싱
- [x] 상태 계산을 `WeatherStatusPolicy`로 분리
- [x] timeout·외부 API 오류·응답 스키마 검증
- [x] `LIVE | CACHED | UNAVAILABLE` 출처 구분
- [x] API 키가 로그에 나오지 않는지 확인

### T6. 날씨 이력 저장

브랜치: `feature/persist-weather-snapshots`

- [x] `WeatherSnapshot` 모델 구현 (T2 schema + T6 영구 저장)
- [x] 관측 시각과 서버 수집 시각 구분 (observedAt=외부 API 발표시각, collectedAt=DB now())
- [x] 지역·측정소·좌표 저장 정책 결정 (regionName/cityName/lat/lon/kmaAreaNo/airkoreaStation 저장)
- [x] 진단 연결용 서비스 메서드 제공 (getOrCreateSnapshot/getSnapshotById)
- [x] 진단 시 weatherSnapshotId 실제 연결 (T9 Diagnosis 도메인에서)
- [x] 중복·fallback 데이터 저장 정책 결정 (동일 관측시각 get-or-create dedup, UNAVAILABLE 미저장)
- [x] 개인 패턴 분석 필드 확정 (T10 개인 패턴 API에서 통계 정책과 함께 결정)

### T7. Recommendation/Product 모듈

브랜치: `feature/migrate-recommendation-api`

- [x] Recommendation과 Product 모듈 분리
- [x] 전역 A등급 템플릿과 사용자별 추천 분리
- [x] 제품 목록·category 필터 이식
- [x] `POST /products/weather-based` 이식
- [x] 날씨 기반 제품의 `reason`, `timing` 응답 계약 유지
- [x] Recommendation-Product 중간 테이블 설계
- [x] 추천 상세 소유권 검사
- [x] 동일 진단 중복 생성 방지
- [x] A/B/C 등급을 서버에서 결정
- [x] C등급을 전역 seed에서 분리

### T8. Gemini와 근거 정책

브랜치: `feature/migrate-gemini-recommendation`

- [x] Gemini 호출을 `GeminiClient`로 분리
- [x] 의료적 확정 표현 검증 (`EvidencePolicy` 사후 검증 추가)
- [x] grade와 sourceLabel 서버 고정
- [x] 요청은 측정값 전체가 아니라 `diagnosisId` 중심으로 변경
- [x] 서버가 소유권 확인 후 diagnosis/weather 조회
- [x] 생성 결과를 user/diagnosis에 연결
- [x] Gemini 실패 시 503과 명시적 unavailable 상태 반환
- [x] 개발용 mock 응답과 운영 응답을 분리

### T9. 진단 도메인 기반

브랜치: `feature/diagnosis-domain-foundation`

- [x] multipart 3개 필드, MIME 타입, 파일 크기, 빈 파일 검증
- [x] `Diagnosis.status` 정의 (schema.prisma `DiagnosisStatus` enum — PENDING/COMPLETED/FAILED)
- [x] `InferenceProvider` interface와 `MockInferenceProvider` 구현
- [x] 결과 범위 검증 (overallScore 0~100, 부위 6개 일치, 중복/누락/과잉 거부)
- [x] Diagnosis와 SkinMetric을 하나의 transaction으로 저장
- [x] `modelVersion` 저장
- [x] 원본 이미지 비저장 (memoryStorage + 처리 후 GC, 동의는 ConsentRecord 모델로 별도)
- [x] 중복 요청 방지 정책 결정 (동일 사용자 60초 이내 제출 거부)

### T10. 개인 패턴 분석 API

브랜치: `feature/personal-pattern-api`

- [x] `GET /diagnosis/pattern` 설계
- [x] `LOCKED`, `READY` 상태와 수집일·필요일 계산
- [x] Diagnosis와 WeatherSnapshot 조인
- [x] 분석 대상, 결측값, 최소 샘플 수 정책 결정
- [x] 상관계수 계산 방식 결정
- [x] 상관관계와 인과관계 구분 문구 고정
- [x] 결과를 C등급 추천과 연결
- [x] `trend.tsx`의 직접 mock 사용을 API 계약으로 교체

### T11. 알림 설정 저장

브랜치: `feature/notification-preferences`

- [x] `NotificationPreference` 모델과 사용자별 1 row 보장
- [x] 설정 조회·수정 API
- [x] USER는 자기 설정만 수정
- [x] 기본값 및 프론트 동기화 정책 결정

### T12. Redis 날씨 캐시

브랜치: `feature/redis-weather-cache`

- [x] Redis 연결 모듈
- [x] cache key와 TTL 정의
- [x] hit/miss 처리
- [x] Redis 장애 시 외부 API 또는 최근 DB fallback
- [x] live/cached 출처 구분
- [x] 무효화·로그·metric 정책 결정 (→ N11 다중 인스턴스 운영 보강에서 완료)

### T13. 테스트와 API 계약

브랜치: `test/backend-contracts`

- [x] Auth, USER/ADMIN, 소유권 테스트
- [x] migration/seed 테스트
- [x] Weather parser/fallback 테스트
- [x] 추천 중복 생성 방지 테스트
- [x] 진단 파일 검증 테스트
- [x] Pattern locked/ready 테스트
- [x] 프론트 API response contract 테스트
- [x] 운영 환경 mock fallback 비활성화 테스트
- [x] 날씨 지표 `undefined`와 추천 API `503` 계약 테스트

### T14. Docker와 GitHub Actions

브랜치: `chore/backend-ci-cd`

- [x] NestJS Dockerfile
- [x] PostgreSQL·Redis 로컬 컨테이너
- [x] 환경변수 주입 문서화
- [x] install/build/test workflow
- [x] PR 자동 테스트
- [x] Prisma migration 검사
- [x] 배포 전략 결정

### 운영 개선 (N0~N34)

### OTP MO 전환 — OCTOMO (feature/otp-octomo-mo, 2026-08)

- [x] `OtpProvider` 인터페이스 변경: `send(phone, code)` → `recipientNumber` + `verifySent(phone, text)`
- [x] `OctomoOtpProvider` 신규 — POST `/octomo/v1/public/message/exists`,
      `Authorization: Octomo {key}`, `{ mobileNum, text }` → `{ verified }` (기본 5분 조회)
- [x] `/otp/send` 응답 변경: `{ code, recipientNumber, message }` — MO는 코드를 화면에 표시해야 하므로 **프론트 계약 변경**
- [x] env: `SMS_*` 제거 → `OCTOMO_API_KEY`(production required)·`OCTOMO_ENDPOINT`·`OCTOMO_RECIPIENT_NUMBER`(기본 1666-3538)·`OCTOMO_TIMEOUT_MS`·`OCTOMO_MAX_RETRIES`
- [x] health ready 의존성 `sms` → `octomo` / provider 단위 테스트 교체 / OTP·auth e2e 유지 확인
- [x] 프론트: OTP 화면 "코드 입력" → "수신 번호로 코드 발송 안내" 전환 (`docs/FRONTEND_TASKS.md` F17, PR #94 완료)

### BE-2026-08-12. OTP 개발 모드 정리 — OCTOMO 연동/목업 표시 — 완료 (2026-08-12)

- [x] `MockOtpProvider.recipientNumber`를 `'0000'` → `'1666-3538'`로 변경 (개발 화면 정상화)
- [x] provider 선택을 `NODE_ENV === 'production'` 기준 → **`OCTOMO_API_KEY` 유무 기준**으로 변경
      (`otp.module.ts` useFactory) — 로컬에서도 키만 넣으면 실제 OCTOMO 검증 테스트 가능
### BE-2026-08-12. 개발 스토리지 논리 URI(`memory://`) → http 정규화 (신규, 2026-08-12) — 완료 (2026-08-12)

- [x] `providers/image-object-store.interface.ts` — `toPublicUrl(uri: string): string`
- [x] `providers/memory-image-object-store.ts` — 구현 + `putObject` uri http화
- [x] `providers/s3-image-object-store.ts` — pass-through 구현
- [x] `image-storage.service.ts` — `toPublicUrl` 노출
- [x] `diagnosis.service.ts` — 스냅샷 DTO thumbnailUri 정규화 (레거시 DB분 포함)
- [x] spec 테스트 갱신

### N0. 운영 보안·HTTP 보호

브랜치: `feature/runtime-security-http`

- [x] Helmet 적용
- [x] @nestjs/throttler Rate Limit 적용 (저장소: 메모리(ThrottlerStorageService), limit=60 / window=60s 기본, 환경변수 조정 가능)
- [x] CORS/Validation 현재 유지
- [x] 운영 환경에서 `NODE_ENV=production` 시 보안 헤더·throttle 강제 (Swagger 노출 차단, Helmet 보안 헤더 적용)

### N1. 구조화 로깅·관측성

브랜치: `feature/structured-logging-observability`

- [x] Pino JSON 구조화 로깅과 correlation ID
- [x] 민감정보 redact 정책
- [x] Sentry 선택적 연동과 민감정보 제거
- [x] 감사 로그와 애플리케이션 로그 책임 분리

### N2. 인증 강화·ADMIN 운영 API

브랜치: `feature/otp-auth-admin`

- [x] OTP provider interface 설계 (`OtpProvider`, `MockOtpProvider`, `SmsOtpProvider`)
- [x] 가입·새 디바이스 로그인 OTP 검증·소비 흐름
  - 개발: allowlisted test phone / mock OTP
  - 운영: 시도 횟수·만료·재전송 제한 적용
- [x] 실제 SMS 게이트웨이 HTTP 호출 (→ N9에서 알리고(Aligo) 연동 완료)
- [x] OTP 발송 채널은 SMS로 결정
- [x] JWT key rotation(kid) — DB active/verify-only 키와 기본 v1 호환
- [x] 첫 ADMIN 운영 API + @Roles(Role.ADMIN) + 감사 로그
  - Role 기반 유지 (Permission은 3개+ 독립 action 시 도입)
- [x] USER 403·ADMIN 200·미인증 401 e2e 테스트

### N3. S3 이미지 저장·Consent 실제 연동

브랜치: `feature/s3-consent-image`

- [x] 동의 목적 enum/registry 설계 (`diagnosis_image_processing`, `diagnosis_image_storage`, `ai_recommendation_data_transfer`)
- [x] ConsentRecord 동의 흐름 코드 연동 (diagnosis upload, Gemini 전송, 이미지 저장)
- [x] 필수 동의 version 없으면 해당 기능 거부 (기능 진입 조건)
- [x] 동의 version registry 구조 설계
- [x] 동의한 경우 S3 암호화 저장 + DB 메타데이터/위치
- [x] 미동의 시 추론 후 즉시 삭제 (현재 memoryStorage 비저장 유지)
- [x] 동의 철회 후 신규 처리/보존 데이터 정책 구현
- [x] 동의 audit log 연동 (N1 로깅과 연계)

### N4. 비동기 처리(BullMQ)

브랜치: `feature/bullmq-async-jobs`

- [x] BullMQ 도입 — 현재 Redis는 날씨 캐시만
- [x] 추천 생성·패턴 분석·알림 발송을 비동기 job으로 전환
- [x] job 상태 모델: PENDING → COMPLETED/FAILED
- [x] job 우선순위·재시도·DLQ 정책 구현
- [x] API는 즉시 jobId를 반환하고 결과는 polling/SSE로 조회

### N5. 운영 배포(ECS Fargate)

브랜치: `chore/ecs-fargate-cicd`

- [x] GitHub Actions → ECR 이미지 빌드/푸시 (tag = commit SHA)
- [x] NestJS / FastAPI 각각 ECS Fargate task definition
- [x] RDS PostgreSQL·S3·CloudWatch 연동
- [x] docker-compose에 inference-service 통합(개발 환경)
- [x] 운영 migration: 단일 release job이 backup·diff·migrate deploy 후 app rollout
  - destructive는 expand/contract, local/test만 container startup migration 허용
- [x] production deploy: 승인 게이트 + 이전 image rollback 절차
- [x] secret: Secret Manager 주입

### N6. 운영 DB·확장성·정책 마무리

브랜치: `feature/db-soft-delete-scalability`

- [x] User/Diagnosis에 Soft Delete 필드 + 보존 기간 도입
- [x] 공통 repository/query 정책(삭제 조건) + 최종 purge job
- [x] 개인정보/원본 이미지: 물리 삭제 기본
- [x] 법적 보존 진단 결과: 익명화 후 보존
- [x] FK Cascade/SetNull/Restrict 정책 모델별 표 확정 (schema.prisma)
- [x] health /health/live · /health/ready 분리
  - live: process event loop, ready: DB·필수 config·migration 상태
  - Redis/외부 API는 선택적/요청별 dependency (readiness 무조건 실패 X)
- [x] 커서 pagination(진단·추천·제품 목록)
- [x] 환경변수 registry(owner·description·required env·safe default·secret 여부)
  - mock flag는 test/dev 전용, owner/expiry 없는 flag merge 거부
  - production unknown key 엄격 처리
- [x] 의존성 audit(npm audit) CI 게이트 — critical/high SLA
- [x] coverage threshold: Auth·Diagnosis·Weather·Recommendation·Exception branch/function 우선

### N7. 레거시 FastAPI 정리

브랜치: `chore/legacy-fastapi-cleanup`

- [x] `backend/app/` (옛날 FastAPI 라우터 15개 .py) 삭제 — NestJS가 운영 기준, 미사용
- [x] `backend/requirements.txt` 삭제 (옛날 Python 의존성)
- [x] CI `backend-python-syntax` job 제거 (`backend/app` compileall 검사 불필요)
- [x] `backend/weatherskin.db` 등 SQLite 파일 정리 (git 추적 여부 확인 후)
  - git 미추적, `.gitignore`에 `backend/*.db` 이미 포함
- [x] inference-service/는 유지 (독립 AI 추론 서버, 운영 대상)
- [x] inference-service/requirements.txt는 유지 (FastAPI 추론 서버 의존성)
- [x] README/DEPLOYMENT에서 옛날 app/ 참조 문구 제거

### N8. 히스토리 캘린더 기능

브랜치: `feature/calendar-history`

- [x] `GET /diagnosis/history/:date` — 특정 날짜의 통합 히스토리 조회
  - 해당 날짜의 날씨·대기질 (WeatherSnapshot 조인)
  - 피부 분석 결과 + 점수 (Diagnosis + SkinMetric)
  - 추천 제품 (Recommendation + RecommendationProduct → Product)
  - 동의한 경우: 당시 촬영 이미지(S3) + 랜드마크 데이터
- [x] 점수 변화 시계열 (기간별 overallScore 추이)
- [x] 동의한 이미지 조회 시 S3 presigned URL 발급
- [x] 랜드마크 데이터 저장/조회 스키마 확정 (Diagnosis에 landmarks 필드 추가 여부)
- [x] 날짜 범위 쿼리 인덱스 (Diagnosis.capturedAt)
- [x] 미동의 진단은 이미지/랜드마크 노출 제외

### N9. 운영 SMS OTP 게이트웨이

브랜치: `feature/production-sms-otp`

- [x] SMS provider 확정 — **알리고(Aligo)** (건당 10원대 저비용 + 국내 실무 표준, `apis.aligo.in/send/`)
- [x] 실제 HTTP 발송 구현 (`SmsOtpProvider.send` — form-encoded POST, `result_code>0` 성공 판별)
- [x] 요청 timeout(`SMS_TIMEOUT_MS`)·제한 재시도(`SMS_MAX_RETRIES`, 네트워크 오류 한정 — HTTP/API 거부는 중복 발송 방지로 재시도 없음)
- [x] provider 오류 매핑 — 게이트웨이 문제는 `OtpGatewayError` → 503, 클라이언트 입력 오류는 400 유지
- [x] 전화번호·OTP·API key 로그 금지 검증 (에러 메시지·로거에 미포함, 단위 테스트로 고정)
- [x] 운영에서 `SMS_API_KEY`, `SMS_USER_ID`, `SMS_SENDER`, `SMS_ENDPOINT` 누락 시 readiness 실패 (env.registry `requiredIn: ['production']`)
- [x] provider 계약 단위 테스트 (`sms-otp.provider.spec.ts` — 성공/거부/HTTP오류/재시도/마스킹) + 기존 가입·로그인 E2E 유지 확인

### N10. 이미지 저장소 reconciliation

브랜치: `feature/image-storage-reconciliation`

- [x] 철회·탈퇴의 이미지 선삭제와 DB transaction 순서를 2단계 상태로 재설계
  - `DiagnosisImage.pendingDeleteAt` 기록 → S3 객체 삭제 → `deletedAt` 완료 마킹 (스키마+migration `20260810000000_n10_image_delete_lifecycle`)
  - 삭제 의도는 DB에 먼저 기록되므로 프로세스가 중간에 죽어도 재시도 worker가 수렴
- [x] S3 삭제 실패 레코드 재시도 worker와 운영 지표
  - `ImageReconciliationScheduler`(기본 1시간, `IMAGE_RECONCILE_INTERVAL_MS`)가 `retryPendingDeletes()` 실행
  - 시도 횟수(`deleteAttempts`)·마지막 오류(`lastDeleteError`) 기록, report 반환 + 구조화 로그 지표
- [x] DB 메타데이터 없는 orphan 객체 탐지·정리 dry-run
  - `ImageObjectStore.listObjects()`(S3 ListObjectsV2 페이징 / Memory) + `detectOrphans()`
  - 기본 dry-run(탐지만), 실제 삭제는 ADMIN API `POST /admin/images/reconcile-orphans`(dryRun=false)로만
- [x] 이미지 교체 시 이전 객체 정리 정책
  - `storeDiagnosisImage`가 기존 객체를 교체할 때 이전 객체를 정리. 실패 시 orphan으로 남겨 reconciliation이 수렴
- [x] 철회·탈퇴 삭제 실패 알림과 관리자 재처리 경로
  - 최대 시도 초과(`IMAGE_DELETE_MAX_ATTEMPTS`, 기본 10) 시 `image.delete_permanent_failure` 감사 로그 + error 로그(모니터링 대상)
  - ADMIN API: `POST /admin/images/retry-deletes`, `POST /admin/images/reconcile-orphans`
- [x] S3 lifecycle rule과 보존 정책 정합성 문서화
  - **권장 S3 lifecycle**: `diagnoses/` prefix에 1일 경과 미완료 멀티파트 업로드 abort + 표준(Standard) 90일 후 Standard-IA 전환(선택). **객체 자동 만료 규칙은 두지 않는다** — 이미지 삭제는 동의 철회/탈퇴 시 앱이 2단계로 수행하는 것이 원칙이고, lifecycle 만료가 있으면 재시도 worker·감사 로그와 상충한다. orphan cleanup은 `detectOrphans`(ADMIN)가 유일한 예외 경로다.
  - 보존 정책: 동의 철회·탈퇴 = 즉시 물리 삭제(앱 주도), `DiagnosisImage.deletedAt` 완료 후 DB 메타는 감사 보존, 진단 점수는 N6 익명 보존과 별개로 유지

### N11. 다중 인스턴스 운영 보강

브랜치: `feature/distributed-runtime-controls`

- [x] HTTP Rate Limit 저장소를 Redis 기반으로 전환
  - `RedisThrottlerStorage`(ThrottlerStorage 구현) — key `throttle:{name}:{key}`, INCR+TTL
  - `THROTTLE_STORAGE=auto|memory|redis` — auto는 REDIS_URL 설정 시 Redis, 아니면 메모리
  - ECS 다중 task에서 분당 제한이 인스턴스별로 나뉘지 않음
- [x] 날씨 cache hit/miss와 BullMQ queue/DLQ metric 수집
  - 날씨: `metric:weather:cache:hit/miss` Redis 카운터 (WeatherService)
  - BullMQ: `JobMetricsScheduler`(`JOB_METRICS_INTERVAL_MS`, 기본 60s)가 queue별
- [x] Redis 장애 시 cache·job·rate limit별 fail-open/fail-closed 정책 확정
  - **cache: fail-open** — Redis 다운 시 외부 API/DB fallback (기존 T12 설계)
  - **rate limit: fail-open** — Redis 다운 시 요청 통과. rate limit이 서비스 가용성을
  - **job(BullMQ): fail-closed** — 큐 add 실패는 명시적 오류 전파(요청자가 재시도),
- [x] `/health/ready`에 운영 필수 inference/SMS dependency 정책 반영
  - inference: production+MOCK_INFERENCE=false에서 INFERENCE_SERVICE_URL 없으면 required down
  - SMS: production에서 SMS_API_KEY/SMS_SENDER 없으면 required down (N9 readiness 게이트와 정합)
  - dev/test는 skipped로 취급해 ready를 깨지 않음
- [x] WebSocket/SSE 필요성 재평가(현재 job polling 유지)
  - 결정: **job polling 유지** — N4 job 상태 API + 프론트 polling이 MVP에 충분.

### N12. 서버 소유 날씨 입력 계약

브랜치: `fix/server-owned-weather-contract`

- [x] `POST /products/weather-based`를 인증하고 사용자 입력 weather 전체를 신뢰하지 않도록 변경
- [x] 좌표/지역 식별자만 받아 WeatherService·최근 WeatherSnapshot에서 입력 구성
- [x] Redis·정부 API 실패 시 최근 DB snapshot fallback 구현
- [x] 프론트 요청 계약과 함께 단계적으로 migration
- [x] 비인증 호출·조작된 날씨·외부 API 실패 E2E 추가

### N13. inference-service 내부 경계 보호

브랜치: `feature/inference-service-hardening`

- [x] NestJS↔FastAPI 내부 인증(shared secret 또는 service identity)
- [x] FastAPI 업로드 크기·content type 상한을 NestJS와 동일하게 적용
- [x] queue 대기와 추론 실행 timeout·동시성 지표
- [x] ECS security group에서 backend task만 `/infer` 접근 허용
- [x] 401/413/422/500 계약 테스트

### N14. 외부 AI 호출 멱등성

브랜치: `refactor/external-call-idempotency`

- [x] 진단 추론과 추천 Gemini 호출 전에 요청 예약/idempotency 상태 기록
- [x] 동일 사용자·진단 동시 요청이 외부 호출을 중복 수행하지 않도록 unique/lock 경계 이동
- [x] PENDING 실패·timeout·재시도 상태 전이 정의
- [x] 중복 요청의 동일 결과 반환 또는 409 계약 결정
- [x] 동시 요청 테스트 추가

### N17. CI 테스트 복구 — 코드-테스트 드리프트 정리

브랜치: `fix/ci-test-recovery`

- [x] `diagnosis.service.spec.ts` 2건 — N8 이후 `submit()`이 `wentOutside=true`일 때만 날씨 스냅샷을 연결하도록 바뀐 것을 테스트에 반영
- [x] `python-inference.provider.spec.ts` 1건 — N8 landmarks 필드가 provider 출력에 추가된 것을 mock fixture에 반영(`landmarks: null`)
- [x] spec 파일 TS 타입 에러 정리 — `soft-delete.service.spec`(implicit any), `diagnosis.service.spec`/`weather.service.spec`(mock에 `getPresignedUrlForDiagnosis`/`$executeRaw` 누락), `product`/`recommendation.service.spec`(`CursorPageDto` 인덱싱)
- [x] 로컬 단위 테스트가 DB 없이도 동작하도록 mock 보강 또는 DB 필요 조건 문서화 — `auth`/`prisma` service spec은 실 DB 연동이 목적이므로 CI/TEST_DATABASE_URL 설정 시에만 실행되는 조건부 스위트로 전환하고 주석으로 DB 필요 조건 문서화
- [x] `npm audit --audit-level=high` CI 게이트 복구 — `@nestjs/swagger@11.4.6`(js-yaml 5.x 계열)으로 올리고 `js-yaml@5.2.3` override 적용 (CVE-2026-59870 / GHSA-pm4m-ph32-ghv5 회피)

### N20. 추천-제품 연결 데이터 구축

브랜치: `fix/recommendation-product-links`

- [x] `RecommendationDto.relatedProductIds`가 항상 빈 배열로 반환되는 문제 해결 (template/생성 추천 모두)
- [x] seed에 `RecommendationProduct` 연결 데이터 추가 (템플릿·생성 추천 다형성)
- [x] 프론트 추천 상세의 "관련 제품" 섹션 표시 (프론트 범위 — 완료 기록)

### N21. 패턴 분석 정확성·성능 개선

브랜치: `fix/pattern-analysis-quality`

- [x] `collectedDays`를 UTC → KST 기준으로 통일 (`calendar-date.util`과 정합, 현재 `toISOString().slice(0,10)`은 UTC)
- [x] `collectDailyPeakEnv`의 진단당 1회 aggregate 쿼리(N+1)를 일괄 집계로 개선
- [x] 실내 사용자(`wentOutside=false`)는 weatherSnapshot이 없어 패턴이 영원히 LOCKED — 기본 지역 스냅샷 참조 등 정책 재검토
- [x] (배포 시점) `WeatherCollectionScheduler`가 ECS task마다 실행되어 정부 API를 중복 호출 — 싱글턴/별도 스케줄 task 검토

### N22. OTP 남용 방지·저장 강화 (SMS 연동 시점)

브랜치: `feature/otp-abuse-hardening`

- [x] OTP 발송에 전화번호별 글로벌 제한 추가 (현재는 IP 기반 rate limit만이라 SMS 도배에 취약) — N22
- [x] OTP 코드 해시 저장 검토 (현재 평문 — 단기 만료·시도 제한으로 보완 중이나 DB 유출 시 노출) — N22
- [x] SMS 게이트웨이 연동(N9) 시 발송 실패·재시도·모니터링 정책 확정 — N22

### N24. Product.purchaseUrl

브랜치: `feature/product-purchase-url` (N27과 동일 PR 권장)

- [x] Prisma `Product.purchaseUrl String?` + migration
- [x] Product DTO/응답에 `purchaseUrl` 노출 (목록·관련 제품·weather-based)
- [x] seed/실제품 데이터에 동작하는 구매 URL 채움 (허위 Skinlab/Greenfield 제거는 N27과 함께)

### N25. 날씨 수집 병렬·워밍

브랜치: `fix/weather-collect-parallel`

- [x] UV/기상관측/대기질 수집을 가능한 범위에서 병렬화
- [x] 콜드 스타트·스케줄러 워밍으로 첫 요청 지연 완화
- [x] 실패 시 기존 LIVE/CACHED/UNAVAILABLE 계약 유지 (목업 수치 금지)

### N26. 랜드마크·저장 동의 정합

브랜치: `fix/landmarks-storage-consent`

- [x] `diagnosis.service.ts`에서 `storeImage && landmarks` 등 저장 동의와 landmarks 영속화 조건 일치
- [x] 미동의 시 landmarks/이미지 미노출 계약 유지 (N8)
- [x] 회귀 테스트: 동의·미동의·이미지 없음

### N27. 실제 화장품 카탈로그·매칭

브랜치: `feature/real-product-catalog` (N24와 동일 PR 권장)

- [x] 허구 Skinlab/Greenfield 시드 삭제
- [x] 실제 화장품 30~50개 큐레이션 시드 (오프라인 Gemini 초안 + 사람 검증 가능). **크롤링 없음**
- [x] `purchaseUrl` 필수에 가깝게 채움 (N24)
- [x] 성분 매칭: 기존 `ALLOWED_INGREDIENTS` whitelist 유지. Gemini는 가능하면 **productId** 선택 우선
- [x] 매칭 0건 시 규칙 기반 실제품 fallback (가상 `gemini-product-*` 생성 금지)
- [x] Gemini 담당과 선택 품질·프롬프트 조율

### N28. PATCH /auth/me

브랜치: `feature/auth-patch-me`

- [x] `PATCH /auth/me` — name, gender (phone 변경은 OTP 별도·이번 범위 밖)
- [x] DTO 검증, 소유자만 수정, Swagger
- [x] 기존 `GET /auth/me`와 응답 형태 정합

### N29. 비동기 LIVE 교체

브랜치: `feature/rec-fast-path` (N31+N32+N29 한 PR)

- [x] FALLBACK/CACHED 응답과 함께 job enqueue (기존 jobs 모듈 활용)
- [x] 완료 시 `source: LIVE`로 교체 가능한 결과
- [x] `GET /jobs/:id` 계약 유지·문서화. 동기 `POST /recommendations/generate` 의존 제거는 FE(F1)와 freeze 시 합의

### N30. 비밀번호·아이디 찾기 — 취소

브랜치: 없음 (구현하지 않음)

- [x] 전화+OTP 유지 결정
- [x] 비밀번호·아이디/비번 찾기·이름+생일 찾기 API/UI 추가 금지
- [x] 소셜 로그인(N33)으로 진입 부담 완화

### N31. 실제품만 추천 경로

브랜치: `feature/rec-fast-path` (N31+N32+N29 한 PR)

- [x] weather/diagnosis 추천이 DB 실제품만 사용
- [x] 가상 weather 제품·`gemini-product-*` 경로 제거/차단
- [x] 응답 제품에 `purchaseUrl` 포함

### N32. Redis SWR + 규칙 FALLBACK

브랜치: `feature/rec-fast-path` (N31+N32+N29 한 PR)

- [x] Redis SWR: hit → `source: CACHED` 즉시 실제품
- [x] miss → 규칙 기반 실제품 `source: FALLBACK` 즉시 반환 (빈 화면·긴 동기 Gemini 대기 금지)
- [x] stale/갱신 중 메타는 FE가 표시할 수 있게

### N33. 소셜 로그인 (Kakao · Google · Apple)

브랜치: `feature/auth-social-oauth`

- [x] Kakao / Google / Apple 토큰 검증·계정 연결·세션(기존 refresh 흐름)
- [x] 미가입 소셜 → 온보딩(동의·필요 시 전화 연결) 계약
- [x] Apple은 스토어 미배포여도 API·설정 포함 (Dev 계정은 스토어 시점에)
- [x] 비밀번호/찾기 API 추가 금지
- [x] env.registry·Swagger·실패 계약(취소·거절·만료)

### N34. 설정·알림 계약 보강

브랜치: `feature/settings-notification-contract`

- [x] 푸시 미구현 구간을 FE가 거짓 토글로 오해하지 않도록 플래그/문서 (`pushDeliveryAvailable` 등)
- [x] `morningReminder` 등 미사용 필드 정리 또는 명시적 unsupported
- [x] F16 설정 전면 재구성과 맞춤 — FE 계약에 명시

### 실기기 테스트 버그 (2026-08-13)

### N39. 자외선 최고 시각이 9시간 밀려 표시된다

브랜치: `fix/uv-peak-hour-timezone`

앱에 "자외선 최고 시각 21시"가 떴다. `toKst()`는 epoch에 +9시간을 더한 `Date`를 돌려주므로
UTC 게터로 읽어야 KST가 나오는데, `todayRemainingSlots()`만 로컬 게터로 읽어 KST 머신에서
+9가 두 번 적용됐다.

수정 전후를 같은 입력으로 대조해 확인했다.

```text
TZ=Asia/Seoul, 입력 = KST 12:00
  수정 전: [21]              ← 시각이 밀리고, 날짜 경계 판정까지 깨져 슬롯이 1개로 잘린다
  수정 후: [12, 15, 18, 21]
```

시각뿐 아니라 **최댓값 자체도 틀렸다.** `getDate()`가 함께 밀리면서 날짜 비교가 어긋나
루프가 첫 슬롯에서 끊겼고, 남은 슬롯을 보지 못한 채 피크를 정했다.

- [x] 세 곳을 UTC 게터로 바꿔 `toKst()` 사용 규약을 통일한다
- [x] 이미 지난 슬롯 포함 여부를 판단한다 → **포함 유지.** 조회 기준이 3시간 전이고 응답이 3시간 격자라 어차피 그날 오전은 응답에 없다. 과거 슬롯을 빼도 "그날의 최댓값"이 되지 않으므로, 범위를 바꾸는 대신 `peak` 주석을 실제 의미("3시간 전~자정 중 최댓값")로 고쳤다
- [x] `TZ=Asia/Seoul`·`UTC`·`America/New_York`·`Pacific/Kiritimati` 네 시간대에서 같은 결과가 나오는지 고정하는 테스트를 넣는다 (`kma.client.spec.ts`, 7건)
- [x] 잘못 저장된 기존 `uv_index_peak_hour` 처리 방침을 정한다 → **보정하지 않는다.** 아래 근거

로컬 개발 DB는 대부분 오염돼 있었다.

```text
peak_hour  10시: 1건 / 18시: 9건 / 21시: 58건 / 22시: 61건 / 23시: 49건
```

값 자체는 `(정답 + 9) mod 24`라 되돌릴 수 있어 보이지만, 이 왜곡은 **쓴 프로세스의 시간대에만**
생긴다. 운영 컨테이너는 TZ를 지정하지 않아 UTC로 돌므로 운영 데이터는 정상이다. DB만 봐서는
어떤 행이 KST 프로세스에서 쓰였는지 구별할 수 없어, 일괄 −9 보정은 정상 데이터를 망가뜨린다.
로컬 데이터는 재수집으로 자연 교체되므로 방치한다.

완료 기준: KST·UTC 어느 시간대에서 돌려도 자외선 최고 시각이 실제 예보 시각과 일치하고, 테스트가 이를 고정한다. → 충족


> **N16 (AWS 첫 배포)는 Open** — [`docs/BACKEND_TASKS.md`](BACKEND_TASKS.md) 참고.
> 프론트 범위 완료 기록(N15/N18/N19)은 [`docs/FRONTEND_TASKS.md`](FRONTEND_TASKS.md)에 있다.
