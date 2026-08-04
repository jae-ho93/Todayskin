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
