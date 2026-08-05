# Todayskin 온보딩 가이드

> 코드베이스 지식 그래프 기반 온보딩 문서 · 분석 커밋 `728e835` (2026-08-05)

---

## 1. 프로젝트 개요

**Todayskin** (패키지명: Weatherskin)은 날씨 기반 피부 진단과 맞춤형 제품 추천을 제공하는 모바일 애플리케이션입니다.

| 항목 | 내용 |
|------|------|
| **프론트엔드** | Expo (SDK 54), React Native, Expo Router 6, React 19 |
| **백엔드** | NestJS 11, TypeScript, Prisma 7, PostgreSQL, Redis |
| **레거시 백엔드** | Python FastAPI (backend/app/, 마이그레이션 완료 상태) |
| **AI** | Google Gemini (추천 생성, 근거 검증) |
| **외부 API** | 기상청(KMA) 자외선, 에어코리아 대기질 |
| **인프라** | Docker, docker-compose, GitHub Actions CI |

핵심 가치: 사용자가 피부를 촬영하면 AI가 진단하고, 현재 날씨·대기질 데이터를 결합해 근거 기반 스킨케어 추천과 제품을 제안합니다.

---

## 2. 아키텍처 레이어

12개 레이어로 구성된 전체 아키텍처:

| 레이어 | 파일 수 | 설명 |
|--------|---------|------|
| 프론트엔드 UI | 30 | Expo Router 화면(app/)과 재사용 컴포넌트(src/components/) |
| 프론트엔드 인프라 | 8 | API 클라이언트, 훅, 세션, 테마, 타입 정의 |
| 백엔드 API | 49 | NestJS 컨트롤러·모듈·DTO·enum (HTTP 엔드포인트) |
| 백엔드 서비스 | 21 | 도메인 서비스, 외부 API 클라이언트, 정책, Prisma/Redis 서비스 |
| 백엔드 공통 인프라 | 11 | JWT 가드, 예외 필터, 데코레이터, 환경설정 검증 |
| 데이터 | 15 | Prisma 스키마, 마이그레이션 SQL, 11개 DB 테이블, 시드 |
| 레거시 백엔드 | 16 | Python FastAPI 코드 (backend/app/) |
| 인프라 | 4 | Dockerfile, docker-compose, 배포 문서 |
| CI/CD | 1 | GitHub Actions 워크플로우 |
| 설정 | 18 | package.json, tsconfig, eslint, env 예시 등 |
| 테스트 | 23 | 단위 테스트(.spec.ts) + E2E 테스트(backend/test/) |
| 문서 | 8 | README, CONTRIBUTING, 의사결정 기록 |

---

## 3. 핵심 개념

### 3.1 Inference Provider 패턴

진단 모듈은 `InferenceProvider` 인터페이스를 통해 AI 추론을 추상화합니다. 현재 `MockInferenceProvider`가 개발용으로 구현되어 있으며, 실제 AI 모델 연결 시 교체 가능합니다. DI 토큰(`INFERENCE_PROVIDER`)으로 주입됩니다.

### 3.2 근거 등급 체계 (EvidenceGrade)

추천 시스템은 LLM이 등급을 결정하지 않습니다. 서버가 A/B/C 등급을 고정합니다:

- **A등급**: 공인 가이드라인 기반 고정 템플릿 (시드 데이터)
- **B등급**: 개별 임상/관찰 연구 기반 Gemini 동적 생성
- **C등급**: 개인 시계열 통계적 관찰 (Pattern 모듈)

`EvidencePolicy`가 Gemini 출력에서 과장 표현, 의학적 단정, 금지 성분을 사후 검증합니다.

### 3.3 날씨 데이터 파이프라인

`WeatherService`가 KMA 자외선과 AirKorea 대기질을 병렬 수집, Redis 캐시, Prisma 영속화하는 오케스트레이션을 담당합니다. 외부 API 실패 시 빈 값을 반환하고 가짜 데이터로 대체하지 않습니다.

### 3.4 개인 패턴 분석

`PatternService`가 Diagnosis와 WeatherSnapshot 시계열을 조인해 피어슨 상관계수를 계산합니다. 데이터 부족 시 404가 아닌 `LOCKED` 상태를 반환하며, 인과관계가 아닌 상관관계임을 고정 문구로 표시합니다.

### 3.5 JWT 인증과 토큰 갱신

휴대폰 번호 기반 가입/로그인, JWT access token + refresh token 이중 토큰 구조. refresh token은 해시하여 DB에 저장하고, `JwtAuthGuard`가 보호된 엔드포인트를 제어합니다.

### 3.6 레거시 마이그레이션 (T0-T14)

FastAPI 기반 레거시 백엔드를 NestJS + TypeScript + PostgreSQL(Prisma) + Redis로 전환하는 14개 태스크가 완료된 상태입니다. backend/app/의 Python 코드는 레거시로 남아 있으며, 59개 설계 결정이 decision.md에 기록되어 있습니다.

---

## 4. 가이드 투어 (12단계)

새 개발자가 코드베이스를 이해하는 권장 순서:

### Step 1: 프로젝트 개요 및 아키텍처
코드를 읽기 전에 프로젝트가 해결하는 문제와 아키텍처 방향성을 문서로 파악합니다.
- [README.md](/Users/minseokchae/Dev/Todayskin/README.md)
- [AGENTS.md](/Users/minseokchae/Dev/Todayskin/AGENTS.md)
- [backend/README.md](/Users/minseokchae/Dev/Todayskin/backend/README.md)
- [backend/decision.md](/Users/minseokchae/Dev/Todayskin/backend/decision.md)

### Step 2: 프론트엔드 진입점
Expo Router의 최상위 진입점과 루트 레이아웃을 살펴봅니다.
- [app/index.tsx](/Users/minseokchae/Dev/Todayskin/app/index.tsx) - 세션 여부에 따라 온보딩/메인 분기
- [app/_layout.tsx](/Users/minseokchae/Dev/Todayskin/app/_layout.tsx) - SafeAreaProvider, StatusBar, 전역 Provider

### Step 3: 온보딩 플로우
신규 사용자가 거치는 로그인, 회원가입, 동의, 위치 권한 단계를 따라갑니다.
- [app/onboarding/_layout.tsx](/Users/minseokchae/Dev/Todayskin/app/onboarding/_layout.tsx)
- [app/onboarding/login.tsx](/Users/minseokchae/Dev/Todayskin/app/onboarding/login.tsx)
- [app/onboarding/signup.tsx](/Users/minseokchae/Dev/Todayskin/app/onboarding/signup.tsx)
- [src/components/OnboardingScaffold.tsx](/Users/minseokchae/Dev/Todayskin/src/components/OnboardingScaffold.tsx)

### Step 4: 메인 탭 네비게이션
온보딩 이후 노출되는 하단 탭 구조(Home, History, Products, Settings)를 파악합니다.
- [app/(tabs)/_layout.tsx](/Users/minseokchae/Dev/Todayskin/app/(tabs)/_layout.tsx)
- [app/(tabs)/index.tsx](/Users/minseokchae/Dev/Todayskin/app/(tabs)/index.tsx)
- [app/(tabs)/history.tsx](/Users/minseokchae/Dev/Todayskin/app/(tabs)/history.tsx)
- [app/(tabs)/products.tsx](/Users/minseokchae/Dev/Todayskin/app/(tabs)/products.tsx)

### Step 5: 핵심 기능 화면과 UI 컴포넌트
진단 결과, 추천 상세, 날씨 상세 화면과 이들이 조합하는 재사용 컴포넌트를 봅니다.
- [app/diagnosis-result.tsx](/Users/minseokchae/Dev/Todayskin/app/diagnosis-result.tsx)
- [app/recommendation/[id].tsx](/Users/minseokchae/Dev/Todayskin/app/recommendation/[id].tsx)
- [src/components/CircularGauge.tsx](/Users/minseokchae/Dev/Todayskin/src/components/CircularGauge.tsx)
- [src/components/WeatherCard.tsx](/Users/minseokchae/Dev/Todayskin/src/components/WeatherCard.tsx)
- [src/components/RecommendationCard.tsx](/Users/minseokchae/Dev/Todayskin/src/components/RecommendationCard.tsx)

### Step 6: 디자인 시스템과 도메인 타입
theme/ 토큰이 UI 일관성을 담당하고, src/types/index.ts가 백엔드 DTO 계약을 미러링합니다.
- [src/theme/index.ts](/Users/minseokchae/Dev/Todayskin/src/theme/index.ts)
- [src/theme/colors.ts](/Users/minseokchae/Dev/Todayskin/src/theme/colors.ts)
- [src/theme/typography.ts](/Users/minseokchae/Dev/Todayskin/src/theme/typography.ts)
- [src/types/index.ts](/Users/minseokchae/Dev/Todayskin/src/types/index.ts)

### Step 7: 프론트엔드 인프라 - API 클라이언트와 세션
프론트엔드가 백엔드와 통신하는 방식을 이해합니다.
- [src/api/client.ts](/Users/minseokchae/Dev/Todayskin/src/api/client.ts) - 모든 API 엔드포인트 통합 제공
- [src/lib/session.ts](/Users/minseokchae/Dev/Todayskin/src/lib/session.ts) - AsyncStorage 토큰 관리
- [src/hooks/useUserLocation.tsx](/Users/minseokchae/Dev/Todayskin/src/hooks/useUserLocation.tsx) - 전역 위치 상태

### Step 8: 백엔드 진입점과 인증 모듈
NestJS 부팅, 모듈 조립, JWT 인증 흐름을 파악합니다.
- [backend/src/main.ts](/Users/minseokchae/Dev/Todayskin/backend/src/main.ts)
- [backend/src/app.module.ts](/Users/minseokchae/Dev/Todayskin/backend/src/app.module.ts)
- [backend/src/modules/auth/auth.service.ts](/Users/minseokchae/Dev/Todayskin/backend/src/modules/auth/auth.service.ts)
- [backend/src/modules/auth/auth.controller.ts](/Users/minseokchae/Dev/Todayskin/backend/src/modules/auth/auth.controller.ts)
- [backend/src/common/strategies/jwt.strategy.ts](/Users/minseokchae/Dev/Todayskin/backend/src/common/strategies/jwt.strategy.ts)

### Step 9: 피부 진단 도메인
이미지 3장 업로드, inference provider 호출, 결과 검증, Prisma 트랜잭션 저장 흐름을 확인합니다.
- [backend/src/modules/diagnosis/diagnosis.controller.ts](/Users/minseokchae/Dev/Todayskin/backend/src/modules/diagnosis/diagnosis.controller.ts)
- [backend/src/modules/diagnosis/diagnosis.service.ts](/Users/minseokchae/Dev/Todayskin/backend/src/modules/diagnosis/diagnosis.service.ts)
- [backend/src/modules/diagnosis/providers/inference-provider.interface.ts](/Users/minseokchae/Dev/Todayskin/backend/src/modules/diagnosis/providers/inference-provider.interface.ts)

### Step 10: 추천 생성과 Gemini AI 연동
진단 결과 기반 Gemini 추천 생성과 EvidencePolicy 근거 검증을 살펴봅니다.
- [backend/src/modules/recommendations/recommendation.service.ts](/Users/minseokchae/Dev/Todayskin/backend/src/modules/recommendations/recommendation.service.ts)
- [backend/src/modules/gemini/gemini.client.ts](/Users/minseokchae/Dev/Todayskin/backend/src/modules/gemini/gemini.client.ts)
- [backend/src/modules/gemini/evidence.policy.ts](/Users/minseokchae/Dev/Todayskin/backend/src/modules/gemini/evidence.policy.ts)
- [backend/src/modules/products/product.service.ts](/Users/minseokchae/Dev/Todayskin/backend/src/modules/products/product.service.ts)

### Step 11: 날씨 데이터 수집 모듈
KMA/AirKorea 병렬 수집, Redis 캐싱, Prisma 영속화 오케스트레이션을 파악합니다.
- [backend/src/modules/weather/weather.service.ts](/Users/minseokchae/Dev/Todayskin/backend/src/modules/weather/weather.service.ts)
- [backend/src/modules/weather/weather.controller.ts](/Users/minseokchae/Dev/Todayskin/backend/src/modules/weather/weather.controller.ts)
- [backend/src/modules/weather/clients/kma.client.ts](/Users/minseokchae/Dev/Todayskin/backend/src/modules/weather/clients/kma.client.ts)
- [backend/src/modules/weather/clients/airkorea.client.ts](/Users/minseokchae/Dev/Todayskin/backend/src/modules/weather/clients/airkorea.client.ts)
- [backend/src/modules/weather/weather-cache.ts](/Users/minseokchae/Dev/Todayskin/backend/src/modules/weather/weather-cache.ts)

### Step 12: 데이터 레이어와 인프라
Prisma 스키마, 시드, Docker/Compose, CI로 이어지는 배포 파이프라인을 확인합니다.
- [backend/prisma/schema.prisma](/Users/minseokchae/Dev/Todayskin/backend/prisma/schema.prisma)
- [backend/prisma/seed.ts](/Users/minseokchae/Dev/Todayskin/backend/prisma/seed.ts)
- [backend/Dockerfile](/Users/minseokchae/Dev/Todayskin/backend/Dockerfile)
- [backend/docker-compose.yml](/Users/minseokchae/Dev/Todayskin/backend/docker-compose.yml)
- [.github/workflows/ci.yml](/Users/minseokchae/Dev/Todayskin/.github/workflows/ci.yml)

---

## 5. 파일 맵

### 프론트엔드 UI 레이어

| 파일 | 복잡도 | 설명 |
|------|--------|------|
| app/index.tsx | simple | 세션 여부에 따라 온보딩/메인 탭 분기 |
| app/_layout.tsx | simple | SafeAreaProvider, StatusBar, 전역 Provider |
| app/(tabs)/_layout.tsx | moderate | Home/History/Products/Settings 하단 탭 네비게이터 |
| app/(tabs)/index.tsx | complex | 메인 홈 대시보드 (위치, 날씨, 피부 점수, 추천 종합) |
| app/(tabs)/history.tsx | moderate | 진단 히스토리, SVG 폴리라인 점수 추이 |
| app/(tabs)/products.tsx | moderate | 날씨 기반 추천 화장품, 카테고리 필터 |
| app/(tabs)/settings.tsx | moderate | 알림/언어/버전 정보, 로그아웃 |
| app/camera-guide.tsx | complex | 카메라 권한, 단계별 촬영 가이드, 진단 제출 |
| app/diagnosis-result.tsx | moderate | 진단 결과, 피부 점수, 부위별 분석 |
| app/weather-detail.tsx | complex | 자외선/미세먼지/습도 상세 표시 |
| app/recommendation/[id].tsx | moderate | 추천 상세, 성분 태그, 관련 제품 |
| app/trend.tsx | moderate | 피부 점수 추이, 상관관계 분석 |
| app/onboarding/signup.tsx | complex | 회원가입 (이름/전화번호/생년월일/성별 단계 입력) |
| app/onboarding/login.tsx | moderate | 전화번호 로그인 |
| app/onboarding/consent.tsx | moderate | 약관 동의 |
| app/onboarding/location.tsx | moderate | 위치 권한 요청 |
| src/components/CircularGauge.tsx | medium | 0~100 원형 게이지 (react-native-svg) |
| src/components/WeatherCard.tsx | medium | 날씨 요약 카드 (CAI, UV, 미세먼지) |
| src/components/RecommendationCard.tsx | medium | 추천 카드 (타이밍, 근거 등급, 출처) |
| src/components/StatusBadge.tsx | medium | 대기질 상태 배지 (좋음/보통/나쁨) |
| src/components/EvidenceBadge.tsx | medium | 근거 등급 A/B/C 배지 |
| src/components/OnboardingScaffold.tsx | medium | 온보딩 공통 레이아웃 (인디케이터, CTA) |
| src/components/FaceIllustration.tsx | low | 얼굴 SVG 일러스트레이션 |
| src/components/MetricBar.tsx | low | 부위별 수분/탄력 메트릭 바 |
| src/components/Card.tsx | low | 기본 카드 컨테이너 |
| src/components/IngredientChip.tsx | low | 성분 태그 칩 |
| src/components/ScreenContainer.tsx | low | SafeAreaView 화면 컨테이너 |

### 프론트엔드 인프라

| 파일 | 복잡도 | 설명 |
|------|--------|------|
| src/api/client.ts | high | 모든 API 엔드포인트 통합, 타임아웃, 인증 헤더 |
| src/hooks/useUserLocation.tsx | high | 위치 Context Provider, GPS 1회 조회 공유 |
| src/lib/session.ts | medium | AsyncStorage 토큰 저장/조회/삭제 |
| src/types/index.ts | medium | EvidenceGrade, WeatherSnapshot, Recommendation 등 도메인 타입 |
| src/theme/colors.ts | low | 컬러 팔레트 (sage/coral/ochre, 배지 전용색) |
| src/theme/typography.ts | low | 7단계 폰트 스타일 토큰 |
| src/theme/spacing.ts | low | 간격/라운드/그림자 토큰 |
| src/theme/index.ts | low | theme barrel 파일 |

### 백엔드 API 레이어 (주요 파일)

| 파일 | 복잡도 | 설명 |
|------|--------|------|
| backend/src/main.ts | medium | NestJS 부트스트랩 (ValidationPipe, CORS, Swagger) |
| backend/src/app.module.ts | medium | 루트 모듈 (9개 도메인 모듈 조립) |
| backend/src/modules/auth/auth.controller.ts | medium | signup/login/logout/refresh/me 엔드포인트 |
| backend/src/modules/diagnosis/diagnosis.controller.ts | medium | 진단 조회/이력/제출 API |
| backend/src/modules/recommendations/recommendation.controller.ts | medium | 추천 카탈로그/B등급 생성/상세 조회 |
| backend/src/modules/gemini/gemini.client.ts | high | Gemini API 클라이언트 (스키마 검증, 성분 화이트리스트) |
| backend/src/modules/weather/weather.controller.ts | low | GET /weather (lat/lon) |
| backend/src/modules/pattern/pattern.controller.ts | low | GET /diagnosis/pattern (시계열 상관 분석) |
| backend/src/modules/notifications/notification.controller.ts | low | 알림 설정 조회/수정 |
| backend/src/modules/products/product.controller.ts | low | 제품 목록/날씨 기반 제품 생성 |

### 백엔드 서비스 레이어 (주요 파일)

| 파일 | 복잡도 | 설명 |
|------|--------|------|
| backend/src/modules/weather/weather.service.ts | high | 날씨 수집/캐싱/영속화 오케스트레이션 |
| backend/src/modules/recommendations/recommendation.service.ts | high | A등급 템플릿/B등급 Gemini 생성, advisory lock |
| backend/src/modules/pattern/pattern.service.ts | high | 피어슨 상관계수, LOCKED/READY 분기 |
| backend/src/modules/diagnosis/diagnosis.service.ts | high | 이미지 검증, inference, 트랜잭션 저장 |
| backend/src/modules/auth/auth.service.ts | high | 토큰 발급/검증, 전화번호 정규화 |
| backend/src/modules/gemini/evidence.policy.ts | medium | Gemini 출력 근거 정책 검증 |
| backend/src/modules/products/product.service.ts | medium | 카탈로그 조회, 날씨 기반 제품 생성 |
| backend/src/modules/weather/clients/kma.client.ts | high | 기상청 자외선 API client |
| backend/src/modules/weather/clients/airkorea.client.ts | high | 에어코리아 대기오염 API client |
| backend/src/modules/weather/clients/station.client.ts | medium | 근접측정소 조회 (proj4 좌표 변환) |
| backend/src/prisma/prisma.service.ts | low | Prisma Client 래퍼 (connect/disconnect) |
| backend/src/redis/redis.service.ts | medium | Redis 캐시 서비스 (JSON get/set/invalidate) |

### 백엔드 공통 인프라

| 파일 | 복잡도 | 설명 |
|------|--------|------|
| backend/src/common/filters/http-exception.filter.ts | high | 전역 예외 필터 (통일 응답, Prisma 에러 일반화) |
| backend/src/common/guards/jwt-auth.guard.ts | low | JWT Bearer 토큰 검증 가드 |
| backend/src/common/guards/roles.guard.ts | low | 역할 기반 접근 제어 가드 |
| backend/src/common/strategies/jwt.strategy.ts | medium | Passport JWT 전략 |
| backend/src/config/env.validation.ts | low | 환경변수 검증 스키마 |

### 데이터 레이어

| 파일 | 복잡도 | 설명 |
|------|--------|------|
| backend/prisma/schema.prisma | high | 11개 모델 정의 (User, Diagnosis, WeatherSnapshot 등) |
| backend/prisma/migrations/.../migration.sql | high | 초기 마이그레이션 (11개 테이블 CREATE) |
| backend/prisma/seed.ts | medium | A등급 추천 템플릿 + 제품 카탈로그 upsert |

### 인프라 및 CI/CD

| 파일 | 복잡도 | 설명 |
|------|--------|------|
| backend/Dockerfile | moderate | Node 22 LTS multi-stage 빌드 |
| backend/docker-compose.yml | moderate | PostgreSQL + Redis + NestJS 로컬 개발 |
| .github/workflows/ci.yml | complex | 프론트엔드 타입체크 + 백엔드 빌드/테스트 + Prisma migration diff |

---

## 6. 복잡도 핫스팟

새 개발자가 접근할 때 주의가 필요한 고복잡도 영역:

| 순위 | 파일 | 복잡도 | 주의점 |
|------|------|--------|--------|
| 1 | weather.service.ts | high | KMA/AirKorea 병렬 수집, 캐시, 영속화 오케스트레이션. 외부 API 실패 처리와 폴백 로직이 복잡 |
| 2 | recommendation.service.ts | high | advisory lock 기반 중복 생성 방지, Gemini 실패 시 503 반환. A/B등급 분기 로직 |
| 3 | diagnosis.service.ts | high | 이미지 매직바이트 검증, inference 결과 검증, 중복 가드, Prisma 트랜잭션 |
| 4 | gemini.client.ts | high | Gemini API 응답 스키마 검증, 성분 화이트리스트, 에러 처리 |
| 5 | pattern.service.ts | high | 피어슨 상관계수 계산, LOCKED/READY 분기, 인과관계 면책 문구 |
| 6 | src/api/client.ts | high | 모든 API 엔드포인트 통합, 타임아웃, 인증 헤더, 에러 추출 |
| 7 | useUserLocation.tsx | high | Context Provider, GPS 권한, 폴백 처리 |
| 8 | app/(tabs)/index.tsx | complex | 홈 대시보드 (위치/날씨/피부/추천 종합 로딩) |
| 9 | camera-guide.tsx | complex | 카메라 권한, 3단계 촬영, 진단 제출 |
| 10 | onboarding/signup.tsx | complex | 4단계 입력 검증 (전화번호/생년월일 포맷) |
| 11 | schema.prisma | high | 11개 모델, 관계 정의. 스키마 변경 시 마이그레이션 영향도 확인 필요 |
| 12 | ci.yml | complex | 3개 job, Postgres 서비스 컨테이너, Prisma migration diff 검사 |

---


## 7. 코드 탐색 도구 (Understand-Anything)

이 프로젝트는 Understand-Anything 플러그인으로 지식 그래프를 생성하고 대시보드로 시각화할 수 있습니다.

### 지식 그래프 생성

```bash
# 코드베이스 전체 분석 (한국어 출력)
/understand --language ko

# 변경사항만 증분 분석 (커밋 후 자동)
/understand

# 전체 재분석
/understand --full
```

분석 결과는 `.ua/knowledge-graph.json`에 저장됩니다 (gitignore 제외).

### 대시보드 실행

```bash
# 인터랙티브 웹 대시보드 시작
/understand-dashboard
```

대시보드 URL이 터미널에 출력됩니다 (`?token=` 포함). 브라우저에서 열면:

- 노드/엣지 그래프 시각화
- 레이어별 아키텍처 뷰
- 가이드 투어 단계별 탐색
- 파일 검색 및 의존 관계 추적

### 온보딩 가이드 재생성

```bash
# 이 문서 자동 재생성 (지식 그래프 변경 후)
/understand-onboard
```

### 자동 업데이트

커밋 시 자동으로 지식 그래프를 갱신하려면:

```bash
/understand --auto-update
```

---

## 8. 개발 팁

### 프로젝트 명명 주의

`app.json`과 `package.json`은 "Weatherskin"을 사용하지만, README와 폴더명은 "Todayskin"입니다. 백엔드 패키지명은 `todayskin-backend`입니다. 이중 명명이 있으니 컨텍스트에 따라 적절히 사용하세요.

### 백엔드 모듈 구조

NestJS 모듈은 Controller → Service → Client/Prisma 계층으로 나뉩니다. 새 모듈 추가 시:

1. `backend/src/modules/<domain>/` 디렉토리 생성
2. `*.module.ts`, `*.controller.ts`, `*.service.ts` 작성
3. DTO는 `dto/`, enum은 `enums/` 하위에 배치
4. `app.module.ts`에 모듈 등록
5. 단위 테스트(`*.spec.ts`)와 E2E 테스트(`backend/test/`) 작성

### 외부 API 클라이언트

날씨 클라이언트(KMA, AirKorea, Station)는 `fetchWithTimeout` 패턴을 공유합니다. 새 외부 API 클라이언트 추가 시 같은 패턴을 따르고, 실패 시 빈 값을 반환하며 가짜 데이터로 대체하지 않습니다.

### Prisma 마이그레이션

```bash
cd backend
npx prisma migrate dev --name <description>  # 개발 환경
npx prisma migrate deploy                      # 운영 환경
```

공유된 마이그레이션을 수정하거나 삭제하지 마세요. 새 마이그레이션은 담당자를 먼저 공유하세요.

### 환경변수

백엔드 환경변수는 `backend/.env.example`을 참조하세요. 프론트엔드는 `.env.example`의 `EXPO_PUBLIC_API_BASE_URL`을 설정하세요. 실기기 테스트 시 LAN IP를 사용합니다.

---

## 9. 시작하기

### 로컬 개발 환경

```bash
# 프론트엔드
npm install
npm start          # Expo 개발 서버

# 백엔드
cd backend
npm install
cp .env.example .env   # 환경변수 설정
docker compose up -d   # PostgreSQL + Redis
npx prisma migrate dev # 마이그레이션
npx prisma db seed     # 시드 데이터
npm run start:dev      # NestJS 개발 서버
```

### 테스트

```bash
cd backend
npm run test          # 단위 테스트
npm run test:e2e      # E2E 테스트 (Postgres 필요)
```

### 추가 리소스

- [backend/decision.md](/Users/minseokchae/Dev/Todayskin/backend/decision.md) - 59개 설계 결정 상세 기록
- [backend/easydecision.md](/Users/minseokchae/Dev/Todayskin/backend/easydecision.md) - 일상어 풀이 버전
- [backend/BACKEND_TASKS.md](/Users/minseokchae/Dev/Todayskin/backend/BACKEND_TASKS.md) - T0-T14 작업 분해
- [CONTRIBUTING.md](/Users/minseokchae/Dev/Todayskin/CONTRIBUTING.md) - 브랜치 전략, 커밋 규칙, PR 가이드
- 대시보드: 지식 그래프 시각화 (`/understand-dashboard` 실행)
