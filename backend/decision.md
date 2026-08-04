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
