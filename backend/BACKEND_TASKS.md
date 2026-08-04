# Todayskin Backend Tasks

이 문서는 Todayskin 백엔드 전환과 GitHub 협업의 기준 문서입니다.

## 목표

현재 FastAPI 기능과 프론트 API 계약을 기준으로 다음 구조로 단계적으로 전환합니다.

```text
NestJS + TypeScript
PostgreSQL + Prisma
JWT + Refresh Token
USER / ADMIN 권한
Redis: 날씨 캐시, 향후 AI 작업 큐
```

목표는 기능을 무작정 새로 만드는 것이 아닙니다.

> 현재 구현된 기능을 실제 서비스에서도 사용할 수 있는 구조로 개선하는 것이 목표입니다.

## 최신 origin/main 동기화 반영

2026-08-04에 원격 `origin/main`의 최신 15개 커밋을 pull한 뒤 확인한 변경사항입니다.

- 날씨 API는 `MOCK_WEATHER`로 값을 채우지 않습니다. 정부 API 실패 시 각 지표가 `None`/`undefined`가 되고 프론트가 `측정 불가`를 표시합니다.
- UV API가 V4에서 V5로 변경되었고 `uvIndexPeak`, `uvStatusPeak`, `uvIndexPeakHour`가 추가되었습니다.
- `POST /products/weather-based`가 추가되었습니다. 피부 측정값 없이 Gemini가 `세안 후`, `외출 전`, `외출 후` 제품을 생성합니다.
- 날씨 기반 제품 응답에 `reason`, `timing`이 추가되었습니다.
- 회원가입과 User 응답에 선택 필드 `gender`가 추가되었습니다.
- 개인 패턴 차트와 프론트 mock 데이터는 제거되었고, 현재 개인 패턴 화면은 `준비 중` 상태입니다.
- 프론트 API client도 실패 시 목업 대신 `null`, `error`, `not_found` 상태를 사용합니다.

따라서 이후 이식 작업은 과거의 목업 fallback을 기준으로 하지 않고, 최신의 명시적 unavailable/error 계약을 기준으로 진행합니다.

## 보류 범위: Python AI 서버

피부 이미지 분석 모델 학습과 Python AI 서버 구축은 이번 범위에서 보류합니다.

- 모델 학습이 완료될 때까지 실제 추론 서버를 구현하지 않습니다.
- NestJS 진단 서비스는 `InferenceProvider`와 `MockInferenceProvider`를 기준으로 설계합니다.
- Python AI 서버가 준비되면 `PythonInferenceProvider`를 추가해 교체합니다.
- NestJS의 진단 저장, 권한, 상태 관리, API 계약은 Python 서버 없이 먼저 완성합니다.
- 현재 고정 진단값은 개발/통합 테스트용으로만 사용합니다.

## 최종 구조

```text
backend/
├─ src/
│  ├─ main.ts
│  ├─ app.module.ts
│  ├─ common/                 # Guard, decorator, exception, pipe
│  ├─ prisma/                 # PrismaModule, PrismaService
│  └─ modules/
│     ├─ auth/ users/ weather/
│     ├─ diagnosis/ recommendations/ products/
│     ├─ pattern/ notifications/ health/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts
└─ package.json
```

## 파일 매핑

| 현재 | NestJS 변경 후 |
|---|---|
| `main.py` | `main.ts`, `app.module.ts` |
| `database.py` | `PrismaModule`, `PrismaService` |
| `models.py` | `prisma/schema.prisma` |
| `schemas.py` | 모듈별 `dto/`, `enum/` |
| `deps.py` | `JwtStrategy`, `JwtAuthGuard`, `RolesGuard` |
| `seed.py` | `prisma/seed.ts` |
| `regions.py` | `RegionResolver` |
| `mock_data.py` | seed, fixture, `MockInferenceProvider` |
| `gemini_client.py` | `GeminiClient`, `EvidencePolicy` |
| `routers/auth.py` | `AuthController`, `AuthService` |
| `routers/weather.py` | `WeatherController`, `WeatherService`, API Clients |
| `routers/diagnosis.py` | `DiagnosisController`, `DiagnosisService` |
| `routers/recommendations.py` | Recommendation/Product modules |
| `trend.tsx` mock | `PatternController`, `PatternService` |
| settings 로컬 상태 | `NotificationController`, `NotificationService` |

Controller는 HTTP 처리만 담당하고, 비즈니스 로직은 Service에 둡니다. 외부 API는 Client, 정책은 Policy로 분리합니다. 단순 CRUD마다 Repository를 무조건 만들지는 않습니다.

## 최신 코드와의 충돌 및 수정 필요 사항

### 1. Weather 지표 nullable 계약

최신 백엔드는 API 실패 시 목업값을 반환하지 않고 지표를 `None`으로 응답합니다. NestJS DTO와 Prisma 모델은 다음을 반영해야 합니다.

- UV, 오존, PM2.5, PM10, CAI, NO2, SO2, CO는 nullable입니다.
- `uvIndexPeak`, `uvStatusPeak`, `uvIndexPeakHour`를 포함합니다.
- 데이터 출처는 `LIVE`, `CACHED`, `UNAVAILABLE`처럼 명시합니다.
- Redis와 DB에 정상 데이터가 없으면 임의 수치를 만들지 않고 unavailable 상태를 반환합니다.

### 2. Weather API 설정 변경

- 기상청 UV endpoint는 최신 V5 기준으로 이식합니다.
- `GEMINI_MODEL` 기본값은 현재 `gemini-flash-latest` 기준으로 관리합니다.
- 기존 `KMA_AREA_NO`, `AIRKOREA_STATION_NAME`은 위치 조회 실패 시 기본 지역 fallback에 필요하므로 환경변수와 코드 중 어느 쪽을 기준으로 할지 결정해야 합니다. 지역 테이블을 기준으로 할 경우 환경변수는 기본 region id로 단순화합니다.

### 3. 날씨 기반 제품 추천 API 추가

최신 프론트는 다음 API를 사용합니다.

```text
POST /products/weather-based
```

- 피부 측정값 없이 날씨 데이터만으로 제품을 생성합니다.
- 응답에는 `reason`, `timing`이 포함됩니다.
- `timing`은 `세안 후`, `외출 전`, `외출 후` 중 하나입니다.
- Gemini 실패 시 503을 반환하고 가짜 제품으로 대체하지 않습니다.
- 현재는 사용자별 영구 추천이 아니라 요청 시 생성하는 결과이므로, 캐시 여부와 저장 여부를 별도 결정합니다.
- 클라이언트가 보낸 날씨를 그대로 신뢰하지 않고, 최종 구조에서는 서버가 지역·Redis·WeatherSnapshot에서 입력값을 조회합니다.

### 4. 회원가입 gender 추가

최신 API 계약에 선택 필드 `gender: male | female`가 추가되었습니다.

- Prisma `User.gender`는 nullable enum으로 정의합니다.
- 회원가입 DTO와 User 응답에 포함합니다.
- 모델 학습 전에는 추천 로직에 임의로 사용하지 않습니다.
- 민감정보 취급 여부와 수집 목적·보관 필요성을 문서화합니다.

### 5. 개인 패턴 화면 계약

최신 프론트는 개인 패턴 mock 차트를 제거하고 현재 `준비 중`만 표시합니다.

- 백엔드 `GET /diagnosis/pattern`은 먼저 구현할 수 있습니다.
- 프론트 연결은 API 응답 계약과 통계 정책이 확정된 뒤 별도 PR로 진행합니다.
- 데이터 부족 상태는 `404`가 아니라 `200 + LOCKED`로 유지합니다.

### 6. 현재 프론트 호출과 최종 보안 계약의 차이

현재 프론트는 `POST /recommendations/generate`에 `skinScore`와 `weather` 전체를 보내고 있습니다. 최종 NestJS API는 `diagnosisId`만 받아야 합니다.

```json
{
  "diagnosisId": "diagnosis-id"
}
```

서버는 diagnosis의 사용자 소유권을 확인한 후 DB에서 피부 측정값과 연결된 날씨 snapshot을 조회합니다. 이 변경은 NestJS 이식 PR에서 프론트와 함께 contract migration으로 처리합니다.

### 7. 기존 Python DB와 최신 코드의 migration 주의점

현재 SQLite에는 기존 5개 테이블과 과거 생성 추천 데이터가 있습니다. 최신 코드에는 `gender`가 추가되었으므로 단순 데이터 복사가 아니라 다음 순서로 처리합니다.

1. 새 Prisma schema에 nullable `gender`를 포함합니다.
2. 기존 사용자의 gender는 null로 import합니다.
3. 기존 전역 추천과 개인 생성 추천을 구분합니다.
4. 동일 진단에 중복 생성된 추천은 하나의 기준으로 정리합니다.
5. Access Token은 import하지 않고 사용자를 재로그인시킵니다.

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

- [ ] PostgreSQL 로컬 실행 방식 결정
- [ ] `DATABASE_URL` 연결 및 `PrismaService` 구현
- [ ] `schema.prisma`, migration, `prisma/seed.ts` 작성
- [ ] 제품·추천 템플릿 seed를 upsert로 구현
- [ ] 개발/테스트/운영 DB 분리
- [ ] NestJS 시작 시 자동 `create_all` 사용 금지
- [ ] 기존 SQLite 데이터 보존 및 중복 데이터 처리 정책 결정
- [ ] `User.gender` nullable enum(`male`, `female`) 반영
- [ ] `WeatherSnapshot`에 UV peak와 측정 불가 상태 반영
- [ ] 날씨 기반 생성 제품의 `reason`, `timing` 저장 여부 결정

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
- [ ] ADMIN 전용 운영 API 보호
- [ ] 진단·추천 조회 시 사용자 소유권 검사
- [x] 인증 실패와 권한 부족 상태 코드 구분

전화번호만으로 로그인하는 현재 방식은 개발용 MVP로 취급합니다. 실제 서비스에는 OTP 또는 별도 본인확인이 필요합니다. Access Token은 `User` 테이블에 저장하지 않습니다.

### T4. 기존 Auth/User API 호환

브랜치: `feature/migrate-auth-user-api`

- [ ] `/auth/signup`, `/auth/login`, `/auth/logout` 이식
- [ ] 전화번호·이름·생년월일 검증 규칙 유지
- [ ] `Authorization: Bearer ...` 계약 유지
- [ ] 에러 응답 형식 통일
- [ ] Expo 로그인/회원가입 통합 테스트

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

보류: 실제 Python AI 서버 호출, 실제 모델 추론, 모델 운영·배포 정책.

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

- [ ] `NotificationPreference` 모델과 사용자별 1 row 보장
- [ ] 설정 조회·수정 API
- [ ] USER는 자기 설정만 수정
- [ ] 기본값 및 프론트 동기화 정책 결정

이번 단계에서는 DB 저장만 구현합니다. 푸시 발송과 WebSocket은 포함하지 않습니다.

### T12. Redis 날씨 캐시

브랜치: `feature/redis-weather-cache`

- [ ] Redis 연결 모듈
- [ ] cache key와 TTL 정의
- [ ] hit/miss 처리
- [ ] Redis 장애 시 외부 API 또는 최근 DB fallback
- [ ] live/cached 출처 구분
- [ ] 무효화·로그·metric 정책 결정

초기 Redis 범위는 날씨 캐시입니다. AI 작업 큐는 Python AI 서버와 실제 비동기 추론이 필요해질 때 별도 작업으로 추가합니다.

### T13. 테스트와 API 계약

브랜치: `test/backend-contracts`

- [ ] Auth, USER/ADMIN, 소유권 테스트
- [ ] migration/seed 테스트
- [ ] Weather parser/fallback 테스트
- [ ] 추천 중복 생성 방지 테스트
- [ ] 진단 파일 검증 테스트
- [ ] Pattern locked/ready 테스트
- [ ] 프론트 API response contract 테스트
- [ ] 운영 환경 mock fallback 비활성화 테스트
- [ ] 날씨 지표 `undefined`와 추천 API `503` 계약 테스트

### T14. Docker와 GitHub Actions

브랜치: `chore/backend-ci-cd`

- [ ] NestJS Dockerfile
- [ ] PostgreSQL·Redis 로컬 컨테이너
- [ ] 환경변수 주입 문서화
- [ ] install/build/test workflow
- [ ] PR 자동 테스트
- [ ] Prisma migration 검사
- [ ] 배포 전략 결정

Python AI 서버 컨테이너는 모델 학습과 서버 구현 완료 뒤 별도 작업으로 추가합니다.

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

| 현재 API | NestJS 책임 |
|---|---|
| `POST /auth/signup` | `AuthController.signup()` |
| `POST /auth/login` | `AuthController.login()` |
| `POST /auth/logout` | `AuthController.logout()` |
| `GET /weather` | `WeatherController.getCurrentWeather()` |
| `GET /diagnosis/latest` | `DiagnosisController.getLatest()` |
| `GET /diagnosis/history` | `DiagnosisController.getHistory()` |
| `POST /diagnosis` | `DiagnosisController.submit()` |
| `GET /recommendations` | `RecommendationController.list()` |
| `POST /recommendations/generate` | `RecommendationController.generate()` |
| `GET /recommendations/:id` | `RecommendationController.getById()` |
| `GET /products` | `ProductController.list()` |

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

- [ ] NestJS 실행 구조
- [ ] PostgreSQL + Prisma migration
- [ ] JWT + Refresh Token
- [ ] USER / ADMIN
- [ ] 기존 Auth/Weather/Recommendation/Product API 이식
- [ ] `POST /products/weather-based` 포함
- [ ] 사용자 데이터 소유권 검사

### P1

- [ ] WeatherSnapshot 저장
- [ ] 개인 패턴 분석 API
- [ ] 추천 중복 생성 방지
- [ ] 진단 파일 검증 및 MockInferenceProvider
- [ ] NotificationPreference DB 저장
- [ ] Redis 날씨 캐시

### P2

- [ ] Python AI 서버 연동
- [ ] Redis AI 작업 큐
- [ ] WebSocket/SSE
- [ ] Docker 배포 환경
- [ ] GitHub Actions 배포 자동화

## 완료 정의

- NestJS 모듈 경계 안에 기능이 구현되어 있습니다.
- Prisma migration과 seed가 재현 가능합니다.
- 인증·권한·소유권 검사가 있습니다.
- 성공과 실패 테스트가 있습니다.
- 기존 프론트 API 계약이 검증되었습니다.
- secret이 코드에 포함되지 않았습니다.
- PR 리뷰가 완료되고 `main`에 병합되었습니다.
- 보류 항목과 후속 작업이 PR에 기록되었습니다.
