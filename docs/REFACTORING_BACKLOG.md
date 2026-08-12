# Todayskin Refactoring Backlog

> Paseo 세션 **Todayskin Refactoring Proposal Mode** (`rapid-goose`, 브랜치 `analyze/todayskin-refactoring-proposal`, 2026-08-12)에서 도출한 전체 코드베이스 리팩토링 제안.
> **승인 전 구현 금지** — 각 항목은 검토 후 `OK` / `REJECT` / `MODIFY`로 결정하고, 승인된 항목만 브랜치를 만들어 진행한다.
> DB·API 계약 변경 항목은 별도 승인 없이 착수하지 않는다.
>
> **요약:** Critical 6건 · High 15건 · Medium 11건 · Low 3건 (총 35건)

## 진행 상황

| 묶음 | 상태 | PR | 남은 일 |
|---|---|---|---|
| B1 | ✅ 완료 (2026-08-12) | [#130](https://github.com/jae-ho93/Todayskin/pull/130) | AWS 작업 2건(코드 밖): Secrets Manager `todayskin/prod/OCTOMO_API_KEY` 등록, ALB deregistration delay < `stopTimeout`(120s) 설정. R6 2단계(vCPU 증설 + 슬롯 상향)는 부하 테스트 후 판단 — 값은 `INFERENCE_CONCURRENCY`로 이미 환경변수화됨 |
| B2 | ✅ 완료 (2026-08-12) | `refactor/r-batch-02-safety-net` | 없음. R16의 `useAsyncJob` 테스트는 훅 추출(R27, B6) 후에 추가한다 |
| B3 | ✅ 완료 (2026-08-12) | `refactor/r-batch-03-scheduler-worker` | AWS/GitHub 작업(코드 밖): ① 워커 ECS 서비스 생성 + Variable `ECS_SERVICE_WORKER` 설정 → 큐 소비 확인 후 ② backend task definition에 `JOB_ROLE=api` 추가. 순서를 뒤집으면 잡이 처리되지 않는다 |
| B4 | ✅ 완료 (2026-08-12) | `refactor/r-batch-04-db-migration` | 운영 작업(코드 밖): ① 마이그레이션 배포 후 R11 스윕을 `RETENTION_SWEEP_MODE=dry-run`으로 켜서 삭제 대상 규모 확인 → ② RDS 스냅샷 확보 → ③ `delete`로 전환. 기본값 `off`이므로 배포만으로는 아무 데이터도 지워지지 않는다 |
| B5~B6 | 대기 | — | — |

## 작업 묶음 (Batch)

> **R 단위로 PR을 쪼개지 않는다.** 아래 묶음 단위로 검토·승인하고, 묶음 하나 = 브랜치 하나 = PR 하나로 진행한다.
> 각 R 상세의 `브랜치:`는 소속 묶음 브랜치를 가리킨다.

| 묶음 | 포함 R | 브랜치 | 진행 기준 |
|---|---|---|---|
| **B1. 즉시 보안·운영** ✅ | R1, R2, R4, R6, R17, R19, R32 | `refactor/r-batch-01-security-critical` | Critical 우선 + 배포 차단(키·root·metrics) 항목 포함 |
| **B2. 안전망 (타입·테스트·설정)** ✅ | R15, R16, R18, R34, R29 | `refactor/r-batch-02-safety-net` | 구조 작업 전 타입·테스트 기반 마련 |
| **B3. 스케줄러·워커** ✅ | R3, R13, R31 | `refactor/r-batch-03-scheduler-worker` | 리더 락(R3) → 워커 분리(R13) 순서 |
| **B4. DB (한 마이그레이션)** ✅ | R33, R10, R11, R21 | `refactor/r-batch-04-db-migration` | 인덱스·컬럼·보존을 한 마이그레이션으로 묶음 |
| **B5. 백엔드 구조 (동작 보존)** | R7, R8, R9, R12, R20, R22, R23, R24, R30, R35 | `refactor/r-batch-05-backend-structure` | 순수 구조 개선 — 동작 불변 목표 |
| **B6. 계약·프론트 구조** | R5, R14, R25, R26, R27, R28 | `refactor/r-batch-06-contract-frontend` | B2 완료 후 권장 (strict·테스트가 회귀를 잡음) |

## 선후관계 (순서가 중요한 것)

| 선행 | 후행 | 이유 |
|---|---|---|
| B2 (R15 strict) | R14, R27 | 반환 타입 변경·화면 수정을 컴파일러가 잡아준다 |
| B2 (R15·R16) | R27 | strict + 테스트 없이 화면 구조 변경은 위험 |
| R5 | R25 | 같은 화면 파일(`weather-detail.tsx`)을 건드린다 |
| R7 | R24 | 문구 분리가 클래스 분리(R7)와 함께하는 것이 효율적 |
| B4 (R33) | R9, R10, R11, R21 | 인덱스·컬럼·보존 정책을 한 마이그레이션으로 |
| R3 | R13 | 리더 락 없이 스케줄러를 워커로 옮길 수 없다 |
| R15, R16 | R28 | OpenAPI 생성 타입은 strict·테스트 기반 위에서 안전 |

## 우선순위별 요약

| 우선순위 | 번호 | 제목 |
|---|---|---|
| Critical | R1 | 프론트엔드 JWT가 AsyncStorage에 평문 저장된다 |
| Critical | R2 | Gemini API 키가 쿼리스트링으로 전송된다 |
| Critical | R3 | 스케줄러가 모든 ECS task에서 중복 실행된다 (물리 삭제 포함) |
| Critical | R4 | SIGTERM에 graceful shutdown이 없다 |
| Critical | R5 | 대기질 등급 임계값이 서버·클라이언트에 이중 정의되어 있고 값이 다르다 |
| Critical | R6 | 추론 서버가 전역 락으로 직렬화되어 컨테이너당 동시 1건만 처리한다 |
| High | R7 | RecommendationService가 8가지 책임을 한 클래스에 담고 있다 |
| High | R8 | fast-path SWR 알고리즘이 두 서비스에 통째로 중복돼 있다 |
| High | R9 | 요청마다 상품 카탈로그 전체를 메모리로 로드한다 |
| High | R10 | AsyncJob.payload JSON 경로 조회에 인덱스가 없다 |
| High | R11 | 고빈도 append-only 테이블에 보존 정책이 전혀 없다 |
| High | R12 | Jobs 모듈과 도메인 모듈이 순환 의존한다 (forwardRef 4개) |
| High | R13 | BullMQ 워커가 API 프로세스 안에서 돈다 |
| High | R14 | safeFetch가 인증 헤더를 안 보내고 모든 에러를 null로 삼킨다 |
| High | R15 | 프론트엔드가 strict 모드 없이 컴파일되고, 실제 타입 버그가 숨어 있다 |
| High | R16 | 프론트엔드에 테스트가 한 개도 없다 |
| High | R17 | 운영 ECS task definition에 OCTOMO_API_KEY가 없어 readiness가 실패한다 |
| High | R18 | 환경변수 정의가 두 파일로 갈라져 있고 실제로 어긋나 있다 |
| High | R19 | 두 Docker 이미지 모두 root로 실행된다 |
| Medium | R20 | 캘린더 히스토리 응답이 presigned URL을 N+1로 생성한다 |
| High | R21 | refresh 토큰 회전 중 실패하면 사용자가 강제 로그아웃된다 |
| Medium | R22 | 날씨 필드 매핑이 4곳에 중복돼 있다 |
| Low | R23 | errorName 헬퍼가 3개 파일에 각각 정의돼 있다 |
| Low | R24 | 도메인 서비스에 사용자 노출 한국어 문구가 하드코딩돼 있다 |
| Low | R25 | AirStatus 라벨/색상 매핑이 프론트 5곳에 중복돼 있다 |
| Low | R26 | KST 날짜 헬퍼가 프론트에 중복돼 있다 |
| Medium | R27 | 화면 컴포넌트가 상태 10~15개와 잡 오케스트레이션을 직접 들고 있다 |
| Medium | R28 | 프론트 타입 325줄이 백엔드 DTO를 수기로 미러링한다 |
| Low | R29 | 죽은 코드와 커밋된 에러 로그 파일 |
| Medium | R30 | Gemini 호출에 재시도·서킷브레이커가 없다 |
| Medium | R31 | 배포 워크플로가 CI 성공에 게이팅되지 않고, 죽은 변수가 있다 |
| Medium | R32 | 추론 서버의 /metrics가 무인증으로 노출된다 |
| Medium | R33 | 조회 패턴에 대응하는 인덱스가 빠져 있다 |
| Medium | R34 | OTP 서비스와 JWT 키 회전 서비스에 단위 테스트가 없다 |
| Medium | R35 | 진단 중복 방지 검사가 트랜잭션 밖에서 한 번 더 돌고, soft-delete 조건이 불일치한다 |

## 승인 시 방향 결정이 필요한 항목

- **R5** UV 6~7 등급 정본 — 서버(`bad`) vs 화면(`moderate`)
- ~~**R8** fast-path SWR 두 구현 중 정본 선택~~ — 두 구현의 상수·조건이 실제로는 동일해 결정 불필요(R8 항목 참조)
- **R11** 테이블별 보존 기간 (특히 `WeatherSnapshot`)
- **R13** ECS worker 서비스 신설 여부 (비용·리소스)
- **R14/R29** 미사용 API 제거·인증 강제 (구버전 앱 영향)
- **R21** `familyId` 기반 refresh 토큰 패밀리 폐기 도입 여부

---

## R1. 프론트엔드 JWT가 AsyncStorage에 평문 저장된다

브랜치: `refactor/r-batch-01-security-critical`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **Critical** · 분류: `POTENTIAL BEHAVIOR CHANGE`

위치: `src/lib/session.ts`, `src/api/client.ts` (`getAccessToken`, `refreshInFlight`)

문제: AsyncStorage는 iOS에서는 앱 샌드박스 내 평문 파일, Android에서는 평문 SQLite다. 루팅/탈옥 단말, ADB 백업, 기기 분실 시 refresh 토큰이 그대로 읽힌다. 14일짜리 refresh 토큰이므로 유출 시 공격 창이 2주다. 백엔드는 회전·재사용 탐지까지 구현해 놨는데 클라이언트 저장 계층에서 그 노력이 무효화된다.

작업:

- [x] `expo-secure-store`(iOS Keychain / Android Keystore)를 도입해 토큰만 SecureStore로 옮긴다. 사용자 프로필처럼 민감하지 않은 값은 AsyncStorage에 남긴다. 최초 실행 시 기존 AsyncStorage 세션을 읽어 SecureStore로 이관하고 원본 키를 삭제하는 1회성 마이그레이션을 `session.ts` 내부에 둔다. `session.ts`의 함수 시그니처는 이미 async이므로 호출부는 변경되지 않는다.

변경 범위:

```text
text
파일 수정   src/lib/session.ts, src/api/client.ts
dependency 변경   expo-secure-store 추가
```

위험: POTENTIAL BEHAVIOR CHANGE. . SecureStore는 값 크기 제한(약 2KB)이 있으므로 토큰만 저장해야 한다. 마이그레이션 코드에 버그가 있으면 기존 사용자가 재로그인해야 한다 — 실패 시 조용히 로그아웃 처리하는 fallback이 필요하다.

완료 기준: R1 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R2. Gemini API 키가 쿼리스트링으로 전송된다

브랜치: `refactor/r-batch-01-security-critical`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **Critical** · 분류: `BEHAVIOR-PRESERVING REFACTOR`

위치: `backend/src/modules/gemini/gemini.client.ts` — 요청 URL 조립부

문제: URL 쿼리스트링은 액세스 로그, 프록시 로그, APM 트레이스, 예외 스택의 request URL에 그대로 남는다. Sentry는 기본적으로 요청 URL을 캡처하므로 외부 SaaS로 키가 흘러갈 수 있다. Google은 동일 API에 대해 `x-goog-api-key` 헤더 방식을 공식 지원한다.

작업:

- [x] URL에서 `?key=`를 제거하고 요청 헤더에 `x-goog-api-key: {GEMINI_API_KEY}`를 추가한다. 함께, `RedactLogger`의 마스킹 대상에 `x-goog-api-key`를 추가한다.

변경 범위:

```text
text
파일 수정   backend/src/modules/gemini/gemini.client.ts
파일 수정   backend/src/common/logging/redact.logger.ts (마스킹 키 추가)
```

위험: BEHAVIOR-PRESERVING REFACTOR. . 

완료 기준: R2 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R3. 스케줄러가 모든 ECS task에서 중복 실행된다 (물리 삭제 포함)

브랜치: `refactor/r-batch-03-scheduler-worker`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **Critical** · 분류: `POTENTIAL BEHAVIOR CHANGE`

위치: `backend/src/common/soft-delete/soft-delete-purge.scheduler.ts` · `backend/src/modules/weather/weather-collection.scheduler.ts` · `backend/src/modules/storage/` 이미지 reconcile 스케줄러 · `backend/docker/ecs/backend-task-definition.json`

문제: ECS 서비스의 모든 task는 **같은 task definition을 공유**하므로 "정확히 한 task만 true"는 물리적으로 설정할 수 없다. 결과적으로 desiredCount를 2 이상으로 올리는 순간:

작업:

- [x] Redis 기반 리더 락을 도입한다. `RedisService.acquireLock(key, ttlMs, owner)` + `SchedulerLeaderService` + `LeaderElectedScheduler` 베이스. **락은 해제하지 않고 TTL로 만료시킨다** — 작업 종료 시 해제하면 같은 주기에 다른 인스턴스가 이어서 실행하므로 중복 방지가 무의미해진다. Redis 미가용 시에는 락 없이 실행(현재 동작 유지).
- [x] 데코레이터 대신 베이스 클래스를 택했다. 세 스케줄러가 테스트 환경 skip·인터벌 파싱·unref 타이머·겹침 방지를 각자 복제하고 있었고, 데코레이터로는 그 중복이 남는다. 베이스로 옮기면 새 스케줄러가 리더 선출을 빠뜨릴 수 없다.
- [x] `JobMetricsScheduler`도 함께 옮겼다(백로그가 지목한 3개 + 1개). 지표는 Redis의 큐 상태를 읽으므로 모든 인스턴스가 같은 값을 기록해 로그만 인스턴스 수만큼 불어난다.
- [x] 스케줄러는 R13의 `JOB_ROLE`로 워커 프로세스로 옮겼다. `api`는 스케줄러를 띄우지 않는다.

변경 범위:

```text
text
파일 추가   backend/src/common/scheduler/leader-lock.ts
파일 수정   backend/src/redis/redis.service.ts (acquireLock 추가)
파일 수정   위 3개 스케줄러
```

위험: POTENTIAL BEHAVIOR CHANGE. . 락 TTL이 작업 소요보다 짧으면 두 인스턴스가 동시에 잡을 수 있다 — TTL을 인터벌의 1.5배 이상으로 잡고, 날씨 수집처럼 오래 걸리는 작업(REGIONS × 3초 stagger)은 실측 후 결정해야 한다. 반대로 락 보유 인스턴스가 죽으면 최대 TTL만큼 스케줄이 건너뛴다.

완료 기준: R3 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R4. SIGTERM에 graceful shutdown이 없다

브랜치: `refactor/r-batch-01-security-critical`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **Critical** · 분류: `POTENTIAL BEHAVIOR CHANGE`

위치: `backend/src/main.ts` (`bootstrap`, 88~93행)

문제: `beforeExit`는 이벤트 루프가 비어 정상 종료될 때만 발생한다. **SIGTERM으로는 절대 발생하지 않는다.** ECS는 배포·스케일인 때 SIGTERM을 보내고 30초 후 SIGKILL한다. 따라서 매 배포마다:

작업:

- [x] `app.enableShutdownHooks()`를 추가하고(`PrismaService`/`RedisService`/BullMQ dispatcher의 `OnModuleDestroy`가 자동 호출됨), `SIGTERM`/`SIGINT` 핸들러에서 `await app.close()` → `await flushSentry()` 순으로 정리한다. `bootstrap().catch(...)`로 부팅 실패를 로깅하고 `process.exit(1)`한다. ECS 서비스에는 ALB deregistration delay보다 긴 `stopTimeout`을 설정한다.

변경 범위:

```text
text
파일 수정   backend/src/main.ts
파일 수정   backend/docker/ecs/backend-task-definition.json (stopTimeout)
```

위험: POTENTIAL BEHAVIOR CHANGE. . 

완료 기준: R4 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R5. 대기질 등급 임계값이 서버·클라이언트에 이중 정의되어 있고 값이 다르다

브랜치: `refactor/r-batch-06-contract-frontend`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **Critical** · 분류: `POTENTIAL BEHAVIOR CHANGE`

위치: `backend/src/modules/weather/policies/weather-status.policy.ts` (`uvStatus`, `ozoneStatus`, `pm10Status`, `pm25Status`, `caiStatus`) · `app/weather-detail.tsx` (`UV_BANDS`, `PM10_BANDS`, `PM25_BANDS`, `OZONE_BANDS`, `CAI_BANDS`, 15~45행)

문제: 두 구현이 **실제로 불일치한다.**

작업:

- [ ] 프론트의 5개 구간 배열과 등급 재계산을 삭제하고, 서버가 이미 내려주는 `uvStatus` / `pm10Status` / `pm25Status` / `ozoneStatus` / `caiStatus`를 그대로 사용한다. 게이지 바의 위치 계산(`bandPosition`)에 필요한 시각적 눈금만 프론트에 남긴다. 등급 판정의 단일 출처는 `weather-status.policy.ts`로 확정한다.

변경 범위:

```text
text
파일 수정   app/weather-detail.tsx
API 변경   없음 (기존 응답 필드를 사용만 시작)
```

위험: POTENTIAL BEHAVIOR CHANGE.  — **의도된 표시 변경**이다. UV 6~7 구간이 "보통"에서 "나쁨"으로 바뀐다. 이것이 올바른 방향인지(즉 정책 기준값 자체가 맞는지) 먼저 확인이 필요하다. 만약 프론트 쪽 구간이 의도한 정책이라면 반대로 백엔드 정책을 고쳐야 하며, 그 경우 

완료 기준: R5 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R6. 추론 서버가 전역 락으로 직렬화되어 컨테이너당 동시 1건만 처리한다

브랜치: `refactor/r-batch-01-security-critical`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **Critical** · 분류: `POTENTIAL BEHAVIOR CHANGE`

위치: `backend/inference-service/main.py` (`inference_lock`, `analyze` 엔드포인트) · `backend/inference-service/Dockerfile` (`uvicorn main:app` — worker 1) · `backend/docker/ecs/inference-task-definition.json` (cpu 1024)

문제: `asyncio.to_thread`로 이벤트 루프는 안 막지만 락 때문에 실제 추론은 완전 직렬이다. 컨테이너 처리량 = 1 / 추론시간. 진단 요청이 동시에 2건 들어오면 두 번째는 첫 번째가 끝날 때까지 대기하고, NestJS 측 타임아웃(그리고 프론트 45초)까지 밀리면 그대로 실패한다. 사용자 수가 늘면 가장 먼저 터지는 지점이고, ECS 태스크 수를 늘리는 것 외에 완화 수단이 없다(비용이 선형 증가).

작업:

- [x] **1단계(저위험):** 락을 제거하지 말고 `asyncio.Semaphore(N)` + 명시적 대기 타임아웃으로 바꾼다. PyTorch CPU 추론은 스레드 안전하므로(`torch.set_num_threads(1)`로 스레드당 BLAS 스레드를 고정하면) N을 vCPU 수에 맞춰 2~4로 올릴 수 있다. 세마포어 대기 시간을 `/metrics`에 히스토그램으로 추가하고, 대기 타임아웃 초과 시 429를 반환해 NestJS가 즉시 fallback하도록 한다. 락이 정말로 필요한 이유(모델 내부 가변 상태 등)가 있다면 그 부분만 좁은 범위로 감싼다.
- [ ] **2단계(보류 — 실측 필요):** ECS 태스크 vCPU를 2로 올리고 `uvicorn --workers 2`로 프로세스를 나눈다. 모델이 프로세스별로 메모리를 차지하므로 메모리 상한 확인이 선행되어야 한다. → 1단계에서 `INFERENCE_CONCURRENCY`(기본 1, 최대 4)로 슬롯 수를 환경변수화했으므로, 부하 테스트 후 값만 올리면 된다. cpu/memory 증설은 그 결과에 따라 결정한다.
- [x] 함께, `analyzer`가 startup 실패로 `None`인 상태에서 요청이 들어오면 `AttributeError` → 500이 되므로, `/health`가 `analyzer is None`일 때 실패를 반환하도록 하고 `analyze`는 503을 반환하게 한다.

변경 범위:

```text
text
파일 수정   backend/inference-service/main.py
파일 수정   backend/inference-service/metrics.py
파일 수정   backend/inference-service/Dockerfile
파일 수정   backend/docker/ecs/inference-task-definition.json (cpu/memory)
API 변경   429 응답 코드 추가 (NestJS provider의 재시도/fallback 처리 필요)
```

위험: POTENTIAL BEHAVIOR CHANGE. . 병렬 추론이 스레드 안전한지 반드시 부하 테스트로 확인해야 한다(MediaPipe landmarker는 인스턴스 공유 시 스레드 안전하지 않을 수 있으므로 인스턴스를 스레드로컬로 두거나 풀링이 필요할 수 있음). 429 도입은 NestJS 쪽 처리 변경을 동반한다. 메모리 초과로 OOMKill이 나면 오히려 가용성이 나빠지므로 2단계는 반드시 실측 후 진행한다.

완료 기준: R6 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R7. RecommendationService가 8가지 책임을 한 클래스에 담고 있다

브랜치: `refactor/r-batch-05-backend-structure`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **High** · 분류: `SAFE REFACTOR`

위치: `backend/src/modules/recommendations/recommendation.service.ts` (918줄)

문제: - 변경 사유가 8개다. 캐시 정책만 바꾸려 해도 918줄 파일을 건드려야 하고, 그 파일은 Gemini 호출·DB 트랜잭션도 품고 있어 리뷰 범위가 매번 과하게 커진다. - 테스트가 무겁다. `recommendation.service.spec.ts`는 Prisma·Gemini·Redis·Job·Consent·Idempotency를 전부 목킹해야 한다. 순수 로직(상품 매칭, fallback 선택)만 검증하고 싶어도 불가능하다. - 동일 조회 쿼리("기존 추천 가져오기")가 4곳에 복붙돼 있어 `deletedAt` 조건 같은 게 한 곳만 빠지면 조용히 어긋난다.

작업:

- [ ] 클래스를 넷으로 쪼갠다. 새 추상화를 만드는 게 아니라 **이미 존재하는 경계선을 파일로 드러내는** 작업이다.
- [ ] `RecommendationService` — 유스케이스 오케스트레이션만 (동의 → 예약 → 생성 → 저장 → 매핑 호출)
- [ ] `RecommendationRepository` — 4중 중복된 조회/영속화 쿼리 + advisory lock 트랜잭션
- [ ] `RecommendationMapper` — 엔티티 → DTO 변환 (순수 함수, 목킹 없이 테스트 가능)
- [ ] `RecommendationFallbackPolicy` — fallback 슬롯 정의와 한국어 문구 (제안 [24]와 연결)
- [ ] Gemini 호출과 캐시/잡은 각각 기존 `GeminiClient`와 신설 `FastPathCoordinator`(제안 [8])로 나간다.

변경 범위:

```text
text
파일 추가   recommendation.repository.ts, recommendation.mapper.ts, recommendation.fallback.ts
파일 수정   recommendation.service.ts, recommendation.module.ts, recommendation.service.spec.ts
```

위험: SAFE REFACTOR.  — 외부 동작 불변이 목표다. 다만 918줄을 옮기는 작업이므로 트랜잭션 경계(advisory lock 범위)를 잘못 옮기면 동시성 버그가 생긴다. 리포지토리 메서드가 

완료 기준: R7 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R8. fast-path SWR 알고리즘이 두 서비스에 통째로 중복돼 있다

브랜치: `refactor/r-batch-05-backend-structure`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **High** · 분류: `BEHAVIOR-PRESERVING REFACTOR`

위치: `backend/src/modules/recommendations/recommendation.service.ts` (`generateFast`, `isRecentlyFailed`, 캐시 read/write 헬퍼) · `backend/src/modules/products/product.service.ts` (`generateWeatherBasedFast`, 동일 헬퍼)

문제: 캐시 정책이나 잡 dedupe 규칙을 바꿀 때 두 곳을 동시에 고쳐야 하고, 한쪽만 고치면 추천과 제품이 서로 다른 신선도 정책으로 동작한다. 실제로 두 구현의 상수값과 실패 억제 조건이 이미 미묘하게 다르다. 이후 세 번째 fast-path(예: 패턴 분석)를 추가하면 세 벌이 된다.

작업:

- [x] `FastPathCoordinator`를 만들어 제네릭 `resolve<T>()` 하나로 노출한다(`jobs/fast-path.coordinator.ts`, `JobsModule`이 export).
- [x] 도메인은 파라미터만 넘긴다 — `cacheKey`, `dedupeKey`, `jobType`, `readJobResult`, `loadFallback`, `enqueue`.
- [x] 신선도·중복 억제·실패 억제 상수 4개(TTL 6h / 재검증 30m / dedupe 창 10m / FAILED cooldown 5m)를 코디네이터에 한 번만 둔다.
- [x] `recommendation.service` / `product.service`의 SWR·dedupe·캐시 헬퍼를 삭제하고 코디네이터 호출로 대체한다.

**정본 선택 결정 — 선택할 것이 없었다.** 착수 전 두 구현의 상수·분기를 표로 비교했더니 네 상수가 모두 같은 값이었고
(6h / 30m / 10m / 5m), 응답 우선순위와 FAILED cooldown 조건도 동일했다. "상수가 이미 다르다"는 백로그 기술은
사실이 아니었다(작성 시점 이후 한쪽이 맞춰진 것으로 보인다). 따라서 한쪽 동작을 바꾸는 선택 없이 그대로 합쳤다.

남은 차이는 도메인 고유라 코디네이터 밖에 남겼다:

| 항목 | 추천 | 날씨 제품 |
|---|---|---|
| 코디네이터 앞 단계 | 저장된 추천이 있으면 DB에서 바로 LIVE | 카탈로그가 비면 503 |
| dedupeKey | `diagnosisId:*` (호환 모드는 키 없음 → job 재사용 생략) | `regionKey:*` |
| enqueue | 단순 enqueue | N14 예약 가드 경유 |
| COMPLETED 결과 캐시 적재 | 함(`cacheLiveResult: true`) | 안 함(LIVE 생성 경로에서 이미 적재) |

- [x] **캐시 봉투 통일:** 추천이 `{ recommendations }`, 제품이 `{ items }`로 서로 달랐다 → `{ items, generatedAt }`으로 맞췄다.
      배포 시점에 남아 있는 예전 형식 값은 코디네이터가 **miss로 처리**한다(빈 배열로 오해해 빈 화면을 보여주지 않는다).
      키는 그대로라 TTL(6h) 안에 자연 교체된다. Redis는 최적화 계층이므로 이 miss는 FALLBACK + 재생성으로 흡수된다.
- [x] 코디네이터 자체 spec 12개를 추가했다 — 두 화면이 공유하는 정책이라 도메인 없이 우선순위를 직접 검증한다.

변경 범위:

```text
파일 추가   backend/src/modules/jobs/fast-path.coordinator.ts(+spec)
파일 수정   recommendation.service.ts, product.service.ts, jobs.module.ts, 두 spec 파일
```

위험: BEHAVIOR-PRESERVING REFACTOR. 상수가 동일해 통합으로 바뀌는 동작은 없다. 유일한 관찰 가능한 변화는
배포 직후 남은 추천 캐시가 한 번 miss가 되는 것(→ FALLBACK 후 재생성)이다.

완료 기준: R8 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다. → 유닛 425개 통과, typecheck·lint 통과.

## R9. 요청마다 상품 카탈로그 전체를 메모리로 로드한다

브랜치: `refactor/r-batch-05-backend-structure`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **High** · 분류: `POTENTIAL BEHAVIOR CHANGE`

위치: `backend/src/modules/recommendations/recommendation.service.ts` — 상품 매칭 경로 2곳 · `backend/prisma/schema.prisma` — `Product`

문제: - 카탈로그가 커질수록 요청당 전송량·역직렬화·GC 비용이 선형 증가한다. 페이로드 필터링이 전혀 없어 인덱스도 무의미하다. - 상품 데이터는 거의 변하지 않는 참조 데이터인데, 매 요청마다 DB를 왕복한다. - 동일 요청 내 중복 로드가 발생한다.

작업:

- [ ] 카탈로그를 `RedisService`에 TTL 캐시(예: 10~30분)로 올리고, 관리자 상품 변경 시 `invalidate`한다. Redis 미가용 시 프로세스 내 TTL 캐시로 폴백한다.
- [ ] `pickRuleProduct` 같이 특정 카테고리/등급만 필요한 경로는 `where: { category, evidenceGrade }`로 좁혀 조회한다.
- [ ] 함께 `Product`에 `@@index([category])`와 커서 페이지네이션용 `@@index([createdAt, id])`를 추가한다(제안 [33]에 포함).

변경 범위:

```text
text
파일 수정   recommendation.service.ts, product.service.ts
DB 변경     Product 인덱스 추가
migration 필요   예 (인덱스만, 데이터 마이그레이션 없음)
```

위험: POTENTIAL BEHAVIOR CHANGE. . 캐시 도입으로 관리자가 상품을 수정한 뒤 최대 TTL만큼 반영이 지연된다. 무효화 훅을 admin 경로에 반드시 붙여야 한다.

완료 기준: R9 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R10. AsyncJob.payload JSON 경로 조회에 인덱스가 없다

브랜치: `refactor/r-batch-04-db-migration`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **High** · 분류: `POTENTIAL BEHAVIOR CHANGE`

위치: `backend/prisma/schema.prisma` — `AsyncJob.payload (Json)` · `recommendation.service.ts` / `product.service.ts` — `findRecentJob` 계열

문제: `userId + createdAt`으로 후보를 좁힌 뒤 JSON 경로 비교는 행 단위로 수행된다. 지금은 후보가 적어 문제가 없지만, `async_jobs`에 보존 정책이 없어(제안 [11]) 테이블이 무한히 커지고, 활성 사용자일수록 자기 잡이 많아 후보 집합도 커진다. fast-path는 **모든 홈 화면 진입마다** 이 쿼리를 타므로 가장 뜨거운 경로다.

작업:

- [x] **선택지 A 채택:** `AsyncJob.dedupeKey String?` + `@@index([userId, type, dedupeKey, createdAt])`. 인덱스에서 `status`는 뺐다 — 두 호출처가 상태로 필터하지 않고(PENDING·PROCESSING·COMPLETED를 모두 후보로 본다) 컬럼을 더 넣으면 인덱스만 커진다.
- [x] 선택지 B(GIN)는 쓰지 않았다. raw SQL이 필요한 데다 JSON 경로 비교가 남는다.
- [x] 기존 행은 `dedupeKey`가 NULL이다. 백필하지 않는다 — dedupe 윈도우는 수 분이라 배포 직후 잠깐 느슨해질 뿐이고, 그 구간은 잡의 idempotent 예약이 막는다.
- [x] 키 생성을 `job-dedupe.ts` 한 곳에 모았다(`buildJobDedupeKey`). 이전에는 `payload.diagnosisId` / `payload.regionKey`를 각 서비스가 직접 꺼내 JSON 경로로 조회했다. 생성(`JobStateService.create`)과 조회(`findRecentByDedupeKey`)가 같은 함수를 쓰지 않으면 키가 어긋나 dedupe가 조용히 멈춘다.

변경 범위:

```text
text
DB 변경     AsyncJob에 dedupeKey 컬럼 + 복합 인덱스 추가
migration 필요   예
기존 데이터 migration 필요   아니오 (신규 행부터 적용, 조회 윈도우가 짧아 무해)
파일 수정   job.service.ts, recommendation.service.ts, product.service.ts, domain-job.handlers.ts
```

위험: POTENTIAL BEHAVIOR CHANGE.  + **DB 스키마 변경**. 마이그레이션 배포와 코드 배포 사이에 순서 의존이 있다(컬럼 추가 → 코드 배포). 배포 직후 짧은 시간 동안 dedupe가 느슨해져 중복 잡이 한 번 더 생길 수 있으나, 잡 자체가 idempotent 예약으로 보호되므로 영향은 제한적이다. **별도 승인 대상.**

완료 기준: R10 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R11. 고빈도 append-only 테이블에 보존 정책이 전혀 없다

브랜치: `refactor/r-batch-04-db-migration`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **High** · 분류: `FEATURE CHANGE`

위치: `backend/prisma/schema.prisma` — `RefreshSession`, `AsyncJob`, `AiCallReservation`, `WeatherSnapshot`, `OtpCode`, `OtpSendLog` · `backend/src/common/soft-delete/soft-delete.service.ts` (`purgeExpired` — 탈퇴 사용자만 처리)

문제: 증가 속도를 실제 설정으로 계산하면 심각하다.

작업:

- [x] `RetentionService`를 만들고 `SoftDeletePurgeScheduler.tick()`에 붙였다(R3 리더 락 적용 후이므로 인스턴스가 여러 개여도 한 번만 돈다).
- [x] RefreshSession       expiresAt < now - 7d  또는 revokedAt < now - 7d  → DELETE
- [x] AsyncJob             createdAt < now - 30d (COMPLETED/FAILED만)      → DELETE
- [x] AiCallReservation    updatedAt < now - 1d  (COMPLETED)               → DELETE
- [x] OtpCode / OtpSendLog 30d — 각각 인덱스가 있는 `expiresAt` / `sentAt`으로 자른다(`createdAt`은 인덱스가 없고, OTP는 생성-만료 간격이 수 분이라 기간 의미가 같다)
- [x] WeatherSnapshot      collectedAt < now - 400d                        → DELETE
- [x] 보존 기간은 `RETENTION_*` 환경변수로 노출했다. 인덱스는 R33에서 함께 추가했다.
- [x] **`RETENTION_SWEEP_MODE` 기본값은 `off`다.** 되돌릴 수 없는 DELETE이므로 코드 배포만으로는 아무것도 지우지 않는다. 운영 활성화는 `dry-run`으로 규모 확인 → 스냅샷 → `delete` 순서로 별도 진행한다(docs/DEPLOYMENT.md).
- [x] 삭제는 id를 먼저 뽑고 그 목록만 지운다. `deleteMany`에는 LIMIT이 없어 조건에 맞는 전체 행을 한 트랜잭션에서 지우려 하고, 최초 실행처럼 대상이 많을 때 테이블 잠금이 길어진다. 테이블당 20배치를 넘기면 남은 몫을 다음 tick으로 넘긴다.
- [x] 한 테이블의 실패가 나머지 정리를 막지 않도록 정책별로 예외를 잡는다.

변경 범위:

```text
text
파일 추가   backend/src/common/retention/retention.service.ts
파일 수정   soft-delete-purge.scheduler.ts (또는 별도 스케줄러), env.registry.ts, env.validation.ts
DB 변경     인덱스 추가 (expiresAt, revokedAt, createdAt, collectedAt)
migration 필요   예 (인덱스)
기존 데이터 migration 필요   최초 실행 시 대량 삭제 발생 — 배치 실행 필요
```

위험: FEATURE CHANGE.  — **데이터를 삭제한다.** 특히 

완료 기준: R11 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R12. Jobs 모듈과 도메인 모듈이 순환 의존한다 (forwardRef 4개)

브랜치: `refactor/r-batch-05-backend-structure`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **High** · 분류: `BEHAVIOR-PRESERVING REFACTOR`

위치: `backend/src/modules/jobs/handlers/domain-job.handlers.ts` · `backend/src/modules/jobs/jobs.module.ts` (`forwardRef` × 4) · `recommendation.module.ts`, `product.module.ts`, `pattern.module.ts`, `notification.module.ts`

문제: 의존 방향이 잘못됐다. 인프라 계층(jobs)이 도메인 계층을 알고 있다. 새 잡 타입을 추가할 때마다 `jobs.module.ts`에 `forwardRef`가 하나씩 늘어난다. `forwardRef`는 순환을 숨길 뿐 해소하지 않으며, 초기화 순서 문제로 런타임에 `undefined` 주입이 발생할 수 있다(테스트에서 모듈 구성이 조금만 달라져도 드러난다).

작업:

- [ ] 의존 방향을 뒤집는다. `JobsModule`은 `JobHandlerRegistry`(빈 레지스트리)만 제공하고, **각 도메인 모듈이 자기 `OnModuleInit`에서 자기 핸들러를 등록**한다.
- [ ] 현재:  JobsModule ──forwardRef──► Recommendation/Product/Pattern/Notification
- [ ] 변경:  Recommendation/Product/Pattern/Notification ──► JobsModule (단방향)
- [ ] └─ onModuleInit: registry.register(JobType.X, handler)
- [ ] `domain-job.handlers.ts`는 삭제된다. 동시에 각 핸들러 진입점에서 payload를 `class-validator` DTO나 좁은 타입 가드로 검증하고, 실패 시 명시적으로 잡을 FAILED 처리한다.

변경 범위:

```text
text
파일 삭제   backend/src/modules/jobs/handlers/domain-job.handlers.ts
파일 수정   jobs.module.ts, job-handler.registry, 도메인 모듈 4개 + 서비스 4개
```

위험: BEHAVIOR-PRESERVING REFACTOR. . 등록 시점이 

완료 기준: R12 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R13. BullMQ 워커가 API 프로세스 안에서 돈다

브랜치: `refactor/r-batch-03-scheduler-worker`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **High** · 분류: `POTENTIAL BEHAVIOR CHANGE`

위치: `backend/src/modules/jobs/dispatchers/bullmq.job-dispatcher.ts` (모듈 초기화 시 `new Worker(...)`) · `backend/docker/ecs/backend-task-definition.json`

문제: - 잡 처리(Gemini 호출, 상품 매칭, 패턴 계산)가 API 요청과 같은 CPU/이벤트 루프를 공유해 **p99 응답 지연을 직접 밀어올린다.** - API 트래픽 기준으로 스케일하면 워커도 같이 늘고, 잡 기준으로 스케일하면 API가 과잉 프로비저닝된다. 두 워크로드의 스케일 축이 다른데 하나로 묶여 있다. - 배포 시 graceful shutdown이 없어(제안 [4]) 처리 중이던 잡이 stalled로 남는다.

작업:

- [x] `JOB_ROLE=api|worker|both`를 도입했다(`src/config/job-role.ts`). 기본값 `both` = 현재 동작. `api`는 `Queue`만 만들고 `Worker`를 만들지 않는다 — Queue까지 빼면 `dispatch()`가 실패한다.
- [x] `worker`도 HTTP를 계속 띄운다. ECS 컨테이너 헬스체크가 `/health`를 호출하기 때문이며, ALB 타깃 그룹에 등록하지 않는 것으로 트래픽을 분리한다. HTTP 리스너 자체를 없애면 컨테이너가 unhealthy로 계속 재시작된다.
- [x] `worker-task-definition.json` 추가(`JOB_ROLE=worker`, `JOB_DISPATCHER=bullmq` 강제 — Redis 누락 시 조용히 inline으로 떨어지면 워커가 큐를 소비하지 않는다). `JOB_WORKER_CONCURRENCY`로 동시성 분리(API 2 / 워커 4).
- [x] deploy 워크플로에 워커 rollout을 API보다 **먼저** 넣었다. Variable `ECS_SERVICE_WORKER`가 비어 있으면 스킵되므로 서비스 생성 전에도 안전하다.
- [x] `backend-task-definition.json`은 아직 `both`로 둔다. `api`로 내리는 것은 워커 서비스 가동 확인 후 별도 변경이며, 순서를 뒤집지 못하도록 `task-definition-env.spec.ts`가 `JOB_ROLE=api`를 거부한다.

변경 범위:

```text
text
파일 수정   bullmq.job-dispatcher.ts, main.ts, jobs.module.ts, env.registry.ts, env.validation.ts
파일 추가   backend/docker/ecs/worker-task-definition.json
파일 수정   .github/workflows/deploy-ecs.yml (worker 서비스 rollout 추가)
```

위험: POTENTIAL BEHAVIOR CHANGE.  + 인프라 변경. 워커 서비스를 띄우기 전에 

완료 기준: R13 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R14. safeFetch가 인증 헤더를 안 보내고 모든 에러를 null로 삼킨다

브랜치: `refactor/r-batch-06-contract-frontend`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **High** · 분류: `POTENTIAL BEHAVIOR CHANGE`

위치: `src/api/client.ts` — `safeFetch`, 그리고 이를 쓰는 `getWeather`, `getProducts`, `getRecommendations`

문제: - **인증 누락:** `/weather`, `/products`, `/recommendations`가 토큰 없이 호출된다. 이들이 개인화 응답을 준다면 지금 동작하는 이유는 서버가 인증을 요구하지 않고 있다는 뜻이며, 그렇다면 rate limit 외에 보호 장치가 없다. 반대로 서버가 인증을 요구하도록 바뀌면 화면이 조용히 깨진다. - **에러 구분 불가:** 네트워크 단절, 타임아웃, 401, 500, 잘못된 JSON이 전부 `null`이 된다. 화면은 "데이터 없음"과 "요청 실패"를 구분할 수 없어 사용자에게 재시도를 안내하지 못한다. - 두 경로가 존재해 새 API를 붙일 때 어느 쪽을 써야 하는지 규칙이 없다.

작업:

- [ ] `safeFetch`를 제거하고 모든 호출을 `authFetch`로 통일한다. 토큰이 없을 때는 헤더를 생략하되(현재 동작 유지) 경로 자체는 하나로 만든다. 반환 타입을 판별 가능한 결과 타입으로 바꾼다.
- [ ] 화면은 `kind`에 따라 재시도 버튼 / 로그인 유도 / 빈 상태를 구분해 보여준다.
- [ ] 함께, 서버 쪽 세 엔드포인트가 인증을 요구해야 하는지 확인하고 필요하면 가드를 추가한다.

변경 범위:

```text
text
파일 수정   src/api/client.ts (전면), 이를 소비하는 화면 전체
파일 수정   (확인 후) 백엔드 weather/products/recommendations 컨트롤러 가드
API 변경    가능 — 위 엔드포인트를 인증 필수로 바꾸는 경우
```

위험: POTENTIAL BEHAVIOR CHANGE. . 반환 타입 변경이 모든 소비 화면에 파급된다(제안 [15]의 strict 모드 활성화 후에 하면 컴파일러가 누락을 잡아준다 — **[15] 이후에 진행할 것을 권장**). 엔드포인트에 인증을 강제하면 미로그인 사용자의 화면 동작이 바뀌므로 별도 승인이 필요하다.

완료 기준: R14 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R15. 프론트엔드가 strict 모드 없이 컴파일되고, 실제 타입 버그가 숨어 있다

브랜치: `refactor/r-batch-02-safety-net`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **High** · 분류: `SAFE REFACTOR`

위치: `tsconfig.json` (루트) — `"strict": false` · `app/(tabs)/index.tsx` 91~92행 · `typecheck-report.txt` (저장소에 커밋됨) · `package.json` (루트) — scripts에 `typecheck`/`lint`/`test` 없음

문제: strict가 꺼진 덕에 실제 버그가 통과한다.

작업:

- [x] 루트 `tsconfig.json`에 `"strict": true`를 켠다. 한 번에 다 고치기 어려우면 `strictNullChecks`부터 켜고 나머지를 단계적으로 올린다.
- [x] 2. 드러나는 에러를 수정한다. strict 위반은 `app/(tabs)/index.tsx` 1건뿐이었다. `setRecommendations([])`로 바꾸면 "추천을 불러올 수 없어요" 분기가 죽으므로(호출부가 `recommendations === null`을 검사한다) 상태 타입을 `Recommendation[] | null`로 넓혀 런타임 동작을 보존했다.
- [x] 3. 루트 `package.json`에 `typecheck`/`lint`/`test`를 추가하고 ESLint flat config(`eslint-config-expo/flat`)를 도입한다. ESLint는 9.x로 고정한다 — `eslint-plugin-react` peer가 `^9.7`까지여서 10.x에서는 규칙 로딩이 깨진다.
- [x] 4. CI에 `npm run lint`를 추가한다.
- [x] 5. `typecheck-report.txt`를 삭제하고 `.gitignore`에 추가한다.

변경 범위:

```text
text
파일 수정   tsconfig.json, package.json, .github/workflows/ci.yml, .gitignore
파일 추가   eslint.config.js
파일 삭제   typecheck-report.txt
파일 수정   strict 위반이 드러나는 화면들
dependency 변경   eslint, eslint-config-expo, eslint-plugin-react-hooks 추가
```

위험: SAFE REFACTOR. (설정) + 개별 수정은 

완료 기준: R15 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R16. 프론트엔드에 테스트가 한 개도 없다

브랜치: `refactor/r-batch-02-safety-net`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **High** · 분류: `SAFE REFACTOR`

위치: `src/**`, `app/**` — 테스트 파일 0개 · `.github/workflows/ci.yml` — `frontend-typecheck` 잡은 `tsc --noEmit`만 수행

문제: 테스트되지 않은 채 남아 있는 프론트 로직 중 실패 비용이 큰 것들이 있다.

작업:

- [x] `jest-expo` + `@testing-library/react-native`를 도입하고 다음 세 가지에 집중한다(전면 커버리지가 목표가 아니다).
- [x] `client.ts` 단위 테스트 — 401 → 재발급 → 재시도, 동시 401 시 재발급 1회, 재발급 실패 시 세션 정리. **이 테스트가 실제 버그를 잡았다**: `refreshInFlight` 해제가 refresh 토큰 부재 경로에서 누락돼, 한 번 실패하면 프로세스 수명 동안 재발급이 영구히 막혔다. `finally`로 항상 해제하도록 고쳤다. `src/lib/session.ts`(R1 SecureStore 이관)도 함께 덮었다.
- [ ] 2. `useAsyncJob`(제안 [27]로 추출 후) 단위 테스트 — PENDING → COMPLETED, 타임아웃, 언마운트 시 abort. **B6(R27)에서 훅을 추출한 뒤 추가한다.**
- [x] 3. 백엔드 e2e에 존재하는 `api-contract.e2e-spec.ts`와 짝을 이루는 프론트 계약 테스트 — 응답 타입이 맞는지.
- [x] CI `frontend-typecheck` 잡에 `npm test`를 추가한다.

변경 범위:

```text
text
파일 추가   jest.config.js, src/**/__tests__/*
파일 수정   package.json, .github/workflows/ci.yml
dependency 변경   jest-expo, @testing-library/react-native, @types/jest 추가
```

위험: SAFE REFACTOR. (제품 코드 무변경). 초기 설정 비용이 있고, RN 테스트 환경은 네이티브 모듈 목킹이 번거롭다. 화면 렌더 테스트까지 확장하면 유지보수 부담이 커지므로 위 3개 영역으로 범위를 제한할 것을 권한다.

완료 기준: R16 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R17. 운영 ECS task definition에 OCTOMO_API_KEY가 없어 readiness가 실패한다

브랜치: `refactor/r-batch-01-security-critical`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **High** · 분류: `SAFE REFACTOR`

위치: `backend/docker/ecs/backend-task-definition.json` — `secrets` 배열 · `backend/src/health/health.service.ts` — `pushOctomoDependency` · `backend/src/config/env.registry.ts` — `OCTOMO_API_KEY: requiredIn: ['production']`

문제: 운영 배포 시 `/health/ready`가 항상 not-ready가 된다. 컨테이너 헬스체크는 `/health`를 보므로 태스크는 뜨지만, ALB 타깃 그룹 헬스체크를 `/health/ready`로 잡는 순간 전 태스크가 unhealthy가 되어 롤아웃이 무한 실패한다. 실제 OTP 발송도 동작하지 않으므로 **신규 가입과 신규 디바이스 로그인이 전부 막힌다.**

작업:

- [x] task definition의 `secrets`에 `OCTOMO_API_KEY`를 추가하고 Secrets Manager에 값을 등록한다. `OCTOMO_ENDPOINT`, `OCTOMO_RECIPIENT_NUMBER`는 비밀이 아니므로 `environment`에 명시한다. 근본 대책으로 `getRequiredEnvKeys('production')`의 결과와 task definition의 `environment ∪ secrets` 키 집합을 비교하는 CI 검증 스크립트를 추가해 같은 종류의 누락을 자동 차단한다.

변경 범위:

```text
text
파일 수정   backend/docker/ecs/backend-task-definition.json
파일 추가   scripts/verify-task-definition-env.ts (또는 e2e spec)
파일 수정   .github/workflows/ci.yml
AWS 변경    Secrets Manager 시크릿 생성
```

위험: SAFE REFACTOR. (설정). 값 자체는 운영 비밀이므로 Secrets Manager 등록과 실행 롤 권한(

완료 기준: R17 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R18. 환경변수 정의가 두 파일로 갈라져 있고 실제로 어긋나 있다

브랜치: `refactor/r-batch-02-safety-net`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **High** · 분류: `POTENTIAL BEHAVIOR CHANGE`

위치: `backend/src/config/env.validation.ts` (Joi 스키마) · `backend/src/config/env.registry.ts` (`ENV_REGISTRY`)

문제: 두 목록이 이미 어긋나 있다.

작업:

- [x] 레지스트리를 단일 출처로 삼는다. `EnvVarDefinition`에 `schema: Joi.Schema` 필드를 추가하고, `envValidationSchema`를 `Joi.object(Object.fromEntries(ENV_REGISTRY.map(d => [d.key, d.schema])))`로 생성한다. 이 리팩토링이 부담스럽다면 **최소한** 두 키 집합이 정확히 일치하는지 검증하는 테스트를 추가한다 — 그것만으로도 드리프트는 즉시 막힌다. 누락된 9개 키의 Joi 규칙과 `TEST_DATABASE_URL` 등록도 함께 처리한다.

변경 범위:

```text
text
파일 수정   env.registry.ts, env.validation.ts, env.registry.spec.ts
```

위험: POTENTIAL BEHAVIOR CHANGE. . 지금까지 검증을 우회하던 키에 규칙이 생기면서, 현재 운영/개발 환경의 값이 새 규칙에 걸려 **부팅이 실패할 수 있다.** 각 키의 규칙을 현재 실제 값보다 느슨하게(대부분 

완료 기준: R18 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R19. 두 Docker 이미지 모두 root로 실행된다

브랜치: `refactor/r-batch-01-security-critical`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **High** · 분류: `POTENTIAL BEHAVIOR CHANGE`

위치: `backend/Dockerfile` (runner 스테이지 — `USER` 없음) · `backend/inference-service/Dockerfile` (`USER` 없음, `COPY . .`)

문제: 컨테이너 내 원격 코드 실행 취약점이 생기면 root 권한으로 이어져 컨테이너 브레이크아웃 난이도가 크게 낮아진다. 추론 서비스는 **사용자가 업로드한 이미지를 파싱**하므로(Pillow/OpenCV 등 네이티브 디코더) 공격 표면이 특히 넓은 서비스다. 여기가 root로 도는 것은 위험 대비 이득이 없다.

작업:

- [x] 두 Dockerfile 모두 마지막 스테이지에서 비-root 유저를 만들고 전환한다.
- [x] RUN useradd --system --uid 10001 --create-home appuser
- [x] NestJS 이미지는 `entrypoint.sh`와 `dist`의 소유권을 맞춰야 한다. 추론 이미지는 `COPY . .` 대신 필요한 `*.py`와 `assets/`만 명시적으로 복사한다. ECS task definition에도 `"user": "10001"`을 명시해 이미지 변경과 무관하게 강제한다.

변경 범위:

```text
text
파일 수정   backend/Dockerfile, backend/inference-service/Dockerfile
파일 수정   backend/docker/ecs/*.json ("user" 필드)
```

위험: POTENTIAL BEHAVIOR CHANGE. . 파일 권한 문제로 컨테이너가 부팅에 실패할 수 있다(특히 

완료 기준: R19 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R20. 캘린더 히스토리 응답이 presigned URL을 N+1로 생성한다

브랜치: `refactor/r-batch-05-backend-structure`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **Medium** · 분류: `SAFE REFACTOR`

위치: `backend/src/modules/diagnosis/diagnosis.service.ts` — `toCalendarDiagnosisDto` 내부 `Promise.all` · `backend/src/modules/storage/image-storage.service.ts` — presign 경로

문제: 하루에 진단이 여러 건이거나 진단당 이미지가 여러 장이면 호출 수가 곱해진다. 캘린더 화면은 사용자가 자주 여는 화면이라 누적 비용이 크다. `Promise.all`이라 동시 실행되긴 하지만 커넥션 풀을 순간적으로 점유해 다른 요청 지연으로 번진다.

작업:

- [ ] presign에 필요한 데이터(S3 key, mimetype 등)를 상위 쿼리에서 `include`로 한 번에 가져오고, `ImageStorageService`에 `presignMany(keys: string[])`를 추가해 DB 왕복 없이 URL만 배치 생성한다. presign 자체는 순수 서명 연산이므로 네트워크 호출이 필요 없다.

변경 범위:

```text
text
파일 수정   diagnosis.service.ts, image-storage.service.ts
```

위험: SAFE REFACTOR. . presign 만료 기준 시각이 항목별에서 배치별로 바뀌지만 

완료 기준: R20 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R21. refresh 토큰 회전 중 실패하면 사용자가 강제 로그아웃된다

브랜치: `refactor/r-batch-04-db-migration`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **High** · 분류: `POTENTIAL BEHAVIOR CHANGE`

위치: `backend/src/modules/auth/auth.service.ts` — `refresh` (약 322, 368, 470행 주변), `issueTokens`

문제: 폐기 후 발급 전에 예외(DB 순단, JWT 서명 실패, 프로세스 종료)가 나면 옛 토큰은 이미 무효인데 새 토큰은 없다. 클라이언트는 재발급 실패로 세션을 지우고 사용자는 재로그인해야 한다. 배포 중 SIGKILL(제안 [4] 미해결 상태)에서 발생 확률이 특히 높다.

작업:

- [x] 폐기와 신규 세션 생성을 `prisma.$transaction`으로 묶었다. 실패 시 옛 세션이 살아 있으므로 클라이언트가 그대로 재시도할 수 있다. 폐기는 `updateMany({ revokedAt: null })` + `count === 1` 검사로 하므로 같은 토큰의 동시 회전은 하나만 성공한다(원자적 소비).
- [x] `RefreshSession.familyId` + `@@index([familyId])`를 추가했다. 회전한 세션은 계열을 물려받고, 새 로그인은 자기 id가 계열 뿌리가 된다. 기존 행은 `familyId = id`로 백필했다.
- [x] 폐기된 토큰이 다시 오면 계열 전체를 폐기한다(OAuth 2.0 BCP). 단 `REFRESH_REUSE_GRACE_MS`(기본 10초) 안의 재사용은 네트워크 재시도로 보고 401만 준다 — 앱이 같은 토큰으로 두 번 갱신을 시도하는 것은 흔하고, 이를 탈취로 처리하면 정상 사용자가 로그아웃된다.

변경 범위:

```text
text
파일 수정   backend/src/modules/auth/auth.service.ts, auth.service.spec.ts
DB 변경     RefreshSession.familyId 추가 + 인덱스 (familyId 도입 시)
migration 필요   예 (familyId 도입 시)
기존 데이터 migration 필요   기존 행은 familyId = 자기 id로 백필
```

위험: POTENTIAL BEHAVIOR CHANGE. . 트랜잭션 묶기 자체는 

완료 기준: R21 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R22. 날씨 필드 매핑이 4곳에 중복돼 있다

브랜치: `refactor/r-batch-05-backend-structure`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **Medium** · 분류: `SAFE REFACTOR`

위치: `backend/src/modules/weather/weather.service.ts` — `buildSnapshotDto`, `persist`의 create data · `backend/src/modules/diagnosis/diagnosis.service.ts` — 스냅샷 변환 · `backend/src/modules/recommendations/recommendation.service.ts` — 스냅샷 변환

문제: 날씨 필드가 하나 추가되면 네 곳을 모두 고쳐야 하고, 한 곳을 빠뜨리면 그 경로에서만 필드가 `undefined`가 된다. 컴파일러가 잡아주지 않는다(모든 필드가 optional이므로). 이미 각 사본이 완전히 동일한지 육안 확인이 어려운 상태다.

작업:

- [ ] `weather/mappers/weather-snapshot.mapper.ts`에 `toSnapshotDto(entity)`와 `toCreateInput(dto)` 두 순수 함수를 두고 네 곳이 이를 호출한다. `Pick`/`satisfies`로 필드 누락 시 컴파일 에러가 나도록 타입을 조인다.

변경 범위:

```text
text
파일 추가   backend/src/modules/weather/mappers/weather-snapshot.mapper.ts
파일 수정   weather.service.ts, diagnosis.service.ts, recommendation.service.ts
```

위험: SAFE REFACTOR. . 통합 과정에서 네 사본의 미세한 차이(예: 한 곳만 특정 필드를 빠뜨린 상태)가 드러날 수 있다 — 그 차이가 의도된 것인지 버그인지 판단이 필요하며, 대부분 버그일 것이다.

완료 기준: R22 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R23. errorName 헬퍼가 3개 파일에 각각 정의돼 있다

브랜치: `refactor/r-batch-05-backend-structure`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **Low** · 분류: `SAFE REFACTOR`

위치: `backend/src/modules/diagnosis/diagnosis.service.ts` · `backend/src/modules/weather/weather.service.ts` · `backend/src/redis/redis.service.ts` (245행)

문제: 동일 유틸의 3중 복제다. 로그 포맷 정책(예: 이름 대신 `name: message` 형태로)이 바뀌면 세 곳을 찾아 고쳐야 하고, 새 서비스는 네 번째 사본을 만들 가능성이 높다.

작업:

- [ ] `backend/src/common/errors/error-name.util.ts`로 옮기고 세 곳에서 import한다. "한 번만 쓰는 유틸은 만들지 않는다"는 원칙에 어긋나지 않는다 — 이미 세 번 쓰이고 있다.

변경 범위:

```text
text
파일 추가   backend/src/common/errors/error-name.util.ts
파일 수정   diagnosis.service.ts, weather.service.ts, redis.service.ts
```

위험: SAFE REFACTOR. . 없음.

완료 기준: R23 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R24. 도메인 서비스에 사용자 노출 한국어 문구가 하드코딩돼 있다

브랜치: `refactor/r-batch-05-backend-structure`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **Low** · 분류: `SAFE REFACTOR`

위치: `backend/src/modules/recommendations/recommendation.service.ts` — `FALLBACK_SOURCE_LABEL`, `B_GRADE_SOURCE_LABEL`, fallback 슬롯의 `title`/`explanation` (660~720행 부근)

문제: 문구 오탈자 하나를 고치려고 918줄짜리 도메인 서비스를 수정하고 백엔드를 재배포해야 한다. 문구 변경 PR과 로직 변경 PR이 같은 파일에서 충돌한다. 다국어 지원을 하게 되면 서비스 로직 전체를 헤집어야 한다. 프레젠테이션 관심사가 도메인 계층에 섞여 있다.

작업:

- [ ] `recommendations/content/fallback-content.ts`(혹은 [7]의 `RecommendationFallbackPolicy`)로 문구를 분리한다. 지금 단계에서 i18n 프레임워크까지 도입할 필요는 없다 — **상수 파일 하나로 충분하다.**

변경 범위:

```text
text
파일 추가   backend/src/modules/recommendations/content/fallback-content.ts
파일 수정   recommendation.service.ts
```

위험: SAFE REFACTOR. . 문자열을 옮기기만 하므로 위험 없음. [7]과 함께 진행하는 것이 효율적이다.

완료 기준: R24 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R25. AirStatus 라벨/색상 매핑이 프론트 5곳에 중복돼 있다

브랜치: `refactor/r-batch-06-contract-frontend`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **Low** · 분류: `POTENTIAL BEHAVIOR CHANGE`

위치: `src/components/StatusBadge.tsx` (6~8행) · `src/components/WeatherCard.tsx` (9~11행) · `app/weather-detail.tsx` (`STATUS_LABEL`, `STATUS_COLOR`, 47~52행) · `app/(tabs)/history.tsx` (`WEATHER_STATUS_COLOR`, 334행) · `app/diagnosis/[id].tsx` (228행 — 인라인 삼항)

문제: 등급 색상 하나를 바꾸면 다섯 곳을 찾아야 한다. 이미 각 사본의 색상 소스가 다르다(`colors.statusGood` vs `colors.sageLight` 등). 화면마다 같은 등급이 다른 색으로 보일 수 있다.

작업:

- [ ] `src/lib/air-status.ts`에 `AIR_STATUS_LABEL`, `AIR_STATUS_COLOR`(`Record<AirStatus, ...>`)를 두고 다섯 곳이 이를 import한다. `Record<AirStatus, T>`로 선언하면 등급이 추가될 때 컴파일 에러가 난다.

변경 범위:

```text
text
파일 추가   src/lib/air-status.ts
파일 수정   위 5개 파일
```

위험: POTENTIAL BEHAVIOR CHANGE.  — 현재 사본들의 색상이 서로 다르므로 통합하면 일부 화면의 색이 바뀐다. 어느 색을 정본으로 삼을지 디자인 확인이 필요하다. 제안 [5]와 같은 파일들을 건드리므로 함께 진행하는 것이 좋다.

완료 기준: R25 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R26. KST 날짜 헬퍼가 프론트에 중복돼 있다

브랜치: `refactor/r-batch-06-contract-frontend`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **Low** · 분류: `SAFE REFACTOR`

위치: `app/(tabs)/history.tsx` — `kstDateStrings`, `monthBounds`, `formatDateKo` (29~52행) · `app/diagnosis-result.tsx` — `todayKst`, `currentMonthRange` (29~40행)

문제: 서버는 모든 히스토리 집계를 Asia/Seoul 기준으로 수행한다(`src/types/index.ts:251` 주석, `calendar-date.util.ts`). 클라이언트 계산이 서버와 어긋나면 **자정 근처에 사용자가 다른 날짜의 데이터를 본다.** 두 벌로 나뉘어 있으면 한쪽만 고쳐 어긋날 위험이 상존한다.

작업:

- [ ] `src/lib/kst-date.ts`로 통합하고, 백엔드 `calendar-date.util.ts`와 동일한 규칙임을 명시한다. 백엔드에는 이미 `calendar-date.util.spec.ts`가 있으므로, 프론트에도 같은 케이스(자정 경계, 월말/월초)의 단위 테스트를 [16]에서 추가한다.

변경 범위:

```text
text
파일 추가   src/lib/kst-date.ts
파일 수정   app/(tabs)/history.tsx, app/diagnosis-result.tsx
```

위험: SAFE REFACTOR. . 두 구현이 실제로 동일한지 먼저 대조해야 한다 — 다르다면 어느 쪽이 서버와 일치하는지 확인이 필요하다.

완료 기준: R26 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R27. 화면 컴포넌트가 상태 10~15개와 잡 오케스트레이션을 직접 들고 있다

브랜치: `refactor/r-batch-06-contract-frontend`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **Medium** · 분류: `BEHAVIOR-PRESERVING REFACTOR`

위치: `app/(tabs)/index.tsx`, `app/(tabs)/products.tsx` — fast-path → 잡 폴링 → SSE fallback 로직 중복 · `app/(tabs)/settings.tsx` (useState 13개), `app/onboarding/signup.tsx` (useState 15개) · `app/(tabs)/history.tsx`, `app/weather-detail.tsx`, `app/diagnosis-result.tsx`

문제: - **서버 상태와 UI 상태가 섞여 있다.** `loading`, `refreshing`, `error`, `data`가 개별 `useState`로 흩어져 조합 불가능한 상태(예: `loading=true`이면서 `error!=null`)가 표현 가능하다. - 잡 오케스트레이션은 타이밍·정리(cleanup) 로직이라 버그가 나기 쉬운데, 두 벌로 존재하고 테스트가 없다([16]). 언마운트 시 abort 누락이 있으면 메모리 릭과 "사라진 화면에 setState" 경고로 이어진다. - 화면 파일이 400~600줄이라 로직 변경 시 리뷰가 어렵다.

작업:

- [ ] 과한 구조를 만들지 말고 **중복된 것만** 뽑는다.
- [ ] `src/hooks/useAsyncJob.ts` — fast 응답과 잡 오케스트레이션 단일 구현. `index.tsx`와 `products.tsx`가 공유.
- [ ] 2. 화면별 데이터 훅(`useHomeDashboard`, `useWeatherProducts`) — 서버 상태를 `{ status: 'idle'|'loading'|'success'|'error', data, error }` 형태의 판별 유니온 하나로 묶는다.
- [ ] 3. `StyleSheet`를 `*.styles.ts`로 분리한다.
- [ ] React Query 같은 라이브러리 도입은 지금 단계에서 권하지 않는다 — 화면 수가 적고 위 1~2번만으로 중복이 해소된다.

변경 범위:

```text
text
파일 추가   src/hooks/useAsyncJob.ts, src/features/*/use*.ts, app/**/*.styles.ts
파일 수정   위 화면 전체
```

위험: BEHAVIOR-PRESERVING REFACTOR. 이지만 범위가 넓다. 두 화면의 잡 처리 세부(타임아웃, 재시도 횟수)가 다를 수 있으므로 통합 전 대조가 필요하다. **[15](strict 모드)와 [16](테스트) 이후에 진행할 것을 강력히 권한다** — 그래야 컴파일러와 테스트가 회귀를 잡아준다.

완료 기준: R27 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R28. 프론트 타입 325줄이 백엔드 DTO를 수기로 미러링한다

브랜치: `refactor/r-batch-06-contract-frontend`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **Medium** · 분류: `SAFE REFACTOR`

위치: `src/types/index.ts` (325줄, 약 30개 인터페이스) · `backend/src/**/dto/*.ts` (`@nestjs/swagger` 데코레이터 보유)

문제: 계약이 조용히 어긋난다. 실제로 `getWeatherProductsFast`와 `generateWeatherProducts`가 같은 엔드포인트를 호출하면서 서로 다른 응답 형태를 기대하는 상태가 이미 발견됐다. 백엔드에서 필드를 optional로 바꾸거나 이름을 바꿔도 프론트는 컴파일 성공하고 런타임에 `undefined`가 된다. [15]에서 strict를 켜도 **타입 정의 자체가 틀리면 소용없다.**

작업:

- [ ] CI에서 OpenAPI 스펙을 산출하고(`SwaggerModule.createDocument` 결과를 JSON으로 덤프하는 소규모 스크립트) `openapi-typescript`로 `src/types/api.generated.ts`를 생성한다. 생성 결과가 커밋본과 다르면 CI를 실패시켜 드리프트를 차단한다. `src/types/index.ts`는 생성 타입을 재export하는 얇은 파일로 축소하고, 순수 UI 타입만 남긴다.
- [ ] 한 번에 전부 전환하기 부담스러우면 **CI 검증만 먼저** 도입해도 된다 — 생성 타입과 수기 타입의 불일치를 리포트하는 것만으로 [14], [27] 작업 중의 사고를 막을 수 있다.

변경 범위:

```text
text
파일 추가   backend/scripts/export-openapi.ts, src/types/api.generated.ts
파일 수정   src/types/index.ts, .github/workflows/ci.yml, package.json
dependency 변경   openapi-typescript 추가 (devDependency)
```

위험: SAFE REFACTOR. (도구) + 전환 시 

완료 기준: R28 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R29. 죽은 코드와 커밋된 에러 로그 파일

브랜치: `refactor/r-batch-02-safety-net`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **Low** · 분류: `SAFE REFACTOR`

위치: `src/api/client.ts` — `generateWeatherProducts`, `generateRecommendations`, `getHistory`, `getProducts`, `getSkinScore` (호출부 없음) · `typecheck-report.txt` (저장소 루트)

문제: 죽은 API 함수는 "이 엔드포인트가 쓰이고 있다"는 잘못된 인상을 주어, 백엔드에서 해당 엔드포인트를 정리할 때 판단을 흐린다. `generateWeatherProducts`는 [28]에서 언급한 응답 형태 불일치의 당사자이기도 하다 — 쓰이지 않는 코드가 잘못된 계약까지 들고 있는 상태다. `typecheck-report.txt`는 에러 로그이자 로컬 경로 노출이다.

작업:

- [x] 실제 미사용은 3개였다(`getHistory`, `generateRecommendations`, `generateWeatherProducts`). `getProducts`는 `app/recommendation/[id].tsx`, `getSkinScore`는 홈·진단결과 화면에서 쓰이므로 남겼다. 백엔드 엔드포인트 제거는 구버전 앱 영향이 있어 R14(B6)에서 함께 판단한다. 이 밖에 도달 불가였던 설정 화면의 "안면 이미지 처리방침" 모달(진입점 없음 — 동의 관리 모달이 같은 registry 문구를 이미 보여준다)도 제거했다. 삭제 대상: 대응하는 백엔드 엔드포인트가 다른 소비자 없이 남아 있는지 확인해 함께 정리한다. `typecheck-report.txt`를 삭제하고 `.gitignore`에 `*-report.txt`를 추가한다.

변경 범위:

```text
text
파일 수정   src/api/client.ts, .gitignore
파일 삭제   typecheck-report.txt
파일 수정   (확인 후) 대응 백엔드 컨트롤러
API 변경    가능 — 미사용 엔드포인트 제거 시
```

위험: SAFE REFACTOR. (클라이언트 함수 삭제만 할 경우). **백엔드 엔드포인트까지 제거하면 

완료 기준: R29 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R30. Gemini 호출에 재시도·서킷브레이커가 없다

브랜치: `refactor/r-batch-05-backend-structure`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **Medium** · 분류: `POTENTIAL BEHAVIOR CHANGE`

위치: `backend/src/modules/gemini/gemini.client.ts`

문제: Gemini API의 순간적 429(할당량 버스트)나 5xx가 그대로 사용자 실패로 이어진다. fast-path는 fallback 콘텐츠가 있어 완충되지만, 잡은 그대로 FAILED가 되고 `isRecentlyFailed` 억제 창 동안 재시도조차 막힌다. 반대로 Gemini가 장시간 장애일 때는 모든 잡이 15초씩 붙잡혀 워커 슬롯을 소진한다.

작업:

- [ ] 지수 백오프 + 지터로 429/5xx만 2회 재시도한다(4xx 나머지는 즉시 실패). 연속 실패 임계(예: 1분 내 10회) 초과 시 30초간 호출을 건너뛰고 즉시 fallback을 반환하는 간단한 서킷브레이커를 둔다 — 라이브러리 도입 없이 카운터와 타임스탬프 두 필드로 충분하다. 타임아웃은 환경변수(`GEMINI_TIMEOUT_MS`)로 노출한다.

변경 범위:

```text
text
파일 수정   gemini.client.ts, gemini.client.spec.ts, env.registry.ts, env.validation.ts
```

위험: POTENTIAL BEHAVIOR CHANGE. . 재시도로 최악 지연이 15초에서 45초 이상으로 늘 수 있다 — 잡 경로에서는 무해하지만 동기 경로가 있다면 전체 타임아웃 예산을 다시 계산해야 한다. 

완료 기준: R30 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R31. 배포 워크플로가 CI 성공에 게이팅되지 않고, 죽은 변수가 있다

브랜치: `refactor/r-batch-03-scheduler-worker`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **Medium** · 분류: `POTENTIAL BEHAVIOR CHANGE`

위치: `.github/workflows/deploy-ecs.yml` (7~13행 트리거, 162행 `ECS_ASSIGN_PUBLIC_IP`) · `.github/workflows/ci.yml` (3~7행 트리거)

문제: - main에 머지되는 순간 CI와 배포가 **병렬로** 시작한다. 테스트가 실패해도 배포 파이프라인은 계속 진행되며, 유일한 방어선은 production 환경의 수동 승인 게이트다. 승인자가 CI 결과를 확인하지 않으면 실패한 코드가 배포된다. - 주석은 "GitHub Variable `ECS_ASSIGN_PUBLIC_IP`로 오버라이드 가능"이라고 안내하지만, 변수가 job env로 전달되지 않아 셸에서는 항상 미정의다. 즉 **항상 `ENABLED`이고 오버라이드는 동작하지 않는다.** NAT gateway로 전환할 때 이 사실을 모르면 원인 파악에 시간을 쓰게 된다.

작업:

- [x] `on: workflow_run`(CI 완료) + `if: conclusion == 'success'`로 바꿨다.
- [x] `workflow_run`은 `paths` 필터를 지원하지 않으므로 `guard` job에서 `git diff HEAD^ HEAD`로 `backend/**` 변경을 확인한다. 이게 없으면 프론트 전용 커밋마다 배포가 돈다.
- [x] `workflow_run`의 `GITHUB_SHA`는 기본 브랜치 최신 커밋이라 CI가 검증한 커밋과 다를 수 있다. 모든 job이 `workflow_run.head_sha`를 checkout하고 이미지 태그로 쓴다.
- [x] job `env:`에 `ECS_ASSIGN_PUBLIC_IP: ${{ vars.ECS_ASSIGN_PUBLIC_IP }}`를 추가했다(값이 없으면 셸에서 `ENABLED`로 기본).

변경 범위:

```text
text
파일 수정   .github/workflows/deploy-ecs.yml
```

위험: POTENTIAL BEHAVIOR CHANGE. (배포 파이프라인). 

완료 기준: R31 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R32. 추론 서버의 /metrics가 무인증으로 노출된다

브랜치: `refactor/r-batch-01-security-critical`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **Medium** · 분류: `POTENTIAL BEHAVIOR CHANGE`

위치: `backend/inference-service/main.py` — `/metrics` 엔드포인트, `metrics.py`

문제: 추론 횟수, 지연, 실패율 등 운영 지표가 인증 없이 조회된다. 현재는 VPC 내부 서비스라 노출 범위가 제한되지만, 보안 그룹 오설정이나 향후 ALB 연결 시 그대로 외부에 열린다. 지표는 사용량 추정과 장애 시점 추론에 쓸 수 있는 정보다.

작업:

- [x] `/metrics`에도 `X-Inference-Key` 검증을 적용하거나, 별도 관리 포트로 분리한다. `/health`는 ECS 헬스체크가 호출하므로 무인증을 유지한다(민감 정보를 담지 않도록 응답 내용도 함께 점검한다).

변경 범위:

```text
text
파일 수정   backend/inference-service/main.py
```

위험: POTENTIAL BEHAVIOR CHANGE. . 외부 스크레이퍼(Prometheus 등)가 이미 이 엔드포인트를 긁고 있다면 헤더 설정이 필요하다. 현재 스크레이퍼 구성이 있는지 확인이 선행되어야 한다.

완료 기준: R32 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R33. 조회 패턴에 대응하는 인덱스가 빠져 있다

브랜치: `refactor/r-batch-04-db-migration`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **Medium** · 분류: `SAFE REFACTOR`

위치: `backend/prisma/schema.prisma`

작업:

- [x] Product                @@index([category]) @@index([createdAt, id])
- [x] RecommendationTemplate @@index([createdAt, id])
- [x] WeatherSnapshot        @@index([collectedAt])
- [x] RefreshSession         @@index([expiresAt]) @@index([revokedAt])
- [x] OtpCode                @@index([expiresAt])
- [x] R11의 스윕이 쓰는 인덱스를 함께 넣었다: `OtpSendLog @@index([sentAt])`, `AiCallReservation @@index([status, updatedAt])`. 인덱스 없이 스윕을 돌리면 정리 작업이 매 tick 풀스캔한다.
- [x] R10, R11, R21과 한 마이그레이션(`20260817000000_b4_indexes_retention_token_family`)으로 묶었다.
- [x] `CREATE INDEX CONCURRENTLY`는 넣지 않았다 — Prisma는 마이그레이션을 트랜잭션 안에서 실행하고 `CONCURRENTLY`는 트랜잭션에서 못 쓴다. 대신 모든 `CREATE INDEX`에 `IF NOT EXISTS`를 붙였으므로, 큰 테이블은 배포 전에 psql로 `CONCURRENTLY` 생성해두면 마이그레이션이 그 인덱스를 건너뛴다(docs/DEPLOYMENT.md).

변경 범위:

```text
text
DB 변경     인덱스 5개 모델에 추가
migration 필요   예
기존 데이터 migration 필요   아니오
```

위험: SAFE REFACTOR. (스키마 추가만, 동작 불변). 다만 **DB 변경이므로 별도 승인 대상**이다. 큰 테이블에 인덱스를 만들면 잠금과 시간이 소요되므로 

완료 기준: R33 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R34. OTP 서비스와 JWT 키 회전 서비스에 단위 테스트가 없다

브랜치: `refactor/r-batch-02-safety-net`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **Medium** · 분류: `SAFE REFACTOR`

위치: `backend/src/modules/otp/otp.service.ts` · `backend/src/modules/auth/jwt-key.service.ts` · (`admin.service.ts`, `audit-log.service.ts`도 동일하나 위험도 낮음)

문제: `otp.service.ts`는 보안 로직 밀도가 가장 높은 파일 중 하나다: 코드 해싱(salt + SHA-256), 시도 횟수 제한, 재전송 쿨다운, 번호별 미검증 코드 상한, KST 일일 발송 한도, allowlist 예외. 이 중 하나가 조용히 깨지면 OTP 무차별 대입이 가능해지거나 정상 사용자가 가입하지 못한다. e2e는 행복 경로 위주라 경계 조건(쿨다운 만료 직전/직후, 일일 한도 경계, 시도 횟수 소진 후 재전송)을 다 덮기 어렵다.

작업:

- [x] 두 서비스에 경계 조건 중심의 단위 테스트를 추가한다(OTP 25건 + JWT 키 15건). 시간 의존 로직은 `Date`를 주입하거나 `jest.useFakeTimers`로 제어한다.

변경 범위:

```text
text
파일 추가   otp.service.spec.ts, jwt-key.service.spec.ts
파일 수정   (필요 시) 시간 주입을 위한 시그니처 소폭 조정
```

위험: SAFE REFACTOR. . 시간 주입을 위해 시그니처를 바꾸면 호출부 수정이 따르지만 범위가 좁다.

완료 기준: R34 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

## R35. 진단 중복 방지 검사가 트랜잭션 밖에서 한 번 더 돌고, soft-delete 조건이 불일치한다

브랜치: `refactor/r-batch-05-backend-structure`  (묶음 단위 — 상단 [작업 묶음](#작업-묶음-batch) 참조)

우선순위: **Medium** · 분류: `POTENTIAL BEHAVIOR CHANGE`

위치: `backend/src/modules/diagnosis/diagnosis.service.ts` — `guardDuplicate`, 트랜잭션 내부의 최근 진단 검사

문제: - 트랜잭션 밖 검사는 경쟁 조건에서 신뢰할 수 없으므로 어차피 트랜잭션 내 검사가 정본이다. 밖의 검사는 매 요청 DB 왕복을 하나 더 만들 뿐이다(빠른 실패라는 이점은 있으나, 이미 idempotency 예약이 동시 요청을 막고 있어 중복된 방어다). - soft-delete된 진단이 최근 60초 내에 있으면 새 진단이 차단된다. 사용자가 진단을 삭제하고 다시 찍는 흐름에서 이유 없이 거부당한다. 같은 파일의 다른 조회는 `notDeletedWhere`를 적용하고 있어 규칙이 일관되지 않다.

작업:

- [ ] `guardDuplicate`를 제거하고 트랜잭션 내부 검사만 남긴다. 남는 검사에 `notDeletedWhere`를 적용해 파일 내 다른 조회와 규칙을 통일한다. 프로젝트 전반의 soft-delete 조건 적용 방식을 `notDeletedWhere` 헬퍼 하나로 통일한다(`auth.service.ts`의 `getMe`/`login`이 수동 `deletedAt` 검사를 하고 `linkPhone`은 헬퍼를 쓰는 불일치도 함께 정리).

변경 범위:

```text
text
파일 수정   diagnosis.service.ts, auth.service.ts, 각 spec
```

위험: POTENTIAL BEHAVIOR CHANGE. . 삭제된 진단이 더 이상 중복 판정에 포함되지 않으므로 동작이 바뀐다 — 이것이 의도한 정책인지 확인이 필요하다. 

완료 기준: R35 변경 제안이 반영되고 관련 회귀 테스트·CI가 통과한다.

