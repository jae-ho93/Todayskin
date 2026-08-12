# Todayskin Backend Tasks

이 문서는 Todayskin 백엔드·배포의 **활성 작업 보드**다. 지금 할 일은 전부 여기 있다.
완료 이력·계약 기록은 [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md), 리팩토링 R1~R35의 실행 기록과
판단 근거는 [`REFACTORING_BACKLOG.md`](REFACTORING_BACKLOG.md)에 있다.
협업 규칙은 [`CONTRIBUTING.md`](../CONTRIBUTING.md), 아키텍처 원칙은 [`ARCHITECTURE.md`](ARCHITECTURE.md)가 기준이다.

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
RDS·S3·CloudWatch 연동, Pino·Helmet·JWT·Swagger·Jest를 적용한다.
(크래시 리포팅/Sentry는 2026-08-13 해커톤 결정으로 도입하지 않는다.)

> 현재 구현된 기능을 실제 서비스에서도 사용할 수 있는 구조로 개선하는 것이 목표다.

## 현재 Open

> **해커톤 컨텍스트 (2026-08-13 확정)**: 이 프로젝트는 **해커톤 제출용**이다(제출까지 1주).
> 스토어 배포는 범위 밖이며, N52(API /v1 버저닝)는 이 결정으로 **제외**했다.
> 목표는 제출일까지 데모 품질 최상화 — 코드 태스크(N46~N49, N53)를 우선한다.

실기기 테스트에서 나온 버그·정책 변경(N39~N45)과 프로젝트 리뷰
([`Fable5_ProjectReview.md`](Fable5_ProjectReview.md))에서 나온 **코드 태스크 N46~N49·N53은
2026-08-13에 모두 반영했다** (PR #158~#162, 기록은 [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md)).
남은 Open은 전부 AWS 배포 계열이다 — **N16 → N35 → N36 → N37** 순서를 지키고
(N35~N37은 배포 파이프라인이 살아 있어야 검증 가능), 리뷰에서 나온 N50·N51도 N16 이후에만
가능하다. **해커톤 데모에 AWS 배포가 꼭 필요한지 먼저 판단**하고 착수한다(로컬/터널 데모로
충분하면 보류).

각 Task는 브랜치 하나 = PR 하나이며, 코드 변경이 없는 인프라 설정 작업은
설정 근거와 확인 결과를 PR 본문 또는 이 문서에 남긴다.

### N16. AWS 운영 리소스 프로비저닝·첫 배포 (미완료)

브랜치: `chore/aws-production-bootstrap`

**막힌 지점 (2026-08-12 확인).** `Deploy ECS Fargate` 워크플로가 `Build and push ECR images` 잡의
`Configure AWS credentials` 단계에서 실패한다(`Credentials could not be loaded`).
`Gate on CI result`는 정상 통과하므로 워크플로 자체는 문제가 없고, 아래 **GitHub OIDC role 미구성**이 원인이다.
백엔드 경로가 바뀌지 않은 커밋에서는 guard job이 배포를 건너뛰므로 실패로 드러나지 않는다.

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
- [ ] `OCTOMO_API_KEY`는 Secrets Manager `todayskin/prod/OCTOMO_API_KEY`에 넣고 task definition `secrets`로 주입한다. 나머지 둘은 비밀이 아니므로 `environment`에 둔다 (R1·R17 후속). 키 집합 누락은 `task-definition-env.spec.ts`가 검증한다

### N35. ALB deregistration delay를 graceful shutdown보다 짧게 (R4 후속)

선행: N16 · 코드 변경 없음 (인프라 설정)

R4에서 SIGTERM 처리를 넣어 종료 시 진행 중인 요청을 기다린다(`stopTimeout` 120초). 그런데 ALB가
타깃을 먼저 빼지 않으면 배포 중 새 요청이 죽는 컨테이너로 계속 들어간다. 드레인이 먼저 끝나야 한다.

- [ ] 타깃 그룹 `deregistration_delay.timeout_seconds`를 `stopTimeout`(120s)보다 **작게** 설정한다
- [ ] 배포를 한 번 돌려 롤링 교체 중 5xx가 발생하지 않는지 ALB 메트릭으로 확인한다

완료 기준: 롤링 배포 1회에서 `HTTPCode_ELB_5XX_Count` 증가가 없다.

### N36. 워커 ECS 서비스 분리 배포 (R13 후속)

선행: N16 · 코드 변경 없음 (인프라 설정 + 변수)

R13에서 BullMQ 워커를 API 프로세스에서 떼어냈다. 프로세스 역할은 `JOB_ROLE`로 정한다.
**순서를 뒤집으면 잡을 아무도 처리하지 않는 구간이 생긴다.**

- [ ] ① 워커 ECS 서비스를 만들고 GitHub Variable `ECS_SERVICE_WORKER`를 설정한다
- [ ] ② 큐가 실제로 소비되는지 확인한다 (추천 생성 잡 1건 → COMPLETED)
- [ ] ③ 그 다음에 backend task definition에 `JOB_ROLE=api`를 추가한다

완료 기준: API task가 `JOB_ROLE=api`로 돌면서도 잡이 워커에서 정상 처리된다.

### N37. 데이터 보존 스윕 활성화 (R11 후속)

선행: N16, 마이그레이션 배포 완료 · 코드 변경 없음 (환경변수 + 운영 절차)

R11에서 append-only 테이블에 보존 정책을 넣었다. 기본값이 `off`라 배포만으로는 아무것도 지워지지 않는다.
**되돌릴 수 없는 작업이므로 순서를 지킨다.**

- [ ] ① `RETENTION_SWEEP_MODE=dry-run`으로 켜서 삭제 대상 규모를 로그로 확인한다
- [ ] ② 규모가 예상과 맞으면 RDS 스냅샷을 확보한다
- [ ] ③ `delete`로 전환하고 첫 스윕 후 실제 삭제 건수를 대조한다

완료 기준: dry-run 예측 건수와 실제 삭제 건수가 일치하고, 스냅샷이 확보돼 있다.

### N50. CloudWatch 알람 + 장애 런북 (Fable5 리뷰 P1)

선행: N16 · 코드 변경 없음 (인프라 설정 + 문서)

로그·헬스체크는 있지만 **알림이 없어** 장애를 사용자 제보로 알게 되는 구조다.

- [ ] 알람 4종: ALB 5xx율, ECS 태스크 비정상(health fail), AsyncJob FAILED 급증(DLQ 적체), inference 429율
- [ ] 알람 수신 채널 연결 (이메일 또는 Slack webhook)
- [ ] 장애 런북 1페이지 (`docs/DEPLOYMENT.md`에 추가): 증상 → 확인 순서 → 롤백 판단 기준

완료 기준: 알람을 인위적으로 트리거해 수신을 확인하고, 런북이 문서에 있다.

### N51. JWT 서명키 보관 개선 (Fable5 리뷰 S-3)

선행: N16 (Secrets Manager 가동 후)

`JwtKeyRotation.secret`이 DB에 평문으로 저장된다. DB 스냅샷·백업이 유출되면 토큰 위조가
가능하다.

- [ ] 프로덕션 키를 Secrets Manager 단일 소스로 이전하거나, DB 보관 유지 시 KMS 봉투 암호화 적용 (택1 — 근거를 PR에 기록)
- [ ] 회전 절차가 기존 `JWT_SECRET` fallback과 호환되는지 테스트

완료 기준: 프로덕션 DB 덤프만으로는 유효한 토큰을 만들 수 없다.

## 보류 (조건 충족 후 착수)

근거가 있어 남긴 항목이다. 조건이 충족되면 위 Open으로 올린다.

### N38. 추론 서버 동시 처리 슬롯 상향 (R6 2단계)

조건: **부하 테스트 실측 결과.** 아키텍처상 FastAPI 추론 서버(`backend/inference-service`) 담당이다.

R6 1단계로 전역 락을 풀고 슬롯 수를 `INFERENCE_CONCURRENCY`(기본 1, 최대 4)로 환경변수화했다.
2단계는 ECS 태스크 vCPU를 2로 올리고 `uvicorn --workers 2`로 프로세스를 나누는 것인데,
모델이 프로세스별로 메모리를 차지하므로 메모리 상한 확인이 선행되어야 한다.
부하 테스트 결과에 따라 **값만 올리는 것으로 끝날 수도 있다.**

### R9 일부 — 상품 조회를 카테고리·등급으로 좁히기

조건: **추천 규칙이 카탈로그 전체를 보지 않도록 바뀔 때.** 현재 규칙 선택은 전체 카탈로그를 전제한다.
조회 비용은 TTL 10분 캐시로 이미 잡혀 있어 지금 좁힐 이득이 없다. 근거는
[`REFACTORING_BACKLOG.md`](REFACTORING_BACKLOG.md) R9 상세에 있다.

> N52(API `/v1` 버저닝)는 2026-08-13 해커톤 결정(스토어 배포 없음)으로 **제외**했다.
> 실서비스 전환이 결정되면 첫 심사 제출 전에 재등록한다 — 근거는
> [`Fable5_ProjectReview.md`](Fable5_ProjectReview.md) 30장.

## 완료 (Done)

| 영역 | 상태 | 상세 |
|---|---|---|
| 전환 기반 T0~T14 | ✅ | [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md) |
| 우선순위 P0~P2 | ✅ | [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md) |
| 운영 개선 N0~N14, N17~N34 | ✅ | [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md) |
| 실기기 테스트 대응 N39~N45 | ✅ | [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md) |
| Fable5 리뷰 대응 N46~N49·N53 (PR #158~#162) | ✅ | [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md) |
| OTP MO 전환 — OCTOMO | ✅ | [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md) |
| 개발 스토리지 `memory://` → http 정규화 | ✅ | [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md) |
| 프론트 범위 완료 기록 (N15/N18/N19) | ✅ | [`FRONTEND_TASKS.md`](FRONTEND_TASKS.md) |
| 리팩토링 R1~R35 (묶음 B1~B6) | ✅ | [`REFACTORING_BACKLOG.md`](REFACTORING_BACKLOG.md) |

> `main` 기준 **API freeze** (N24~N34 완료, main `42897d5` / PR #59~#66). EAS·구독 결제는 보류.

## 리팩토링 (완료)

R1~R35를 묶음 B1~B6으로 나눠 전부 반영했다(2026-08-12, PR [#130](https://github.com/jae-ho93/Todayskin/pull/130)~[#137](https://github.com/jae-ho93/Todayskin/pull/137)).
문제 진단·해법·하지 않기로 한 것의 근거는 [`REFACTORING_BACKLOG.md`](REFACTORING_BACKLOG.md)에 남겼다.
같은 판단을 다시 하게 되면 그 문서를 먼저 읽는다.

백엔드에 남긴 후속은 위 N35·N36·N37(Open)과 N38·R9 일부(보류)다. 그 밖에 코드 변경은 없다.

## 완료 정의

- NestJS 모듈 경계 안에 기능이 구현되어 있습니다.
- Prisma migration과 seed가 재현 가능합니다.
- 인증·권한·소유권 검사가 있습니다.
- 성공과 실패 테스트가 있습니다.
- 기존 프론트 API 계약이 검증되었습니다.
- secret이 코드에 포함되지 않았습니다.
- PR 리뷰가 완료되고 `main`에 병합되었습니다.
- 보류 항목과 후속 작업이 PR에 기록되었습니다.
