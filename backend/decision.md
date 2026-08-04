# T10 개인 패턴 분석 API — 결정 보류 사항

T10 구현 중 에이전트가 임의로 결정할 수 없어 사용자 확인이 필요한 항목.

## 1. 최소 샘플 수 정책 확정

- 현재값: `MIN_SAMPLES = 5` (`pattern.service.ts` 최상단)
- 근거: BACKEND_TASKS.md에 명시된 값이 없어 합리적 기본값으로 설정.
- 문제: "최소 일수"를 의미한다면 통계적으로 5일은 너무 적을 수 있음.
- 필요한 결정: 비즈니스/의료적 근거로 5일/7일/14일/30일 중 기준 확정.
- 변경 방법: `pattern.service.ts`의 `MIN_SAMPLES` 상수만 수정.

## 2. C등급 추천 "연결" vs "생성" 범위 확정

- 현재 구현: 패턴 분석 결과를 사용자의 기존 C등급 추천 id와 연결만 함 (`recommendationIds`).
- 보류 이유: T10에 "결과를 C등급 추천과 연결"이라만 적혀 있어 "생성"까지 포함인지 불명확.
- 필요한 결정:
  - (a) 연결만 하면 됨 → 현재 구현 유지.
  - (b) 패턴 결과로부터 Gemini가 C등급 추천을 새로 생성해야 함 → 추가 작업 필요
    (PatternModule에 RecommendationService + GeminiClient 주입, 생성 로직 추가).

## 3. 환경 지표 후보 범위

- 현재 포함: uvIndex, pm25, pm10, ozonePpm, caiValue (5개).
- 제외: no2, so2, co (피부 직접 연관 약하다고 판단).
- 필요한 결정: no2/so2/co를 분석 대상에 포함할지 여부.
- 변경 방법: `ENV_METRICS` 배열에 항목 추가.

## 4. 프론트 LOCKED 문구

- 현재: 백엔드 `lockedMessage` 우선, 폴백은 기존 안내 텍스트 유지.
- 필요한 결정: 최종 카피 확정 여부.

# T12 Redis 날씨 캐시 — 결정 보류 사항

T12 구현 중 에이전트가 임의로 결정할 수 없어 사용자 확인이 필요한 항목.

## 1. 외부 API 장애 시 DB fallback 여부

- 현재 구현: Redis 장애 → 외부 API 직접 호출 fallback만 구현.
- 보류 항목: T12 요구사항에 "Redis 장애 시 외부 API 또는 **최근 DB fallback**"이 명시됨.
  외부 API(기상청/에어코리아) 호출마저 실패했을 때, 동일 지역의 가장 최근
  `WeatherSnapshot` DB row를 반환할 것인지 결정 필요.
- 필요한 결정:
  - (a) DB fallback 구현 안 함 → 외부 API 실패 시 현재와 같이 `UNAVAILABLE` 반환.
  - (b) DB fallback 구현 → `WeatherService`에 `findLatestSnapshotByRegion()` 추가,
    외부 API 수집 실패 시 DB에서 최근 row를 찾아 반환. `collect()` 실패 처리 로직 개편 필요.
- 변경 위치:
  - `src/modules/weather/weather.service.ts` — `collect()` 예외 처리 + `persist()` 인근에
    DB 조회 fallback 추가.
  - `src/modules/weather/weather.service.ts` — `resolveSource()`에서 fallback 상태 판단.

## 2. DB fallback 시 source 라벨

- (b)를 선택한 경우 필요한 결정: DB fallback 데이터의 `source` 표시 방식.
  - (i) 기존 `CACHED` 재사용.
  - (ii) 새 값 `STALE` 추가 → `WeatherSource` enum(`src/common/enums/weather-source.enum.ts`),
    `prisma/schema.prisma`의 `WeatherSource` enum, 프론트 계약에 영향. migration 포함.
- 변경 위치:
  - `src/common/enums/weather-source.enum.ts`
  - `prisma/schema.prisma` — `enum WeatherSource` + migration 생성
  - `src/modules/weather/dto/weather-snapshot.dto.ts` — ApiProperty enum 업데이트

## 3. DB fallback 최대 허용 시각

- (b)를 선택한 경우 필요한 결정: 얼마나 오래된 DB row까지 fallback으로 허용할 것인가.
- 예: 1시간 이내 row만 허용, 초과 시 `UNAVAILABLE` 반환.
- 근거: 너무 오래된 데이터는 날씨 변동으로 의미가 떨어지므로 임계값이 필요.
- 변경 위치:
  - `src/modules/weather/weather.service.ts` — DB fallback 쿼리의 `where` 조건
    (`observedAt` 범위 필터), 상수(예: `DB_FALLBACK_MAX_AGE_HOURS`) 추가.

## 4. 무효화·로그·metric 정책

- 현재 구현: `RedisService.invalidate()` / `invalidatePattern()`은 구현되어 있으나
  "언제 무효화할 것인가"는 미결정.
- 필요한 결정:
  - 무효화 트리거: 정부 API 갱신 주기 연동(예: 매 정시 자동 invalidate),
    수동 flush 엔드포인트 필요 여부.
  - metric 수집: hit rate, latency, Redis error rate를 어디서 수집/노출할 것인가.
    (T13 테스트/계약, T14 CI/CD의 observability와 함께 결정 권장.)
- 변경 위치:
  - `src/redis/redis.service.ts` — metric 카운터/이벤트 추가.
  - `src/modules/weather/weather.service.ts` — 자동 무효화 스케줄러(필요 시 `@nestjs/schedule`).

# T13 테스트와 API 계약 — 결정 보류 사항

T13 구현 중 에이전트가 임의로 결정할 수 없어 사용자(리뷰어) 확인이 필요한 항목.

## 1. e2e test DB 격리 전략

- 현재 구현: `test/jest-e2e.json`에 `maxWorkers: 1`을 추가해 e2e 파일을 순차 실행.
- 이유: 모든 e2e 파일이 같은 `todayskin_test` DB를 공유하므로 병렬 실행 시 race condition 발생.
  (예: auth.e2e의 미가입 전화번호 테스트가 recommendation-product.e2e에서 생성한 사용자와 충돌)
- 필요한 결정:
  - (a) `maxWorkers: 1` 유지 → 안전하지만 e2e 실행 시간이 길어짐.
  - (b) e2e 파일별 고유 schema/isolation 부여 → 병렬 실행 가능, 설정 복잡도 증가.
  - (c) 파일별 test DB 분리(예: `todayskin_test_auth`, `todayskin_test_rec`) → 격리 완벽, 컨테이너 설정 변경 필요.
- 변경 위치:
  - `test/jest-e2e.json` — `maxWorkers` 제거/유지
  - 각 `test/*.e2e-spec.ts` — `process.env.DATABASE_URL` 분리 (c 선택 시)
  - `docker/postgres-init.sh` — DB 추가 생성 (c 선택 시)

## 2. GeminiClient.isMockEnabled() getter 노출 수용 여부

- 현재 구현: `src/modules/gemini/gemini.client.ts`에 `isMockEnabled(): boolean` public getter 추가.
  기존 `private mockEnabled` 필드를 그대로 노출만 하고, 로직은 변경하지 않음.
- 목적: 운영 환경에서 mock fallback이 비활성화되었는지 검증 가능한 지점 제공 (T13 테스트용).
- 필요한 결정:
  - (a) public getter 유지 → 테스트/운영 시작 로그에서 활용 가능.
  - (b) 테스트 전용 별도 검증 경로 원함 → getter 제거하고 리플렉션/별도 health check로 대체.
- 변경 위치:
  - `src/modules/gemini/gemini.client.ts` — getter 유지/제거
  - `test/prod-mock-disabled.e2e-spec.ts` — getter 사용 부분 대체 (b 선택 시)

## 3. 프론트-백엔드 contract 통합 테스트 범위

- 현재 구현: 백엔드 응답 스키마(camelCase 필드, detail 에러, 401/403/503 상태)만 검증.
  프론트 `src/api/client.ts`가 실제 응답을 파싱하는 것은 검증하지 않음.
- 필요한 결정:
  - (a) T13 범위를 백엔드 응답 스키마까지만 → 현재 구현 유지.
  - (b) 프론트 client 파싱까지 통합 테스트에 포함 → 별도 Task 또는 T13 확장.
    프론트 `src/api/client.ts`의 `extractErrorMessage`, User 세션 저장 로직 검증 필요.
- 변경 위치:
  - (b) 선택 시 `test/`에 프론트 client 모킹 통합 테스트 추가, 또는 별도 Task 생성.

## 4. 진단 → 날씨 → 패턴 READY end-to-end 검증

- 현재 구현: `diagnosis-pattern.e2e-spec.ts`는 외부 API mock이 UNAVAILABLE이므로
  진단 제출 시 `weatherSnapshotId`가 null이 됨. PatternService는 weatherSnapshot이 있는
  진단만 시계열에 포함하므로, 테스트에서는 DB에 직접 weatherSnapshot을 연결한 진단을
  생성해 LOCKED 상태만 검증. READY end-to-end는 `pattern.service.spec.ts` 단위 테스트에 위임.
- 필요한 결정:
  - (a) 현재처럼 LOCKED만 e2e, READY는 단위 테스트 위임 → 유지.
  - (b) READY end-to-end도 e2e로 검증 → 날씨 API mock이 LIVE 값을 반환하도록
    `diagnosis-pattern.e2e-spec.ts`의 KMA/AirKorea mock을 LIVE 데이터로 설정.
- 변경 위치:
  - `test/diagnosis-pattern.e2e-spec.ts` — 날씨 mock을 LIVE로 설정 + 진단 5개 이상 생성 (b 선택 시)

## 5. ADMIN 전용 운영 API 보호 테스트 대상

- 현재 구현: `RolesGuard` 단위 테스트로 USER가 ADMIN API에 접근 시 403을 검증.
  하지만 실제 ADMIN 전용 엔드포인트가 아직 컨트롤러에 없음
  (`@Roles(Role.ADMIN)`가 붙은 라우트가 현재 없음 — T3에 "ADMIN 전용 운영 API 보호"가 미완료).
- 필요한 결정:
  - (a) ADMIN 엔드포인트가 추가될 때 해당 컨트롤러에 e2e 테스트 추가 → 현재 RolesGuard 단위만 유지.
  - (b) 지금 테스트용 ADMIN 엔드포인트(예: `GET /admin/users`)를 임시로 추가해 e2e로 검증.
    단, 이는 T3 미완료 항목을 T13에서 끌어오는 것이므로 범위 확장.
- 변경 위치:
  - (b) 선택 시 `src/modules/admin/` 임시 컨트롤러 + `test/admin.e2e-spec.ts` 추가

## 6. migration_lock 파일 형식 통일 (T14)

- 현재 구현: `prisma/migrations/`에 `migration_lock.json`(기존)과
  `migration_lock.toml`(T14에서 CI migration diff 검사용으로 추가)이 공존.
  - `prisma migrate deploy`, `prisma migrate status` — `migration_lock.json`을 읽음.
  - `prisma migrate diff --from-migrations` (CI 검사) — `migration_lock.toml`을 요구.
- 필요한 결정: Prisma 7에서 정식 lock 파일 형식을 확인 후 하나로 통일.
- 확인 방법:
  ```bash
  cd backend
  npx prisma migrate dev --name test_lock_format --create-only
  ls prisma/migrations/migration_lock.*
  ```
  위 명령으로 Prisma 7이 새로 생성하는 lock 파일 형식을 확인한 뒤, 다른 하나를 삭제.
- 변경 위치:
  - `prisma/migrations/migration_lock.json` 또는 `migration_lock.toml` 중 하나 삭제.

## 7. 운영 인프라 및 배포 방식 확정 (T14)

- 현재 구현: `docker/DEPLOYMENT.md`에 단일 서버 + docker compose를 추천으로 기재.
  CI는 build/test/lint/migration diff 검사까지 완료. 자동 CD는 미설정.
- 필요한 결정: 운영 환경을 확정해야 자동 CD 워크플로우 추가 가능.
- 결정 항목:
  - 운영 서버 유형 (VPS / 클라우드 VM / 컨테이너 플랫폼)
  - 컨테이너 이미지 저장소 (GHCR / Docker Hub / 사내 registry)
  - 시크릿 주입 방식 (환경변수 파일 마운트 / 시크릿 매니저 / 오케스트레이터 내장 시크릿)
  - 운영 DB 관리 방식 (컨테이너 내부 / 외부 관리형 DB)
  - 배포 자동화 여부 (CI 통과 후 자동 push + deploy / 수동 승인 후 배포)
- 변경 위치:
  - 항목 확정 시 `.github/workflows/`에 CD 워크플로우 추가.
  - 운영 환경 변수 주입 설정 (docker compose `env_file` 또는 시크릿 매니저 연동).
