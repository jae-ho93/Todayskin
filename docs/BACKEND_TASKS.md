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
RDS·S3·CloudWatch 연동, Pino·Sentry·Helmet·JWT·Swagger·Jest를 적용한다.

> 현재 구현된 기능을 실제 서비스에서도 사용할 수 있는 구조로 개선하는 것이 목표다.

## 현재 Open

**버그(N39~N41)가 배포 작업(N16·N35~N37)보다 먼저다.** 버그는 코드 수정이라 AWS 없이 고칠 수 있고,
지금 사용자에게 잘못된 값이 보이고 있다. 배포 작업은 **N16 → N35 → N36 → N37** 순서를 지킨다
(N35~N37은 배포 파이프라인이 살아 있어야 검증할 수 있다).

각 Task는 브랜치 하나 = PR 하나이며, 코드 변경이 없는 인프라 설정 작업은
설정 근거와 확인 결과를 PR 본문 또는 이 문서에 남긴다.

### N42. 진단 시각의 날씨가 기록에서 빈칸으로 남는다 (2026-08-13 실기기)

원인 확정 · 코드 수정 · AWS 무관

기록 상세에서 촬영 당시 날씨가 안 나온다. DB의 해당 스냅샷을 보면 대기질 세 지표가 전부 비어 있다.

```text
진단 스냅샷(2026-08-13 03:41): ozonePpm=null  pm10=null  pm25=null   uvIndex=0
같은 좌표로 지금 조회:          ozonePpm=0.02  pm10=8     pm25=5
```

화면은 `null`을 `-`로 그린다(`app/diagnosis/[id].tsx`의 `WeatherMetric`). 그래서 사용자에게는
"못 불러온다"로 보인다. 값이 아예 없으니 화면 잘못이 아니라 저장 시점에 이미 비어 있었다.

원인은 진단 경로의 설계다. `getOrCreateSnapshot()`은 재현성을 위해 **캐시를 쓰지 않고**
매번 새로 수집한 뒤 그대로 저장한다(`weather.service.ts:161`). 그리고 대기질은 측정소명이
필요해 근접측정소 조회 **뒤에** 호출된다(필수 의존성). 즉 이 순서에 재시도가 없어서,

- 근접측정소 조회 실패 → 구 이름이 `중구`로 폴백(N41)
- 이어지는 대기질 조회 실패 → 세 지표가 `null`

**한 번의 일시 실패가 그 진단 기록에 영구히 남는다.** 같은 스냅샷에서 두 증상이 동시에
나타난 것이 이 추정과 일치한다. 진단은 하루 1건 수준이라 재시도 비용이 거의 없는데도 없다.

- [ ] 외부 API 호출에 짧은 재시도를 넣는다(예: 1회 백오프). 진단은 저빈도 경로이므로 지연보다 완결성이 중요하다
- [ ] 그래도 실패하면 스냅샷을 **부분 상태로 저장하지 말지** 판단한다. 저장한다면 "수집 실패" 플래그를 남겨 화면이 `-`와 구별해 보여줄 수 있게 한다(F70)
- [ ] 이미 비어 있는 과거 스냅샷의 보정(backfill) 방침을 정한다. 관측 시각이 지난 대기질은 소급 조회가 어려우므로, 되살릴 수 있는 범위를 먼저 확인한다
- [ ] 대기질 조회가 측정소명에 의존하는 구조를 재검토한다. 측정소를 모를 때 시/도 대표 측정소로라도 조회할지 결정한다 — 단 N41처럼 오답이 굳지 않게 출처를 표시한다
- [ ] 수집 실패율을 지표로 남긴다. 지금은 조용히 `null`이 되어 빈도를 알 수 없다

완료 기준: 일시 실패가 진단 기록을 영구 훼손하지 않는다. 실패한 경우 화면이 "값 없음"과 "수집 실패"를 구별해 보여준다.

### N43. 진단 기록 삭제 API가 없다

신규 기능 · 사용자 요청(2026-08-13) · AWS 무관

사용자가 자기 진단 기록을 지울 수 없다. `diagnosis.controller.ts`에 삭제 엔드포인트가 없다.
개인정보를 담은 얼굴 이미지 기반 기록이라 삭제 수단은 사실상 필수다.

기반은 이미 있다. Soft Delete 정책(N6)과 `notDeletedWhere()`, 이미지 물리 삭제
(`imageStorage.deleteAllForUser`)가 갖춰져 있어 탈퇴 로직이 쓰는 흐름을 건당으로 좁히면 된다.

- [ ] `DELETE /diagnosis/:id` 추가. 소유권 검사 필수 — 추천 상세 조회가 이미 하는 검사와 같은 방식으로 맞춘다
- [ ] 이미지와 랜드마크는 즉시 물리 삭제한다. 개인정보 처리방침이 "철회 시 지체 없이 파기"를 약속하고 있어 soft delete만으로는 문구와 어긋난다
- [ ] 진단 row 자체는 soft delete(`deletedAt`)로 두고 retention sweep(N37)이 정리하게 할지, 즉시 물리 삭제할지 결정한다. N44 결론과 같은 기준을 쓴다
- [ ] 삭제된 진단에 딸린 추천·패턴 집계에서 제외되는지 확인한다. 스코어 추이(trend)가 지운 기록을 계속 반영하면 사용자에게는 삭제가 안 된 것으로 보인다
- [ ] 삭제 후 재조회가 404인지, 목록·캘린더에서 사라지는지 통합 테스트로 고정한다

완료 기준: 본인 기록만 삭제되고, 이미지가 즉시 사라지며, 목록·추이·추천에서 함께 빠진다.

### N44. 탈퇴 시 진단 결과를 완전 삭제로 바꾼다 (정책 변경)

정책 변경 · 약관 문구 동반 수정 · AWS 무관

현재 정책은 **탈퇴해도 진단 결과를 익명 보존**한다(`soft-delete.policy.ts:7`).

```text
탈퇴 즉시:  이미지 물리 삭제 / 진단 soft delete(deletedAt, purgeAfter=+30일) / PII 스크럽
purgeAfter 경과 후:  User 물리 삭제, Diagnosis는 FK SetNull로 userId=null 로 남는다
```

즉 사용자 화면에서는 즉시 사라지지만 진단 row는 익명 상태로 계속 남는다. 이를 완전 삭제로
바꾸기로 했다(2026-08-13 결정).

**약관·개인정보 처리방침을 같이 고쳐야 한다.** 지금 문구가 보존을 명시하고 있어 코드만 바꾸면
문서가 거짓이 된다(`src/lib/legal.ts`).

```text
"탈퇴 시 즉시 개인정보가 파기되며 진단 결과는 가명처리되어 보존될 수 있습니다"
"진단 결과 중 개인 식별이 불가능한 형태로 가명처리된 통계는 서비스 개선을 위해 보존될 수 있습니다"
```

- [ ] purge 시 `Diagnosis`를 `userId` SetNull로 남기지 않고 함께 물리 삭제한다. 딸린 추천·부위 결과·패턴 행도 같이 지운다
- [ ] 즉시 삭제인지 `purgeAfter`(30일) 유예 후인지 정한다. 유예는 오탈퇴 복구와 분쟁 대응에 쓰이므로 없애기 전에 근거를 남긴다
- [ ] 가명처리 통계를 남길 필요가 있는지 판단한다. 남긴다면 진단 row가 아니라 식별 불가능한 집계 테이블로 분리해야 문구와 코드가 같아진다
- [ ] `src/lib/legal.ts`의 보존 관련 문구 2곳을 바꾼 정책에 맞게 수정하고 시행일을 갱신한다 (프론트 파일이지만 정책 변경과 한 PR로 묶는다)
- [ ] 법정 보관 의무(거래기록 5년 등)와 충돌하지 않는지 확인한다. 진단 결과는 거래기록이 아니라 해당 없을 것으로 보이나 명시해 둔다
- [ ] 탈퇴 → purge → 재조회까지 이어지는 테스트로 잔존 row가 0임을 고정한다

완료 기준: 탈퇴·purge 후 해당 사용자의 진단 결과가 DB에 남지 않고, 약관 문구가 실제 동작과 일치한다.

### N45. 추천의 근거·출처 표기를 실제 출처로 바꾼다

설계 변경 · 사용자 지적(2026-08-13) · AWS 무관

추천 상세의 출처 문구가 근거를 가리키지 못한다. 서버가 고정하는 값이다
(`recommendations/content/fallback-content.ts`).

```text
B등급: "출처: AI 종합 분석 · 피부과학 일반 지식 기반"
폴백:  "규칙 기반 빠른 응답 · AI 분석 전"
C등급: "개인 시계열 통계적 관찰"
```

"피부과학 일반 지식 기반"은 출처가 아니라 출처가 없다는 말을 완곡하게 쓴 것이다.
등급 라벨도 마찬가지로 `A · 공인 가이드라인`이라고만 하고 어느 가이드라인인지는 없다.

**지금 구조가 정직하다는 점은 유지해야 한다.** 출처를 LLM이 만들지 못하게 서버가 고정한 것은
허위 인용을 막는 올바른 설계다(코드 주석에 그 의도가 적혀 있다). 문구만 그럴듯하게 바꿔
없는 인용을 만들어내는 방향은 오히려 후퇴다.

유사 서비스 조사(2026-08-13):

| 서비스 | 근거 표기 방식 |
|---|---|
| Peak Skin | 추천을 만들기 전에 문헌을 먼저 검색(retrieval-first)하고, 핵심 문장마다 원문 링크를 건다. 출처 풀을 AAD·BAD·NICE 가이드라인, Cochrane 리뷰, 피어리뷰 저널로 명시 |
| kivo.skin | 정확도 수치를 굳이 공개하지 않고, 대신 모든 점수가 어떤 성분·신호에서 나왔는지 역추적되게 한다. "cosmetic tool, not diagnostic" 포지션을 명시 |
| Skinreo | 성분 분석을 EU Commission 등 규제 DB에 교차 참조한다고 밝힌다 |

공통점은 **"AI가 했다"가 아니라 "무엇에 근거했는지"를 보여준다**는 것이다. 반대로 JAMA
Dermatology 스코핑 리뷰(2024)는 시중 AI 피부 앱 대다수가 피어리뷰 근거·전문가 참여·투명성이
없다고 지적한다. 지금 문구는 후자에 가깝게 읽힌다.

규제 측면도 함께 봐야 한다. "의학적 진단이 아니다"라는 면책 문구만으로는 보호되지 않고,
규제기관은 기능의 실제 동작을 본다. Apple 5.1.3 / Google Play 건강 앱 정책은 근거 없는
효능·진단 주장을 금지한다. 즉 **출처를 강하게 보이게 만들수록 그 주장을 실제로 뒷받침해야 한다.**

- [ ] 출처 레지스트리를 만든다. 추천 템플릿·성분마다 실제 참조(가이드라인 이름·발행기관·연도·URL)를 붙이고, 서버가 그 ID를 추천에 연결한다
- [ ] A등급 전역 템플릿부터 적용한다. 이미 "공인 가이드라인"이라 표기하고 있으므로 실제 가이드라인을 못 대면 등급 자체가 과장이다
- [ ] B등급(사진+날씨 LLM 생성)은 문헌 인용을 붙일 수 없다. 등급·문구를 재정의한다. 예: "AI 생성 · 개인 진단 기반"처럼 생성물임을 밝히고 출처 칸을 비우는 편이 없는 출처를 적는 것보다 낫다
- [ ] 자외선·대기질 기준은 인용 가능한 공개 출처가 있다(WHO 자외선 지수 권고, 기상청·에어코리아 등급 기준). 날씨 연동 조언은 여기서 근거를 확보한다
- [ ] LLM이 출처를 만들어내지 못하게 하는 현재 방어(서버 고정 + `EvidencePolicy` 검증)는 유지한다. 레지스트리 도입 후에도 자유 텍스트 인용은 허용하지 않는다
- [ ] 등급 정의를 사용자 언어로 다시 쓴다. `A · 공인 가이드라인` / `B · 임상 관찰 연구` / `C · 개인 통계 관찰`이 실제 근거 강도와 맞는지 검증한다
- [ ] 프론트 표기(F69)와 한 릴리스로 맞춘다. 서버 문구만 바뀌면 화면의 "출처:" 라벨과 어긋난다

완료 기준: 화면에 뜨는 출처가 검증 가능한 실제 참조를 가리키거나, 참조가 없는 경우 생성물임을 명확히 밝힌다. 없는 인용을 만들지 않는다.

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

## 완료 (Done)

| 영역 | 상태 | 상세 |
|---|---|---|
| 전환 기반 T0~T14 | ✅ | [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md) |
| 우선순위 P0~P2 | ✅ | [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md) |
| 운영 개선 N0~N14, N17~N34 | ✅ | [`BACKEND_ARCHIVE.md`](BACKEND_ARCHIVE.md) |
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
