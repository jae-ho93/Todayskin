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

### N40. 지표별 등급 어휘 분리 (자외선 5단계 / 대기질 4단계)

브랜치: `feature/indicator-grade-vocabulary`

모든 지표가 `AirStatus` 하나(3단계)를 공유해 자외선지수 9가 "나쁨"으로 표기됐다.
기상청 기준으로 9는 "매우높음"이고, 자외선은 좋고 나쁨이 아니라 높고 낮음으로 말한다.

- [x] 판정을 지표별 등급 체계로 나눈다 — 자외선 5단계(`UvLevel`), 대기질 4종 4단계(`AirStatus`에 `veryBad` 추가)
- [x] DTO 타입을 지표별로 좁힌다 — `uvStatus`/`uvStatusPeak`을 `UvLevel`로. 타입을 가른 덕에 소비처 6곳을 컴파일러가 전부 짚어냈다
- [x] 경계값 테스트를 등급 수만큼 확장한다 — 자외선 11건, 대기질 4종 각 6건. 모든 등급의 양쪽 경계를 덮는다
- [x] OpenAPI 스펙 재생성 → 프론트 타입 갱신
- [x] 색상 단계 확장은 F64에서 함께 처리 (같은 PR)

DB enum도 함께 바꿨다(`20260818000000_n40_indicator_grade_vocabulary`).
기존 3단계 라벨에서는 '높음/매우높음/위험'을 복원할 수 없어, 같은 행의 원본 지수에서
등급을 다시 계산했다. 판정 기준은 정책 코드와 동일하게 맞췄다.

작업 중 드러난 두 가지를 함께 고쳤다.

- **프론트 등급 타입이 손으로 적혀 있어 드리프트 검사를 통과했다.** 서버가 등급을 늘려도 `AirStatus = 'good'|'moderate'|'bad'`가 그대로 남아 조용히 어긋난다. 생성 타입에서 파생하도록 바꿔 같은 사고를 막았다
- **`status === 'bad'` 비교가 새 등급을 놓쳤다.** '매우나쁨'일 때 미세먼지·오존 경고 문구가 사라진다. 컴파일러가 잡을 수 없는 종류라 `isAirConcerning()`으로 묶었다

완료 기준: 자외선 9가 "매우높음"으로, 미세먼지 최악 구간이 "매우나쁨"으로 표기되고, 경계값 테스트가 전 등급을 덮는다. → 충족

### N41. 측정소 조회 실패가 엉뚱한 구 이름으로 표시된다

브랜치: `fix/district-name-fallback`

해운대구에서 촬영했는데 기록에 "부산광역시 중구"로 떴다. 10회 연속 같은 값이 나왔고,
같은 시각 정부 API를 직접 부르면 정상이었다.

원인은 두 겹이다.

```text
districtName = nearest?.districtName ?? region.airkoreaStationName;
```

`airkoreaStationName`은 **측정소명이지 행정구역이 아니다.** 부산의 대표 측정소가
'중구'이고, 경기도는 '인계동'(동 이름)이다. 측정소 조회가 한 번 실패하면
"구를 모른다"가 "중구"라는 그럴듯한 오답으로 바뀐다.

그 오답이 캐시에 정상 TTL(5분)로 들어간 게 두 번째 겹이다. 캐시 키는 좌표를 소수
2자리로 뭉치므로 해운대 일대가 한 키를 공유한다. 한 번의 실패가 그 지역 사용자
전원에게 5분간 재생됐다 — 10회 연속 재현된 이유다.

- [x] 실패 시 근사표 대표 구로 폴백하지 않는다 — 모르면 `null`, 화면은 시/도만 보여준다. 대기질 조회용 측정소 폴백은 데이터 출처의 폴백이라 타당해 그대로 뒀다
- [x] 폴백 발생을 로그로 남긴다 (좌표·대체 측정소명 포함)
- [x] 재시도 여부 판단 → **여기서는 넣지 않는다.** 이제 실패해도 구가 비고 캐시가 30초라 스스로 회복한다. 응답 경로에 재시도를 넣으면 외부 API가 느릴 때 모든 사용자의 지연이 두 배가 된다. 영구 저장되는 진단 경로의 재시도는 N42에서 수집 경로 전반에 공통으로 넣는다
- [x] `meta` 분기에서도 `districtName`을 채운다 — 근사표에 표시용 시/군/구를 추가하고, 세 분기가 각자 완전한 객체를 반환하도록 바꿔 누락 시 컴파일 에러가 나게 했다
- [x] `regionName` 표기 정리 — '부산'/'부산광역시' 혼재를 정규화(`20260819000000_n41_normalize_region_name`). 현재 코드는 세 분기 모두 근사표 정식 명칭을 쓰므로 새로 생기지 않는다
- [x] 폴백으로 만든 값은 정상 TTL로 캐시하지 않는다 — 측정소 조회 실패를 degraded 판정에 포함시켜 TTL 30초 적용

근사표 표기 규칙을 테스트로 고정했다(`region.registry.spec.ts`). 시/도는 17개 정식
명칭만, 구 이름은 시/군/구로 끝나야 하고, 광역 대표 항목은 구가 비어 있어야 한다.
두 사고 모두 표기 규칙이 코드로 고정돼 있지 않아 생겼다.

완료 기준: 측정소 조회가 실패하면 구 이름이 비고, 성공하면 실제 구가 저장된다. 스케줄러 경로 스냅샷도 구 이름을 갖는다. → 충족

### N42. 진단 시각의 날씨가 기록에서 빈칸으로 남는다

브랜치: `feature/weather-collection-resilience` (프론트 F70 포함)

진단 스냅샷의 대기질 세 지표가 전부 null로 저장돼 있었다. 화면은 null을 `-`로 그리므로
사용자에게는 "못 불러온다"로 보이지만, 저장 시점에 이미 비어 있었다.

진단 경로는 재현성을 위해 캐시를 쓰지 않고 매번 새로 수집한 뒤 그대로 저장한다.
캐시가 흡수해 줄 것이 없으니 **일시 실패 한 번이 그 기록에 영원히 남는다.**

- [x] 외부 API 호출에 짧은 재시도를 넣는다 — 진단 경로만 1회. 응답 경로는 0을 유지한다(외부 API가 느릴 때 모든 사용자의 지연이 배로 늘어난다). 옵트인이라 호출부가 정책을 고른다
- [x] 부분 상태로 저장할지 판단 → **저장한다.** 자외선과 관측 시각은 실제 값이라 통째로 버리면 진단과 환경의 연결이 아예 끊긴다. 대신 무엇을 못 받았는지 남긴다
- [x] 과거 스냅샷 보정 방침 → **보정하지 않는다.** 지난 시각의 대기질은 소급 조회가 안 되고, 근처 시각의 다른 스냅샷으로 채우면 N41처럼 남의 값이 사실처럼 굳는다. 기존 행의 플래그는 false로 두고 화면은 지금처럼 `-`로 보여준다 — 우리가 아는 만큼만 말한다
- [x] 측정소 의존 구조 재검토 → 대표 측정소 폴백은 유지한다(N41에서 출처 표시 문제는 해결됐다). 대신 측정소 조회에도 재시도를 넣었다 — 이 실패가 대기질 실패로 연쇄되므로 효과가 가장 크다
- [x] 수집 실패율을 지표로 남긴다 — `metric:weather:collect:{total,uv_failed,air_failed,station_failed}`

**클라이언트가 실패를 삼키던 게 근본 문제였다.** 실패해도 빈 값을 돌려줘서 서비스는
"값 없음"과 "수집 실패"를 구별할 수 없었다. 재시도할지 판단할 근거도, 화면에 이유를
설명할 근거도 없었다. 세 클라이언트가 `failed`를 명시적으로 보고하게 했고, 그게
재시도 조건이자 F70의 표시 근거가 된다.

마이그레이션 `20260820000000_n42_collection_failure_flags`로 스냅샷에
`uv_collection_failed` / `air_collection_failed`를 추가했다. 외부 API 단위로 나눈 이유는,
대기질만 실패했는데 자외선까지 "수집 실패"로 표시하면 그것도 거짓말이기 때문이다.

완료 기준: 일시 실패가 진단 기록을 영구 훼손하지 않는다. 실패한 경우 화면이 "값 없음"과 "수집 실패"를 구별해 보여준다. → 충족

### N43. 진단 기록 삭제 API가 없다

브랜치: `feature/diagnosis-record-deletion` (프론트 F67 포함)

얼굴 이미지에서 나온 기록인데 사용자가 지울 수단이 없었다.

- [x] `DELETE /diagnosis/:id` 추가 — 소유권 검사는 진단 상세 조회와 같은 방식(없으면 404, 남의 것이면 403)
- [x] 이미지와 랜드마크는 즉시 물리 삭제
- [x] 진단 row도 **물리 삭제**한다(N44와 같은 기준) → 아래 참고
- [x] 추천·패턴 집계에서 빠지는지 확인 → 추천은 명시적으로 함께 지운다. 패턴·추이·목록은 진단 row를 보므로 자동으로 빠진다
- [x] 삭제 후 목록·캘린더·추이에서 사라지는지 통합 테스트로 고정 (`test/diagnosis-delete.e2e-spec.ts`)

**soft delete를 쓰지 않은 이유.** 진단 row를 지우는 주체가 어디에도 없다. retention
sweep(N37)은 세션·job·날씨만 보고, purge 스케줄러는 탈퇴 사용자만 본다. soft delete로
두면 사실상 "화면에서만 감추기"가 되고, 처리방침의 "철회 시 지체 없이 파기"와 어긋난다.

**추천을 함께 지운다.** `Recommendation.diagnosisId`가 SetNull이라 진단만 지우면 추천이
사용자에게 그대로 남는다. 그 문장은 지운 진단을 설명하는 글이다.

**이미지를 먼저 지운다.** 진단 row를 먼저 지우면 `DiagnosisImage`가 Cascade로 사라지며
s3Key를 잃고, S3 객체는 아무도 가리키지 않는 orphan이 된다. 객체 삭제가 실패하면 503으로
멈춰 진단 row를 남긴다 — 사용자에게는 삭제 실패로 보이고 재시도할 수 있다. 반대 순서면
사진만 남고 기록이 사라져, 가장 지우고 싶었던 것이 남는다.

되돌릴 수 없는 개인정보 삭제이므로 감사 로그(`diagnosis.deleted`)를 남긴다.

완료 기준: 본인 기록만 삭제되고, 이미지가 즉시 사라지며, 목록·추이·추천에서 함께 빠진다. → 충족

### N44. 탈퇴 시 진단 결과를 완전 삭제로 바꾼다 (정책 변경)

브랜치: `feature/withdrawal-hard-delete` (약관 문구 포함)

구 정책은 탈퇴해도 진단 결과를 익명 보존했다(`purgeAfter` 경과 후 `userId` SetNull).
사용자 화면에서는 즉시 사라지지만 얼굴 분석 결과가 DB에 계속 남았다.

- [x] purge 시 `Diagnosis`를 SetNull로 남기지 않고 함께 물리 삭제한다. 추천·부위 결과도 같이 지운다
- [x] 즉시 삭제 vs `purgeAfter` 유예 → **즉시 삭제** → 아래 참고
- [x] 가명처리 통계 → **남기지 않는다.** 지금 통계를 쓰는 코드가 없다. 쓰지도 않는 데이터를 "통계 목적"으로 남기면 문구만 넓어지고 실제로는 파기를 미루는 셈이다. 필요해지면 그때 식별 불가능한 집계 테이블로 따로 만든다
- [x] `src/lib/legal.ts` 보존 문구 2곳 수정 + 시행일 갱신 (2026-08-13)
- [x] 법정 보관 의무 확인 → 진단 결과는 거래 기록·분쟁 처리 기록이 아니므로 5년/3년 예외에 해당하지 않는다. 문구에 명시했다
- [x] 탈퇴 → purge → 재조회 e2e로 잔존 row 0 고정 (`test/withdrawal.e2e-spec.ts`)

**유예를 두지 않은 이유.** 유예는 오탈퇴 복구를 위한 것인데, 탈퇴 시점에 이미지가
물리 삭제되고 PII도 스크럽된 뒤라 복원할 것이 없다. 복원 경로도 구현되어 있지 않다.
유예는 파기를 미루기만 할 뿐 아무것도 돌려주지 않는다. **계정 껍데기(User row)는
유예를 유지한다** — 탈퇴 사실 자체는 분쟁 대응에 쓰이고, PII가 비어 있어 위험이 없다.

부수 효과로 집계 감사가 필요 없어졌다. row가 사라지니 목록·추이·패턴이 자동으로
빠진다. soft delete였다면 `deletedAt` 조건을 빠뜨린 쿼리 하나가 조용히 지운 기록을
되살렸을 것이다.

purge 경로에도 진단 삭제를 남겨 뒀다. 정상 흐름에서는 0건이지만, 구 정책으로 탈퇴한
사용자의 행이 남아 있고 FK가 SetNull이라 User만 지우면 주인 없이 영원히 남는다.
마이그레이션 `20260821000000_n44_purge_withdrawn_diagnoses`로 기존 잔존 행을 정리했다.

완료 기준: 탈퇴·purge 후 해당 사용자의 진단 결과가 DB에 남지 않고, 약관 문구가 실제 동작과 일치한다. → 충족

### N45. 추천의 근거·출처 표기를 실제 출처로 바꾼다

브랜치: `feature/recommendation-evidence-registry` (F69 동반)

출처가 자유 문자열 하나(`sourceLabel`)였다. 문자열은 무엇이든 주장할 수 있어서
`AI 종합 분석 · 피부과학 일반 지식 기반`처럼 **인용할 문헌이 없다는 말을 완곡하게 쓴
문구**가 출처 칸에 들어가 있었다. 확인할 방법이 없는 표기는 없는 것보다 나쁘다 —
사용자는 근거가 있다고 읽는다.

- [x] 출처 레지스트리를 만든다 (`content/evidence-sources.ts`) — 제목·발행기관·연도·URL과, 원문이 실제로 뒷받침하는 범위(`claim`)를 함께 담는다. 추천은 id만 참조한다
- [x] A등급 전역 템플릿부터 적용한다. `RecommendationTemplate.sourceIds` 추가 + 마이그레이션 `20260822000000_n45_evidence_source_registry`
- [x] B등급 재정의 → `AI 생성 · 내 진단 결과 기반`. 등급 정의도 `임상 관찰 연구` → `AI 생성`으로 고쳤다 (아래 참고)
- [x] 자외선·대기질 공개 출처 확보 → WHO UVI 가이드(2002), 기상청 자외선지수 단계별 대응요령, 에어코리아 CAI 기준. 셋 다 원문을 열어 문장을 확인했다
- [x] LLM 자유 텍스트 인용 금지 유지. 레지스트리에 없는 id는 `resolveEvidenceSources`가 버리므로 서버 코드에 없는 출처는 화면에 뜰 수 없다
- [x] 등급 정의를 사용자 언어로 다시 쓴다 → `src/lib/evidence.ts`의 `GRADE_CRITERIA` (F69)
- [x] 프론트 표기(F69)와 한 릴리스로 맞춘다

**등급 B의 정의가 동작과 달랐다.** `개별 임상/관찰 연구`라고 정의해 놓고 실제로 하는
일은 사진+날씨 LLM 생성이라, 연구를 근거로 든 적이 한 번도 없다. 정의가 틀리면 배지
문구도 따라서 틀리므로 정의 쪽을 고쳤다. 인용을 붙일 수 없는 항목에 출처를 지어내는
것보다 생성물임을 밝히는 편이 낫다.

**기존 A등급 템플릿(rec-1)의 주장도 함께 손봤다.** 출처를 강하게 보이게 만들수록 그
주장을 실제로 뒷받침해야 한다. 확인해 보니 세 군데가 원문에 없었다.

| 기존 | 문제 | 수정 |
|---|---|---|
| `대한피부과학회 자외선 가이드라인` | 어느 문서인지 특정 불가 | 확인한 WHO·기상청 문서 2건으로 교체 |
| "2~3시간마다 재도포" | 인용 문서 어디에도 그 간격이 없다 | "정기적으로 덧발라 주세요"(기상청 문구) |
| "오늘 자외선지수는 8(매우 높음)로 측정되었습니다" | 전역 템플릿에 측정값을 박아뒀다. 사용자마다 다르다 | 지수별 권고 기준 설명으로 대체 |

`evidence-sources.spec.ts`가 **A등급 템플릿에 참조가 최소 1개 있는지**를 강제한다.
화면에 `A · 공인 가이드라인`이라고 뜨는데 가리킬 문서가 없으면 등급 자체가 과장이므로,
레지스트리와 시드가 어긋나는 순간 CI에서 깨진다.

완료 기준: 화면에 뜨는 출처가 검증 가능한 실제 참조를 가리키거나, 참조가 없는 경우 생성물임을 명확히 밝힌다. 없는 인용을 만들지 않는다. → 충족


> **N16 (AWS 첫 배포)는 Open** — [`docs/BACKEND_TASKS.md`](BACKEND_TASKS.md) 참고.
> 프론트 범위 완료 기록(N15/N18/N19)은 [`docs/FRONTEND_TASKS.md`](FRONTEND_TASKS.md)에 있다.
