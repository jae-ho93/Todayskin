# Todayskin Backend Decision Register

이 문서는 T0~T14 작업을 하나의 운영 가능한 백엔드로 유지하기 위해, 코드에 구현되어 있거나 앞으로 선택이 필요한 설계 결정을 기록한다.

- `[코드에서 확인]`: 현재 코드·스키마·테스트·문서에서 확인한 사실
- `[미결정]`: 현재 구현은 있으나 장기 유지보수를 위한 기준이 명시되지 않은 상태
- 이 문서의 추천안은 현재 API 계약과 기존 사용자 데이터를 최대한 보존하는 것을 전제로 한다.
- 이미 확정된 구현 세부사항도 장기 운영에 중요한 경우에는 현재 상황과 유지 기준을 함께 기록한다.

---

# T0. 협업 환경과 개발 규칙

## T0-01. Naming Convention과 자동 검증 범위

### 현재 상황

[코드에서 확인] `CONTRIBUTING.md`에는 브랜치, Conventional Commit, PR, 리뷰, migration 규칙이 있으나 TypeScript 클래스·메서드·DTO·파일명·Prisma 필드·환경변수의 naming convention을 하나의 표로 정의하지 않는다. 실제 코드는 camelCase TypeScript/JSON, snake_case DB column mapping, PascalCase 클래스, kebab-case 성격의 파일명을 함께 사용한다.

[미결정] 새 모듈에서 사용할 이름과 lint/CI가 강제할 범위가 명시되지 않았다.

### 왜 결정이 필요한가

이름이 달라지면 같은 개념을 중복 구현하거나 API와 DB 필드 매핑을 잘못할 가능성이 커진다. 특히 DTO와 Prisma 모델 사이의 필드명이 달라 수동 매핑이 필요한 프로젝트이므로 기준이 없으면 계약 변경을 놓치기 쉽다.

### 선택 가능한 옵션

- Option A: 팀의 관례에 맡긴다
  - 장점: 별도 문서와 도구 변경이 없다.
  - 단점: 모듈마다 다른 이름과 파일 구조가 생기고 리뷰 비용이 커진다.

- Option B: 공통 naming 표와 lint 규칙을 확정한다
  - 장점: 새 코드의 형태를 예측할 수 있고 자동 검증이 가능하다.
  - 단점: 기존 예외 이름을 정리할 때 소규모 변경이 필요하다.

### 추천안

Option B. TypeScript는 클래스·DTO·enum은 PascalCase, 변수·메서드·JSON 응답은 camelCase, 파일명은 kebab-case, Prisma DB mapping은 snake_case, 환경변수는 대문자 snake_case를 사용한다. 외부 API 원문 필드명은 Client 내부에서만 사용하고 Service 밖으로 노출하지 않는다.

### 추천 이유

현재 코드와 가장 잘 맞는 규칙이며, 외부 API·Prisma·프런트 계약의 경계를 이름으로 구분할 수 있다. 새 규칙은 lint와 PR 리뷰에서 자동·수동으로 함께 확인할 수 있다.

### 영향 범위

- `backend/src/**`
- `backend/prisma/schema.prisma`
- `backend/.env.example`
- `src/types/**`, `src/api/**`, ESLint 및 PR 리뷰 기준

---

# T1. NestJS 기본 구조와 공통 API

## T1-01. NestJS와 레거시 FastAPI의 운영 기준

### 현재 상황

[코드에서 확인] 현재 운영 대상 구조는 NestJS + TypeScript + Prisma + PostgreSQL + Redis이다. 동시에 `backend/app/`에 FastAPI 구현이 남아 있고 CI는 Python syntax 검사도 수행한다. README는 Python 코드를 참조용·점진 이식 대상으로 설명하지만 실제 서비스 트래픽을 어느 구현이 받는지는 별도 선언이 없다.

[미결정] NestJS를 유일한 운영 백엔드로 확정할지, FastAPI를 언제 읽기 전용·참조용으로 전환하고 삭제할지 정해지지 않았다.

### 왜 결정이 필요한가

두 구현이 동시에 유지되면 인증, 날씨, 추천, 예외 응답, DB 접근 방식이 다시 갈라질 수 있다. 장애 시 어느 코드가 기준인지도 모호해진다.

### 선택 가능한 옵션

- Option A: NestJS와 FastAPI를 장기간 병행 운영한다
  - 장점: 기존 Python 기능을 즉시 폐기하지 않아도 된다.
  - 단점: API·보안·마이그레이션·운영 비용을 두 번 관리해야 한다.

- Option B: NestJS를 기준 구현으로 확정하고 FastAPI에 종료 조건을 둔다
  - 장점: 하나의 인증·DB·오류·배포 기준을 유지할 수 있다.
  - 단점: FastAPI 소비자와 기능 동등성 검증, 트래픽 전환 계획이 필요하다.

### 추천안

Option B. NestJS를 운영 API의 단일 기준 구현으로 삼고, FastAPI는 실제 트래픽이 없는 참조·마이그레이션 검증용으로만 유지한다. NestJS의 API 계약·e2e 검증이 완료되고 소비자 전환이 확인되면 FastAPI 라우터와 전용 DB 코드를 제거한다.

### 추천 이유

현재 T0~T14의 최종 구조와 CI가 NestJS를 기준으로 작성되어 있다. 두 구현을 운영 경로에 남기는 것은 점진적 전환에는 도움이 되지만 최종 구조로는 일관성이 떨어진다.

### 영향 범위

- `backend/app/**`
- `backend/src/**`
- `.github/workflows/ci.yml`
- `backend/README.md`, 배포·트래픽 전환 설정

## T1-02. Module 경계와 Repository 도입 기준

### 현재 상황

[코드에서 확인] Auth, Weather, Diagnosis, Recommendation, Product, Pattern, Notification, Gemini, Health가 모듈로 분리되어 있다. Controller는 HTTP 처리, Service는 비즈니스 로직을 담당하며 외부 API는 Client, 계산 규칙은 Policy로 분리한다. 단순 CRUD는 Service에서 Prisma를 직접 호출하고 PrismaModule은 전역이다.

[미결정] 어느 시점에 모듈을 분리하고, 어떤 복잡도부터 Repository 또는 별도 Domain Policy를 도입할지 명시되지 않았다.

### 왜 결정이 필요한가

무조건 Repository를 만들면 추상화만 늘고, 반대로 Service가 모든 SQL·매핑·정책을 가지면 책임이 커진다. 모듈 간 직접 Service 호출이 늘어나면 순환 의존성도 생길 수 있다.

### 선택 가능한 옵션

- Option A: 모든 모듈에 Controller-Service-Repository-DTO를 강제한다
  - 장점: 구조가 형식적으로 통일된다.
  - 단점: 단순 조회에도 파일과 추상화가 늘어난다.

- Option B: 책임과 복잡도 기준으로 선택적으로 도입한다
  - 장점: 현재 규모에서 불필요한 추상화를 피하면서 복잡한 query·transaction은 캡슐화할 수 있다.
  - 단점: 도입 기준을 리뷰어가 계속 판단해야 한다.

### 추천안

Option B. 모듈은 사용자에게 제공하는 도메인 책임 기준으로 나눈다. 하나의 Service가 여러 aggregate를 조합하거나 raw query·advisory lock·pagination·재사용 query를 포함하면 Repository/Query 객체를 도입한다. 모듈 간에는 공개된 Service interface만 사용하고 다른 모듈의 Prisma 모델을 직접 조회하지 않는다.

### 추천 이유

`BACKEND_TASKS.md`의 “단순 CRUD마다 Repository를 무조건 만들지 않는다”는 방향을 유지하면서, 현재 규모가 커질 때 Service 비대화를 막는다.

### 영향 범위

- `backend/src/modules/**`
- `backend/src/prisma/**`
- Prisma query, transaction, 모듈 import/export 구조

## T1-03. Global Infrastructure Module 사용 기준

### 현재 상황

[코드에서 확인] `PrismaModule`과 `RedisModule`은 `@Global()`이며 모든 모듈에서 Service를 주입할 수 있다. Weather 외에도 향후 Redis를 사용할 수 있지만 현재는 날씨 캐시가 주 사용처다.

[미결정] 전역 모듈에 추가할 수 있는 인프라와 모듈에서 명시적으로 import해야 하는 기능의 기준이 없다.

### 왜 결정이 필요한가

전역 의존성은 편리하지만 어떤 모듈이 DB·Redis·외부 서비스를 사용하는지 import만으로 파악하기 어렵게 한다. 테스트에서 숨은 전역 상태가 생길 수도 있다.

### 선택 가능한 옵션

- Option A: 모든 공통 인프라를 Global로 제공한다
  - 장점: 모듈 설정과 import가 간단하다.
  - 단점: 의존성이 숨고 테스트 격리가 어려워진다.

- Option B: Prisma만 Global로 유지하고 기능별 인프라는 명시적으로 import한다
  - 장점: 모듈 관계와 기능 사용 범위가 명확하다.
  - 단점: import/export 설정이 늘어난다.

### 추천안

Option B. Prisma는 애플리케이션 공통 저장소로 Global을 유지하고, Redis·Queue·외부 Client 집합은 사용하는 도메인 모듈이 명시적으로 import한다. Global Service는 요청 상태나 사용자 상태를 보유하지 않는다.

### 추천 이유

현재 Redis가 선택적 성능 계층이므로 모든 모듈에 숨겨진 의존성을 제공할 필요가 없다. 향후 AI Queue가 추가될 때도 사용 모듈을 명확히 제한할 수 있다.

### 영향 범위

- `backend/src/prisma/prisma.module.ts`
- `backend/src/redis/redis.module.ts`
- `backend/src/app.module.ts`
- `backend/src/modules/**`

## T1-04. API Versioning과 레거시 계약 종료

### 현재 상황

[코드에서 확인] API에는 `/v1` prefix나 Nest versioning 설정이 없다. 기존 FastAPI 계약 호환을 위해 `/auth/login` 응답은 사용자 필드와 토큰을 함께 반환하고, 추천 생성은 `diagnosisId`와 레거시 `skinScore+weather`를 모두 허용한다.

[미결정] breaking change 시 versioning을 사용할지, 레거시 계약을 언제 제거할지 정해지지 않았다.

### 왜 결정이 필요한가

계약 호환을 위해 이전 형식을 계속 허용하면 서버가 오래된 입력을 영구 지원하게 된다. 반대로 예고 없이 제거하면 모바일 앱 업데이트 지연으로 장애가 난다.

### 선택 가능한 옵션

- Option A: URL versioning 없이 모든 변경을 하위 호환으로 처리한다
  - 장점: URL과 클라이언트 변경이 최소화된다.
  - 단점: DTO와 분기 로직이 누적된다.

- Option B: 현재 계약을 유지하고 breaking change부터 `/v1`과 deprecation 기간을 적용한다
  - 장점: 계약의 수명과 제거 시점을 관리할 수 있다.
  - 단점: 잠시 두 API 버전을 운영해야 한다.

### 추천안

Option B. 현재 경로는 호환 기간 동안 유지하되 신규 breaking API는 `/v1`을 사용한다. `POST /recommendations/generate`는 `diagnosisId` 전용으로 전환할 날짜와 client 최소 버전을 정하고, 레거시 입력은 경고 로그·metric 후 제거한다.

### 추천 이유

현재 프런트가 이미 `diagnosisId`를 사용하는 코드와 레거시 호환 분기를 함께 가지고 있으므로, 즉시 제거보다 명시적 전환 기간이 안전하다.

### 영향 범위

- `backend/src/main.ts`
- `backend/src/modules/recommendations/**`
- `backend/src/modules/auth/**`
- `src/api/client.ts`, 모바일 앱 배포·릴리스 정책

## T1-05. 성공 응답 Envelope와 null·빈 배열·404 기준

### 현재 상황

[코드에서 확인] 성공 응답은 대부분 배열 또는 DTO를 직접 반환한다. 데이터가 없을 때 진단 latest와 추천 상세는 404이고, 알림 설정은 기본값을 200으로 반환하며, Pattern은 404 대신 200 + `LOCKED`를 반환한다. 선택 지표는 `null`, 관련 제품 ID는 현재 빈 배열이다.

[미결정] 도메인별로 어떤 상태를 404·200 빈 배열·`null`·명시적 status로 표현할지, 성공 envelope를 도입할지 결정되지 않았다.

### 왜 결정이 필요한가

프런트가 “리소스 없음”, “아직 준비되지 않음”, “측정 불가”, “정상적인 빈 목록”을 구분해야 한다. 표현이 섞이면 화면 상태와 재시도 정책이 잘못된다.

### 선택 가능한 옵션

- Option A: 현재 도메인별 raw 응답을 유지한다
  - 장점: 기존 프런트 계약을 유지한다.
  - 단점: 새 API마다 응답 의미를 별도로 문서화해야 한다.

- Option B: 공통 envelope와 상태 표현을 도입한다
  - 장점: 응답 구조와 상태 처리가 통일된다.
  - 단점: 모든 프런트 파서와 기존 계약을 변경해야 한다.

### 추천안

Option A를 당장 유지하되 규칙을 문서화한다. 단일 리소스의 존재하지 않음은 404, 정상적인 목록 없음은 200 + `[]`, 측정·수집 불가는 해당 측정값 `null`과 source/status, 분석 데이터 부족은 200 + 도메인 상태(`LOCKED`)로 표현한다. 성공 envelope는 다음 major API version에서만 검토한다.

### 추천 이유

현재 프런트가 raw 배열과 DTO를 이미 사용하므로 API 계약을 지키면서 의미만 고정하는 것이 가장 안전하다.

### 영향 범위

- 모든 `backend/src/modules/**/dto/**`
- `backend/src/common/exceptions/**`
- `src/api/client.ts`, 화면별 loading/empty/error 처리

## T1-06. Error Response와 Custom Exception 사용 기준

### 현재 상황

[코드에서 확인] Global `HttpExceptionFilter`가 Nest 예외와 Prisma P2002/P2025/P2003, Multer 오류를 공통 포맷으로 변환한다. 알 수 없는 500 오류의 내부 메시지는 숨긴다. 도메인별 Custom Exception 계층과 stable error code는 없다.

[미결정] 언제 Nest 기본 예외를 사용하고 언제 도메인 예외·error code를 만들지 정해지지 않았다.

### 왜 결정이 필요한가

문자열 메시지를 계약으로 사용하면 문구 변경이 클라이언트 로직을 깨뜨린다. 예외가 Service마다 다르게 매핑되면 재시도 가능 오류와 사용자 입력 오류를 구분하기 어렵다.

### 선택 가능한 옵션

- Option A: Nest 기본 Exception과 문자열 메시지를 계속 사용한다
  - 장점: 구현이 단순하다.
  - 단점: 안정적인 기계 판별 값이 없다.

- Option B: 공통 Custom Exception과 stable error code를 도입한다
  - 장점: `AUTH_INVALID_TOKEN`, `RESOURCE_NOT_FOUND`, `AI_UNAVAILABLE` 등 정해진 코드로 클라이언트가 한국어 메시지를 파싱하지 않아도 되고, 로그·metric에서 오류 유형별 빈도를 집계할 수 있다.
  - 단점: error code 목록을 version 관리하고, 모든 Service에서 같은 코드를 사용하도록 매핑 표를 유지해야 하며, 신규 코드 추가 시 클라이언트 최소 버전과의 호환성을 고려해야 한다.

### 추천안

Option B. HTTP status는 현재 계약을 유지하고 `AUTH_INVALID_TOKEN`, `RESOURCE_NOT_FOUND`, `AI_UNAVAILABLE`, `WEATHER_UNAVAILABLE`, `VALIDATION_FAILED` 같은 내부 error code를 추가한다. 단순 입력 오류는 Nest 기본 예외를 허용하되, 반복되거나 재시도·화면 분기가 필요한 도메인 오류는 Custom Exception을 사용한다.

### 추천 이유

현재 `detail` 호환을 유지하면서도 향후 프런트가 한국어 메시지를 파싱하지 않게 할 수 있다.

### 영향 범위

- `backend/src/common/filters/http-exception.filter.ts`
- `backend/src/common/exceptions/**`
- 모든 Service, Swagger와 `src/api/client.ts`

---

# T2. PostgreSQL, Prisma 및 데이터 모델

## T2-01. SQLite 데이터 이전과 데이터 소유권

### 현재 상황

[코드에서 확인] `backend/app/`에는 과거 SQLite/SQLAlchemy 모델이 남아 있고 새 운영 스키마는 PostgreSQL + Prisma migration을 사용한다. `BACKEND_TASKS.md`는 기존 사용자·추천·진단을 단순 복사가 아닌 별도 정리 대상으로 설명하지만 실제 운영 데이터 이전 실행 절차는 없다.

[미결정] SQLite를 실제로 이전할지, 초기 사용자·추천·진단의 보존·중복·누락을 어떻게 처리할지 확정되지 않았다.

### 왜 결정이 필요한가

데이터를 잘못 병합하면 진단과 추천의 소유권이나 근거 연결이 깨질 수 있다. Access Token을 이전하지 않고 재로그인시키는 정책도 실제 이행 단계에서 명시되어야 한다.

### 선택 가능한 옵션

- Option A: 운영 전환 시 신규 PostgreSQL을 빈 DB로 시작한다
  - 장점: 이전 도구와 데이터 정합성 검증이 필요 없다.
  - 단점: 기존 사용자와 진단 이력을 잃는다.

- Option B: 검증된 일회성 migration/import를 수행한다
  - 장점: 사용자 데이터와 이력을 보존할 수 있다.
  - 단점: field mapping, 중복 제거, rollback·백업 절차가 필요하다.

### 추천안

Option B. 원본 SQLite 백업을 보존하고 staging에서 import를 검증한 뒤, User·Diagnosis·SkinMetric·Recommendation의 매핑 보고서를 생성한다. gender는 기존 데이터에 `null`, Access Token은 이전하지 않고 전원 재로그인, 중복 추천은 diagnosisId와 생성시각 기준으로 정리한다. import는 운영 트래픽과 분리된 일회성 명령으로 실행하고 건수·checksum을 확인한다.

### 추천 이유

기존 서비스의 사용자 경험을 보존하면서도 토큰과 민감정보를 그대로 이전하지 않을 수 있다.

### 영향 범위

- `backend/app/models.py`, `backend/app/database.py`
- `backend/prisma/schema.prisma`, `backend/prisma/seed.ts`
- import script, backup, 운영 전환 runbook

## T2-02. ID 생성 및 외부 공개 식별자 규칙

### 현재 상황

[코드에서 확인] User·일부 join 모델은 autoincrement Int이고 Diagnosis·WeatherSnapshot·Recommendation·RefreshSession은 UUID 또는 UUID 파생 문자열을 사용한다. 일부 추천 ID는 `gemini-` prefix를 붙인 random UUID 파생값이다.

[미결정] 내부 DB ID와 API 공개 ID를 같은 값으로 사용할지, 모델별 ID 규칙을 통일할지 정해지지 않았다.

### 왜 결정이 필요한가

숫자 ID를 외부에 노출하면 추측 가능한 리소스 열거 위험이 있고, prefix 규칙이 모듈마다 달라지면 추적·마이그레이션이 어렵다.

### 선택 가능한 옵션

- Option A: 현재 모델별 ID 방식을 유지한다
  - 장점: migration이 없다.
  - 단점: 규칙이 복잡하고 공개 ID 보호가 각 API에 의존한다.

- Option B: 내부 키와 공개 식별자를 분리한다
  - 장점: 외부 노출·마이그레이션·분산 생성 정책을 독립적으로 관리할 수 있다.
  - 단점: 컬럼과 mapping이 추가된다.

### 추천안

Option B를 신규 외부 리소스부터 적용한다. User 내부 ID는 Int로 유지하되 API에는 opaque public ID를 사용하고, Diagnosis·Recommendation·WeatherSnapshot은 UUID 계열 공개 ID를 유지한다. 생성 주체를 구분하는 prefix는 표시용으로만 사용하고 식별자 의미로 의존하지 않는다.

### 추천 이유

기존 DB를 크게 변경하지 않으면서 사용자 ID 열거를 줄이고, 분산·비동기 생성으로 확장하기 쉽다.

### 영향 범위

- `backend/prisma/schema.prisma`
- Auth/User 및 모든 `:id` Controller
- `src/types/**`, migration·seed·로그 correlation 필드

## T2-03. 삭제, Soft Delete와 보존 기간

### 현재 상황

[코드에서 확인] Soft Delete 필드는 없고 User 삭제 시 RefreshSession·Diagnosis·Recommendation·ConsentRecord·NotificationPreference가 Cascade된다. Diagnosis에서 Recommendation은 SetNull이고, RecommendationProduct는 양쪽 관계에서 Cascade다. 원본 이미지는 저장하지 않는다.

[미결정] 회원 탈퇴·개인정보 삭제·법적 보존·분석 데이터 보존을 물리 삭제와 Soft Delete 중 어떤 방식으로 처리할지 결정되지 않았다.

### 왜 결정이 필요한가

Cascade는 간단하지만 탈퇴 후 복구·감사·법정 보존을 어렵게 한다. Soft Delete를 도입하고 조회 조건을 빠뜨리면 삭제된 데이터가 사용자에게 노출될 수 있다.

### 선택 가능한 옵션

- Option A: 물리 삭제와 Cascade를 기본으로 한다
  - 장점: 개인정보 제거가 명확하고 조회가 단순하다.
  - 단점: 감사·분쟁 대응과 통계 재현이 어렵다.

- Option B: 사용자·진단 등 일부 aggregate에 Soft Delete와 보존 기간을 둔다
  - 장점: 유예 기간·감사·복구가 가능하다.
  - 단점: 모든 query에 삭제 조건과 purge 작업이 필요하다.

### 추천안

개인정보와 원본 이미지는 물리 삭제를 기본으로 하고, 법적·운영적으로 보존이 필요한 진단 결과만 별도 익명화 후 보존한다. Soft Delete는 User/Diagnosis에 도입할 경우 공통 repository/query 정책과 최종 purge 기한을 함께 만든다. 모든 FK의 Cascade/SetNull/Restrict 정책을 모델별 표로 확정한다.

### 추천 이유

현재 원본 이미지를 저장하지 않는 원칙과 충돌하지 않으면서, 탈퇴와 데이터 재현의 요구를 분리할 수 있다.

### 영향 범위

- `backend/prisma/schema.prisma`, 모든 migration
- Auth 탈퇴, Diagnosis/Recommendation 조회·삭제
- ConsentRecord, purge job, 개인정보 처리방침

## T2-04. 시간대와 날짜 필드 규칙

### 현재 상황

[코드에서 확인] Prisma DateTime은 UTC 기반으로 저장하고 API는 ISO 문자열을 반환한다. 생년월일은 UTC 자정으로 파싱하고, KMA·AirKorea의 KST 시각을 UTC로 변환한다. Pattern은 capturedAt을 날짜 단위로 잘라 distinct day를 계산한다.

[미결정] 사용자 날짜와 관측·수집 시각의 기준 시간대, 일자 경계, DST·서버 시간 동기화 정책이 문서화되지 않았다.

### 왜 결정이 필요한가

한국 날짜와 UTC 날짜가 자정에 달라지면 생년월일·진단 이력·패턴 수집일이 다르게 계산될 수 있다. 외부 API 관측 시각과 서버 수집 시각을 혼동하면 재현성이 떨어진다.

### 선택 가능한 옵션

- Option A: 모든 날짜를 서버 UTC 기준으로 계산한다
  - 장점: 분산 서버에서 일관되다.
  - 단점: 한국 사용자에게 날짜가 직관적이지 않다.

- Option B: 저장·전송은 UTC, 사용자·도메인 일자 계산은 서비스 기준 시간대(현재 KST)로 한다
  - 장점: 저장 표준과 사용자 의미를 모두 보존한다.
  - 단점: 날짜 계산 helper와 테스트가 필요하다.

### 추천안

Option B. instant는 UTC로 저장·전송하고, 생년월일과 패턴의 distinct day는 `Asia/Seoul` 기준으로 계산한다. 외부 관측 시각은 원문 시간대 변환 후 `observedAt`, 서버 수집 시각은 `collectedAt`으로 분리한다.

### 추천 이유

현재 외부 API가 KST를 사용하고 서비스 사용자가 한국인이라는 구현 사실을 유지하면서, DB와 API의 시간 표현은 표준화할 수 있다.

### 영향 범위

- `backend/src/modules/auth/auth.service.ts`
- `backend/src/modules/weather/clients/**`
- `backend/src/modules/pattern/pattern.service.ts`
- Prisma DateTime 필드, 테스트 fixture와 운영 서버 time sync

## T2-05. Transaction·Advisory Lock·Idempotency 적용 기준

### 현재 상황

[코드에서 확인] Diagnosis + SkinMetric, Recommendation 생성은 transaction을 사용한다. Diagnosis 중복 제출·WeatherSnapshot dedup·Recommendation 중복 생성에는 PostgreSQL advisory lock이 사용되고, 진단은 최근 60초 중복을 거부한다. 외부 Gemini 호출은 transaction/lock 전에 수행된다. WeatherSnapshot dedup 조건은 지역·측정소·관측 분이며 DB에는 그 조합을 강제하는 unique constraint가 없다.

[미결정] 어떤 요청을 idempotent로 볼지, lock key와 transaction 범위, 외부 호출과 저장의 순서를 어떻게 유지할지 기준이 없다.

### 왜 결정이 필요한가

재시도·동시 요청이 늘면 진단·추천·스냅샷이 중복되거나 AI 호출 비용이 중복된다. transaction 안에 느린 외부 호출을 넣으면 lock이 길어지고, 밖에 두면 중복 호출이 생긴다.

### 선택 가능한 옵션

- Option A: 현재처럼 도메인별 시간 창과 advisory lock을 조합한다
  - 장점: migration이 작고 현재 기능을 유지한다.
  - 단점: lock key·중복 정책을 각 Service가 따로 관리한다.

- Option B: API idempotency key와 DB unique/business key를 표준화한다
  - 장점: 재시도와 동시 요청의 결과를 명확히 재사용할 수 있다.
  - 단점: key 저장·만료·응답 재생 정책이 필요하다.

### 추천안

Option B를 외부 호출·비용이 큰 생성 API부터 적용한다. 클라이언트 idempotency key와 사용자·도메인 scope를 저장하고, DB unique key는 가능한 dedup 기준에 추가한다. 외부 호출은 lock 밖에서 수행하되 key 기반 상태를 `PROCESSING/COMPLETED/FAILED`로 관리하고, retry 시 동일 결과를 반환한다.

### 추천 이유

긴 외부 호출을 DB lock 안에 넣지 않으면서도 중복 비용과 부분 결과를 통제할 수 있다.

### 영향 범위

- `backend/src/modules/diagnosis/diagnosis.service.ts`
- `backend/src/modules/recommendations/recommendation.service.ts`
- `backend/src/modules/weather/weather.service.ts`
- Prisma unique/index, API DTO와 transaction 정책

## T2-06. Index와 대량 조회·Pagination 기준

### 현재 상황

[코드에서 확인] User phone, Diagnosis(userId,capturedAt), WeatherSnapshot(regionName,observedAt), Recommendation(userId,diagnosisId,createdAt) 등의 index가 있다. Diagnosis history, Product 목록, Recommendation 목록, Pattern 분석은 전체 행을 `findMany`로 읽고 pagination·limit·cursor가 없다. Pattern은 사용자 진단과 weather snapshot을 메모리에 적재한다.

[미결정] 목록 API와 분석 API의 최대 데이터량, pagination 방식, index 추가·삭제 검토 기준이 없다.

### 왜 결정이 필요한가

사용자 이력과 전역 카탈로그가 커지면 응답·메모리·DB 부하가 선형으로 증가한다. index가 실제 where/orderBy와 다르면 추가 비용만 생긴다.

### 선택 가능한 옵션

- Option A: 현재 전체 조회를 유지한다
  - 장점: API 계약과 구현이 단순하다.
  - 단점: 데이터 증가에 취약하다.

- Option B: 목록은 cursor pagination, 분석은 기간·샘플 상한과 집계 query를 사용한다
  - 장점: 응답 크기와 메모리를 제한할 수 있다.
  - 단점: 클라이언트와 query 설계가 변경된다.

### 추천안

Option B. 진단·추천·제품 목록은 기본 limit와 최대 limit를 문서화하고 cursor pagination을 적용한다. Pattern은 최근 기간 또는 최대 샘플 수를 정하고, query plan과 실제 cardinality를 기준으로 복합 index를 검토한다. Weather dedup query에 맞는 index와 RecommendationProduct 조회 index를 별도로 점검한다.

### 추천 이유

현재 API 계약을 유지하면서도 pagination을 선택적으로 추가할 수 있고, Pattern의 메모리 적재 위험을 줄일 수 있다.

### 영향 범위

- `backend/src/modules/diagnosis/**`
- `backend/src/modules/recommendations/**`
- `backend/src/modules/products/**`
- `backend/src/modules/pattern/**`
- `backend/prisma/schema.prisma`, migration, 프런트 pagination 상태

---

# T3. JWT 인증과 USER/ADMIN 권한

## T3-01. JWT 수명·전송·Refresh Token 저장 정책

### 현재 상황

[코드에서 확인] Access Token 기본 만료는 15분, Refresh Token 기본 만료는 14일이다. Refresh Token은 body로 받고 DB에는 SHA-256 hash를 저장하며, rotation 시 기존 session을 revoke한다. 앱은 `AsyncStorage`에 Access Token 중심으로 세션을 저장하고 자동 refresh는 구현되어 있지 않다.

[미결정] 운영에서의 최대 수명, refresh 전송 방식(body·HttpOnly cookie), 모바일 저장소, 탈취·재사용 대응 기준이 완전히 확정되지 않았다.

### 왜 결정이 필요한가

토큰은 계정 접근의 핵심 자격증명이다. 응답 body와 일반 저장소에 장기 토큰을 남기면 로그·백업·악성 앱 노출 위험이 있다.

### 선택 가능한 옵션

- Option A: 현재 body + AsyncStorage + 15분/14일 정책을 유지한다
  - 장점: 현재 프런트와 호환된다.
  - 단점: Refresh Token 보호와 자동 갱신이 약하다.

- Option B: 모바일 secure storage와 rotation/reuse detection을 표준으로 한다
  - 장점: 토큰 탈취 대응력이 높다.
  - 단점: 앱 변경과 세션 재발급 UX가 필요하다.

### 추천안

Option B. Access Token은 Bearer header로 유지하고, Refresh Token은 모바일 secure storage에만 저장한다. 웹을 추가할 경우 HttpOnly·Secure·SameSite cookie를 별도 정책으로 둔다. Access Token 15분, Refresh Token 14일은 초기 기본값으로 유지하되 환경별 최대값을 검증한다. rotation 실패·재사용 탐지 시 해당 세션 또는 사용자 세션을 폐기하고 401을 반환한다.

### 추천 이유

기존 API 계약을 크게 바꾸지 않으면서 장기 토큰의 보호와 재사용 대응을 강화할 수 있다.

### 영향 범위

- `backend/src/modules/auth/**`
- `backend/src/common/strategies/jwt.strategy.ts`
- `src/lib/session.ts`, `src/api/client.ts`
- 모바일 secure storage와 인증 e2e

## T3-02. Logout 범위와 세션 관리

### 현재 상황

[코드에서 확인] `POST /auth/logout`은 현재 사용자의 `revokedAt = null`인 모든 RefreshSession을 폐기한다. Service 주석에는 향후 userAgent/ipAddress로 디바이스별 범위를 좁힐 수 있다고 적혀 있지만 디바이스 ID나 세션 목록 API는 없다.

[미결정] 기본 로그아웃이 현재 디바이스만인지 모든 디바이스인지, 세션 관리 UI를 제공할지 정해지지 않았다.

### 왜 결정이 필요한가

모든 세션 폐기는 보안상 안전하지만 사용자가 다른 기기에서 갑자기 로그아웃된다. 반대로 현재 디바이스만 폐기하면 분실 기기 대응 기능이 필요하다.

### 선택 가능한 옵션

- Option A: 모든 세션을 폐기한다
  - 장점: 로그아웃 효과가 명확하고 단순하다.
  - 단점: 다른 디바이스의 정상 세션을 불필요하게 끊는다.

- Option B: 현재 세션 폐기와 전체 세션 폐기를 분리한다
  - 장점: UX와 보안을 모두 선택할 수 있다.
  - 단점: session 식별자와 세션 관리 API가 필요하다.

### 추천안

Option B. Refresh Token session에 공개하지 않는 session identifier를 연결하고, 기본 logout은 현재 세션, `logout-all`은 전체 세션으로 분리한다. 의심스러운 token reuse나 비밀번호·OTP 변경 시에는 전체 세션을 폐기한다.

### 추천 이유

현재 DB에 userAgent·ipAddress·session id가 이미 있어 점진적으로 구현할 수 있다.

### 영향 범위

- `backend/prisma/schema.prisma`
- `backend/src/modules/auth/auth.service.ts`
- Auth Controller/DTO, 모바일 계정 설정 화면

## T3-03. JWT Secret Rotation과 Refresh Hash 보호

### 현재 상황

[코드에서 확인] Access/Refresh secret은 서로 다른 환경변수이며 non-test에서 32자 이상을 요구한다. Refresh Token hash는 salt·pepper 없이 SHA-256으로 만든다. JWT payload에는 `sub`, `role`, `jti`가 들어가지만 key version은 없다.

[미결정] secret 교체 절차, 다중 key 검증 유예, hash pepper 관리, 유출 시 전체 세션 폐기 기준이 없다.

### 왜 결정이 필요한가

secret을 교체할 때 기존 Access Token을 즉시 모두 무효화할지, Refresh Token을 어떤 기간 인정할지 결정하지 않으면 배포 중 로그인 장애나 보안 공백이 발생한다.

### 선택 가능한 옵션

- Option A: secret을 환경변수로 교체하고 모든 토큰을 즉시 무효화한다
  - 장점: 절차가 단순하고 유출 대응이 빠르다.
  - 단점: 정상 사용자도 동시에 재로그인해야 한다.

- Option B: key id와 이전 key 검증 유예를 둔다
  - 장점: 무중단 rotation이 가능하다.
  - 단점: key 보관·만료·폐기 절차가 복잡하다.

### 추천안

Option B. JWT header의 `kid`와 활성/이전 key 목록을 Secret Manager에서 관리하고, 이전 key는 짧은 유예 기간만 검증한다. Refresh hash는 서버 pepper를 추가한 HMAC-SHA-256으로 새로 저장하며, secret 유출·대규모 이상 징후에는 전체 RefreshSession revoke를 수행한다.

### 추천 이유

운영 무중단과 긴급 폐기를 동시에 지원하면서 DB에 토큰 평문을 저장하지 않는 현재 방향을 유지할 수 있다.

### 영향 범위

- `backend/src/modules/auth/auth.service.ts`
- `backend/src/common/strategies/jwt.strategy.ts`
- `backend/src/config/env.validation.ts`
- Secret Manager, RefreshSession migration과 운영 runbook

## T3-04. 전화번호 로그인에서 OTP·본인확인 도입 기준

### 현재 상황

[코드에서 확인] `signup`과 `login` 모두 phoneNumber만 검증하며 비밀번호·OTP·SMS provider 호출이 없다. Controller Swagger에도 “비밀번호 없음 — MVP”라고 명시되어 있다.

[미결정] 전화번호 소유권을 확인할 시점과 운영 전환 조건이 정해지지 않았다.

### 왜 결정이 필요한가

현재 방식은 전화번호를 아는 누구나 로그인할 수 있어 실제 사용자 데이터와 진단 이력이 노출될 수 있다.

### 선택 가능한 옵션

- Option A: MVP 기간 동안 전화번호만 사용한다
  - 장점: 외부 SMS 비용과 가입 절차가 없다.
  - 단점: 운영 보안 기준을 만족하기 어렵다.

- Option B: 가입·새 디바이스 로그인에 OTP 또는 본인확인을 요구한다
  - 장점: 전화번호 소유권을 확인할 수 있다.
  - 단점: SMS provider, 재전송 제한, 비용과 개인정보 정책이 필요하다.

### 추천안

Option B를 운영 공개 전 필수 조건으로 둔다. 개발·테스트에서만 allowlisted test phone 또는 mock OTP를 허용하고 운영에서는 실제 OTP, 시도 횟수·만료·재전송 제한을 적용한다.

### 추천 이유

서비스가 다루는 진단과 개인정보의 민감도를 고려하면 전화번호 단독 인증은 임시 상태로만 허용해야 한다.

### 영향 범위

- `backend/src/modules/auth/**`
- OTP provider, Rate Limit, 사용자 onboarding과 개인정보 처리방침

## T3-05. Role 기반 권한과 Permission 도입 기준

### 현재 상황

[코드에서 확인] Role enum은 `USER`, `ADMIN` 두 값이고 `RolesGuard`가 `@Roles()` 메타데이터를 검사한다. 실제 `@Roles(Role.ADMIN)` route는 없다. Permission table·scope·resource action 모델도 없다.

[미결정] ADMIN 기능을 계속 Role 하나로 관리할지, 운영 기능이 늘면 permission/scope로 세분화할지 결정되지 않았다.

### 왜 결정이 필요한가

ADMIN에게 모든 운영 권한을 주면 최소 권한 원칙을 적용하기 어렵다. 반대로 너무 일찍 Permission을 도입하면 현재 규모에서 복잡도만 증가한다.

### 선택 가능한 옵션

- Option A: Role 기반만 유지한다
  - 장점: 현재 `Role.USER`/`Role.ADMIN` enum과 `RolesGuard` 하나로 인증 흐름이 끝나므로 추가 테이블·캐시·관리 화면 없이 구현과 검증이 가능하다.
  - 단점: ADMIN 한 명이 모든 운영 기능에 접근할 수 있어 최소 권한 원칙을 적용할 수 없고, 운영자 유형(예: 콘텐츠 관리자 vs 사용자 관리자)이 늘어나면 Role만으로는 세밀한 분리가 어렵다.

- Option B: Role은 묶음, Permission은 실제 action으로 분리한다
  - 장점: 운영자 유형과 resource별 권한을 세밀하게 관리할 수 있다.
  - 단점: 정책 저장·캐시·관리 화면이 필요하다.

### 추천안

현재는 Role 기반을 유지하되, 실제 ADMIN endpoint를 만들 때 `@Roles(Role.ADMIN)`와 감사 로그를 함께 추가한다. ADMIN 기능이 3개 이상의 독립된 action 또는 운영자 유형으로 나뉘는 시점에 Permission을 도입한다.

### 추천 이유

현재 ADMIN route가 없으므로 Permission을 미리 구현할 실익은 낮지만, 도입 기준은 지금 정해야 한다.

### 영향 범위

- `backend/src/common/decorators/roles.decorator.ts`
- `backend/src/common/guards/roles.guard.ts`
- 향후 `admin` module, Audit Log와 운영자 계정

## T3-06. 사용자 소유권 검사 표준

### 현재 상황

[코드에서 확인] Diagnosis와 Recommendation Service는 `userId` 비교 또는 userId 조건으로 소유권을 검사한다. Notification은 인증된 userId만 사용한다. 모든 리소스에 공통 ownership policy나 IDOR 회귀 테스트 규칙이 있는 것은 아니다.

[미결정] 소유권 검사를 Controller·Service·Repository 중 어디에서 강제할지, ADMIN 예외를 어떻게 처리할지 정해지지 않았다.

### 왜 결정이 필요한가

인증된 사용자라는 사실만으로 다른 사용자의 diagnosis·recommendation에 접근할 수 있어서는 안 된다. 새 endpoint에서 검사를 빠뜨리면 IDOR 취약점이 된다.

### 선택 가능한 옵션

- Option A: 각 Service가 개별적으로 검사한다
  - 장점: 현재 구조와 호환된다.
  - 단점: 누락 가능성이 높고 규칙이 중복된다.

- Option B: ownership query helper/repository와 공통 테스트 checklist를 둔다
  - 장점: 소유권 조건을 표준화할 수 있다.
  - 단점: query abstraction과 ADMIN 예외 설계가 필요하다.

### 추천안

Option B. Service가 `findOwned...` 형태의 query helper를 사용하고, Controller는 raw id를 Service에 전달한다. ADMIN은 명시적인 permission이 있을 때만 우회하도록 하며, 모든 사용자 리소스 endpoint에는 타 사용자 403/404 e2e 테스트를 필수로 둔다.

### 추천 이유

현재 Service 중심 책임 분리를 유지하면서 IDOR를 코드 리뷰와 테스트에서 반복 검증할 수 있다.

### 영향 범위

- `backend/src/modules/diagnosis/**`
- `backend/src/modules/recommendations/**`
- `backend/src/modules/notifications/**`
- Guard, Repository/query helper, e2e 테스트

---

# T4. 기존 Auth/User API 호환

## T4-01. 레거시 요청 계약의 Deprecation 정책

### 현재 상황

[코드에서 확인] `POST /recommendations/generate`는 `diagnosisId`가 있으면 서버 DB를 사용하고, 없으면 클라이언트가 보낸 `skinScore+weather`를 사용한다. `POST /products/weather-based`도 클라이언트 weather payload를 Gemini 입력으로 사용한다. 기존 `/auth/login`은 User 필드와 token을 함께 반환한다.

[미결정] 레거시 요청을 어느 기간 허용할지, 서버가 보낸 payload를 신뢰하는 방식의 종료 조건이 없다.

### 왜 결정이 필요한가

클라이언트 입력을 신뢰하면 사용자가 다른 피부·날씨 데이터를 추천 모델에 넣을 수 있고, 서버는 진단 근거를 재현할 수 없다. 호환 분기가 오래 남으면 최종 계약으로 이동하지 못한다.

### 선택 가능한 옵션

- Option A: 두 형식을 계속 허용한다
  - 장점: 구버전 앱이 계속 동작한다.
  - 단점: 보안·재현성·코드 복잡도 문제가 남는다.

- Option B: client 최소 버전과 종료일을 정해 diagnosisId 전용으로 전환한다
  - 장점: 서버가 소유권과 입력 근거를 통제한다.
  - 단점: 모바일 강제 업데이트 또는 버전 분기 운영이 필요하다.

### 추천안

Option B. `diagnosisId` 계약을 정식 계약으로 지정하고, 레거시 payload는 deprecation 로그와 metric을 남기는 한시적 호환으로만 유지한다. `products/weather-based`도 인증 여부와 무관하게 서버가 WeatherService에서 최신 스냅샷을 확인하는 방향을 확정한다.

### 추천 이유

이미 프런트 `src/api/client.ts`는 diagnosisId를 보낼 수 있고, 서버에도 소유권 검증 경로가 구현되어 있다.

### 영향 범위

- `backend/src/modules/recommendations/dto/generate-recommendation.dto.ts`
- `backend/src/modules/recommendations/recommendation.service.ts`
- `backend/src/modules/products/product.service.ts`
- `src/api/client.ts`, 앱 최소 버전·릴리스 정책

---

# T5. Weather 모듈과 외부 API

## T5-01. 기본 지역 결정 원천

### 현재 상황

[코드에서 확인] 좌표가 없거나 측정소 조회가 실패하면 `KMA_AREA_NO`, `AIRKOREA_STATION_NAME` 환경변수 또는 `DEFAULT_REGION`을 사용한다. 좌표가 있을 때는 region registry와 실제 근접 측정소 조회를 조합한다.

[미결정] 기본 지역을 환경변수로 운영할지, 버전 관리되는 Region registry 또는 사용자 프로필을 기준으로 할지 확정되지 않았다.

### 왜 결정이 필요한가

기본 지역이 서버 환경에 묶이면 모든 사용자가 같은 지역을 볼 수 있고, 환경변수 변경이 데이터 재현성에 영향을 준다.

### 선택 가능한 옵션

- Option A: 운영 환경변수로 기본 지역을 지정한다
  - 장점: 설정이 쉽고 장애 fallback이 빠르다.
  - 단점: 지역 데이터와 설정 변경 이력이 분리된다.

- Option B: versioned registry와 사용자 선택 지역을 사용한다
  - 장점: 코드·데이터로 재현 가능하고 사용자별 기본값을 지원한다.
  - 단점: 지역 registry 관리와 사용자 설정이 필요하다.

### 추천안

Option B. registry를 정확한 area/station mapping의 기준으로 삼고, 환경변수는 bootstrap fallback 또는 기본 region key만 지정한다. 위치 권한 거부 시 사용자 선택 지역이 있으면 우선 사용하고 없을 때만 서비스 기본 지역을 사용한다.

### 추천 이유

현재 `RegionRegistry`와 환경변수가 모두 존재하는 과도기 구조를 명확히 정리할 수 있다.

### 영향 범위

- `backend/src/modules/weather/regions/**`
- `backend/src/config/env.validation.ts`
- `WeatherService`, 사용자 위치·지역 설정 API

## T5-02. 외부 API Timeout·Retry·Circuit Breaker 정책

### 현재 상황

[코드에서 확인] KMA, AirKorea, 근접 측정소 Client의 timeout은 각 8초이고 Gemini는 15초이다. fetch timeout은 구현되어 있으나 명시적 retry와 circuit breaker는 없다. 외부 API 실패는 해당 값 `null` 또는 Gemini 503으로 처리한다.

[미결정] HTTP 상태별 retry, 전체 요청 timeout budget, 외부 API 연속 장애 차단 기준이 없다.

### 왜 결정이 필요한가

세 외부 날씨 호출이 순차적으로 지연되면 한 요청이 긴 시간 동안 연결을 점유할 수 있다. 무제한 재시도는 정부 API 장애를 악화시키고, 재시도하지 않으면 일시적 네트워크 오류를 모두 unavailable로 처리한다.

### 선택 가능한 옵션

- Option A: 현재 timeout만 유지하고 실패를 즉시 반영한다
  - 장점: 흐름이 단순하고 외부 장애를 증폭하지 않는다.
  - 단점: 일시 장애 복구와 사용자 성공률이 낮다.

- Option B: 제한적 retry와 circuit breaker를 적용한다
  - 장점: 일시 오류를 흡수하고 지속 장애 시 빠르게 실패한다.
  - 단점: 상태 관리·metric·튜닝이 필요하다.

### 추천안

Option B. timeout을 endpoint별로 유지하되 전체 `/weather`·AI 요청 budget을 별도로 둔다. 연결/5xx/429만 짧은 exponential backoff + jitter로 1~2회 재시도하고 4xx·잘못된 응답은 재시도하지 않는다. 연속 실패율·open 시간·half-open probe 기준을 endpoint별로 문서화한다.

### 추천 이유

외부 API를 보호하면서도 일시적인 네트워크 오류를 일부 흡수할 수 있다. 현재 Client가 분리되어 있어 endpoint별 정책을 적용하기 쉽다.

### 영향 범위

- `backend/src/modules/weather/clients/**`
- `backend/src/modules/gemini/gemini.client.ts`
- `WeatherService`, `ProductService`, `RecommendationService`, metric·alert 설정

## T5-03. 부분 실패와 WeatherSnapshot 품질 기준

### 현재 상황

[코드에서 확인] UV·오존·PM·CAI·NO2·SO2·CO는 각각 nullable이고, 하나의 지표가 실패해도 다른 지표는 응답한다. 모든 주요 지표가 null이면 `UNAVAILABLE`이며 진단은 날씨 snapshot 없이 계속할 수 있다.

[미결정] 어떤 지표 조합이면 응답을 `LIVE`로 인정할지, 부분 데이터로 추천·패턴 분석을 수행할지 기준이 없다.

### 왜 결정이 필요한가

현재 `anyUv || anyAir` 기준은 “일부 값이 있음”과 “추천에 충분함”을 구분하지 않는다. 데이터 품질이 낮은 snapshot을 AI나 상관 분석에 사용하면 잘못된 결과가 나온다.

### 선택 가능한 옵션

- Option A: 값 하나라도 있으면 LIVE로 취급한다
  - 장점: 데이터가 적어도 응답이 가능하다.
  - 단점: 기능별 최소 품질이 보장되지 않는다.

- Option B: 목적별 completeness 기준을 둔다
  - 장점: 날씨 화면·추천·패턴이 필요한 데이터만 사용한다.
  - 단점: 품질 기준과 상태 문서가 추가된다.

### 추천안

Option B. Weather 화면은 field-level null을 허용하고, Recommendation은 필수 입력이 부족하면 생성하지 않거나 근거 부족 상태를 반환하며, Pattern은 pairwise 유효 쌍 기준으로만 계산한다. source는 수집 출처이고 completeness는 별도 계산 필드 또는 서비스 정책으로 관리한다.

### 추천 이유

화면 표시와 AI·통계 입력의 품질 요구가 다르므로 하나의 `LIVE` 값만으로 모두 판단하면 안 된다.

### 영향 범위

- `backend/src/modules/weather/**`
- `backend/src/modules/recommendations/**`
- `backend/src/modules/pattern/**`
- Weather DTO, EvidencePolicy와 프런트 상태 처리

---

# T6. 날씨 이력 저장

## T6-01. WeatherSnapshot 보존·익명화·정리 정책

### 현재 상황

[코드에서 확인] WeatherSnapshot은 regionName, cityName, latitude, longitude, 측정소, 관측·수집 시각과 지표를 영구 저장한다. UNAVAILABLE row는 저장하지 않지만 정상 snapshot의 자동 purge 정책은 없다. Diagnosis가 snapshot id를 참조한다.

[미결정] 날씨 이력의 보존 기간, 좌표 정밀도·익명화, 진단에 연결된 snapshot의 보존 예외가 정해지지 않았다.

### 왜 결정이 필요한가

정밀 좌표는 개인 위치 정보가 될 수 있고, snapshot이 무한히 쌓이면 DB 비용이 증가한다. 진단 재현에는 필요하지만 모든 원시 위치를 영구 보존할 필요는 없다.

### 선택 가능한 옵션

- Option A: 모든 snapshot을 장기 보존한다
  - 장점: 분석과 재현이 쉽다.
  - 단점: 개인정보와 저장 비용이 커진다.

- Option B: 기간·연결 여부에 따라 보존·익명화한다
  - 장점: 데이터 최소화와 재현성을 균형 있게 유지한다.
  - 단점: purge·익명화 job이 필요하다.

### 추천안

Option B. 진단에 연결된 snapshot은 진단 보존 기간 동안 지역 단위로 보존하고 정밀 좌표는 필요 시 반올림 또는 제거한다. 연결되지 않은 중복 snapshot은 짧은 보존 기간 후 purge한다. 보존 기간, 사용자 탈퇴 시 처리, 분석용 익명화 기준을 운영 정책으로 고정한다.

### 추천 이유

현재 snapshot은 개인 진단의 환경 근거이므로 무조건 삭제할 수는 있지만, 위치 데이터를 원시 그대로 무기한 저장할 이유도 없다.

### 영향 범위

- `backend/prisma/schema.prisma`
- `backend/src/modules/weather/weather.service.ts`
- `Diagnosis.weatherSnapshotId`, purge/retention job, 개인정보 정책

## T6-02. WeatherSnapshot Dedup과 Index 정합성

### 현재 상황

[코드에서 확인] `WeatherService.persist()`는 regionName·kmaAreaNo·airkoreaStation·관측 분을 advisory lock과 `findFirst`로 dedup한다. DB index는 `(regionName, observedAt)`이고 해당 조합의 unique constraint는 없다. 좌표·수집 시각이 달라도 같은 관측 분이면 기존 row를 재사용한다.

[미결정] dedup business key를 DB 수준에서 보장할지, 서로 다른 source·측정소·좌표를 어느 범위에서 동일 snapshot으로 볼지 정해지지 않았다.

### 왜 결정이 필요한가

애플리케이션 lock만으로는 다른 writer·migration script·운영 도구의 중복 저장을 막지 못한다. 쿼리 조건과 index가 어긋나면 dedup이 느려질 수 있다.

### 선택 가능한 옵션

- Option A: advisory lock + findFirst를 유지한다
  - 장점: 현재 schema 변경이 없다.
  - 단점: DB가 uniqueness를 보장하지 않는다.

- Option B: 정규화된 business key/hash를 저장하고 unique index를 추가한다
  - 장점: 모든 writer에 대해 중복을 방지한다.
  - 단점: 기존 데이터 정리와 migration이 필요하다.

### 추천안

Option B. region·area·station·observed minute·source context를 정규화한 dedup key를 정의하고 unique index 또는 별도 key column으로 보장한다. advisory lock은 동시 충돌 완화용으로 유지하되 데이터 정합성의 최종 책임은 DB에 둔다. query와 index가 동일한 필드를 사용하도록 `EXPLAIN`으로 검증한다.

### 추천 이유

날씨 수집은 여러 요청·job·fallback 경로에서 호출될 수 있으므로 DB 제약이 가장 안전하다.

### 영향 범위

- `backend/src/modules/weather/weather.service.ts`
- `backend/prisma/schema.prisma`, migration
- `backend/test/weather-persist.e2e-spec.ts`

---

# T7. Recommendation/Product 모듈

## T7-01. 날씨 기반 제품 생성 결과의 저장·Cache 정책

### 현재 상황

[코드에서 확인] `POST /products/weather-based`는 클라이언트 weather payload를 받아 Gemini로 제품 3개를 생성하며 DB에 저장하지 않는다. 결과 ID는 요청마다 random으로 생성된다. `Product` catalog 목록은 DB seed를 조회한다.

[미결정] 날씨 기반 생성 결과를 저장·재사용할지, Redis cache 대상인지, 결과의 유효 기간과 재현 키를 정하지 않았다.

### 왜 결정이 필요한가

요청마다 AI를 호출하면 비용과 지연이 커지고 같은 날씨에 다른 결과가 나올 수 있다. 반대로 저장하면 가상 제품 결과의 수명과 개인정보·근거 정책을 관리해야 한다.

### 선택 가능한 옵션

- Option A: 매 요청 Gemini 생성, 저장하지 않는다
  - 장점: 저장 데이터가 늘지 않고 최신 prompt를 즉시 반영한다.
  - 단점: 비용·지연·결과 변동이 크다.

- Option B: 정규화한 weather input과 policy/model version으로 단기 cache한다
  - 장점: 같은 조건의 중복 호출을 줄이고 결과를 재현할 수 있다.
  - 단점: cache key·TTL·정책 변경 무효화가 필요하다.

### 추천안

Option B. 사용자 피부 데이터가 없는 공개 날씨 제품 결과는 개인정보 없이 지역·관측시각·model/prompt version을 key로 단기 cache한다. 영구 Recommendation row는 만들지 않고, source·생성 시각·유효 기간을 응답에 필요할 때만 노출한다.

### 추천 이유

현재 결과가 user 비종속이고 저장하지 않는 방향을 유지하면서 AI 호출 비용을 줄일 수 있다.

### 영향 범위

- `backend/src/modules/products/product.service.ts`
- `backend/src/modules/gemini/gemini.client.ts`
- `backend/src/redis/**`, `ProductDto`, 공개 API rate limit

## T7-02. RecommendationProduct 관계와 relatedProductIds 책임

### 현재 상황

[코드에서 확인] Prisma에는 `RecommendationProduct` 중간 테이블과 unique constraint가 있지만 `RecommendationService.modelToDto()`와 `templateToDto()`는 `relatedProductIds`를 항상 빈 배열로 반환한다. Product 응답의 `recommendationId`도 null이다.

[미결정] 중간 테이블을 실제 추천-제품 관계로 사용할지, 단순히 미래 확장용으로 둘지 결정되지 않았다.

### 왜 결정이 필요한가

현재 schema와 API 응답이 서로 다른 모델을 표현한다. 관계를 쌓아두고 응답에 반영하지 않으면 데이터만 남고 의미가 불분명해진다.

### 선택 가능한 옵션

- Option A: 관계 테이블을 유지하되 현재 API에서는 사용하지 않는다
  - 장점: 당장 계약 변경이 없다.
  - 단점: dead schema와 빈 응답이 유지된다.

- Option B: 추천 생성·조회 시 관계를 저장하고 `relatedProductIds`를 반환한다
  - 장점: DB 모델과 API가 일치한다.
  - 단점: product matching 기준과 transaction을 확정해야 한다.

### 추천안

Option B를 제품 매칭 규칙 확정 후 적용한다. Recommendation과 Product 연결은 하나의 transaction에서 저장하고 displayOrder를 보존하며, 관계가 없을 때만 `[]`를 반환한다. 전역 template과 사용자 생성 Recommendation의 제품 연결 가능 범위를 별도로 정한다.

### 추천 이유

이미 schema와 DTO 필드가 존재하므로 장기적으로 관계를 실제 데이터로 만들지 않는 편이 더 큰 혼란을 만든다.

### 영향 범위

- `backend/prisma/schema.prisma`
- `backend/src/modules/recommendations/**`
- `backend/src/modules/products/**`
- seed, migration, API contract 테스트

## T7-03. Recommendation 생성 Idempotency 범위

### 현재 상황

[코드에서 확인] diagnosisId가 있으면 기존 Recommendation을 조회하고 transaction 안 advisory lock 후 다시 조회한다. diagnosisId가 없는 레거시 skinScore+weather 모드에서는 user 기준 lock key를 사용하지만 같은 입력에 대한 결과 식별자는 없다.

[미결정] 동일 진단의 재생성·prompt 변경·AI 결과 변경을 허용할지, 버전을 어떻게 관리할지 정해지지 않았다.

### 왜 결정이 필요한가

추천 결과가 바뀌면 사용자에게 어떤 근거로 생성됐는지 재현하기 어렵고, 무조건 기존 결과를 반환하면 정책 변경이 반영되지 않는다.

### 선택 가능한 옵션

- Option A: diagnosisId당 최초 결과만 불변으로 유지한다
  - 장점: 재현성과 중복 방지가 쉽다.
  - 단점: 모델·근거 정책 개선을 기존 진단에 반영하기 어렵다.

- Option B: model/prompt version별 결과를 여러 개 보존한다
  - 장점: 재생성·비교·감사가 가능하다.
  - 단점: 기본 결과 선택과 저장량이 복잡하다.

### 추천안

Option A를 기본으로 한다. 정책이나 모델이 바뀌면 명시적 `regenerate` 명령으로 새 version을 만들고 이전 결과를 보존한다. 레거시 입력은 idempotency를 보장하지 않는 호환 모드로 표시하고 deprecation 기간에 제거한다.

### 추천 이유

현재 제품의 추천은 진단 근거와 연결되어 있으므로 최초 결과의 불변성이 사용자 설명과 테스트에 유리하다.

### 영향 범위

- `backend/src/modules/recommendations/recommendation.service.ts`
- Recommendation schema, model/prompt version 필드
- AI 비용·재생성 API·e2e 테스트

---

# T8. Gemini와 근거 정책

## T8-01. LLM Prompt·Evidence Policy 변경 승인과 Version

### 현재 상황

[코드에서 확인] `GeminiClient`는 system prompt, JSON schema, ingredient whitelist, `EvidencePolicy` 사후 검증을 사용한다. grade와 sourceLabel은 서버가 고정하고 정책 위반 시 503을 반환한다. Prompt와 금지어 목록은 소스 코드 상수이며 결과에 prompt/model version을 저장하지 않는다.

[미결정] prompt·금지어·허용 성분·모델 변경의 승인자, versioning, rollback, 의료·법무 검토 기준이 없다.

### 왜 결정이 필요한가

문구 하나가 추천의 근거와 사용자 안전에 영향을 주며, 모델이 바뀌면 같은 입력의 결과가 달라진다. 어떤 버전에서 생성된 추천인지 추적할 수 있어야 한다.

### 선택 가능한 옵션

- Option A: 코드 리뷰와 git history만으로 관리한다
  - 장점: `SYSTEM_PROMPT` 상수와 `EvidencePolicy` 금지어 목록을 코드로 관리하므로 별도 version registry나 승인 절차 없이 PR 리뷰로 변경을 추적할 수 있다.
  - 단점: 생성된 Recommendation에 prompt/model version이 기록되지 않으므로, 과거 추천이 어떤 prompt로 생성되었는지 재현할 수 없고, 정책 변경 후 이전 결과와 새 결과를 비교하거나 rollback하기 어렵다.

- Option B: prompt/policy/model version과 승인 기록을 관리한다
  - 장점: 재현·감사·rollback이 가능하다.
  - 단점: version registry와 승인 절차가 필요하다.

### 추천안

Option B. 모든 생성 결과에 provider/model/prompt/evidence policy version을 기록하고, 의료적 표현·성분 whitelist·sourceLabel 변경은 별도 리뷰와 회귀 테스트를 통과해야 한다. 정책 위반률과 503 비율을 metric으로 추적한다.

### 추천 이유

현재 이미 EvidencePolicy가 별도 계층으로 분리되어 있으므로 version과 승인 메타데이터를 추가하는 방향이 자연스럽다.

### 영향 범위

- `backend/src/modules/gemini/**`
- `backend/src/modules/recommendations/**`
- `Product`/`Recommendation` schema, migration, 운영 승인 문서

## T8-02. AI 입력의 개인정보 최소화와 외부 전송 기준

### 현재 상황

[코드에서 확인] RecommendationService는 diagnosisId 방식에서 피부 점수·부위 metric·thumbnailUri·weather를 Gemini 입력 객체로 구성한다. 현재 원본 이미지 buffer는 InferenceProvider에만 전달되고 저장하지 않지만, LLM으로 전송되는 field의 최소화·보존·provider 학습 사용 정책은 없다.

[미결정] Gemini에 보낼 수 있는 사용자 데이터, 외부 provider의 저장·학습 사용 여부, 민감정보 제거 규칙이 정해지지 않았다.

### 왜 결정이 필요한가

진단 데이터는 민감정보가 될 수 있으며, 외부 AI provider로 보내면 국내외 개인정보 처리와 동의 범위가 문제가 된다.

### 선택 가능한 옵션

- Option A: 현재 DTO 전체를 외부 AI에 전달한다
  - 장점: 추천 문맥이 풍부하다.
  - 단점: 과도한 개인정보 전송과 보존 위험이 있다.

- Option B: 필요한 지표만 최소화하고 외부 학습·보존을 제한한다
  - 장점: 개인정보 노출과 규제 위험을 줄인다.
  - 단점: prompt mapping과 provider 계약 검토가 필요하다.

### 추천안

Option B. User ID·전화번호·생년월일·정밀 좌표·thumbnailUri는 LLM 입력에서 제거하고, 추천에 필요한 익명화된 측정값·환경값만 전송한다. provider의 retention/training opt-out 계약을 확인하고, ConsentRecord의 목적·version과 연결한다.

### 추천 이유

피부 추천에 사용자 식별 정보가 필요하지 않으며, 데이터 최소화가 기능을 거의 해치지 않는다.

### 영향 범위

- `backend/src/modules/recommendations/recommendation.service.ts`
- `backend/src/modules/gemini/gemini.client.ts`
- `ConsentRecord`, 개인정보 처리방침, 외부 AI provider 계약

## T8-03. Gemini Timeout과 AI 비동기 처리 기준

### 현재 상황

[코드에서 확인] Gemini 호출은 동기 HTTP 흐름에서 수행되고 timeout은 15초이다. 실패하면 503을 반환하며 mock fallback은 production에서 차단된다. 실제 Python InferenceProvider와 AI 작업 큐는 보류되어 있다.

[미결정] AI 호출을 요청-응답으로 계속 처리할지, 요청 수·파일 크기·지연이 증가하면 비동기 job으로 전환할지 기준이 없다.

### 왜 결정이 필요한가

동기 AI 요청은 모바일 네트워크와 서버 worker를 오래 점유한다. 비동기로 바꾸면 상태 조회·알림·재시도·중복 정책이 필요하다.

### 선택 가능한 옵션

- Option A: 모든 AI를 동기 처리한다
  - 장점: API와 프런트 흐름이 단순하다.
  - 단점: timeout과 worker 점유 문제가 있다.

- Option B: 긴 작업은 queue + job status로 처리한다
  - 장점: 재시도·확장·장시간 추론에 유리하다.
  - 단점: Redis Queue/worker/상태 API를 운영해야 한다.

### 추천안

현재 Gemini 추천은 동기를 유지하되 전체 요청 budget과 Rate Limit을 적용한다. 이미지 추론 또는 p95가 합의한 임계값을 넘는 작업은 `PENDING → COMPLETED/FAILED` job으로 전환하고, Redis AI 작업 큐는 Python provider가 준비되는 별도 작업에서 도입한다.

### 추천 이유

현재 T9가 실제 inference provider를 보류하고 있어 즉시 queue를 구현하는 것은 범위를 넓힌다. 다만 전환 기준을 지금 정의해야 한다.

### 영향 범위

- `backend/src/modules/gemini/**`
- `backend/src/modules/diagnosis/**`
- `Diagnosis.status`, Redis/Queue, 모바일 polling 또는 notification

---

# T9. 진단 도메인 기반

## T9-01. InferenceProvider 운영 전환과 Diagnosis Status

### 현재 상황

[코드에서 확인] `InferenceProvider` interface와 `MockInferenceProvider`가 있으며, production에서 mock은 fail-closed된다. 실제 provider가 없으면 진단 요청은 503이다. Schema에는 PENDING·COMPLETED·FAILED가 있지만 현재 submit 흐름은 성공 결과를 transaction으로 저장하고 실패 상태 row를 일반적으로 저장하지 않는다.

[미결정] Python provider 전환 시 동기·비동기 방식, status의 각 전이와 실패 결과 보존 여부가 정해지지 않았다.

### 왜 결정이 필요한가

진단이 오래 걸리거나 실패할 때 클라이언트가 무한 재시도하거나 중복 요청을 만들 수 있다. PENDING/FAILED enum이 실제 계약으로 쓰이지 않으면 모델의 의미가 불명확하다.

### 선택 가능한 옵션

- Option A: 추론 완료까지 동기로 처리하고 실패 row를 만들지 않는다
  - 장점: 현재 API와 DB 흐름이 단순하다.
  - 단점: 장시간 작업·실패 이력·재처리가 어렵다.

- Option B: Diagnosis를 job 상태로 관리한다
  - 장점: 상태 조회, 재시도, 운영 추적이 가능하다.
  - 단점: 비동기 API와 worker가 필요하다.

### 추천안

Option A를 현재 Gemini·Mock 범위에서 유지하되, 실제 Python inference가 연결되거나 p95가 정한 기준을 넘으면 Option B로 전환한다. 그때 `PENDING → COMPLETED/FAILED` 전이, 실패 사유의 외부 노출 여부, 재시도 횟수와 terminal state를 명시한다.

### 추천 이유

현재 작업 범위를 유지하면서 이미 schema에 있는 상태 필드의 미래 의미를 명확히 할 수 있다.

### 영향 범위

- `backend/src/modules/diagnosis/**`
- `backend/prisma/schema.prisma`
- Python inference service, job queue, diagnosis API와 프런트 상태 화면

## T9-02. 이미지 업로드 메모리·동시성·검증 정책

### 현재 상황

[코드에서 확인] `FileFieldsInterceptor`는 memoryStorage를 사용하고 front/left/right 3개, 각 10MB, files 3, parts 6으로 제한한다. Service는 MIME·파일 signature·size를 재검증하고 원본을 저장하지 않는다. 전체 동시 업로드 수와 process memory budget은 없다.

[미결정] 동시 업로드 제한, reverse proxy body limit, 이미지 변환·바이러스 검사, 요청 취소 시 buffer 정리 기준이 없다.

### 왜 결정이 필요한가

요청당 30MB까지 메모리에 적재될 수 있어 동시 요청이 많으면 OOM이 발생할 수 있다. MIME만 검사해도 악성·비정상 이미지가 inference provider로 전달될 수 있다.

### 선택 가능한 옵션

- Option A: 현재 memoryStorage와 파일 검증만 유지한다
  - 장점: `FileFieldsInterceptor`와 `memoryStorage`로 디스크 I/O 없이 InferenceProvider에 buffer를 바로 전달할 수 있어 구현이 단순하다.
  - 단점: 요청당 최대 3×10MB = 30MB가 process memory에 적재되므로 동시 사용자가 늘면 Node.js heap 제한을 넘을 수 있고, MIME과 magic byte만 검사해 악의적으로 조작된 이미지나 대량 업로드 공격을 막기 어렵다.

- Option B: 스트리밍/임시 객체 저장과 동시성·콘텐츠 검사 기준을 둔다
  - 장점: 메모리 사용을 제한하고 안전 검사를 확장할 수 있다.
  - 단점: 임시 파일 정리와 저장소 보안이 필요하다.

### 추천안

Option B를 운영 트래픽 전에 적용한다. proxy·Nest·provider의 최대 크기를 일치시키고 사용자·인스턴스별 동시 업로드 제한을 둔다. 원본 영구 저장은 하지 않으며, 필요하면 암호화된 짧은 TTL 임시 저장소와 정리 job을 사용한다. 이미지 decoder 기반 콘텐츠 검사를 추가한다.

### 추천 이유

현재 3 × 10MB 제한은 입력 검증일 뿐 전체 메모리 보호가 아니다. 진단 데이터의 민감도와 비용을 고려하면 concurrency budget이 필요하다.

### 영향 범위

- `backend/src/modules/diagnosis/diagnosis.controller.ts`
- `backend/src/modules/diagnosis/diagnosis.service.ts`
- Docker/reverse proxy, InferenceProvider, Rate Limit과 memory monitoring

## T9-03. ConsentRecord와 개인정보 사용 목적

### 현재 상황

[코드에서 확인] `ConsentRecord` 모델은 userId·type·agreed·version·createdAt을 저장하지만 진단 upload, Gemini 전송, 이미지 비저장 동의 API와 연결되어 있지 않다. 원본 이미지는 현재 저장하지 않는다.

[미결정] 어떤 동의가 필수인지, 동의 version 변경·철회·재동의·탈퇴 시 기록을 어떻게 처리할지 결정되지 않았다.

### 왜 결정이 필요한가

모델만 있고 실제 동의 검사가 없으면 저장된 consent가 법적·운영적 증거로 기능하지 못한다. AI 외부 전송과 얼굴 이미지 처리는 목적별 동의가 필요할 수 있다.

### 선택 가능한 옵션

- Option A: ConsentRecord를 기록용으로만 유지한다
  - 장점: 현재 API 변경이 없다.
  - 단점: 동의 없는 민감 처리와 버전 불일치를 막지 못한다.

- Option B: 목적·version별 동의를 기능 진입 조건으로 사용한다
  - 장점: 동의 상태와 실제 처리 흐름이 일치한다.
  - 단점: 동의 API·철회·기존 사용자 migration이 필요하다.

### 추천안

Option B. `diagnosis_image_processing`, `ai_recommendation_data_transfer` 등 목적을 enum 또는 registry로 관리하고, 필수 동의 version이 없으면 해당 기능을 거부한다. 철회 이후 신규 처리와 보존 데이터를 어떻게 다룰지 별도 정책으로 두며 audit 대상에 포함한다.

### 추천 이유

현재 ConsentRecord 구조를 활용해 기능별 사용 목적과 동의 상태를 연결할 수 있다.

### 영향 범위

- `backend/prisma/schema.prisma`
- Auth/onboarding, Diagnosis, Gemini modules
- `ConsentRecord`, 개인정보 처리방침·탈퇴·audit log

## T9-04. 진단 중복 제출과 Idempotency Window

### 현재 상황

[코드에서 확인] 동일 사용자의 최근 60초 Diagnosis가 있으면 제출을 거부하고, transaction 안에서도 advisory lock으로 race condition을 줄인다. 이 정책은 모든 재시도와 실제 작업 실패를 구분하지 않는다.

[미결정] 60초가 비즈니스 정책인지 기술적 방어인지, 실패·취소·네트워크 timeout 뒤 재제출을 어떻게 허용할지 정해지지 않았다.

### 왜 결정이 필요한가

사용자가 응답을 받지 못한 정상 요청을 재시도할 때 60초 동안 막힐 수 있다. 반대로 window가 짧으면 동일 이미지가 중복 저장될 수 있다.

### 선택 가능한 옵션

- Option A: 현재 60초 시간 창을 유지한다
  - 장점: advisory lock과 `findFirst`로 동일 사용자의 60초 이내 진단을 거부하므로 추가 저장소나 클라이언트 변경 없이 중복을 즉시 줄일 수 있다.
  - 단점: 사용자가 응답을 받지 못해 정상적으로 재시도한 요청도 60초 동안 400으로 거부되고, 네트워크 timeout과 실제 중복 요청을 구분하지 못해 모바일 환경에서 사용자 경험이 나빠진다.

- Option B: client idempotency key와 이미지/request fingerprint를 사용한다
  - 장점: 같은 요청 재시도와 새 진단을 구분한다.
  - 단점: key 수명·hash 개인정보·저장 정책이 필요하다.

### 추천안

Option B. 모바일은 제출마다 idempotency key를 생성하고, 서버는 user scope에서 짧은 기간 저장한다. 같은 key는 처리 중이면 상태를 반환하고 완료되면 기존 결과를 재생한다. 60초 시간 창은 추가 안전장치로 유지하되 새로운 요청을 무조건 차단하는 기준으로 의존하지 않는다.

### 추천 이유

네트워크 재시도가 많은 모바일 환경에서 사용자 경험과 중복 방지를 모두 개선할 수 있다.

### 영향 범위

- `backend/src/modules/diagnosis/**`
- Diagnosis schema·idempotency 저장소
- `src/api/client.ts`, 업로드 e2e와 Rate Limit

---

# T10. 개인 패턴 분석 API

## T10-01. 최소 진단 샘플 수 정책

### 현재 상황

[코드에서 확인] `PatternService`의 `MIN_SAMPLES`는 5이고, 그보다 적으면 404가 아니라 200 + `LOCKED`를 반환한다. `requiredDays`와 `lockedMessage`에도 5가 반영된다. `BACKEND_TASKS.md`에 통계적 최소 일수의 근거는 없다.

[미결정] 최소 기준을 5회로 확정할지 7·14·30회 등으로 바꿀지 정해지지 않았다.

### 왜 결정이 필요한가

표본이 적으면 상관계수가 크게 흔들리고 사용자가 우연한 관계를 의미 있는 패턴으로 오해할 수 있다. 프런트 문구와 API의 requiredDays도 함께 바뀐다.

### 선택 가능한 옵션

- Option A: 서로 다른 진단일 5일을 최소 기준으로 사용한다
  - 장점: 사용자가 짧은 기간 안에 READY 결과를 확인할 수 있고 현재 코드의 5회 기준과 가장 가깝다.
  - 단점: 표본 수가 작아 일시적인 날씨나 피부 상태가 상관계수에 크게 반영될 수 있다.

- Option B: 서로 다른 진단일 7일을 최소 기준으로 사용한다
  - 장점: 일주일 단위의 생활·날씨 변화를 포함하면서도 사용자의 대기 기간이 비교적 짧다.
  - 단점: 주간 특이 상황에 결과가 좌우될 수 있고 안정적인 개인 패턴으로 보기에는 여전히 표본이 적다.

- Option C: 서로 다른 진단일 14일을 최소 기준으로 사용한다
  - 장점: 2주 동안의 변화를 반영해 5일·7일보다 우연한 상관관계를 줄일 수 있다.
  - 단점: 최소 2주 동안 꾸준히 진단해야 하므로 READY 전환율이 낮아질 수 있다.

- Option D: 서로 다른 진단일 30일을 최소 기준으로 사용한다
  - 장점: 월간 환경 변화와 피부 변동을 가장 폭넓게 반영할 수 있다.
  - 단점: 사용자가 결과를 보기까지 너무 오래 걸리고 중도 이탈 가능성이 가장 높다.

### 추천안

Option C. 서로 다른 진단일 14일을 최소 기준으로 사용한다. 현재 `diagnoses.length` 기준은 동일 날짜의 반복 진단을 여러 표본으로 계산하므로, 최종 결정 적용 시 distinct day 기준으로 변경한다.

### 추천 이유

현재 서비스는 하루 여러 번 진단할 수 있어 단순 회차는 실제 관찰 일수를 과대평가할 수 있다. 안정적인 패턴이라는 표현을 사용하려면 서로 다른 날짜 기준이 더 적절하다.

### 영향 범위

- `backend/src/modules/pattern/pattern.service.ts`
- Pattern DTO, LOCKED UI 문구, pattern unit/e2e 테스트

## T10-02. C등급 추천 연결과 생성의 범위

### 현재 상황

[코드에서 확인] PatternService는 사용자의 기존 C등급 Recommendation ID를 조회해 `recommendationIds`로 반환한다. 패턴 결과로 Gemini를 호출해 새 C등급 Recommendation을 생성하지는 않는다.

[미결정] T10의 “C등급 추천과 연결”이 기존 추천 연결만 의미하는지, 패턴 결과에 따른 신규 생성을 포함하는지 정해지지 않았다.

### 왜 결정이 필요한가

연결과 생성은 데이터 책임·AI 비용·중복·근거 정책이 완전히 다르다. 문구만으로 범위를 해석하면 Pattern과 Recommendation 모듈 사이에 불필요한 의존성이 생긴다.

### 선택 가능한 옵션

- Option A: 기존 C등급 추천 연결만 한다
  - 장점: PatternService 책임이 작고 현재 구현을 유지한다.
  - 단점: 패턴별 맞춤 문구가 자동 생성되지는 않는다.

- Option B: 패턴 결과로 C등급 추천을 새로 생성한다
  - 장점: READY 결과가 즉시 맞춤 추천으로 이어진다.
  - 단점: Gemini 호출·prompt version·중복·재생성 정책이 필요하다.

### 추천안

Option A를 T10의 범위로 확정한다. C등급 생성이 필요하면 RecommendationService의 별도 명령과 versioned idempotency를 사용하는 후속 작업으로 분리한다.

### 추천 이유

현재 Pattern 모듈은 통계 계산 책임에 집중되어 있고, 기존 C등급 ID 연결이 이미 구현되어 있다.

### 영향 범위

- `backend/src/modules/pattern/**`
- `backend/src/modules/recommendations/**`
- Pattern DTO와 프런트 추천 상세 화면

## T10-03. 환경 지표 후보 범위와 결측 처리

### 현재 상황

[코드에서 확인] 분석 지표는 `uvIndex`, `pm25`, `pm10`, `ozonePpm`, `caiValue`이고 `no2`, `so2`, `co`는 제외되어 있다. 두 값이 모두 유효한 pairwise 쌍만 계산하고 유효 쌍이 3개 미만이면 제외하며 `|r| < 0.1`도 제외한다.

[미결정] NO2·SO2·CO의 분석 포함 여부와 pairwise deletion·threshold를 향후 변경할 승인 기준이 없다.

### 왜 결정이 필요한가

WeatherSnapshot에는 더 많은 지표가 저장되므로 DB에 있는 값과 Pattern 결과의 범위가 달라질 수 있다. 결측 처리 변경은 correlation 결과를 직접 바꾼다.

### 선택 가능한 옵션

- Option A: 현재 5개 지표와 pairwise 기준을 유지한다
  - 장점: `uvIndex`·`pm25`·`pm10`·`ozonePpm`·`caiValue` 5개만 계산하므로 상관계수 결과가 5×N으로 적고, 피부 직접 연관성이 낮은 지표의 노이즈가 사용자에게 노출되지 않는다.
  - 단점: DB에 이미 저장된 `no2`·`so2`·`co` 값을 분석에 사용하지 않으므로 수집 비용에 비해 활용도가 떨어지고, 향후 피부와 대기오염의 추가 연관성을 검증하려면 pattern policy version을 올려야 한다.

- Option B: NO2·SO2·CO를 포함하고 통계 기준을 재검증한다
  - 장점: 저장된 환경 데이터를 더 활용한다.
  - 단점: 사용자 해석·노이즈·샘플 부족이 늘어날 수 있다.

### 추천안

Option A를 기본으로 유지한다. 지표를 추가하려면 피부과학적 사용 목적, 최소 유효 쌍, 결측률, 다중 비교 문제를 검토하고 Pattern policy version을 올린다.

### 추천 이유

현재 저장 여부와 분석 대상은 다를 수 있으며, 지표를 많이 보여주는 것보다 오해를 줄이는 것이 우선이다.

### 영향 범위

- `backend/src/modules/pattern/pattern.service.ts`
- `PatternCorrelationDto`, WeatherSnapshot schema, trend UI와 통계 테스트

## T10-04. LOCKED 메시지와 사용자 문구 책임

### 현재 상황

[코드에서 확인] 백엔드는 `lockedMessage`를 반환하고 프런트는 백엔드 문구를 우선 사용하며 기존 안내 문구를 fallback으로 둔다. 현재 화면은 패턴 API를 호출하지 않고 “준비 중” 상태다.

[미결정] 최소 샘플 기준에 따른 최종 사용자 문구, 카피 변경 승인자, 의료적 오해를 피하는 표현 기준이 없다.

### 왜 결정이 필요한가

통계적 관찰과 의료적 진단을 혼동하면 서비스 신뢰와 안전 문제가 생긴다. 기준 수치가 바뀔 때 문구가 자동으로 맞지 않을 수 있다.

### 선택 가능한 옵션

- Option A: 백엔드 상수 문구를 그대로 노출한다
  - 장점: 프런트와 문구가 자동으로 일치한다.
  - 단점: 카피 변경과 다국어 처리가 어렵다.

- Option B: status·requiredDays·message key를 보내고 클라이언트가 카피를 관리한다
  - 장점: UX·다국어·카피 리뷰가 쉽다.
  - 단점: 클라이언트 버전별 문구 불일치 가능성이 있다.

### 추천안

Option B에 가까운 계약으로 전환하되 현재 `lockedMessage`는 호환 기간에 유지한다. API는 `status`, `requiredDays`, `messageKey`를 기준으로 하고 카피는 제품·의료 검토 후 버전 관리한다. “인과관계”가 아닌 “통계적 관찰”이라는 문구는 고정한다.

### 추천 이유

서버는 상태와 계산 기준을 책임지고, 사용자 문구는 제품 카피로 독립시키는 편이 유지보수와 다국어 확장에 유리하다.

### 영향 범위

- `backend/src/modules/pattern/dto/**`
- `backend/src/modules/pattern/pattern.service.ts`
- `app/trend.tsx`, `src/types/index.ts`, 제품·의료 카피 검토

---

# T11. 알림 설정 저장

## T11-01. 알림 기본값과 저장 시점

### 현재 상황

[코드에서 확인] NotificationPreference는 User와 1:1이며, row가 없으면 DB에 쓰지 않고 기본값을 200으로 반환한다. PUT은 전달된 필드만 갱신하고 row가 없으면 기본값과 함께 upsert한다. pushEnabled 기본값은 false이고 실제 push/WebSocket/SSE 발송은 구현하지 않았다.

[미결정] 기본값의 제품 책임, 서버 기본값과 모바일 로컬 상태 충돌 시 우선순위, 최초 조회 시 row를 생성할지 정해지지 않았다.

### 왜 결정이 필요한가

설정 화면과 DB가 다른 값을 보이면 사용자가 알림을 끄거나 켜도 다음 실행에서 되돌아갈 수 있다. 발송 기능이 추가될 때 false/true의 의미도 달라질 수 있다.

### 선택 가능한 옵션

- Option A: 현재처럼 GET은 계산값, PUT 때만 저장한다
  - 장점: 읽기에 부작용이 없고 row가 불필요하게 늘지 않는다.
  - 단점: 기본값 변경이 기존 사용자에게 일관되게 적용되지 않는다.

- Option B: 가입 또는 최초 GET 때 기본 row를 생성한다
  - 장점: 사용자별 실제 설정이 항상 DB에 있다.
  - 단점: read 요청이 write가 되고 기본값 migration이 필요하다.

### 추천안

Option A를 유지한다. 서버 응답을 최종 source of truth로 하고, 기본값 변경 시 명시적인 migration 또는 versioned defaults를 사용한다. push 발송을 시작하기 전 preference와 실제 notification channel의 의미를 다시 확정한다.

### 추천 이유

현재 Service 주석과 테스트가 read side effect 없는 동작을 명확히 하고 있어 기존 설계가 합리적이다.

### 영향 범위

- `backend/src/modules/notifications/**`
- `NotificationPreference`, 모바일 설정 동기화와 향후 push worker

## T11-02. 푸시 알림의 발송 주체와 preference 의미

### 현재 상황

[코드에서 확인] DB에는 `pushEnabled`, `uvAlertEnabled`, `dustAlertEnabled`, `morningReminder`가 있지만 발송 scheduler·device token·notification delivery가 없다. T11 범위도 DB 저장만으로 제한되어 있다.

[미결정] 향후 알림을 Nest cron, 별도 worker, 외부 push provider 중 어디서 발송할지와 각 preference가 어떤 event를 차단하는지 정해지지 않았다.

### 왜 결정이 필요한가

설정 필드가 있어도 발송 주체가 없으면 사용자가 기대하는 기능과 실제 동작이 다르다. 중복 발송·timezone·재시도·audit 기준도 필요하다.

### 선택 가능한 옵션

- Option A: NestJS가 동기 또는 cron으로 직접 발송한다
  - 장점: 구성 요소가 적다.
  - 단점: API 인스턴스 확장과 재시도에 취약하다.

- Option B: event/queue와 별도 notification worker를 사용한다
  - 장점: 재시도·중복 방지·대량 발송에 유리하다.
  - 단점: queue·device token·운영 모니터링이 필요하다.

### 추천안

Option B. Preference는 event type별 opt-in/out으로 해석하고, device token과 delivery status를 별도 모델로 관리한다. 동일 event id의 중복 발송을 막고, KST 기준 발송 window와 실패 재시도 정책을 둔다.

### 추천 이유

현재 알림은 저장만 하므로 실제 발송을 추가할 때 API Service에 외부 push 호출을 넣지 않고 독립적으로 확장할 수 있다.

### 영향 범위

- `backend/src/modules/notifications/**`
- 향후 queue/worker, device token·delivery log, 모바일 push 권한

---

# T12. Redis 날씨 캐시

## T12-01. 외부 API 장애 시 최근 DB Fallback

### 현재 상황

[코드에서 확인] Redis miss 또는 Redis 장애 시 `WeatherService`는 외부 API를 직접 호출한다. 외부 Client가 실패하면 nullable 지표와 `UNAVAILABLE`을 반환하며, 최근 WeatherSnapshot을 조회해 응답하는 경로는 없다. `getOrCreateSnapshot()`도 cache를 사용하지 않는다.

[미결정] Redis와 외부 API가 모두 실패할 때 동일 지역 최근 snapshot을 반환할지 결정되지 않았다.

### 왜 결정이 필요한가

DB fallback은 가용성을 높이지만 오래된 날씨를 현재 값처럼 보여줄 위험이 있다. Pattern·추천 입력에 stale data가 들어가면 결과가 왜곡될 수 있다.

### 선택 가능한 옵션

- Option A: DB fallback을 하지 않고 UNAVAILABLE을 반환한다
  - 장점: 최신성 없는 데이터를 명확히 거부한다.
  - 단점: 외부 API 일시 장애에서 화면이 비게 된다.

- Option B: 허용 연령 이내 최근 snapshot을 fallback으로 반환한다
  - 장점: 사용자 화면 가용성이 높아진다.
  - 단점: stale 상태·최대 연령·기능별 사용 제한을 관리해야 한다.

### 추천안

Option B를 화면용 `GET /weather`에만 적용하고, 진단·추천 근거 snapshot에는 기본 적용하지 않는다. fallback 응답은 `STALE` 또는 명시적인 `isStale` 상태를 사용하고, 허용 연령을 초과하면 `UNAVAILABLE`로 처리한다.

### 추천 이유

화면 표시와 분석 근거의 최신성 요구가 다르다. stale data를 LIVE/CACHED로 위장하지 않으면서 가용성을 확보할 수 있다.

### 영향 범위

- `backend/src/modules/weather/weather.service.ts`
- `WeatherSource` enum·DTO·Prisma schema/migration
- Weather 화면, Diagnosis/Recommendation 입력 정책

## T12-02. DB Fallback Source Label과 최대 허용 연령

### 현재 상황

[코드에서 확인] 현재 WeatherSource는 `LIVE`, `CACHED`, `UNAVAILABLE`뿐이며 DB fallback source는 구현되어 있지 않다. 최근 snapshot 조회 시 `observedAt` 연령 조건도 없다.

[미결정] DB fallback을 선택할 경우 기존 CACHED를 재사용할지 새 STALE 상태를 도입할지, 얼마나 오래된 데이터를 허용할지 정하지 않았다.

### 왜 결정이 필요한가

캐시된 최신 응답과 DB의 오래된 관측값은 의미가 다르다. 구분하지 않으면 프런트가 stale 데이터를 실시간 데이터로 표시할 수 있다.

### 선택 가능한 옵션

- Option A: `CACHED`를 DB fallback에도 사용한다
  - 장점: enum·migration 변경이 없다.
  - 단점: Redis cache와 DB stale의 의미가 섞인다.

- Option B: `STALE`을 추가하고 최대 연령을 둔다
  - 장점: 출처와 최신성을 명확히 표현한다.
  - 단점: schema·프런트·테스트 변경이 필요하다.

### 추천안

Option B. `STALE`을 추가하고 기본 허용 연령은 제품·날씨 변동성 검토 후 정한다. 추천 기준으로 재사용할 수 있는 연령과 화면 표시용 연령을 분리하며, 허용 범위를 넘으면 저장값을 사용하지 않는다.

### 추천 이유

현재 source가 이미 사용자에게 데이터 상태를 알려주는 계약이므로 stale을 CACHED로 숨기는 것은 계약 의미를 훼손한다.

### 영향 범위

- `backend/src/common/enums/weather-source.enum.ts`
- `backend/prisma/schema.prisma`, migration
- `backend/src/modules/weather/dto/weather-snapshot.dto.ts`, 프런트 상태 badge

## T12-03. Cache Key 정밀도와 UNAVAILABLE Negative Cache

### 현재 상황

[코드에서 확인] 좌표는 소수점 둘째 자리로 반올림해 `weather:current:{region}:{lat}:{lon}` key로 만들고, 기본 지역은 별도 key를 사용한다. `LIVE`와 `UNAVAILABLE` 응답을 모두 기본 TTL 300초로 저장한다. Cache hit 시 source를 CACHED로 override한다.

[미결정] 좌표 그룹 크기, 지역·측정소 변경 시 key invalidation, UNAVAILABLE negative cache TTL을 별도로 둘지 정해지지 않았다.

### 왜 결정이 필요한가

좌표를 너무 넓게 묶으면 다른 관측소의 값을 보여주고, 너무 좁게 묶으면 cache hit이 줄어든다. UNAVAILABLE을 오래 캐시하면 외부 API가 복구되어도 빈 데이터가 지속된다.

### 선택 가능한 옵션

- Option A: 현재 2자리·모든 응답 300초를 유지한다
  - 장점: `weatherCacheKey`가 소수점 둘째 자리로 좌표를 묶고 TTL 300초를 사용하므로 현재 단위 테스트와 e2e가 그대로 통과한다.
  - 단점: 좌표 2자리 묶음은 약 1.1km 범위로 묶어 다른 측정소 결과를 같은 key로 캐시할 수 있고, `UNAVAILABLE`도 300초 동안 캐시되어 외부 API가 복구돼도 5분간 빈 데이터가 반환된다.

- Option B: 위치 정밀도와 상태별 TTL을 분리한다
  - 장점: 정확도와 장애 복구를 독립적으로 조정한다.
  - 단점: key/TTL 정책과 테스트가 복잡해진다.

### 추천안

Option B. key는 실제 region/station identity를 우선하고 좌표 rounding은 해당 identity를 얻기 전의 임시 grouping으로 사용한다. LIVE와 UNAVAILABLE TTL을 분리하고, UNAVAILABLE은 짧은 negative TTL을 사용한다. 좌표가 다른 요청을 동일 key로 합쳐도 허용 가능한 거리 기준을 문서화한다.

### 추천 이유

날씨 API 장애 보호와 정상 복구 속도를 동시에 확보할 수 있다.

### 영향 범위

- `backend/src/modules/weather/weather-cache.ts`
- `backend/src/modules/weather/weather.service.ts`
- `RedisService`, Weather DTO와 cache contract 테스트

## T12-04. Cache Stampede·무효화·Metric 정책

### 현재 상황

[코드에서 확인] `RedisService.invalidate()`와 `invalidatePattern()`은 구현되어 있지만 WeatherService에서 정기 무효화 trigger는 없다. 동일 key cache miss를 하나로 합치는 single-flight/lock은 없고, hit rate·latency·Redis error metric도 없다. Redis 장애는 애플리케이션 부팅을 막지 않는다.

[미결정] 무효화 시점, 수동 flush endpoint 여부, stampede 방지 방식, cache metric과 alert 기준이 정해지지 않았다.

### 왜 결정이 필요한가

TTL만으로는 정부 API 갱신 시점과 맞지 않을 수 있고, 특정 지역 동시 요청이 외부 API를 한꺼번에 호출할 수 있다. Redis가 성능 계층이라도 장애와 hit율은 운영 판단에 필요하다.

### 선택 가능한 옵션

- Option A: TTL 만료와 수동 코드 호출만 사용한다
  - 장점: `RedisService.invalidate()`만 구현되어 있고 별도 scheduler나 운영 endpoint가 없으므로 인프라 구성과 권한 관리가 최소화된다.
  - 단점: 정부 API 갱신 주기(분 단위)와 TTL 300초가 정렬되지 않아 최대 5분간 stale 데이터가 반환될 수 있고, 동일 key에 동시 miss가 몰리면 여러 요청이 외부 API를 동시에 호출하는 cache stampede가 발생한다.

- Option B: single-flight, 주기 무효화, metric·관리 endpoint를 도입한다
  - 장점: 외부 API 호출을 안정적으로 제어하고 상태를 관찰할 수 있다.
  - 단점: scheduler·운영 권한·metric 시스템이 필요하다.

### 추천안

Option B. cache miss에는 짧은 distributed lock 또는 single-flight를 사용하고, 정부 API 갱신 주기에 맞춘 key 무효화는 scheduler가 담당한다. 수동 flush는 ADMIN 전용 내부 운영 API로 제한한다. hit/miss, TTL, populate latency, Redis error, lock wait를 metric으로 남긴다.

### 추천 이유

현재 RedisService가 오류를 삼키는 구조이므로, 오류를 사용자 요청에 전파하지 않으면서 운영자가 성능 저하를 볼 수 있어야 한다.

### 영향 범위

- `backend/src/redis/redis.service.ts`
- `backend/src/modules/weather/weather.service.ts`
- scheduler, ADMIN 운영 API, metrics·alert 시스템

---

# T13. 테스트와 API 계약

## T13-01. e2e Test DB 격리 전략

### 현재 상황

[코드에서 확인] e2e는 공용 `todayskin_test` PostgreSQL을 사용하고 `test/jest-e2e.json`에서 `maxWorkers: 1`로 직렬 실행한다. 각 파일이 before/after hook에서 일부 데이터를 삭제한다.

[미결정] 직렬 실행을 계속할지, schema·DB·transaction 기반 격리로 병렬화할지 정해지지 않았다.

### 왜 결정이 필요한가

현재 방식은 race condition을 줄이지만 테스트 시간이 늘고, cleanup 누락이 다음 파일에 영향을 줄 수 있다.

### 선택 가능한 옵션

- Option A: 공용 test DB에서 `maxWorkers: 1`로 직렬 실행한다
  - 장점: 현재 설정과 테스트 cleanup 코드를 그대로 사용하며 race condition을 가장 적은 변경으로 피할 수 있다.
  - 단점: 테스트 파일이 늘수록 CI 시간이 선형으로 증가하고 cleanup 누락이 다른 테스트에 영향을 줄 수 있다.

- Option B: e2e 파일 또는 worker마다 PostgreSQL schema를 분리한다
  - 장점: 하나의 PostgreSQL 인스턴스에서 migration을 재사용하면서 테스트를 병렬 실행할 수 있다.
  - 단점: worker별 `DATABASE_URL`, schema 생성·삭제, connection pool 정리 로직이 필요하다.

- Option C: e2e 파일 또는 worker마다 독립된 test database를 사용한다
  - 장점: schema와 connection까지 완전히 분리되어 테스트 간 데이터 간섭 가능성이 가장 낮다.
  - 단점: DB 생성·migration 시간이 길고 로컬 Docker와 CI의 데이터베이스 관리가 복잡해진다.

### 추천안

단기에는 Option A를 유지한다. 테스트 수와 CI 시간이 임계값을 넘으면 Option B로 전환해 worker별 PostgreSQL schema를 생성하고 테스트 종료 후 삭제한다. fixture는 고유 prefix와 user scope를 사용한다.

### 추천 이유

현재 e2e가 공용 DB cleanup에 의존하므로 즉시 병렬화를 강제하면 flaky test가 생길 수 있다.

### 영향 범위

- `backend/test/jest-e2e.json`
- `backend/test/*.e2e-spec.ts`
- `backend/docker/postgres-init.sh`, CI PostgreSQL setup

## T13-02. GeminiClient Mock 상태 확인 방식

### 현재 상황

[코드에서 확인] `GeminiClient`는 `isMockEnabled()` public getter를 제공하고 T13 production mock-disabled e2e가 이를 사용한다. getter는 테스트와 운영 시작 로그 검증을 위해 노출되어 있다.

[미결정] 테스트 전용 상태 확인을 위해 public getter를 유지할지, health/config snapshot 등 별도 검증 경로로 바꿀지 정해지지 않았다.

### 왜 결정이 필요한가

테스트 편의를 위한 public API가 제품 기능으로 굳어질 수 있다. 반대로 getter를 없애면 운영에서 mock 활성 여부를 확인하기 어려워진다.

### 선택 가능한 옵션

- Option A: public getter를 유지한다
  - 장점: `prod-mock-disabled.e2e-spec.ts`가 `isMockEnabled()`로 운영에서 mock이 꺼져 있는지 직접 확인하므로 별도 diagnostic endpoint 없이 테스트와 운영 시작 검증이 가능하다.
  - 단점: `GeminiClient`의 public API에 mock 설정 노출 여부가 섞여 도메인 기능과 무관한 내부 상태가 API 표면에 남고, 향우 다른 provider에서도 유사 getter가 늘어날 수 있다.

- Option B: Config/health diagnostic으로 분리한다
  - 장점: Client의 public API가 도메인 기능에 집중한다.
  - 단점: 운영 진단 endpoint 보호와 테스트 설정이 필요하다.

### 추천안

Option A를 현재 테스트 계약으로 유지하되 외부 HTTP API에는 노출하지 않는다. 향후 readiness/diagnostic 응답에서 안전한 boolean과 provider mode를 제공할 때 getter를 내부 interface로 축소한다.

### 추천 이유

현재 getter는 실제 운영 기능이 아니라 mock fail-closed 검증용이며, 당장 제거하면 테스트 목적만 복잡해진다.

### 영향 범위

- `backend/src/modules/gemini/gemini.client.ts`
- `backend/test/prod-mock-disabled.e2e-spec.ts`
- Health/readiness diagnostic

## T13-03. Frontend-Backend Contract Test 범위

### 현재 상황

[코드에서 확인] `api-contract.e2e-spec.ts`는 백엔드 camelCase 응답, `detail`, 401/403/503 상태를 검증한다. 프런트 `src/api/client.ts`의 실제 parsing·session 저장·error extraction을 동일 테스트에서 검증하지는 않는다.

[미결정] backend schema contract만 유지할지, mobile client parsing까지 통합 검증할지 정해지지 않았다.

### 왜 결정이 필요한가

백엔드가 올바른 JSON을 반환해도 프런트 parser가 필드나 error array를 잘못 읽으면 사용자 기능이 깨진다.

### 선택 가능한 옵션

- Option A: 백엔드 contract test만 유지한다
  - 장점: backend CI가 독립적이고 빠르다.
  - 단점: 실제 모바일 파싱 문제를 잡지 못한다.

- Option B: shared schema 또는 client integration test를 추가한다
  - 장점: 소비자 관점의 계약을 검증한다.
  - 단점: frontend/backend CI 결합과 fixture 관리가 필요하다.

### 추천안

Option B. backend e2e는 HTTP 응답 schema의 source of truth로 유지하고, root frontend test에서 `src/api/client.ts`와 session parser를 fixture 기반으로 검증한다. 동일 OpenAPI/JSON schema를 생성·비교하는 방식은 계약이 커질 때 도입한다.

### 추천 이유

현재 프런트가 backend 응답을 직접 저장·해석하므로 양쪽 테스트를 분리하되 최소한의 consumer 검증은 필요하다.

### 영향 범위

- `backend/test/api-contract.e2e-spec.ts`
- `src/api/client.ts`, `src/lib/session.ts`
- root/backend CI workflow와 API fixture

## T13-04. Diagnosis → Weather → Pattern READY e2e 범위

### 현재 상황

[코드에서 확인] 진단 e2e에서 외부 날씨 mock이 UNAVAILABLE이면 diagnosis의 `weatherSnapshotId`가 null이 된다. Pattern은 weather snapshot이 연결된 진단만 사용하므로 현재 READY 흐름은 직접 snapshot을 연결한 테스트와 unit test에 의존하고, e2e는 LOCKED 중심이다.

[미결정] 실제 사용자 흐름 전체를 READY e2e로 검증할지 정해지지 않았다.

### 왜 결정이 필요한가

단위 테스트만으로는 날씨 snapshot 연결·인증·DB query·Pattern 상태 전환의 통합 오류를 잡지 못한다. 반대로 다수의 진단 fixture는 e2e 실행을 느리게 한다.

### 선택 가능한 옵션

- Option A: LOCKED e2e와 READY unit test를 유지한다
  - 장점: `pattern.service.spec.ts` 단위 테스트가 외부 API 없이 빠르게 동작하고, `diagnosis-pattern.e2e-spec.ts`는 DB에 직접 snapshot을 연결해 LOCKED 상태만 검증하므로 실행 시간이 짧다.
  - 단점: 실제 사용자 흐름인 진단 제출 → 날씨 snapshot 연결 → 5개 이상 진단 → READY 상태 전환이 e2e로 검증되지 않아, WeatherService와 PatternService의 조인 오류나 status 매핑 누락이 회귀로 발견될 수 있다.

- Option B: deterministic LIVE weather stub으로 READY e2e를 추가한다
  - 장점: 핵심 흐름을 실제 HTTP·DB로 검증한다.
  - 단점: fixture와 실행 시간이 늘어난다.

### 추천안

Option B를 핵심 smoke e2e로 최소 1개 추가한다. 외부 정부 API가 아니라 test provider가 deterministic snapshot을 반환하도록 하고, 최소 샘플·서로 다른 날짜·correlation 결과·C등급 연결을 검증한다.

### 추천 이유

외부 네트워크 없이도 T9→T6→T10의 실제 결합을 검증할 수 있다.

### 영향 범위

- `backend/test/diagnosis-pattern.e2e-spec.ts`
- Weather provider override, Diagnosis/Pattern/Recommendation fixture

## T13-05. ADMIN Endpoint 보호 테스트 대상

### 현재 상황

[코드에서 확인] RolesGuard unit test는 USER가 요구 role을 충족하지 못할 때 403을 검증한다. 그러나 실제 `@Roles(Role.ADMIN)`이 붙은 운영 Controller는 없다.

[미결정] 실제 ADMIN endpoint가 추가될 때까지 unit test만 유지할지, 테스트 전용 endpoint를 추가할지 정해지지 않았다.

### 왜 결정이 필요한가

Guard 자체가 정상이어도 Controller에 Guard를 붙이지 않으면 운영 API가 공개될 수 있다. 테스트용 endpoint를 넣으면 실제 기능 범위가 불필요하게 커진다.

### 선택 가능한 옵션

- Option A: 실제 ADMIN API 추가 시 해당 endpoint의 e2e를 함께 추가한다
  - 장점: 테스트용 기능을 만들지 않는다.
  - 단점: 현재 route wiring을 검증하지 못한다.

- Option B: 내부 테스트 fixture Controller를 둔다
  - 장점: Guard·route 조합을 즉시 검증한다.
  - 단점: 배포 코드에 테스트 route가 섞일 위험이 있다.

### 추천안

Option A. 현재는 RolesGuard unit test만 유지하고, 첫 ADMIN 운영 API를 구현하는 동일 PR에서 USER 403·ADMIN 200·미인증 401 e2e를 필수로 한다. 테스트 전용 공개 endpoint는 추가하지 않는다.

### 추천 이유

아직 보호할 실제 운영 기능이 없으므로 테스트 목적의 API를 추가하는 것은 범위와 보안 표면을 늘린다.

### 영향 범위

- `backend/src/common/guards/roles.guard.ts`
- 향후 `backend/src/modules/admin/**`
- ADMIN controller와 e2e 테스트

## T13-06. Test Pyramid·Coverage·Fixture 기준

### 현재 상황

[코드에서 확인] Unit test와 e2e test가 있으며 `npm run test:cov`는 존재하지만 package script와 CI에는 coverage threshold가 없다. 외부 API는 mock/provider override 중심이고, e2e는 각 파일이 직접 seed·cleanup한다.

[미결정] 핵심 비즈니스 로직의 최소 coverage, unit/integration/e2e 책임, fixture 공용화와 flaky test 대응 기준이 없다.

### 왜 결정이 필요한가

테스트 수가 많아도 ownership·동시성·예외 흐름이 빠지면 품질을 보장할 수 없다. coverage를 무조건 높이면 의미 없는 줄만 늘어날 수 있다.

### 선택 가능한 옵션

- Option A: 현재 테스트와 CI 성공 여부만 기준으로 둔다
  - 장점: CI가 단순하다.
  - 단점: 회귀 범위와 핵심 경로 품질을 측정하기 어렵다.

- Option B: 계층별 책임과 핵심 module coverage threshold를 정한다
  - 장점: 변경 위험을 정량적으로 관리한다.
  - 단점: fixture·테스트 유지 비용이 늘어난다.

### 추천안

Option B. 순수 policy/mapper는 unit, Prisma query·transaction은 integration, 인증부터 핵심 사용자 흐름은 e2e로 검증한다. 전체 coverage보다 Auth·Diagnosis·Weather·Recommendation·Exception의 branch/function threshold를 우선 정하고 flaky test는 재시도보다 원인 수정과 격리를 우선한다.

### 추천 이유

현재 이미 세 계층의 테스트 기반이 있으므로 책임을 명시하는 비용이 낮다.

### 영향 범위

- `backend/package.json`
- `backend/src/**/*.spec.ts`, `backend/test/**`
- Jest config, CI와 fixture/helper 구조

---

# T14. Docker, CI/CD와 운영 설정

## T14-01. Prisma migration lock과 baseline 기준

### 현재 상황

[코드에서 확인] 현재 `backend/prisma/migrations/`에는 Prisma 7용 `migration_lock.toml`과 초기 migration이 있고, CI는 `prisma migrate diff --from-migrations`와 `migrate deploy`를 사용한다. 테스트 DB에는 migration history가 없는 상태에서 baseline을 어떻게 만들지 별도 runbook이 없다.

[미결정] repository에서 허용할 lock 파일 형식과 기존 DB를 migration history에 연결하는 baseline 절차가 확정되지 않았다.

### 왜 결정이 필요한가

lock 형식이 도구·CI와 다르면 migration 명령이 실패할 수 있다. 운영 DB에 history를 잘못 삽입하면 이미 적용된 schema에 migration을 다시 적용할 위험이 있다.

### 선택 가능한 옵션

- Option A: 현재 Prisma 7이 생성하는 TOML lock과 초기 migration을 기준으로 한다
  - 장점: 현재 package와 CI 흐름에 맞는다.
  - 단점: 기존 DB의 baseline 절차를 별도로 수행해야 한다.

- Option B: 과거 lock 형식을 함께 보존해 도구 호환을 시도한다
  - 장점: 기존 환경 일부와 호환될 수 있다.
  - 단점: 어떤 명령이 어느 파일을 읽는지 혼란과 drift가 생긴다.

### 추천안

Option A. Prisma 7이 생성한 단일 lock 형식만 commit하고, 기존 test/dev DB는 backup 후 schema와 migration diff를 검증한 뒤 baseline history를 등록한다. `migrate dev`는 개발 전용, `migrate deploy`는 CI/운영 전용으로 구분한다.

### 추천 이유

현재 CI가 migration diff를 중요한 품질 게이트로 사용하므로 lock 파일과 baseline을 하나의 도구 기준으로 단순화해야 한다.

### 영향 범위

- `backend/prisma/migrations/migration_lock.toml`
- `backend/prisma/migrations/**`
- `backend/prisma.config.ts`, CI와 test DB 초기화

## T14-02. 운영 인프라·이미지·Secret 주입·CD 방식

### 현재 상황

[코드에서 확인] Dockerfile, local PostgreSQL·Redis compose, GH Actions build/test/lint/migration diff가 있다. `docker/DEPLOYMENT.md`는 단일 서버 + docker compose를 권장하지만 ECS/Fly.io/Cloud Run/Kubernetes도 후보로 남기고, 자동 CD는 아직 없다. 운영 DB는 컨테이너 외부를 권장하며 secret은 컨테이너 외부 주입으로 설명한다.

[미결정] 운영 서버, image registry, secret manager, managed DB, CD 자동 승인과 rollback 주체가 확정되지 않았다.

### 왜 결정이 필요한가

배포 자동화와 migration 실행 주체는 인프라에 따라 달라진다. 확정 없이 CD를 만들면 secret·DB·rollback이 수동 문서와 실제 파이프라인에서 어긋난다.

### 선택 가능한 옵션

- Option A: 단일 VM/VPS에서 Docker Compose로 운영한다
  - 장점: 현재 Dockerfile·Compose·배포 문서를 거의 그대로 사용할 수 있고 초기 비용과 운영 복잡도가 낮다.
  - 단점: 단일 장애 지점이 생기며 자동 scaling·무중단 rolling deploy·self-healing을 직접 구성해야 한다.

- Option B: Cloud Run·Fly.io 같은 관리형 container platform을 사용한다
  - 장점: image 기반 배포, health check, 자동 scaling과 rollback을 플랫폼 기능으로 사용할 수 있다.
  - 단점: 플랫폼별 네트워크·cold start·비용 모델에 종속되고 장기 요청이나 고정 연결에 제약이 생길 수 있다.

- Option C: AWS ECS 같은 관리형 container orchestration을 사용한다
  - 장점: VPC·managed DB·load balancer와 통합하면서 여러 인스턴스와 rolling deploy를 안정적으로 운영할 수 있다.
  - 단점: IAM·network·task definition·배포 파이프라인의 초기 설정과 운영 비용이 증가한다.

- Option D: Kubernetes를 사용한다
  - 장점: 서비스 수가 많아질 때 배포·확장·정책·관측성을 하나의 표준으로 관리할 수 있다.
  - 단점: 현재 단일 백엔드 규모에서는 cluster 운영과 manifest 관리가 과도한 복잡도를 만든다.

### 추천안

초기 운영은 Option A로 확정하되, GHCR image tag를 commit SHA로 고정하고 운영 DB·Redis는 컨테이너 외부의 관리형 또는 별도 백업 대상으로 둔다. secret은 Secret Manager 또는 보호된 host injection만 허용한다. CI 통과 후 image push는 자동화하되 production deploy는 승인 단계와 이전 image rollback 절차를 둔다.

### 추천 이유

현재 프로젝트 규모와 Docker Compose 문서에 가장 맞고, DB를 애플리케이션 컨테이너와 분리해 데이터 손실 위험을 줄인다.

### 영향 범위

- `backend/Dockerfile`
- `backend/docker-compose.yml`
- `backend/docker/DEPLOYMENT.md`
- `.github/workflows/**`, registry·Secret Manager·운영 DB

## T14-03. 운영 Migration 실행 주체와 다중 인스턴스 배포

### 현재 상황

[코드에서 확인] `docker/DEPLOYMENT.md`는 컨테이너 시작 시 `prisma migrate deploy`를 자동 실행하는 전략을 설명한다. 여러 backend instance가 동시에 시작할 때 migration을 누가 단독 실행하는지, migration 실패 시 애플리케이션을 어떻게 차단할지 별도 절차는 없다.

[미결정] migration을 app container entrypoint에서 실행할지, CI/CD release job 또는 일회성 migration task에서 실행할지 결정되지 않았다.

### 왜 결정이 필요한가

여러 인스턴스가 동시에 migration을 실행하면 lock·startup 순서·부분 배포 문제가 생길 수 있다. schema가 먼저 바뀌고 구버전 앱이 실행되는 expand/contract 순서도 필요하다.

### 선택 가능한 옵션

- Option A: 각 app container가 시작할 때 migrate deploy를 실행한다
  - 장점: 배포 절차가 단순하다.
  - 단점: 다중 인스턴스와 rollback 제어가 어렵다.

- Option B: release 단계에서 단일 migration job을 먼저 실행한다
  - 장점: 실행 주체·로그·실패 gate가 명확하다.
  - 단점: CD pipeline과 운영 권한 구성이 필요하다.

### 추천안

Option B. production migration은 단일 release job이 backup·diff·`migrate deploy`를 완료한 뒤 app rollout을 시작한다. destructive 변경은 expand/contract migration으로 나누고, migration 실패 시 새 app rollout을 중단한다. local/test만 container startup migration을 허용한다.

### 추천 이유

운영 DB를 애플리케이션 startup과 분리해야 다중 인스턴스와 무중단 배포를 안전하게 통제할 수 있다.

### 영향 범위

- `backend/Dockerfile`, `backend/docker/DEPLOYMENT.md`
- `.github/workflows/**`
- Prisma migration, release job, rollback runbook

## T14-04. Liveness·Readiness·Health Check 기준

### 현재 상황

[코드에서 확인] `GET /health`는 `{ status: 'ok', timestamp }`를 반환하는 프로세스 liveness endpoint다. DB·Redis 연결과 외부 API readiness를 확인하지 않으며 Docker HEALTHCHECK와 load balancer가 같은 endpoint를 사용한다.

[미결정] liveness와 readiness를 분리할지, Redis·외부 API 장애를 startup/traffic readiness에 반영할지 정해지지 않았다.

### 왜 결정이 필요한가

Redis는 선택적 캐시라 장애가 있어도 트래픽을 받을 수 있지만 DB는 핵심 의존성이다. 하나의 health endpoint에 모두 넣으면 일시적 외부 API 장애 때문에 인스턴스가 불필요하게 제거될 수 있다.

### 선택 가능한 옵션

- Option A: 현재 `/health` 하나를 모든 probe에 사용한다
  - 장점: `GET /health`가 `{ status: 'ok', timestamp }`만 반환하므로 Dockerfile HEALTHCHECK와 load balancer가 하나의 endpoint로 동작하고 별도 probe 설정이 필요 없다.
  - 단점: DB 연결 실패·Redis 장애·외부 API timeout이 모두 같은 200 응답으로 나오므로, DB가 죽어도 인스턴스가 살아있는 것으로 판단해 트래픽이 계속 유입되고, 반대로 Redis 일시 장애로 불필요하게 인스턴스가 제거될 수 있다.

- Option B: `/health/live`와 `/health/ready`를 분리한다
  - 장점: dependency별 중요도를 반영할 수 있다.
  - 단점: probe·alert 설정이 추가된다.

### 추천안

Option B. liveness는 process event loop만 확인하고 readiness는 DB·필수 config·migration 상태를 확인한다. Redis와 날씨/ Gemini 외부 API는 선택적 또는 요청별 dependency로 분리해 readiness를 무조건 실패시키지 않는다. 각 상태와 HTTP code를 문서화한다.

### 추천 이유

현재 Redis가 optional이고 외부 API가 부분 실패를 허용하므로 dependency를 한 endpoint에 묶는 것은 서비스 설계와 맞지 않는다.

### 영향 범위

- `backend/src/health/**`
- `backend/src/prisma/**`, `backend/src/redis/**`
- Dockerfile HEALTHCHECK, load balancer·container platform probe

## T14-05. 구조화 Logging·Correlation ID·Audit Log

### 현재 상황

[코드에서 확인] Nest Logger로 bootstrap·Service·외부 API 오류를 기록하고 Global Exception Filter가 method·url·status·error name을 로그로 남긴다. request/correlation ID, JSON 구조, 전화번호·IP·좌표·토큰 마스킹, 로그 보관 기간, 사용자 행위 Audit Log는 없다.

[미결정] 운영 로그 필드·레벨·보관·민감정보 정책과 audit 대상이 정해지지 않았다.

### 왜 결정이 필요한가

장애 추적에는 한 요청이 auth→DB→외부 API로 이어지는 연결 정보가 필요하다. 민감정보를 그대로 로그에 남기면 보안 사고가 된다. 일반 application log와 법적 행위 기록도 목적이 다르다.

### 선택 가능한 옵션

- Option A: 현재 문자열 Logger와 인프라 로그에 의존한다
  - 장점: Nest `Logger`로 문자열 로그를 stdout에 출력하므로 별도 logging 라이브러리나 log storage 없이 인프라 표준 출력만으로 동작한다.
  - 단점: `request.method + request.url` 형태라 한 요청이 auth → DB → 외부 API로 이어지는 흐름을 correlation ID로 추적할 수 없고, 전화번호·IP·좌표가 마스킹되지 않은 채 로그에 남을 수 있으며, 로그 검색과 보관 기준이 없어 장애 원인 분석이 어렵다.

- Option B: 구조화 로그와 별도 Audit Log를 도입한다
  - 장점: request trace와 사용자 행위를 구분해 추적할 수 있다.
  - 단점: schema·보관·접근권한을 운영해야 한다.

### 추천안

Option B. 모든 request에 server-generated correlation ID를 부여하고 method·route template·status·duration·userId hash·provider·error code를 JSON으로 기록한다. token·전화번호·생년월일·prompt 원문·이미지·정밀 좌표는 로그에서 제외하거나 마스킹한다. 로그인·logout·권한 변경·동의·진단 제출·데이터 삭제는 append-only Audit Log 대상으로 삼는다.

### 추천 이유

현재 exception filter와 Service Logger가 이미 공통 지점이므로 middleware/interceptor와 공통 logger를 추가해 단계적으로 통일할 수 있다.

### 영향 범위

- `backend/src/main.ts`
- `backend/src/common/filters/http-exception.filter.ts`
- 모든 Controller/Service, Audit Log schema·로그 수집 시스템

## T14-06. Error Tracking·Tracing·Metrics와 SLO

### 현재 상황

[코드에서 확인] 애플리케이션 내 전용 error tracking, OpenTelemetry tracing, Prometheus/StatsD metrics, SLO 정의가 없다. Redis hit/miss metric과 외부 API latency metric도 아직 결정되지 않았다.

[미결정] 어떤 시스템을 기준으로 장애·성능을 측정하고 알림을 보낼지 정해지지 않았다.

### 왜 결정이 필요한가

로그만으로는 p95 지연, 외부 API별 실패율, AI 503, DB pool 고갈, Redis cache 효과를 정량적으로 판단할 수 없다.

### 선택 가능한 옵션

- Option A: 인프라 기본 모니터링과 로그 검색만 사용한다
  - 장점: 초기 비용이 낮다.
  - 단점: 사용자 영향과 원인 분석이 늦다.

- Option B: error tracking + tracing + 핵심 metrics와 SLO를 도입한다
  - 장점: 장애 영향·원인·회귀를 빠르게 파악한다.
  - 단점: 개인정보 전송·sampling·운영 비용을 관리해야 한다.

### 추천안

Option B. 최소 지표는 HTTP request rate/error/latency, DB query latency/error, Redis hit/miss/error, KMA/AirKorea/Station/Gemini timeout·status·latency, diagnosis inference latency, recommendation duplicate rate로 한다. 초기 SLO는 사용자 핵심 API availability와 p95 latency를 정하고, error tracking에는 민감정보를 보내지 않는다.

### 추천 이유

현재 외부 의존성이 분리되어 있어 provider별 metric을 붙이기 쉽고, AI·날씨 실패를 사용자 상태와 연결해 판단해야 한다.

### 영향 범위

- `backend/src/**`
- `backend/src/health/**`, Redis·external Client
- CI/CD, monitoring backend, alert/SLO runbook

## T14-07. Environment Variable과 Feature Flag 수명주기

### 현재 상황

[코드에서 확인] Joi가 `NODE_ENV`, DB, Redis, JWT, 외부 API key, token expiry, `MOCK_GEMINI`, `MOCK_INFERENCE`를 검증한다. unknown environment variable은 허용되고 test에서 DB/JWT secret 빈 값이 허용된다. Feature flag는 production에서 mock을 fail-closed하지만 owner·expiry·removal rule은 없다.

[미결정] 환경변수 소유권·secret 주입·변경 승인·환경별 필수값, feature flag의 만료와 제거 기준이 없다.

### 왜 결정이 필요한가

잘못된 환경변수는 startup 이후에만 발견될 수 있고, 오래된 mock flag가 운영 동작을 바꿀 수 있다. secret과 일반 설정은 보관·접근 정책이 달라야 한다.

### 선택 가능한 옵션

- Option A: `.env.example`와 Joi 검증만 유지한다
  - 장점: `env.validation.ts`의 Joi schema가 startup 시 필수 변수를 검증하므로 별도 registry나 secret manager 없이 `.env` 파일로 개발 환경을 구성할 수 있다.
  - 단점: `MOCK_GEMINI`·`MOCK_INFERENCE` 같은 feature flag에 owner·expiry date·제거 기준이 없어 운영에 실수으로 남을 수 있고, unknown 환경변수가 `allowUnknown: true`로 통과하므로 오타난 변수명이 조용히 무시될 수 있다.

- Option B: 환경변수 registry와 feature flag lifecycle을 관리한다
  - 장점: 설정 책임과 운영 안전성을 명확히 한다.
  - 단점: 문서·secret manager·CI 검증이 필요하다.

### 추천안

Option B. 각 변수에 owner·description·required environment·safe default·secret 여부를 기록하고 production secret은 Secret Manager에서 주입한다. mock flag는 test/development 전용으로 제한하고, owner와 expiry date가 없는 flag는 merge를 거부한다. 허용할 환경변수 목록과 unknown key 처리도 production에서 엄격하게 한다.

### 추천 이유

현재 변수 종류와 validation이 이미 정리되어 있어 registry와 lifecycle 필드를 추가하기 쉽다.

### 영향 범위

- `backend/src/config/env.validation.ts`
- `backend/.env.example`, `backend/docker/DEPLOYMENT.md`
- CI/CD, Secret Manager, `MOCK_GEMINI`, `MOCK_INFERENCE` 사용 코드

## T14-08. Dependency Audit·Update 정책

### 현재 상황

[코드에서 확인] backend는 NestJS 11, Prisma 7, ioredis, proj4 등 외부 dependency를 사용하고 `package-lock.json`을 commit한다. CI에는 build/test/lint/migration 검사가 있지만 dependency audit과 정기 update gate는 없다.

[미결정] 보안 취약점 대응 SLA, Node/Prisma major update 기준, lockfile 변경 검토 기준이 없다.

### 왜 결정이 필요한가

인증·DB·외부 HTTP 라이브러리 취약점은 서비스 전체의 위험으로 이어진다. 자동 major update는 Prisma migration이나 runtime 호환성을 깨뜨릴 수 있다.

### 선택 가능한 옵션

- Option A: 필요할 때 수동으로 dependency를 업데이트한다
  - 장점: 변경량과 위험이 작다.
  - 단점: 취약점 대응이 늦을 수 있다.

- Option B: audit와 정기 업데이트, major upgrade review를 CI/운영에 포함한다
  - 장점: 취약점을 지속적으로 발견하고 대응한다.
  - 단점: 유지보수 시간을 정기적으로 확보해야 한다.

### 추천안

Option B. PR에서 `npm audit` 또는 승인된 scanner를 수행하고, critical/high 취약점에는 정해진 SLA를 둔다. patch/minor는 정기 update window에서 자동 제안하되 build·unit·e2e·migration diff를 통과시킨다. Node·NestJS·Prisma major upgrade는 별도 migration/rollback 계획과 리뷰를 요구한다.

### 추천 이유

현재 CI가 이미 backend quality gate를 가지고 있어 dependency 검사를 추가하기 쉽고, Prisma major 변경은 DB 영향이 크므로 별도 기준이 필요하다.

### 영향 범위

- `backend/package.json`, `backend/package-lock.json`
- `.github/workflows/ci.yml`
- Node/Prisma runtime, migration·보안 대응 runbook
