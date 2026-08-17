# Todayskin Backend Tasks

이 문서는 Todayskin 백엔드·배포의 **활성 작업 보드**다. 지금 할 일은 전부 여기 있다.
완료 이력·계약 기록은 [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md), 리팩토링 R1~R35의 실행 기록과
판단 근거는 [`REFACTORING_BACKLOG.md`](REFACTORING_BACKLOG.md)에 있다.
협업 규칙은 [`CONTRIBUTING.md`](../../CONTRIBUTING.md), 아키텍처 원칙은 [`ARCHITECTURE.md`](../architecture/ARCHITECTURE.md)가 기준이다.

## 목표

NestJS를 메인 백엔드(BFF + 비즈니스 로직)로, FastAPI(inference-service)를 독립 AI 추론 서버로
역할 분리한 운영 가능한 백엔드를 목표로 한다. NestJS는 Modular Monolith 구조로 auth, otp, admin,
consent, storage, diagnosis, weather, recommendations, products, care, pattern, notifications, openai,
jobs, idempotency 모듈로 책임을 분리하고 모든 비즈니스 로직을 담당한다. FastAPI는 AI 모델 서빙과 피부 이미지 추론만 담당하며
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
([`ProjectReview_2026-08-13.md`](../reviews/ProjectReview_2026-08-13.md))에서 나온 **코드 태스크 N46~N49·N53은
2026-08-13에 모두 반영했다** (PR #158~#162, 기록은 [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md)).

**배포 준비 웨이브 (2026-08-13 오후)**: 목표를 "배포 버튼만 누르면 되는(deploy-ready) 상태"로
올렸다. AWS 계정 자격 증명이 필요한 실 프로비저닝(N16)과 그 후속(N35~N37·N50 알람·N51)은
사람이 계정을 준비해야 착수 가능하므로 Open으로 유지하고, **자격 증명 없이 지금 끝낼 수 있는
배포 준비는 N54로 등록**해 처리한다. 순서는 **N54 → N16 → N35 → N36 → N37 → N50 → N51**.
**N16은 2026-08-16 실배포로 완료**, N35도 실배포에서 적용 완료. N50은 데모 기간 보류(2026-08-17),
남은 Open은 **N36·N37·N51**이다.

각 Task는 브랜치 하나 = PR 하나이며, 코드 변경이 없는 인프라 설정 작업은
설정 근거와 확인 결과를 PR 본문 또는 이 문서에 남긴다.

**데모 준비 웨이브 (2026-08-16)**: 실기기 테스트 + 배포 2일 전 마무리로 N55~N63, F84~F89를
**전부 머지했다** (PR #210~#223). 핵심: ① N55 — ECS migrate task에서 shadow DB 없는 `migrate diff`
제거(CRITICAL-01) ② N56 — 추천 생성 API diagnosisId 전용 전환(HIGH-03) ③ N57 — 비용 민감 라우트
fail-closed(HIGH-04) ④ N58 — presigned 실패 시 landmarks 미노출(MEDIUM-07) ⑤ N59 — 롤백/migration
expand-contract 문서화 ⑥ N60 — 올리브영 직링크 데모 1개만 유지 ⑦ N61 — DB E2E 절차 문서화
⑧ N62/N63 — 케어 제품 즉시 노출 + Redis SWR 캐시·조용한 교체 ⑨ F84/F87 — 로그인 중앙 배치(회귀 수정),
F85 측정 결과 리디자인, F86 프론트 취약점 조사(SDK 54 내 안전 수정 0건), F89 토스트 safe area.
N35는 실배포 적용 완료. 남은 Open(N36·N37·N51)은 AWS 운영 결정 필요로 유지,
N50(CloudWatch 알람)은 데모 1주일 기간 보류로 결정 (2026-08-17).

**데모 준비 웨이브 (2026-08-17) — 진행 중**: 시연 배포 준비 — ① 소셜 로그인 네이티브 대비:
Google 검증을 다중 client id 허용으로 확장(`jwt-verify` `audiences` — APK의 구글 로그인이
플랫폼별 aud를 내려보내므로 필수, 테스트 2건 추가) ② 시연용 Android APK 빌드 설정
(app.json cleartext·패키지명, eas.json) — 운영 백엔드가 HTTP-only라 cleartext 허용 필요
③ N35 보드 완료 표시, N50·F11 보류 결정 반영 ④ 소셜 키 시크릿 항목(GOOGLE_CLIENT_ID
쉼표 목록·KAKAO_APP_ID)을 배포 체크리스트에 추가. 남은 Open은 N36·N37·N51(운영 결정 보류).
**소셜 키 운영 반영 (완료)**: 카카오는 커스텀 스킴 리다이렉트 거부로 보류. 구글 Android
클라이언트 ID 발급(패키지 `com.todayskin.app` + SHA-1) 후 `GOOGLE_CLIENT_ID` 시크릿 생성
(웹+Android 쉼표 목록, `todayskin/prod/GOOGLE_CLIENT_ID`) — backend task definition에
시크릿 추가 (PR #235) → 재배포 예정. APK 2차(정상 env) 빌드 성공, 최종(Android ID 포함) 빌드 대기.


### N65. OTP verify 503 — OCTOMO exists API 응답 필드 불일치 (APK 실기기 테스트 발견) ✅ 2026-08-17

브랜치: `fix/otp-octomo-exists-field`

> **증상**: APK 실기기에서 휴대폰 인증(회원가입·로그인)이 항상
> "OTP 인증 서비스에 문제가 있어요. 잠시 후 다시 시도해주세요."로 실패.
>
> **원인 (실측 3단계)**: ① 배포 백엔드(`/otp/verify`)가 503 반환 재현
> ② CloudWatch 로그: `OCTOMO 응답 형식 오류 (verified 누락)`
> ③ OCTOMO exists API 직접 호출 결과 실제 응답은 `{"exists": boolean}` —
> 코드는 `{ verified: boolean }`을 기대 → 필드명 불일치로 모든 검증이 503.

- [x] `octomo-otp.provider.ts` — `data.verified` → `data.exists` (주석·로그 문구 동기화)
- [x] `octomo-otp.provider.spec.ts` — mock 응답·테스트명 `exists`로 갱신 (8건)
- [x] 백엔드 typecheck·lint·otp 테스트 통과
- [ ] 배포 백엔드 재배포 시 반영 (ALB에 구버전 실행 중 — OTP 수정 포함 재배포 필요)


### N66. 데모 테스트 계정 — OCTOMO allowlist bypass (010-0000-0000 고정 OTP 123456) ✅ 2026-08-17

브랜치: `feat/otp-allowlist-demo-account`

> **목적**: 해커톤 데모용 테스트 계정. 배포 환경(OctomoOtpProvider)은 실문자 검증이라
> 가짜 번호(010-0000-0000)로는 문자 수신이 없어 로그인이 불가능했다.
> allowlist에 등록된 번호는 고정 코드 `123456` 발급(OtpService 기존 정책) + 검증 시
> 게이트웨이 호출 없이 통과(OctomoOtpProvider에 동일 allowlist 정책 추가)로 해결.
> 운영 정책(N22 fail-closed)과 상충하므로 데모 기간 후 `OTP_ALLOWLIST_PHONES` 제거 예정.

- [x] `octomo-otp.provider.ts` — `OTP_ALLOWLIST_PHONES` 읽기 + verifySent allowlist bypass (마스킹 로그)
- [x] `octomo-otp.provider.spec.ts` — allowlist bypass·비등록 번호 게이트웨이 유지 테스트 2건 추가 (총 10건)
- [x] 백엔드 typecheck·lint·provider 테스트 통과
- [x] `backend/docker/ecs/backend-task-definition.json` — `OTP_ALLOWLIST_PHONES=01000000000` 추가 (배포 워크플로 템플릿 — PR #242에서 반영)
- [x] `env.registry.ts` — `allowProductionUntil` 필드 추가 (OTP_ALLOWLIST_PHONES 데모 기간 한정 production 허용, 2026-08-26 이후 자동 복귀) + spec 2건
- [x] 배포 검증 — production 부팅 실패(mock flag 금지) 원인 수정, 재배포 후 OTP 010-0000-0000 실측
- [x] `prisma/seed-demo.ts` — 데모 계정 + 2주간 진단 7건·부위 지표·날씨·추천 시드 (로컬 실측: OTP 123456 → 로그인 → history 반영)
- [x] `tsx`를 dependencies로 이동 (ECS one-off seed task용 — prod 이미지에 포함)
- [x] 배포 후 ECS one-off task로 RDS에 시드 실행 (exit 0, 진단 7건 적재 확인)
- [x] production 실측 — OTP 123456 → 로그인 → history 7건 반환
- [x] `seed-demo.ts` 재작성 — **8/10~8/17 하루 하나씩 8건** + 진단 이미지(DiagnosisImage) 연결 + 날씨/부위 지표/추천, 멱등(추천·진단 정리 후 재생성)
- [x] 얼굴 사진 (무료 라이선스 한국 남성 초상화) S3 업로드 — `diagnoses/1/demo-dx-*/front-demo.jpg` × 8
- [x] RDS 재시드 (amd64 이미지, exit 0) — 8/10~8/17 진단 8건 + 저장 동의 추가 (PR #248)
- [x] production 실측 — 로그인 → history 8건 → **이미지 presigned URL 8일 전부 200** → landmarks·부위 6개·날씨 노출
- [x] 데모 계정 로그인 정보 확정: **010-0000-0000 / OTP 코드 123456** (allowlist — 데모 기간 2026-08-26까지)



### N36. 워커 ECS 서비스 분리 배포 (R13 후속) — 보류 (2026-08-17 데모 결정)

> **2026-08-17 보류**: 해커톤 데모 기간(1주일) 저트래픽에서는 `JOB_ROLE=both` 단일
> 서비스로 충분하다. 분리하면 잡 처리 공백 구간이 생길 수 있어 데모 직전에 운영
> 리스크만 키운다. 장기 운영 전환 시 재등록.

선행: N16 · 코드 변경 없음 (인프라 설정 + 변수)

R13에서 BullMQ 워커를 API 프로세스에서 떼어냈다. 프로세스 역할은 `JOB_ROLE`로 정한다.
**순서를 뒤집으면 잡을 아무도 처리하지 않는 구간이 생긴다.**

- [ ] ① 워커 ECS 서비스를 만들고 GitHub Variable `ECS_SERVICE_WORKER`를 설정한다
- [ ] ② 큐가 실제로 소비되는지 확인한다 (추천 생성 잡 1건 → COMPLETED)
- [ ] ③ 그 다음에 backend task definition에 `JOB_ROLE=api`를 추가한다

완료 기준: API task가 `JOB_ROLE=api`로 돌면서도 잡이 워커에서 정상 처리된다.

### N37. 데이터 보존 스윕 활성화 (R11 후속) — 보류 (2026-08-17 데모 결정)

> **2026-08-17 보류**: 데이터 영구 삭제는 되돌릴 수 없는 작업이다. 1주일치 데모
> 데이터엔 실익이 없고, 실수 시 데모 데이터가 손실된다. 장기 운영 전환 시 재등록.

선행: N16, 마이그레이션 배포 완료 · 코드 변경 없음 (환경변수 + 운영 절차)

R11에서 append-only 테이블에 보존 정책을 넣었다. 기본값이 `off`라 배포만으로는 아무것도 지워지지 않는다.
**되돌릴 수 없는 작업이므로 순서를 지킨다.**

- [ ] ① `RETENTION_SWEEP_MODE=dry-run`으로 켜서 삭제 대상 규모를 로그로 확인한다
- [ ] ② 규모가 예상과 맞으면 RDS 스냅샷을 확보한다
- [ ] ③ `delete`로 전환하고 첫 스윕 후 실제 삭제 건수를 대조한다

완료 기준: dry-run 예측 건수와 실제 삭제 건수가 일치하고, 스냅샷이 확보돼 있다.

### N50. CloudWatch 알람 + 장애 런북 (Fable5 리뷰 P1) — 보류 (2026-08-17 데모 결정)

> **2026-08-17 보류**: 해커톤 데모 기간(1주일)만 서버를 열어두기로 해서 알림이 없어도
> 데모에 영향이 없다. 서버를 장기 운영으로 전환하면 그때 재등록한다.

선행: N16 · 코드 변경 없음 (인프라 설정 + 문서)

로그·헬스체크는 있지만 **알림이 없어** 장애를 사용자 제보로 알게 되는 구조다.

- [ ] 알람 4종: ALB 5xx율, ECS 태스크 비정상(health fail), AsyncJob FAILED 급증(DLQ 적체), inference 429율
- [ ] 알람 수신 채널 연결 (이메일 또는 Slack webhook)
- [ ] 장애 런북 1페이지 (`docs/guides/DEPLOYMENT.md`에 추가): 증상 → 확인 순서 → 롤백 판단 기준

완료 기준: 알람을 인위적으로 트리거해 수신을 확인하고, 런북이 문서에 있다.

### N51. JWT 서명키 보관 개선 (Fable5 리뷰 S-3) — 보류 (2026-08-17 데모 결정)

> **2026-08-17 보류**: 보안 개선이지만 데모 1주일 기간엔 실익이 낮고, 서명키 이전은
> 운영 장애 위험이 있다. 장기 운영 전환 시 재등록.

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
> [`ProjectReview_2026-08-13.md`](../reviews/ProjectReview_2026-08-13.md) 30장.

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
| 배포 준비 N54 | ✅ | [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md) |
| 배포 감사 후속 N55~N61 | ✅ | [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md) |
| 케어 즉시 노출·Redis SWR N62~N63 | ✅ | [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md) |
| 문서 동기화 N64 | ✅ | [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md) |
| AWS 실배포 N16 (+ BE-2026-08-12·N35) | ✅ | [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md) |
| OTP OCTOMO exists 필드 수정 N65 | ✅ | [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md) |

> `main` 기준 **API freeze** (N24~N34 완료, main `42897d5` / PR #59~#66). EAS·구독 결제는 보류.

## 리팩토링 (완료)

R1~R35를 묶음 B1~B6으로 나눠 전부 반영했다(2026-08-12, PR [#130](https://github.com/jae-ho93/Todayskin/pull/130)~[#137](https://github.com/jae-ho93/Todayskin/pull/137)).
문제 진단·해법·하지 않기로 한 것의 근거는 [`REFACTORING_BACKLOG.md`](REFACTORING_BACKLOG.md)에 남겼다.
같은 판단을 다시 하게 되면 그 문서를 먼저 읽는다.

백엔드에 남긴 후속은 위 N36·N37·N51(데모 기간 보류)과 N50(보류)·N38·R9 일부(조건 보류)다.
그 밖에 코드 변경은 없다.

## 완료 정의

- NestJS 모듈 경계 안에 기능이 구현되어 있습니다.
- Prisma migration과 seed가 재현 가능합니다.
- 인증·권한·소유권 검사가 있습니다.
- 성공과 실패 테스트가 있습니다.
- 기존 프론트 API 계약이 검증되었습니다.
- secret이 코드에 포함되지 않았습니다.
- PR 리뷰가 완료되고 `main`에 병합되었습니다.
- 보류 항목과 후속 작업이 PR에 기록되었습니다.
