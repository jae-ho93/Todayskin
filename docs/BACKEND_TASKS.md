# Todayskin Backend Tasks

이 문서는 Todayskin 백엔드 구조와 운영·협업의 기준 문서다. 위치는 `docs/` (프론트 보드 `docs/FRONTEND_TASKS.md`와 동일).
아키텍처 원칙은 `docs/ARCHITECTURE.md`를 따른다.

## 목표

NestJS를 메인 백엔드(BFF + 비즈니스 로직)로, FastAPI(inference-service)를 독립 AI 추론 서버로
역할 분리한 운영 가능한 백엔드를 목표로 한다. NestJS는 Modular Monolith 구조로 auth, otp, admin,
consent, storage, diagnosis, weather, recommendations, products, pattern, notifications, gemini, jobs,
idempotency 모듈로 책임을 분리하고 모든 비즈니스 로직을 담당한다. FastAPI는 AI 모델 서빙과 피부 이미지 추론만 담당하며
추론 결과만 NestJS로 전달한다.

데이터는 PostgreSQL + Prisma(운영: AWS RDS), Redis(날씨 캐시·BullMQ broker),
BullMQ(추천·패턴·알림 비동기)를 사용한다. Refresh Token은 PostgreSQL에 해시로 저장하고,
HTTP Rate Limit은 Redis 분산 저장소(`THROTTLE_STORAGE=auto|redis`, N11)를 사용한다. 이미지는 동의한 경우만 암호화해 S3에 저장하고
미동의 시 추론 후 즉시 삭제한다. 운영은 GitHub Actions → ECR → ECS Fargate 배포,
RDS·S3·CloudWatch 연동, Pino·Sentry·Helmet·JWT·Swagger·Jest를 적용한다.

> 현재 구현된 기능을 실제 서비스에서도 사용할 수 있는 구조로 개선하는 것이 목표다.

## 역할 분리 (완료)

NestJS와 FastAPI의 역할 분리는 완료되었다.

- NestJS(src/)가 메인 백엔드(BFF + 비즈니스 로직)로 동작한다.
- FastAPI(inference-service/)가 독립 AI 추론 서버로 동작한다. AI 모델 서빙과 피부 이미지
추론만 담당하며 비즈니스 로직·인증·DB 접근을 갖지 않고 추론 결과만 NestJS로 전달한다.
- NestJS 진단 서비스는 InferenceProvider interface로 추론 호출을 추상화한다.
`MOCK_INFERENCE=true`인 개발·테스트는 MockInferenceProvider, `INFERENCE_SERVICE_URL` 설정 시 PythonInferenceProvider,
둘 다 없으면 fail-closed provider가 503을 반환한다.
- 레거시 FastAPI 비즈니스 코드(`backend/app/`)는 N7에서 제거되었다. Python은 inference-service/ 추론 서버만 유지한다.

## 2026-08-04 프론트 계약 동기화 이력

NestJS 전환 중 원격 `origin/main`의 프론트 계약을 확인해 반영한 기준이다. 이후 N0~N8 구현 상태는 아래 `다음 과정`에 별도로 기록한다.

- 날씨 API는 MOCK_WEATHER로 값을 채우지 않는다. 정부 API 실패 시 각 지표가 None/undefined가 되고 프론트가 측정 불가를 표시한다.
- UV API가 V4에서 V5로 변경되었고 uvIndexPeak, uvStatusPeak, uvIndexPeakHour가 추가되었다.
- POST /products/weather-based가 추가되었다. 피부 측정값 없이 Gemini가 세안 후, 외출 전, 외출 후 제품을 생성한다.
- 날씨 기반 제품 응답에 reason, timing이 추가되었다.
- 회원가입과 User 응답에 선택 필드 gender가 추가되었다.
- 개인 패턴 차트와 프론트 mock 데이터는 제거되었고, 현재 개인 패턴 화면은 준비 중 상태다.
- 프론트 API client도 실패 시 목업 대신 null, error, not_found 상태를 사용한다.

이후 작업은 과거의 목업 fallback을 기준으로 하지 않고, 최신의 명시적 unavailable/error 계약을 기준으로 진행한다.

## 최종 구조

```text
backend/
├─ src/                        # NestJS 메인 백엔드 (BFF + 비즈니스 로직)
│  ├─ main.ts
│  ├─ app.module.ts
│  ├─ common/                 # Guard, decorator, exception, pipe
│  ├─ prisma/                 # PrismaModule, PrismaService
│  ├─ redis/                  # RedisModule (날씨 캐시)
│  └─ modules/
│     ├─ auth/, otp/, admin/   # 인증·OTP·운영 권한
│     ├─ consent/, storage/    # 동의 게이트·이미지 수명주기
│     ├─ weather/              # 날씨·대기질 API + 캐시
│     ├─ diagnosis/            # 진단 도메인 + InferenceProvider + 캘린더
│     ├─ recommendations/, products/, pattern/
│     ├─ notifications/, gemini/
│     └─ jobs/                 # Inline/BullMQ 비동기 작업
├─ inference-service/          # FastAPI 독립 AI 추론 서버
│  ├─ main.py                  # POST /infer, GET /health
│  ├─ analyzer.py              # SkinAnalyzer (MobileNetV3)
│  └─ *.py                     # 전처리·모델·랜드마크·스코어링
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts
├─ docker-compose.yml           # 개발: postgres + redis + (backend)
├─ Dockerfile                   # NestJS 운영 이미지
└─ package.json
```

## 파일 매핑 (전환 완료)

| 기존 FastAPI                 | NestJS                                         |
| -------------------------- | ---------------------------------------------- |
| main.py                    | main.ts, app.module.ts                         |
| database.py                | PrismaModule, PrismaService                    |
| models.py                  | prisma/schema.prisma                           |
| schemas.py                 | 모듈별 dto/, enum/                                |
| deps.py                    | JwtStrategy, JwtAuthGuard, RolesGuard          |
| seed.py                    | prisma/seed.ts                                 |
| regions.py                 | RegionResolver (region.registry)               |
| mock_data.py               | seed, fixture, MockInferenceProvider           |
| gemini_client.py           | GeminiClient, EvidencePolicy                   |
| routers/auth.py            | AuthController, AuthService                    |
| routers/weather.py         | WeatherController, WeatherService, API Clients |
| routers/diagnosis.py       | DiagnosisController, DiagnosisService          |
| routers/recommendations.py | Recommendation/Product modules                 |
| trend.tsx mock             | PatternController, PatternService              |
| settings 로컬 상태             | NotificationController, NotificationService    |

Controller는 HTTP 처리만 담당하고, 비즈니스 로직은 Service에 둔다. 외부 API는 Client,
정책은 Policy로 분리한다. 단순 CRUD마다 Repository를 무조건 만들지는 않는다.

## 최신 코드와의 충돌 및 수정 필요 사항

### 1. Weather 지표 nullable 계약

최신 백엔드는 API 실패 시 목업값을 반환하지 않고 지표를 None으로 응답한다. NestJS DTO와 Prisma 모델은 다음을 반영한다.

- UV, 오존, PM2.5, PM10, CAI, NO2, SO2, CO는 nullable이다.
- uvIndexPeak, uvStatusPeak, uvIndexPeakHour를 포함한다.
- 데이터 출처는 LIVE, CACHED, UNAVAILABLE처럼 명시한다.
- Redis와 DB에 정상 데이터가 없으면 임의 수치를 만들지 않고 unavailable 상태를 반환한다.

### 2. Weather API 설정 변경

- 기상청 UV endpoint는 최신 V5 기준으로 이식한다.
- GEMINI_MODEL 기본값은 현재 gemini-flash-latest 기준으로 관리한다.
- 기존 KMA_AREA_NO, AIRKOREA_STATION_NAME은 위치 조회 실패 시 기본 지역 fallback에 필요하므로
환경변수와 코드 중 어느 쪽을 기준으로 할지 결정해야 한다. 지역 registry를 기준으로 할 경우
환경변수는 기본 region id로 단순화한다.

### 3. 날씨 기반 제품 추천 API 추가

최신 프론트는 다음 API를 사용한다.

```text
POST /products/weather-based
```

- 피부 측정값 없이 날씨 데이터만으로 제품을 생성한다.
- 응답에는 reason, timing이 포함된다.
- timing은 세안 후, 외출 전, 외출 후 중 하나다.
- Gemini 실패 시 503을 반환하고 가짜 제품으로 대체하지 않는다.
- 현재는 사용자별 영구 추천이 아니라 요청 시 생성하는 결과이므로, 캐시 여부와 저장 여부를 별도 결정한다.
- 클라이언트가 보낸 날씨를 그대로 신뢰하지 않고, 최종 구조에서는 서버가 지역·Redis·WeatherSnapshot에서 입력값을 조회한다.

### 4. 회원가입 gender 추가

최신 API 계약에 선택 필드 gender: male | female가 추가되었다.

- Prisma User.gender는 nullable enum으로 정의한다.
- 회원가입 DTO와 User 응답에 포함한다.
- 모델 학습 전에는 추천 로직에 임의로 사용하지 않는다.
- 민감정보 취급 여부와 수집 목적·보관 필요성을 문서화한다.

### 5. 개인 패턴 화면 계약

최신 프론트는 개인 패턴 mock 차트를 제거하고 현재 준비 중만 표시한다.

- 백엔드 GET /diagnosis/pattern은 구현 완료다.
- 프론트 연결은 API 응답 계약과 통계 정책이 확정된 뒤 별도 PR로 진행한다.
- 데이터 부족 상태는 404가 아니라 200 + LOCKED로 유지한다.

### 6. 현재 프론트 호출과 최종 보안 계약의 차이

현재 프론트는 POST /recommendations/generate에 skinScore와 weather 전체를 보내고 있다.
최종 NestJS API는 diagnosisId만 받아야 한다.

```json
{
  "diagnosisId": "diagnosis-id"
}
```

서버는 diagnosis의 사용자 소유권을 확인한 후 DB에서 피부 측정값과 연결된 날씨 snapshot을 조회한다.
이 변경은 NestJS 이식 PR에서 프론트와 함께 contract migration으로 처리한다.

### 7. 기존 Python DB와 최신 코드의 migration 주의점

현재 SQLite에는 기존 5개 테이블과 과거 생성 추천 데이터가 있다. 최신 코드에는 gender가 추가되었으므로
단순 데이터 복사가 아니라 다음 순서로 처리한다.

1. 새 Prisma schema에 nullable gender를 포함한다.
2. 기존 사용자의 gender는 null로 import한다.
3. 기존 전역 추천과 개인 생성 추천을 구분한다.
4. 동일 진단에 중복 생성된 추천은 하나의 기준으로 정리한다.
5. Access Token은 import하지 않고 사용자를 재로그인시킨다.

## Task 목록

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

GitHub branch protection/ruleset은 현재 비공개 저장소 플랜에서 지원되지 않아 API 설정이 거부됩니다. 플랜이 지원될 때까지 `main` 직접 push 금지, 승인 1명, CI 성공 후 merge를 팀 규칙으로 적용합니다.

### T1. NestJS 기본 구조

브랜치: `feature/backend-nest-init`

- [x] NestJS, `AppModule`, `HealthModule` 초기화
- [x] `GET /health` 구현
- [x] `ConfigModule`과 환경변수 검증
- [x] 전역 `ValidationPipe`와 공통 예외 응답 설정
- [x] CORS 허용 목록 환경변수화
- [x] build/test 스크립트와 Swagger 기반 마련

완료 기준: DB 없이 실행되고 `/health`가 정상 응답합니다.

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

초기 모델:

```text
User, RefreshSession, ConsentRecord
Diagnosis, SkinMetric, WeatherSnapshot
RecommendationTemplate, Recommendation
Product, RecommendationProduct
NotificationPreference
```

인덱스 후보:

```text
User.phoneNumber UNIQUE
Diagnosis(userId, capturedAt)
SkinMetric(diagnosisId, part) UNIQUE
WeatherSnapshot(regionName, observedAt)
Recommendation(userId, diagnosisId, createdAt)
```

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

전화번호만으로 로그인하는 현재 방식은 개발용 MVP로 취급합니다. 실제 서비스에는 OTP 또는 별도 본인확인이 필요합니다. Access Token은 `User` 테이블에 저장하지 않습니다.

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

정부 API 실패 시 지표를 임의 목업값으로 채우지 않습니다. `LIVE`, `CACHED`, `UNAVAILABLE`을 구분하고, 프론트가 측정 불가 상태를 표시할 수 있도록 합니다.

### T6. 날씨 이력 저장

브랜치: `feature/persist-weather-snapshots`

- [x] `WeatherSnapshot` 모델 구현 (T2 schema + T6 영구 저장)
- [x] 관측 시각과 서버 수집 시각 구분 (observedAt=외부 API 발표시각, collectedAt=DB now())
- [x] 지역·측정소·좌표 저장 정책 결정 (regionName/cityName/lat/lon/kmaAreaNo/airkoreaStation 저장)
- [x] 진단 연결용 서비스 메서드 제공 (getOrCreateSnapshot/getSnapshotById)
- [x] 진단 시 weatherSnapshotId 실제 연결 (T9 Diagnosis 도메인에서)
- [x] 중복·fallback 데이터 저장 정책 결정 (동일 관측시각 get-or-create dedup, UNAVAILABLE 미저장)
- [x] 개인 패턴 분석 필드 확정 (T10 개인 패턴 API에서 통계 정책과 함께 결정)

완료 기준: 특정 진단이 어떤 환경 데이터에 기반했는지 DB에서 재현할 수 있습니다.

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

후속 N5/N8에서 Python inference-service 호출, 실제 모델 컨테이너, landmarks 계약과 ECS 배포 경로까지 반영했다.

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

데이터 부족은 `404`가 아니라 `200 + LOCKED`로 반환합니다.

현재 최신 프론트는 개인 패턴 API를 호출하지 않고 `준비 중` 상태를 표시합니다. 백엔드 API 완성 후 프론트 연결은 별도 Task로 진행합니다.

### T11. 알림 설정 저장

브랜치: `feature/notification-preferences`

- [x] `NotificationPreference` 모델과 사용자별 1 row 보장
- [x] 설정 조회·수정 API
- [x] USER는 자기 설정만 수정
- [x] 기본값 및 프론트 동기화 정책 결정

이번 단계에서는 DB 저장만 구현합니다. 푸시 발송과 WebSocket은 포함하지 않습니다.

### T12. Redis 날씨 캐시

브랜치: `feature/redis-weather-cache`

- [x] Redis 연결 모듈
- [x] cache key와 TTL 정의
- [x] hit/miss 처리
- [x] Redis 장애 시 외부 API 또는 최근 DB fallback
- [x] live/cached 출처 구분
- [x] 무효화·로그·metric 정책 결정 (→ N11 다중 인스턴스 운영 보강에서 완료)

초기 Redis 범위는 날씨 캐시였으며, N4에서 추천·패턴·알림 BullMQ 작업 큐와 Inline fallback을 추가했다.

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

Python inference-service 컨테이너와 ECS 배포는 N5에서 추가되었다.

참고: Dockerfile, docker-compose backend 서비스, CI migration diff 검사 단계, 배포 전략 문서(`docs/DEPLOYMENT.md`)를 추가했다. CI는 `prisma generate`, build, 단위/E2E 테스트와 lint를 실행한다. migration diff 검사는 별도 shadow DB(`todayskin_shadow`)를 사용한다.

## 데이터 설계 기준

```text
User
 ├─ RefreshSession
 ├─ Diagnosis
 │   ├─ SkinMetric
 │   └─ WeatherSnapshot
 ├─ Recommendation
 ├─ NotificationPreference
 └─ ConsentRecord

RecommendationTemplate
Recommendation
 └─ RecommendationProduct ─ Product
```

- `User.accessToken`은 제거하고 `RefreshSession`으로 분리합니다.
- `SkinDiagnosis`는 `Diagnosis`로 정리하며 `status`, `modelVersion`, `weatherSnapshotId`를 검토합니다.
- `SkinPartMetric`은 `SkinMetric`으로 정리하고 `unique(diagnosisId, part)`를 둡니다.
- 전역 추천 템플릿과 사용자 생성 결과를 분리합니다.
- 제품 관계는 `RecommendationProduct` 중간 테이블로 전환합니다.
- 프론트와 스키마가 현재 6개 부위를 사용하므로 모델 명세 확정 전까지 6개를 유지합니다.

## API 계약 기준

| 현재 API                           | NestJS 책임                               |
| -------------------------------- | --------------------------------------- |
| `POST /auth/signup`              | `AuthController.signup()`               |
| `POST /auth/login`               | `AuthController.login()`                |
| `POST /auth/logout`              | `AuthController.logout()`               |
| `GET /weather`                   | `WeatherController.getCurrentWeather()` |
| `GET /diagnosis/latest`          | `DiagnosisController.getLatest()`       |
| `GET /diagnosis/history`         | `DiagnosisController.getHistory()`      |
| `POST /diagnosis`                | `DiagnosisController.submit()`          |
| `GET /recommendations`           | `RecommendationController.list()`       |
| `POST /recommendations/generate` | `RecommendationController.generate()`   |
| `GET /recommendations/:id`       | `RecommendationController.getById()`    |
| `GET /products`                  | `ProductController.list()`              |

가능하면 기존 `camelCase` 응답 필드와 `Authorization: Bearer ...` 헤더 계약을 유지합니다.

추천 생성 요청은 최종적으로 다음처럼 `diagnosisId`만 받는 방향을 권장합니다.

```json
{
  "diagnosisId": "diagnosis-id"
}
```

## 협업 규칙

### 미리 생성된 Task 브랜치 주의사항

T0~T14 브랜치는 2026-08-04의 `main` 커밋 `2e48c21`을 기준으로 미리 생성했습니다. 브랜치를 미리 만들면 다른 Task가 먼저 병합되는 동안 오래된 기준점에 남을 수 있습니다.

각 Task를 실제로 시작하기 전 반드시 최신 `main`을 반영합니다.

```bash
git fetch origin
git switch <task-branch>
git merge origin/main
```

처음 협업하는 동안에는 공유 브랜치의 이력을 다시 쓰지 않도록 merge 방식을 기본으로 사용합니다. 팀이 rebase 규칙에 합의한 경우에만 아직 공유되지 않은 개인 작업 브랜치에서 rebase를 사용합니다.

Task 브랜치를 동시에 연쇄적으로 개발하지 않습니다. 선행 Task 의존성이 있는 경우 선행 PR이 `main`에 병합된 뒤 후속 브랜치에 최신 `origin/main`을 반영하고 작업합니다.

### 브랜치 규칙

- `main`: 배포 가능한 상태
- `feature/<name>`: 기능
- `fix/<name>`: 버그
- `refactor/<name>`: 구조 개선
- `test/<name>`: 테스트
- `chore/<name>`: 설정

작업 시작:

```bash
git switch main
git pull origin main
git switch -c feature/<작업명>
```

### 커밋 규칙

커밋은 하나의 목적만 포함합니다.

```text
feat: add Prisma PostgreSQL schema
fix: prevent duplicate recommendation generation
refactor: separate weather API clients
test: add ownership checks for diagnosis history
chore: configure backend CI workflow
```

작업 중에는 `git status`, `git diff`, `git diff --cached`를 확인합니다.

### Pull Request 규칙

모든 작업은 PR을 통해 `main`에 병합합니다. PR에는 다음을 포함합니다.

- 변경 내용과 이유
- 테스트 명령어와 결과
- API/DB schema 변경 여부
- 환경변수 변경 여부
- 보류하거나 남은 작업
- 리뷰어가 확인할 위험 지점

PR 하나는 하나의 기능 또는 하나의 설계 주제만 다룹니다. 권장 병합 방식은 `Squash and merge`입니다.
FE F0~F16 웨이브에서는 `CONTRIBUTING.md`의 한시적 예외(작업자 self-merge)를 따른다. BE는 API freeze.

### 코드 리뷰 기준

- 기존 API와 프론트 호환성이 유지되는가?
- Controller에 비즈니스 로직이 과도하게 들어가지 않았는가?
- 사용자 데이터 소유권 검사가 있는가?
- 인증과 권한 검사가 누락되지 않았는가?
- migration이 안전한가?
- 중복 저장과 race condition 가능성이 있는가?
- 외부 API 실패와 timeout이 처리되는가?
- secret과 개인정보가 로그/커밋에 노출되지 않는가?
- mock fallback이 운영에서 실제 데이터처럼 보이지 않는가?
- 테스트가 실패·빈 데이터·권한 부족 상태를 포함하는가?

### DB 협업

- DB 파일은 커밋하지 않습니다.
- `schema.prisma`와 `prisma/migrations`는 커밋합니다.
- 공유 migration을 임의로 수정하거나 삭제하지 않습니다.
- 스키마 변경은 별도 PR로 분리합니다.
- seed는 upsert를 사용해 반복 실행에도 중복을 만들지 않습니다.

### 보안

절대 커밋하지 않는 항목:

```text
.env
.env.bak
backend/.env
API key
JWT secret
DB password
Refresh Token
얼굴 이미지
실사용자 개인정보
```

`.env.example`에는 변수명과 형식만 기록합니다.

## 우선순위

### P0

- [x] NestJS 실행 구조
- [x] PostgreSQL + Prisma migration
- [x] JWT + Refresh Token
- [x] USER / ADMIN
- [x] 기존 Auth/Weather/Recommendation/Product API 이식
- [x] `POST /products/weather-based` 포함
- [x] 사용자 데이터 소유권 검사

### P1

- [x] WeatherSnapshot 저장
- [x] 개인 패턴 분석 API
- [x] 추천 중복 생성 방지
- [x] 진단 파일 검증 및 MockInferenceProvider
- [x] NotificationPreference DB 저장
- [x] Redis 날씨 캐시

### P2

- [x] Python inference-service 연동
- [x] Redis BullMQ 작업 큐
- [ ] WebSocket/SSE (현재 polling)
- [x] Docker 배포 환경
- [x] GitHub Actions 배포 자동화

## 다음 과정 (Next)

> **BE 버그픽스/제품 웨이브(N24~N34) 완료 · API freeze** (main `42897d5` / PR #59~#66).
> 다음 구현은 **FE** (`docs/FRONTEND_TASKS.md` + `docs/FE_HANDOFF.md`).
> N16(AWS 첫 배포)는 계정·시크릿·승인자가 준비된 뒤 **별도**. EAS·구독 결제는 보류.
>
> **FE 웨이브 운영** (BE는 freeze — 계약 변경 시 Task/Swagger 먼저)
> - Task 하나 = 브랜치 하나 = PR 하나.
> - **`main` 작업 금지.** merge 후 브랜치 **삭제 금지**.
> - 리뷰어 1명 강제 **일시 해제**(FE F0~F16). `gh pr merge --squash`(`--delete-branch` 금지) 후 `main` pull → 새 브랜치.
> - 비밀번호·아이디/비번 찾기 UI 금지. 가상 제품·가짜 구독 카드·목업 로그인 금지.
>
> 아래 Task 체크리스트는 **이력·계약 기준**으로 유지한다 (삭제하지 않음).

### OTP MO 전환 — OCTOMO (feature/otp-octomo-mo, 2026-08)

알리고(MT — 서비스가 SMS 발송, 사업자등록증 필수)를 **OCTOMO(MO — 사용자가 문자 발송, 수신 여부 검증, 발송 비용 0원)** 로 교체.

- [x] `OtpProvider` 인터페이스 변경: `send(phone, code)` → `recipientNumber` + `verifySent(phone, text)`
- [x] `OctomoOtpProvider` 신규 — POST `/octomo/v1/public/message/exists`,
      `Authorization: Octomo {key}`, `{ mobileNum, text }` → `{ verified }` (기본 5분 조회)
- [x] `/otp/send` 응답 변경: `{ code, recipientNumber, message }` — MO는 코드를 화면에 표시해야 하므로 **프론트 계약 변경**
- [x] env: `SMS_*` 제거 → `OCTOMO_API_KEY`(production required)·`OCTOMO_ENDPOINT`·`OCTOMO_RECIPIENT_NUMBER`(기본 1666-3538)·`OCTOMO_TIMEOUT_MS`·`OCTOMO_MAX_RETRIES`
- [x] health ready 의존성 `sms` → `octomo` / provider 단위 테스트 교체 / OTP·auth e2e 유지 확인
- [x] 프론트: OTP 화면 "코드 입력" → "수신 번호로 코드 발송 안내" 전환 (`docs/FRONTEND_TASKS.md` F17, PR #94 완료)

### BE-2026-08-12. OTP 개발 모드 정리 — OCTOMO 연동/목업 표시 — 완료 (2026-08-12)

> 2026-08-12 로컬 점검: `.env`에 `OCTOMO_API_KEY`가 없어 개발 환경이 `MockOtpProvider`로 동작하고,
> mock의 `recipientNumber = '0000'`(자리표시자)가 프론트 코드 카드에 그대로 노출돼
> "0000으로 인증코드를 보내라"는 깨진 화면이 보임. (프론트 F17은 정상 구현)

- [x] `MockOtpProvider.recipientNumber`를 `'0000'` → `'1666-3538'`로 변경 (개발 화면 정상화)
- [x] provider 선택을 `NODE_ENV === 'production'` 기준 → **`OCTOMO_API_KEY` 유무 기준**으로 변경
      (`otp.module.ts` useFactory) — 로컬에서도 키만 넣으면 실제 OCTOMO 검증 테스트 가능
- [ ] 운영 필수: OCTOMO 가입(무료) → `OCTOMO_API_KEY`·`OCTOMO_RECIPIENT_NUMBER` 등록
      (외부 회원가입 절차 — 배포 시(N16) 처리)

완료 기준: 개발 모드에서도 화면에 1666-3538이 표시되고, 키가 있으면 로컬에서 실제 MO 검증이 동작.

### BE-2026-08-12. 개발 스토리지 논리 URI(`memory://`) → http 정규화 (신규, 2026-08-12) — 완료 (2026-08-12)

> **배경**: 로컬 `S3_BUCKET` 미설정 시 `MemoryImageObjectStore` 사용. PR #109에서
> `getPresignedUrl`은 `http://<DEV_STORAGE_BASE_URL>/dev-storage/...`로 바뀌었지만,
> ① `putObject`의 `uri`(DB `thumbnailUri`에 저장)는 여전히 `memory://`이고,
> ② 스냅샷 응답(`/diagnosis/latest`·제출 응답)이 저장된 `thumbnailUri`를 **그대로** 내보내
> RN `Image`가 `memory://`를 처리하지 못해 실기기 크래시 (2026-08-12 04:29 재발).
>
> **수정 방향**:
> - `ImageObjectStore`에 `toPublicUrl(uri)` 추가 — Memory는 `memory://bucket/key` →
>   `${baseUrl}/dev-storage/bucket/key`, S3는 그대로 반환(논리 `s3://` URI 유지)
> - `MemoryImageObjectStore.putObject`의 `uri`도 http dev-storage URL로 발급
> - `ImageStorageService.toPublicUrl` 노출 → 진단 스냅샷 DTO(`toSnapshotDto`·
>   `toSnapshotDtoFromDb`)에서 저장된 `thumbnailUri`를 정규화해 반환 (레거시 DB분 포함)
> - spec: memory store `uri`/`toPublicUrl` 단위 테스트 + 스냅샷 DTO 정규화 어서션

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

완료 기준: 운영 환경에서 Helmet 보안 헤더와 Rate Limit가 적용되고, 개발 환경은 기존 동작을 유지한다.

### N1. 구조화 로깅·관측성

브랜치: `feature/structured-logging-observability`

- [x] Pino JSON 구조화 로깅과 correlation ID
- [x] 민감정보 redact 정책
- [x] Sentry 선택적 연동과 민감정보 제거
- [x] 감사 로그와 애플리케이션 로그 책임 분리

완료 기준: 모든 요청에 correlation ID가 부여되고 JSON 로그로 남으며, 에러가 Sentry에 민감정보 없이 전송된다.

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

현재 기준: OTP 검증 흐름과 ADMIN 보호는 완료했지만 실제 SMS 발송은 N9에서 완료해야 운영 공개가 가능하다.

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

참고: ConsentModule + StorageModule 추가. `GET/POST /consents`, registry version 게이트.
저장 동의 시에만 SSE(AES256/KMS)로 객체 저장하고 `DiagnosisImage` 메타를 남긴다.
S3_BUCKET 미설정 시 개발/테스트는 Memory store를 사용한다. 운영은 S3_BUCKET 필수이며 Memory fallback을 허용하지 않는다.

완료 기준: 동의 상태가 진단·추천 기능의 진입 조건으로 동작하고, 동의한 이미지만 S3에 암호화 저장된다.

### N4. 비동기 처리(BullMQ)

브랜치: `feature/bullmq-async-jobs`

- [x] BullMQ 도입 — 현재 Redis는 날씨 캐시만
- [x] 추천 생성·패턴 분석·알림 발송을 비동기 job으로 전환
- [x] job 상태 모델: PENDING → COMPLETED/FAILED
- [x] job 우선순위·재시도·DLQ 정책 구현
- [x] API는 즉시 jobId를 반환하고 결과는 polling/SSE로 조회

완료 기준: 시간이 오래 걸리는 작업이 비동기 job으로 분리되어 API 응답 속도가 개선된다.

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

참고: `.github/workflows/deploy-ecs.yml`, `backend/docker/ecs/*.json`,
`backend/inference-service/Dockerfile`, `RUN_MIGRATIONS_ON_START` entrypoint,
`docs/DEPLOYMENT.md`에 절차·시크릿·롤백을 정리했다.
실제 AWS ECR/ECS/RDS/OIDC는 계정 시크릿 설정 후 워크플로로 실행한다.

완료 기준: CI 통과 후 ECR에 이미지가 push되고, 승인 후 NestJS와 FastAPI가 각각 Fargate에 배포된다.

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

참고: Soft Delete(`deletedAt`/`purgeAfter`), Diagnosis 익명 보존(`anonymizedAt`, userId SetNull),
`POST /auth/withdraw`, ADMIN soft-delete/purge, `/health/live|/health/ready`,
커서 pagination(limit 지정 시), `env.registry.ts`, CI `npm audit --audit-level=high`,
Jest coverageThreshold를 반영했다.

완료 기준: 탈퇴 시 Soft Delete로 보존 기간이 유지되고, purge job이 최종 삭제를 수행하며, health probe가 의존성 중요도별로 분리된다.

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

완료 기준: 옛날 FastAPI 코드가 저장소에서 제거되고 CI가 NestJS + inference-service만 검증한다.

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

완료 기준: 날짜 선택 시 날씨·대기질·분석·점수·추천 제품이 한 번에 조회되고, 동의한 경우 이미지와 랜드마크까지 확인할 수 있다.

### N9. 운영 SMS OTP 게이트웨이

브랜치: `feature/production-sms-otp`

- [x] SMS provider 확정 — **알리고(Aligo)** (건당 10원대 저비용 + 국내 실무 표준, `apis.aligo.in/send/`)
- [x] 실제 HTTP 발송 구현 (`SmsOtpProvider.send` — form-encoded POST, `result_code>0` 성공 판별)
- [x] 요청 timeout(`SMS_TIMEOUT_MS`)·제한 재시도(`SMS_MAX_RETRIES`, 네트워크 오류 한정 — HTTP/API 거부는 중복 발송 방지로 재시도 없음)
- [x] provider 오류 매핑 — 게이트웨이 문제는 `OtpGatewayError` → 503, 클라이언트 입력 오류는 400 유지
- [x] 전화번호·OTP·API key 로그 금지 검증 (에러 메시지·로거에 미포함, 단위 테스트로 고정)
- [x] 운영에서 `SMS_API_KEY`, `SMS_USER_ID`, `SMS_SENDER`, `SMS_ENDPOINT` 누락 시 readiness 실패 (env.registry `requiredIn: ['production']`)
- [x] provider 계약 단위 테스트 (`sms-otp.provider.spec.ts` — 성공/거부/HTTP오류/재시도/마스킹) + 기존 가입·로그인 E2E 유지 확인

참고: `SMS_USER_ID`(알리고 user_id)와 `SMS_TESTMODE`(testmode_yn=Y) 환경변수 추가. `testmode_yn=Y`면 과금 없이 연동 테스트만 수행.
개발/테스트는 기존 `MockOtpProvider` 유지.

완료 기준: 운영 환경의 OTP가 실제 SMS로 발송되고, 설정 누락이나 provider 장애가 가짜 성공으로 처리되지 않는다.

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

완료 기준: 일시적인 S3/DB 장애 뒤에도 개인정보 이미지 객체와 DB 메타데이터가 자동으로 수렴한다.

### N11. 다중 인스턴스 운영 보강

브랜치: `feature/distributed-runtime-controls`

- [x] HTTP Rate Limit 저장소를 Redis 기반으로 전환
  - `RedisThrottlerStorage`(ThrottlerStorage 구현) — key `throttle:{name}:{key}`, INCR+TTL
  - `THROTTLE_STORAGE=auto|memory|redis` — auto는 REDIS_URL 설정 시 Redis, 아니면 메모리
  - ECS 다중 task에서 분당 제한이 인스턴스별로 나뉘지 않음
- [x] 날씨 cache hit/miss와 BullMQ queue/DLQ metric 수집
  - 날씨: `metric:weather:cache:hit/miss` Redis 카운터 (WeatherService)
  - BullMQ: `JobMetricsScheduler`(`JOB_METRICS_INTERVAL_MS`, 기본 60s)가 queue별
  waiting/active/completed/failed/delayed + DLQ waiting을 구조화 로그로 수집
- [x] Redis 장애 시 cache·job·rate limit별 fail-open/fail-closed 정책 확정
  - **cache: fail-open** — Redis 다운 시 외부 API/DB fallback (기존 T12 설계)
  - **rate limit: fail-open** — Redis 다운 시 요청 통과. rate limit이 서비스 가용성을
  깨지 않게 하며, 복구 전 짧은 남용 가능성은 인지된 tradeoff
  - **job(BullMQ): fail-closed** — 큐 add 실패는 명시적 오류 전파(요청자가 재시도),
  재시도·DLQ 정책은 기존 JOB_POLICIES 유지. Inline fallback은 JOB_DISPATCHER=inline로 명시 선택
- [x] `/health/ready`에 운영 필수 inference/SMS dependency 정책 반영
  - inference: production+MOCK_INFERENCE=false에서 INFERENCE_SERVICE_URL 없으면 required down
  - SMS: production에서 SMS_API_KEY/SMS_SENDER 없으면 required down (N9 readiness 게이트와 정합)
  - dev/test는 skipped로 취급해 ready를 깨지 않음
- [x] WebSocket/SSE 필요성 재평가(현재 job polling 유지)
  - 결정: **job polling 유지** — N4 job 상태 API + 프론트 polling이 MVP에 충분.
  실시간 알림/라이브 차트 요구가 생기면 N11 후속으로 재평가 (SSE가 서버 비용·인프라
  측면에서 WebSocket보다 우선 후보)

완료 기준: ECS 다중 task에서도 rate limit과 운영 지표가 인스턴스별로 분산되지 않고 일관되게 동작한다.

### N12. 서버 소유 날씨 입력 계약

브랜치: `fix/server-owned-weather-contract`

- [x] `POST /products/weather-based`를 인증하고 사용자 입력 weather 전체를 신뢰하지 않도록 변경
- [x] 좌표/지역 식별자만 받아 WeatherService·최근 WeatherSnapshot에서 입력 구성
- [x] Redis·정부 API 실패 시 최근 DB snapshot fallback 구현
- [x] 프론트 요청 계약과 함께 단계적으로 migration
- [x] 비인증 호출·조작된 날씨·외부 API 실패 E2E 추가

완료 기준: 날씨 기반 제품 생성이 인증된 서버 데이터만 사용하고 외부 API 장애에도 명시적인 cached/unavailable 정책을 유지한다.

### N13. inference-service 내부 경계 보호

브랜치: `feature/inference-service-hardening`

- [x] NestJS↔FastAPI 내부 인증(shared secret 또는 service identity)
- [x] FastAPI 업로드 크기·content type 상한을 NestJS와 동일하게 적용
- [x] queue 대기와 추론 실행 timeout·동시성 지표
- [x] ECS security group에서 backend task만 `/infer` 접근 허용
- [x] 401/413/422/500 계약 테스트

완료 기준: inference-service가 내부망 오배치나 직접 호출에도 무제한 이미지 처리 endpoint로 노출되지 않는다.

### N14. 외부 AI 호출 멱등성

브랜치: `refactor/external-call-idempotency`

- [x] 진단 추론과 추천 Gemini 호출 전에 요청 예약/idempotency 상태 기록
- [x] 동일 사용자·진단 동시 요청이 외부 호출을 중복 수행하지 않도록 unique/lock 경계 이동
- [x] PENDING 실패·timeout·재시도 상태 전이 정의
- [x] 중복 요청의 동일 결과 반환 또는 409 계약 결정
- [x] 동시 요청 테스트 추가

완료 기준: 동시 재시도에서도 외부 AI 비용이 중복 발생하지 않고 DB 결과가 하나로 수렴한다.

### N16. AWS 운영 리소스 프로비저닝·첫 배포

브랜치: `chore/aws-production-bootstrap`

> 네트워킹 확정(2026-08-12): **backend는 public subnet + ALB 유지 + NAT 미사용**
> (아웃바운드는 IGW 경유). **`assignPublicIp=ENABLED`**로 ECS 프로비저닝 + migrate task 실행
> (`deploy-ecs.yml`, `ECS_ASSIGN_PUBLIC_IP` 변수). inference는 내부망 전용(N13).
> 상세는 `docs/DEPLOYMENT.md` 네트워크 구성.

- [ ] ECR, ECS cluster/service, RDS, Redis, S3, CloudWatch 생성
- [ ] GitHub OIDC role과 최소 권한 task/execution role 구성
- [ ] Secrets Manager와 production environment 승인자 설정
- [ ] migration task → backend/inference rollout → health smoke test 실행
- [ ] 이전 commit SHA rollback과 장애 알림 절차 실검증

완료 기준: 저장소의 배포 workflow가 실제 AWS 운영 계정에 승인·migration·health·rollback을 포함해 한 번 이상 성공한다.

### N17. CI 테스트 복구 — 코드-테스트 드리프트 정리

브랜치: `fix/ci-test-recovery`

> 2026-08-07 오디트 기준: main의 `backend-build-test → npm test`가 실패 중(2 suites / 3 tests).
> 원인은 N8/#37 이후 구현이 바뀌었는데 테스트 기대값이 갱신되지 않은 드리프트다.

- [x] `diagnosis.service.spec.ts` 2건 — N8 이후 `submit()`이 `wentOutside=true`일 때만 날씨 스냅샷을 연결하도록 바뀐 것을 테스트에 반영
- [x] `python-inference.provider.spec.ts` 1건 — N8 landmarks 필드가 provider 출력에 추가된 것을 mock fixture에 반영(`landmarks: null`)
- [x] spec 파일 TS 타입 에러 정리 — `soft-delete.service.spec`(implicit any), `diagnosis.service.spec`/`weather.service.spec`(mock에 `getPresignedUrlForDiagnosis`/`$executeRaw` 누락), `product`/`recommendation.service.spec`(`CursorPageDto` 인덱싱)
- [x] 로컬 단위 테스트가 DB 없이도 동작하도록 mock 보강 또는 DB 필요 조건 문서화 — `auth`/`prisma` service spec은 실 DB 연동이 목적이므로 CI/TEST_DATABASE_URL 설정 시에만 실행되는 조건부 스위트로 전환하고 주석으로 DB 필요 조건 문서화
- [x] `npm audit --audit-level=high` CI 게이트 복구 — `@nestjs/swagger@11.4.6`(js-yaml 5.x 계열)으로 올리고 `js-yaml@5.2.3` override 적용 (CVE-2026-59870 / GHSA-pm4m-ph32-ghv5 회피)

완료 기준: `npm test`가 CI·로컬에서 모두 초록이고 main CI가 복구된다.

> 2026-08-07 완료: 로컬 `npm test` 190 passed(+13 skipped=DB 스위트), `tsc --noEmit` 클린, `npm run build`/`lint` 통과, `npm audit --audit-level=high` 0 vulnerabilities.
> e2e 드리프트 1건 추가 수정: N11 이후 `WeatherService`가 `redisService.incrementCounter`를 호출하는데
> e2e 4개 스펙(`api-contract`/`consent-image`/`calendar-history`/`diagnosis-pattern`)의 RedisService mock에 메서드가 없어 `/weather`가 500 — mock에 `incrementCounter` 추가.
> **PR #43 CI에서 `backend-build-test`(build→test→test:cov→test:e2e→lint→audit)와 `frontend-typecheck` 모두 초록 확인** (#25 이후 첫 초록).
> 참고: 로컬에서 DB 없이 `npm run test:cov`를 돌리면 auth/prisma 스위트가 skip되어 `auth.service.ts` coverage threshold(60%)에 미달할 수 있다.

### N20. 추천-제품 연결 데이터 구축

브랜치: `fix/recommendation-product-links`

- [x] `RecommendationDto.relatedProductIds`가 항상 빈 배열로 반환되는 문제 해결 (template/생성 추천 모두)
- [x] seed에 `RecommendationProduct` 연결 데이터 추가 (템플릿·생성 추천 다형성)
- [x] 프론트 추천 상세의 "관련 제품" 섹션 표시 (프론트 범위 — 완료 기록)

완료 기준: 추천 응답의 `relatedProductIds`가 DB 연결 데이터 기준으로 채워지고, A/B/C 추천 상세에서 실제 관련 제품이 표시된다.

### N21. 패턴 분석 정확성·성능 개선

브랜치: `fix/pattern-analysis-quality`

- [x] `collectedDays`를 UTC → KST 기준으로 통일 (`calendar-date.util`과 정합, 현재 `toISOString().slice(0,10)`은 UTC)
- [x] `collectDailyPeakEnv`의 진단당 1회 aggregate 쿼리(N+1)를 일괄 집계로 개선
- [x] 실내 사용자(`wentOutside=false`)는 weatherSnapshot이 없어 패턴이 영원히 LOCKED — 기본 지역 스냅샷 참조 등 정책 재검토
- [x] (배포 시점) `WeatherCollectionScheduler`가 ECS task마다 실행되어 정부 API를 중복 호출 — 싱글턴/별도 스케줄 task 검토

완료 기준: 날짜 집계가 KST 기준으로 일관되고, 쿼리 수가 진단 수와 무관해지며, 실내 사용자 정책이 결정된다.

### N22. OTP 남용 방지·저장 강화 (SMS 연동 시점)

브랜치: `feature/otp-abuse-hardening`

- [x] OTP 발송에 전화번호별 글로벌 제한 추가 (현재는 IP 기반 rate limit만이라 SMS 도배에 취약) — N22
- [x] OTP 코드 해시 저장 검토 (현재 평문 — 단기 만료·시도 제한으로 보완 중이나 DB 유출 시 노출) — N22
- [x] SMS 게이트웨이 연동(N9) 시 발송 실패·재시도·모니터링 정책 확정 — N22

완료 기준: SMS 게이트웨이 활성화 상태에서도 임의 번호 대상 OTP 도배가 불가능하다.

### N24. Product.purchaseUrl

브랜치: `feature/product-purchase-url` (N27과 동일 PR 권장)

- [x] Prisma `Product.purchaseUrl String?` + migration
- [x] Product DTO/응답에 `purchaseUrl` 노출 (목록·관련 제품·weather-based)
- [x] seed/실제품 데이터에 동작하는 구매 URL 채움 (허위 Skinlab/Greenfield 제거는 N27과 함께)

완료 기준: 노출되는 실제품마다 FE가 `Linking.openURL` 할 수 있는 URL이 있다.

### N25. 날씨 수집 병렬·워밍

브랜치: `fix/weather-collect-parallel`

- [x] UV/기상관측/대기질 수집을 가능한 범위에서 병렬화
- [x] 콜드 스타트·스케줄러 워밍으로 첫 요청 지연 완화
- [x] 실패 시 기존 LIVE/CACHED/UNAVAILABLE 계약 유지 (목업 수치 금지)

완료 기준: 홈/날씨 첫 로드가 눈에 띄게 빨라지고 unavailable 계약이 깨지지 않는다.

### N26. 랜드마크·저장 동의 정합

브랜치: `fix/landmarks-storage-consent`

- [x] `diagnosis.service.ts`에서 `storeImage && landmarks` 등 저장 동의와 landmarks 영속화 조건 일치
- [x] 미동의 시 landmarks/이미지 미노출 계약 유지 (N8)
- [x] 회귀 테스트: 동의·미동의·이미지 없음

완료 기준: 저장 동의 진단에서 landmarks가 일관되게 저장·조회된다.

### N27. 실제 화장품 카탈로그·매칭

브랜치: `feature/real-product-catalog` (N24와 동일 PR 권장)

- [x] 허구 Skinlab/Greenfield 시드 삭제
- [x] 실제 화장품 30~50개 큐레이션 시드 (오프라인 Gemini 초안 + 사람 검증 가능). **크롤링 없음**
- [x] `purchaseUrl` 필수에 가깝게 채움 (N24)
- [x] 성분 매칭: 기존 `ALLOWED_INGREDIENTS` whitelist 유지. Gemini는 가능하면 **productId** 선택 우선
- [x] 매칭 0건 시 규칙 기반 실제품 fallback (가상 `gemini-product-*` 생성 금지)
- [x] Gemini 담당과 선택 품질·프롬프트 조율

완료 기준: 추천/날씨 제품이 DB 실제품(+purchaseUrl)만 가리키고, 허구 브랜드가 seed/응답에 없다.

### N28. PATCH /auth/me

브랜치: `feature/auth-patch-me`

- [x] `PATCH /auth/me` — name, gender (phone 변경은 OTP 별도·이번 범위 밖)
- [x] DTO 검증, 소유자만 수정, Swagger
- [x] 기존 `GET /auth/me`와 응답 형태 정합

완료 기준: 설정 프로필 수정이 서버에 반영된다.

### N29. 비동기 LIVE 교체

브랜치: `feature/rec-fast-path` (N31+N32+N29 한 PR)

- [x] FALLBACK/CACHED 응답과 함께 job enqueue (기존 jobs 모듈 활용)
- [x] 완료 시 `source: LIVE`로 교체 가능한 결과
- [x] `GET /jobs/:id` 계약 유지·문서화. 동기 `POST /recommendations/generate` 의존 제거는 FE(F1)와 freeze 시 합의

완료 기준: FALLBACK/CACHED 직후 job으로 LIVE 교체가 가능하고, 가상 제품이 없다.

### N30. 비밀번호·아이디 찾기 — 취소

브랜치: 없음 (구현하지 않음)

- [x] 전화+OTP 유지 결정
- [x] 비밀번호·아이디/비번 찾기·이름+생일 찾기 API/UI 추가 금지
- [x] 소셜 로그인(N33)으로 진입 부담 완화

완료 기준: 비밀번호·찾기 관련 API가 없다.

### N31. 실제품만 추천 경로

브랜치: `feature/rec-fast-path` (N31+N32+N29 한 PR)

- [x] weather/diagnosis 추천이 DB 실제품만 사용
- [x] 가상 weather 제품·`gemini-product-*` 경로 제거/차단
- [x] 응답 제품에 `purchaseUrl` 포함

완료 기준: 추천 경로에 가상 제품이 없고 실제품+purchaseUrl만 노출된다.

### N32. Redis SWR + 규칙 FALLBACK

브랜치: `feature/rec-fast-path` (N31+N32+N29 한 PR)

- [x] Redis SWR: hit → `source: CACHED` 즉시 실제품
- [x] miss → 규칙 기반 실제품 `source: FALLBACK` 즉시 반환 (빈 화면·긴 동기 Gemini 대기 금지)
- [x] stale/갱신 중 메타는 FE가 표시할 수 있게

완료 기준: 첫 응답에 실제품이 즉시 오고, stale 메타로 갱신 중 표시가 가능하다.

### N33. 소셜 로그인 (Kakao · Google · Apple)

브랜치: `feature/auth-social-oauth`

- [x] Kakao / Google / Apple 토큰 검증·계정 연결·세션(기존 refresh 흐름)
- [x] 미가입 소셜 → 온보딩(동의·필요 시 전화 연결) 계약
- [x] Apple은 스토어 미배포여도 API·설정 포함 (Dev 계정은 스토어 시점에)
- [x] 비밀번호/찾기 API 추가 금지
- [x] env.registry·Swagger·실패 계약(취소·거절·만료)

완료 기준: 세 제공자로 가입·로그인·세션이 동작한다.

### N34. 설정·알림 계약 보강

브랜치: `feature/settings-notification-contract`

- [x] 푸시 미구현 구간을 FE가 거짓 토글로 오해하지 않도록 플래그/문서 (`pushDeliveryAvailable` 등)
- [x] `morningReminder` 등 미사용 필드 정리 또는 명시적 unsupported
- [x] F16 설정 전면 재구성과 맞춤 — FE 핸드오프에 계약 명시

완료 기준: 설정 UI가 “되는 것처럼 보이는” 토글을 서버 계약으로 막을 수 있다.

## 프론트 범위 완료 기록 (참고용)

> 아래는 프론트엔드 범위에서 완료되어 `main`에 병합된 작업이다. 백엔드 태스크는 아니지만
> 작업 기록 보존을 위해 여기에 남겨둔다. 상세는 해당 PR과 프론트 코드에서 확인한다.

### N15. 캘린더 히스토리 프론트 연결 (프론트 범위 — 완료)

브랜치: `feature/calendar-history-client`

- [x] 프론트 API client에 `history/:date`, `score-series` 추가
- [x] 날씨·진단·추천·image·landmarks 응답 타입 동기화
- [x] History 화면의 기존 목록/로컬 시계열을 N8 계약으로 migration
- [x] 저장 미동의와 presigned URL 만료 상태 처리
- [x] 로딩·빈 날짜·부분 데이터·재인증 UI 검증

완료 기준: 사용자가 날짜를 선택하면 N8 통합 히스토리를 실제 앱에서 조회하고 동의 상태에 맞는 이미지·landmarks를 확인할 수 있다.

### N18. 앱 세션 토큰 수명 관리 (프론트 범위 — 완료)

브랜치: `feature/app-session-refresh`

- [x] 프론트에 refresh token 회전 연동 (현재 `saveSession`은 accessToken만 저장, refresh 미사용)
- [x] 401 응답 시 재로그인 유도 흐름 (현재는 "불러올 수 없어요"만 노출되고 로그인 화면으로 복귀하지 않음)
- [x] access token(15m) 만료 후에도 앱이 조용히 갱신되거나 명확한 재인증 UX 제공

완료 기준: 세션이 15분 이상 지속돼도 인증 API가 끊기지 않고, 토큰 무효 시 사용자가 로그인 화면으로 안내된다.

### N19. 설정 화면 기능 연동 (프론트 범위 — 완료)

브랜치: `feature/settings-integration`

- [x] 알림 스위치를 `NotificationPreference` API에 연동 (현재 로컬 state만 변경, 서버 미저장)
- [x] "안면 이미지 처리방침 확인" / "데이터 처리 동의 철회" 행에 consent 조회·철회 API 연결
- [x] 탈퇴(withdraw) UI — 백엔드 `POST /auth/withdraw`(N6)는 구현돼 있으나 앱 진입점 없음
- [ ] 구독(프리미엄) 화면 — 현재 정적 표시만, 결제·권한 로직 없음 (범위 별도 결정 — 미완료). **가짜 가격 카드는 F16에서 삭제.** 이후 FE 미완료 작업은 `docs/FRONTEND_TASKS.md`.

완료 기준: 설정 화면의 모든 항목이 실제 API와 동기화되고 동의 철회·탈퇴가 사용자 흐름으로 동작한다.

## 완료 정의

- NestJS 모듈 경계 안에 기능이 구현되어 있습니다.
- Prisma migration과 seed가 재현 가능합니다.
- 인증·권한·소유권 검사가 있습니다.
- 성공과 실패 테스트가 있습니다.
- 기존 프론트 API 계약이 검증되었습니다.
- secret이 코드에 포함되지 않았습니다.
- PR 리뷰가 완료되고 `main`에 병합되었습니다.
- 보류 항목과 후속 작업이 PR에 기록되었습니다.

