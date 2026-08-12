# Todayskin Backend Tasks

이 문서는 Todayskin 백엔드 **활성 작업 보드**다. 완료된 Task 이력·계약 기록은
[`docs/BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md), 리팩토링 제안은
[`docs/REFACTORING_BACKLOG.md`](REFACTORING_BACKLOG.md)에 있다.
협업 규칙은 [`CONTRIBUTING.md`](../CONTRIBUTING.md), 아키텍처 원칙은 [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)가 기준이다.

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

## 현재 Open

### N16. AWS 운영 리소스 프로비저닝·첫 배포 (미완료)

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

### BE-2026-08-12. OCTOMO 운영 키 등록 (미완료 1줄)

외부 회원가입 절차 — 배포 시(N16) 처리.

- [x] `MockOtpProvider.recipientNumber` → `'1666-3538'` (개발 화면 정상화)
- [x] provider 선택을 `OCTOMO_API_KEY` 유무 기준으로 변경 (로컬 실제 검증 가능)
- [ ] **운영 필수**: OCTOMO 가입(무료) → `OCTOMO_API_KEY`·`OCTOMO_RECIPIENT_NUMBER` 등록

## 완료 (Done)

| 영역 | 상태 | 상세 |
|---|---|---|
| 전환 기반 T0~T14 | ✅ | [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md) |
| 우선순위 P0~P2 | ✅ | [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md) |
| 운영 개선 N0~N14, N17~N34 | ✅ | [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md) |
| OTP MO 전환 — OCTOMO | ✅ | [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md) |
| 개발 스토리지 `memory://` → http 정규화 | ✅ | [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md) |
| 프론트 범위 완료 기록 (N15/N18/N19) | ✅ | [`FRONTEND_TASKS.md`](FRONTEND_TASKS.md) |

> `main` 기준 **API freeze** (N24~N34 완료, main `42897d5` / PR #59~#66).
> 다음 구현은 FE (`docs/FRONTEND_TASKS.md`). EAS·구독 결제는 보류.

## 리팩토링 백로그

[`docs/REFACTORING_BACKLOG.md`](REFACTORING_BACKLOG.md) — R1~R35를 **작업 묶음 B1~B6**(즉시 보안 / 안전망 / 스케줄러·워커 / DB / 백엔드 구조 / 계약·프론트) 단위로 진행.
**승인 전 구현 금지.** DB·API 계약 변경 항목은 별도 승인 후 착수.

## 완료 정의

- NestJS 모듈 경계 안에 기능이 구현되어 있습니다.
- Prisma migration과 seed가 재현 가능합니다.
- 인증·권한·소유권 검사가 있습니다.
- 성공과 실패 테스트가 있습니다.
- 기존 프론트 API 계약이 검증되었습니다.
- secret이 코드에 포함되지 않았습니다.
- PR 리뷰가 완료되고 `main`에 병합되었습니다.
- 보류 항목과 후속 작업이 PR에 기록되었습니다.
