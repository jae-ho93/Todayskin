# Todayskin 백엔드 아키텍처 원칙

이 문서는 Todayskin의 백엔드 구조와 발전 방향을 정의한다. 코드를 수정할 때
이 원칙에서 벗어나는 변경은 먼저 이 문서를 갱신하거나 합의해야 한다.
이 프로젝트에서 작업하는 모든 에이전트/개발자는 이 원칙을 따른다.

## 1. 서버 역할 분리

### NestJS — 메인 백엔드 (BFF + 비즈니스 로직)
- Modular Monolith 구조를 유지한다.
- 모든 비즈니스 로직, 인증, 사용자 관리, 데이터 영속화를 담당한다.
- 현재 도메인 모듈: auth, otp, admin, consent, storage, diagnosis, weather,
  recommendations, products, pattern, notifications, gemini, jobs, idempotency.
- 진단 결과 저장, 제품 추천, 피부 변화 패턴 분석, 알림, 날씨·대기질, 동의·이미지 수명주기와 비동기 작업을 관리한다.

### FastAPI — 독립 AI 추론 서버
- AI 모델 서빙과 피부 이미지 추론에만 집중한다.
- 비즈니스 로직/인증/DB 접근을 갖지 않는다.
- 추론 결과(점수/등급/랜드마크 메타데이터)만 NestJS로 전달한다.
- 위치: backend/inference-service/ (analyzer.SkinAnalyzer 기반).
- 이미지는 메모리에서 처리되며 디스크에 기록하지 않는다.

> 원칙: AI 서버는 "추론 결과만 반환"한다. 비즈니스 의사결정·영속화는
> NestJS 측에서만 수행한다.

## 2. 이미지 저장 정책 (동의 기반)

- 사용자가 촬영한 얼굴 이미지는 명시적 동의한 경우에만 저장한다.
- 동의한 경우: 암호화하여 AWS S3에 저장, DB에는 메타데이터 + 저장 위치만 보관.
- 운영 환경은 `S3_BUCKET`을 필수로 하며 Memory fallback을 허용하지 않는다.
- 동의하지 않은 경우: 추론 직후 버퍼 참조를 해제하고 원본을 보관하지 않는다.
- 객체 삭제 실패 시 DB 참조를 유지해 재시도 가능한 상태로 남긴다.
- 추론 서버(FastAPI)는 원본을 디스크에 쓰지 않는다(인메모리 처리).

## 3. 데이터 계층

- PostgreSQL + Prisma 유지.
  - 데이터 모델링, Migration, Transaction, Index 설계, Query 최적화 역량 보존.
  - 운영: AWS RDS PostgreSQL.
  - 스키마: backend/prisma/schema.prisma.
- Redis
  - 날씨 캐시와 BullMQ broker로 사용한다.
  - Refresh Token은 PostgreSQL에 해시로 저장한다. HTTP Rate Limit은 N11부터 Redis 분산 저장소를 사용한다.
- BullMQ
  - 추천 생성, 피부 패턴 분석, 알림 발송 등 긴 작업을 비동기 처리한다.
  - Redis가 없는 개발·테스트 환경은 동일 상태 계약의 Inline dispatcher를 사용한다.

## 4. 개발/운영 인프라

### 개발
- Docker Compose로 NestJS, FastAPI, PostgreSQL, Redis를 함께 운영.
- compose: `backend/docker-compose.yml` — postgres + redis (기본),
  `--profile inference`로 FastAPI, `--profile backend`로 NestJS+FastAPI까지 실행한다.
- 운영 CD: `.github/workflows/deploy-ecs.yml` (ECR → 승인 → migrate → Fargate).

### 운영 (CI/CD)
- GitHub Actions 기반.
- Docker 이미지를 AWS ECR에 빌드 (tag = commit SHA).
- NestJS / FastAPI 각각 ECS Fargate에 배포.
- 연동: AWS RDS PostgreSQL, S3, CloudWatch, Secrets Manager.

## 5. 운영/보안 공통 요소

- Swagger 기반 API 문서화.
- SSE(`GET /jobs/:id/events`, NestJS `@Sse`) — BullMQ job 상태를 실시간 전달.
  프론트는 SSE 우선 소비, 실패 시 `GET /jobs/:id` 폴링으로 폴백한다 (2026-08-12).
- Jest Unit/E2E 테스트 (backend/test/*.e2e-spec.ts).
- Pino Logger.
- Sentry.
- JWT Access Token + Refresh Token 인증과 OTP 검증 흐름.
- Helmet, Validation, Rate Limit(N11부터 Redis 분산 저장소 — `THROTTLE_STORAGE=redis`/auto).
- 운영 OTP는 OCTOMO MO 인증으로 전환했다(2026-08): 서비스가 문자를 발송하지 않고, 사용자가 안내된 수신 번호(1666-3538)로 인증코드를 문자 발송하면 수신 여부를 API로 검증한다(발송 비용 0원, 사업자등록증 불필요). 번호별 일일 발송 한도와 코드 해시 저장은 N22에서 강화했다.

## 6. 히스토리 기능 (캘린더 중심)

- 날짜 선택 -> 해당 날짜의 날씨·대기질·피부 분석 결과·점수 변화·추천 제품 조회.
- 저장 동의한 경우: 당시 촬영 얼굴 이미지 + 랜드마크 데이터까지 함께 조회.
- 단순 기능 구현이 아닌, 실제 서비스 수준의 백엔드 포트폴리오를 목표.

## 7. 포트폴리오 목표

AI 추론 서버와 비즈니스 서버 분리, 클라우드 배포·운영·보안·비동기 처리·
데이터 관리까지 경험한 실제 서비스 수준의 백엔드. 기능 구현에 그치지 않고
운영 가능한 구조를 유지한다.

## 8. 에이전트 작업 규칙

- 이 원칙에서 벗어나는 구조 변경(예: FastAPI에 비즈니스 로직 추가, NestJS에
  AI 모델 로드, DB를 Prisma 외 ORM으로 교체)은 금지한다.
- 새 모듈 추가 시 기존 모듈 목록(1절)과 충돌하지 않는지 확인한다.
- 추론 호출은 항상 inference-service 경유. NestJS에 직접 모델을 올리지 않는다.
- 이미지 저장 시 동의 여부(consent)를 항상 확인하는 흐름을 유지한다.
- 문서는 이 원칙과 코드가 일치하도록 유지한다.
