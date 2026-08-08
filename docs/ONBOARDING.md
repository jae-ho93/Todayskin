# Todayskin 온보딩 가이드

이 문서는 현재 저장소의 프론트엔드, NestJS 백엔드, FastAPI 추론 서비스와 운영 경계를 빠르게 이해하기 위한 읽기 순서입니다.

## 1. 프로젝트 개요

Todayskin은 사용자의 피부 이미지를 분석하고 날씨·대기질을 결합해 피부 상태와 스킨케어 추천을 제공하는 Expo 애플리케이션입니다.

| 영역 | 현재 기술 |
|---|---|
| 프론트엔드 | Expo SDK 54, React Native 0.81, Expo Router 6, React 19 |
| 메인 백엔드 | NestJS 11, TypeScript, Prisma 7, PostgreSQL |
| AI 추론 | FastAPI, MobileNetV3, MediaPipe landmarks |
| 캐시·비동기 | Redis, BullMQ, Inline fallback |
| 운영 | GitHub Actions, ECR, ECS Fargate, RDS, S3, CloudWatch |

T0~T14와 N0~N22 구현이 반영되어 있습니다. 남은 백엔드 작업은 실제 AWS 리소스 프로비저닝·첫 배포(N16)뿐이며 계정·시크릿·승인자 준비 후 진행합니다.

## 2. 반드시 지킬 서버 경계

- NestJS: 인증, 권한, 동의, 데이터 소유권, 비즈니스 로직, DB, 이미지 저장 정책
- FastAPI: 이미지 바이트를 메모리에서 처리하고 점수·등급·landmarks만 반환
- PostgreSQL/Prisma: 사용자, 동의, 진단, 추천, job, 감사 로그의 기준 저장소
- Redis: 날씨 캐시와 BullMQ broker
- S3: 저장 동의가 있는 이미지 원본만 암호화 저장

FastAPI에 인증·DB·추천 정책을 넣거나 NestJS에 모델을 직접 로드하지 않습니다. 자세한 원칙은 [ARCHITECTURE.md](ARCHITECTURE.md)를 따릅니다.

## 3. 권장 코드 탐색 순서

### 1) 실행과 전체 조립

- `README.md`
- `backend/README.md`
- `backend/src/main.ts`
- `backend/src/app.module.ts`
- `backend/src/config/env.validation.ts`
- `backend/src/config/env.registry.ts`

전역 ValidationPipe, CORS, Helmet, Pino/Sentry, rate limit과 각 도메인 모듈의 조립을 먼저 봅니다.

### 2) 인증·OTP·권한

- `backend/src/modules/auth/`
- `backend/src/modules/otp/`
- `backend/src/modules/admin/`
- `backend/src/common/guards/`
- `backend/src/common/strategies/jwt.strategy.ts`

Refresh Token은 해시로 DB에 저장하고 회전합니다. 가입·로그인은 OTP 검증 기록을 소비하며 ADMIN API는 역할 가드와 감사 로그를 사용합니다. 운영 `SmsOtpProvider`는 알리고 게이트웨이로 실제 SMS를 발송하고, 번호별 일일 발송 한도·코드 해시 저장(N22)이 적용됩니다.

### 3) 동의와 이미지 수명주기

- `backend/src/modules/consent/`
- `backend/src/modules/storage/`
- `backend/src/common/soft-delete/`
- `backend/prisma/schema.prisma`

진단 처리 동의는 필수이고 이미지 저장 동의는 선택입니다. 저장 동의가 철회되면 이미지 객체와 landmarks를 제거합니다. 객체 삭제가 실패하면 DB 참조를 유지해 재시도할 수 있어야 합니다.

### 4) 진단과 추론

- `backend/src/modules/diagnosis/diagnosis.controller.ts`
- `backend/src/modules/diagnosis/diagnosis.service.ts`
- `backend/src/modules/diagnosis/providers/`
- `backend/inference-service/main.py`
- `backend/inference-service/analyzer.py`

흐름은 `multipart front 이미지 → 동의·파일 검증 → inference provider → 날씨 snapshot → Diagnosis/SkinMetric transaction → 선택적 S3 저장`입니다.

N8은 다음을 추가합니다.

- `GET /diagnosis/history/:date`
- `GET /diagnosis/score-series`
- 저장 동의가 있을 때만 presigned image URL과 landmarks 노출

### 5) 날씨·추천·패턴

- `backend/src/modules/weather/`
- `backend/src/modules/gemini/`
- `backend/src/modules/recommendations/`
- `backend/src/modules/products/`
- `backend/src/modules/pattern/`

외부 날씨 API가 실패하면 임의의 정상값을 만들지 않고 nullable 지표와 명시적 unavailable 계약을 사용합니다. 추천은 서버가 진단 소유권을 확인하고 A/B/C 근거 등급을 관리합니다. 패턴 데이터가 부족하면 404가 아니라 `200 + LOCKED`입니다.

### 6) 비동기 작업

- `backend/src/modules/jobs/`
- `backend/src/modules/jobs/dispatchers/`
- `backend/src/modules/jobs/handlers/domain-job.handlers.ts`

`JOB_DISPATCHER=auto`는 Redis가 있으면 BullMQ, 없으면 Inline을 선택합니다. 두 dispatcher는 PENDING → COMPLETED/FAILED 상태 계약을 공유합니다.

### 7) 데이터와 운영

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/`
- `backend/prisma/seed.ts`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-ecs.yml`
- `backend/docker/DEPLOYMENT.md`

운영 migration은 앱 컨테이너가 아니라 승인된 release task에서 수행합니다. `schema.prisma` 상단의 FK 정책과 `backend/decision.md`의 Soft Delete·보존 요약을 함께 확인합니다.

### 8) 프론트 연결

- `src/api/client.ts`
- `src/types/index.ts`
- `src/lib/session.ts`
- `app/camera-guide.tsx`
- `app/diagnosis-result.tsx`
- `app/(tabs)/history.tsx`

프론트 API 타입은 백엔드 응답 계약을 미러링해야 합니다. 목업 성공값으로 실패를 숨기지 않고 error/unavailable/not_found 상태를 구분합니다.

## 4. 백엔드 모듈 지도

| 모듈 | 책임 |
|---|---|
| auth | signup/login/refresh/logout/withdraw, JWT 세션 |
| otp | OTP 생성·검증·소비와 제한 정책 |
| admin | 역할 변경, 사용자 운영, purge, 감사 로그 |
| consent | 목적/version별 동의 게이트와 철회 정책 |
| storage | S3/Memory 객체 저장, presigned URL, 삭제 |
| diagnosis | 진단 제출·조회, 캘린더, score series |
| weather | KMA/AirKorea 수집, cache, snapshot |
| recommendations | 근거 등급 추천 생성·조회 |
| products | 카탈로그와 날씨 기반 제품 생성 |
| pattern | 개인 시계열 상관 분석 |
| notifications | 알림 설정과 발송 핸들러 |
| gemini | 외부 LLM 호출과 근거 정책 |
| jobs | Inline/BullMQ enqueue, worker, 상태, DLQ |

## 5. API와 데이터 계약에서 주의할 점

- 기존 `camelCase` 응답과 Bearer 인증을 임의로 바꾸지 않습니다.
- 사용자별 조회는 `userId` 또는 명시적 소유권 검사를 포함합니다.
- Soft Delete 모델 조회에는 `deletedAt: null` 정책을 적용합니다.
- 진단 날짜 범위는 Asia/Seoul 달력 기준입니다.
- 이미지와 landmarks는 현재 활성 저장 동의가 있어야 노출됩니다.
- 정부 API·Gemini·inference 실패를 정상 데이터로 위장하지 않습니다.
- migration 파일은 새로 추가하며 공유된 migration을 고치지 않습니다.

## 6. 로컬 시작

```bash
# 프론트
npm install
cp .env.example .env
npm start

# 백엔드
cd backend
npm install
cp .env.example .env
docker compose up -d
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run start:dev
```

상세 설정은 [SETUP.md](SETUP.md), 작업 상태와 다음 브랜치는 [BACKEND_TASKS.md](BACKEND_TASKS.md) · [FRONTEND_TASKS.md](FRONTEND_TASKS.md)를 참고합니다.

## 7. 변경 전 체크

1. `git switch main && git pull --ff-only origin main`
2. 변경 성격에 맞는 `feature/`, `fix/`, `refactor/`, `test/`, `docs/`, `chore/` 브랜치 생성
3. API·DB·환경변수 영향 확인
4. 관련 단위 테스트와 build/lint 정도만 비례해서 실행
5. PR에 남은 운영 작업과 위험을 기록

협업 규칙은 [CONTRIBUTING.md](../CONTRIBUTING.md)를 따릅니다.
