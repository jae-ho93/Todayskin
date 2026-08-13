# Todayskin Review by Fable5

> Todayskin을 실제 출시 가능한 수준으로 발전시키기 위한
> Product / UI·UX / AI / Architecture / Security / Performance / Release 종합 리뷰

**Review by:** Fable5  
**Target:** Todayskin  
**Date:** 2026-08-13 (목) 06:15 KST  
**Purpose:** 출시 준비를 위한 전체 프로젝트 검토 및 개선 방향 수립  
**Status:** Reviewed — 해커톤 재조정·코드 태스크 반영 완료 (2026-08-13 후속, 아래 참고)

---

## 목차

| 파트 | 내용 |
|------|------|
| A. 개요 | Executive Summary · 검토 방법 · 현재 상태 스냅샷 |
| B. Product | Product Audit · Direction · Core Loop · User Journey |
| C. UI/UX | UI/UX · Design System · Accessibility · UI State · UX Writing |
| D. 핵심 기능 | Skin Analysis · AI · AI Trust/Safety · Weather · Recommendation · History · Retention |
| E. 시장 | Competitive Benchmark · Gap Analysis · Feature Discovery · Existing Feature Audit |
| F. 데이터/아키텍처 | Database · Privacy/Consent · Backend · BullMQ · Redis · PostgreSQL · API |
| G. 품질/운영 | Security · Reliability · Performance · Perceived Performance · Testing · DevOps |
| H. 출시 | Release Readiness · App Store · Cost · Tech Debt |
| I. 종합 | Current vs Recommended · KEEP/CHANGE/ADD · Team Decisions · Decision Log · Blockers · Priority · Roadmap · Final Direction · Final Assessment · Final Questions · TOP 10 · Action Table |

### 근거 수준 표기

- `[FACT]` — 실제 코드 / 파일 / 설정 / 테스트 실행 결과에서 직접 확인
- `[INFERENCE]` — 실제 구현을 기반으로 한 추론
- `[BENCHMARK]` — 경쟁 서비스 / 업계 사례 / 외부 자료 기반 (2026-08 웹 리서치)
- `[RECOMMENDATION]` — Todayskin에 대한 제안

---

# Part A. 개요

## 1. Executive Summary

Todayskin은 **날씨·대기질과 얼굴 이미지 AI 분석을 결합해 피부 상태 점수와 스킨케어/제품 추천을 제공하는 Expo(React Native) 모바일 앱 + NestJS BFF + FastAPI 추론 서버** 구조의 모노레포다.

**전체 평가 (요약):**

- **엔지니어링 기반은 출시 후보 수준으로 성숙하다.** `[FACT]` 프론트 105개, 백엔드 541개 테스트 전부 통과(2026-08-13 로컬 실행), 양쪽 모두 TypeScript strict + typecheck/lint 클린, e2e 19개, CI에 API 계약 드리프트 검사·마이그레이션 diff·npm audit까지 포함. 리팩토링 백로그 R1~R35 전부 완료 기록.
- **AI는 "실제 학습된 모델"이지만 "검증 지표가 없는 모델"이다.** `[FACT]` EfficientNet-B0 부위별 등급 모델·MediaPipe 478 랜드마크·YOLOv8n 여드름·5클래스 질환 분류기의 실제 체크포인트가 리포에 포함되어 서빙된다. 그러나 메인 등급 모델의 홀드아웃 F1/MAE가 리포 어디에도 없고, 여드름 YOLO는 mAP50 ≈ 0.197로 낮다.
- **출시를 막는 것은 코드가 아니라 "출시 체인"이다.** `[FACT]` AWS 프로덕션 인프라 미프로비저닝(N16, OIDC 미설정), EAS/스토어 설정 부재(bundleIdentifier·package·versionCode 없음), 모바일 크래시 리포팅·푸시·애널리틱스 전무, 앱 이름이 아직 "Weatherskin".
- **가장 큰 제품 리스크는 규제·신뢰 경계다.** `[INFERENCE]` 결과 화면의 질환 분류(건선/아토피/주사/지루)는 "베타" 라벨이 있어도 질병 진단 목적으로 해석될 수 있어 의료기기 규제 경계에 걸린다. 면책 문구는 잘 갖춰져 있으나 기능 자체의 출시 포함 여부는 팀 결정이 필요하다.
- **핵심 루프의 뒷부분이 비어 있다.** `[FACT]` 측정→분석→이해→추천까지는 잘 구현됐지만, "행동(루틴 실행)"과 "재측정 유도(푸시/리마인더)"가 없어 리텐션 동인이 약하다.

**최종 판정: `Major Changes Required`** — 상세 근거는 49장.

> #### 2026-08-13 후속 — 해커톤 재조정과 반영 결과
>
> 이 리뷰는 "실서비스 출시" 기준으로 작성됐다. 리뷰 직후 팀 결정으로 프로젝트 성격이
> **해커톤 제출용(제출까지 1주)** 으로 확정되어 판정의 전제가 바뀌었다.
>
> - **범위에서 제외**: 스토어 배포 체인(F12/N23·EAS), API `/v1` 버저닝(N52),
>   크래시 리포팅/Sentry(F71). 위 본문에서 이들을 출시 블로커로 꼽은 항목은
>   해커톤 기준으로는 해당 없음으로 읽는다.
> - **코드 태스크는 전부 반영 완료** (PR #151~#162, 같은 날):
>   보안 S-1·S-2(N46 소셜 토큰 검증)·S-4(N47 fail-closed)·S-5(N48 감사 로그 마스킹),
>   P1 품질 게이트(N49+F78), 기온·습도 수집(N53), 그리고 FE 개선
>   F72(업로드 리사이즈)·F73(로컬 리마인더 — 리텐션 공백 대응)·F74(워딩)·
>   F75(재시도)·F76(폰트 스케일)·F77(브랜드 표시명).
> - **남은 항목**: N16~N37·N50·N51(AWS 배포 계열 — 데모에 필요할 때만),
>   S-3(N51 JWT 키 보관 — N16 선행), 그리고 팀 결정 D-01(질환 분류 노출 여부) 등
>   46장 결정 대기 항목.
>
> **해커톤 기준 상태**: 데모 루프(측정→분석→이해→추천→리마인더)는 코드로 완성됐고,
> 남은 것은 데모 시나리오 리허설과 실기기 스모크다.

---

## 2. 검토 방법과 한계

**검토 방법** `[FACT]`:

1. 리포지토리 전체 탐색 — `app/`(24개 라우트), `src/`(50개 파일), `backend/src`(246개 TS 파일), `backend/inference-service/`(15개 Python 파일), `backend/prisma/`(스키마·23개 마이그레이션·시드), `docs/`, `.github/`, Docker/ECS 설정 전수 확인.
2. 품질 게이트 실제 실행 — 2026-08-13 로컬에서 프론트 `typecheck`/`lint`/`jest`(10 suites, 105 tests 전부 통과), 백엔드 `typecheck`/`lint`/`jest`(52 suites 통과, 2 skipped; 541 tests 통과, 25 skipped) 실행 결과를 근거로 사용.
3. 문서 검토 — `README.md`, `docs/architecture/ARCHITECTURE.md`, `docs/guides/SETUP.md`, `docs/guides/DEPLOYMENT.md`, `docs/tasks/BACKEND_TASKS.md`, `docs/tasks/BACKEND_ARCHIVE.md`, `docs/tasks/FRONTEND_TASKS.md`, `docs/tasks/REFACTORING_BACKLOG.md`, `ml/SKIN_MODEL_TRAINING_PLAN.md`.
4. 경쟁 서비스 웹 리서치(2026-08) — 화해, Perfect Corp(YouCam), Neutrogena Skin360, TroveSkin, 룰루랩 LUMINI, Radien/AISkincare/skncoach 등 신생 AI 스킨케어 앱, 그리고 식약처 웰니스/의료기기 판단 기준.

**한계 (정직하게 명시):**

- **실기기/시뮬레이터에서 앱 화면을 직접 실행해 보지 못했다.** UI/UX 평가는 화면 코드·스타일 토큰·컴포넌트 구조·마이크로카피 기반이다. 시각적 완성도(간격의 실제 느낌, 애니메이션 품질)는 코드 수준 판단이며, 출시 전 실기기 워크스루를 별도로 권장한다.
- 모델 체크포인트의 실제 예측 품질은 리포 내 메타데이터(에폭, 학습 설정, YOLO 평가 수치)로만 판단했다. 별도 홀드아웃 평가는 수행하지 않았다.
- 비용은 실제 요금 확인 없이 구조적 리스크만 분석했다(39장).

---

## 3. 현재 상태 스냅샷 — 구현 / 부분 구현 / 미구현 구분

리뷰 지시문의 전제(6절)와 실제 리포지토리를 대조한 결과다.

| 전제 | 실제 상태 | 근거 |
|------|-----------|------|
| Expo / React Native | **구현** — Expo SDK 54, RN 0.81.5, React 19, Expo Router 6 | `[FACT]` `package.json` |
| NestJS + TypeScript | **구현** — NestJS 11, 15개 도메인 모듈, strict mode | `[FACT]` `backend/src/app.module.ts` |
| FastAPI + Python | **구현** — `/infer` 단일 추론 엔드포인트, 공유 시크릿 인증 | `[FACT]` `backend/inference-service/main.py` |
| PostgreSQL + Prisma | **구현** — Postgres 16, Prisma 7, 18개 모델, 23개 마이그레이션 | `[FACT]` `backend/prisma/schema.prisma` |
| Redis | **구현(선택적)** — 날씨 캐시·스로틀·BullMQ·SWR, 없으면 인라인 폴백 | `[FACT]` `backend/src/redis/` |
| BullMQ | **구현** — recommendation/pattern/notification/dlq 큐 + 인라인 디스패처 폴백 | `[FACT]` `backend/src/modules/jobs/` |
| S3 | **구현** — SSE-S3/KMS 암호화, presign 15분, 동의 게이트. 단 실제 버킷 프로비저닝은 미완 | `[FACT]` `backend/src/modules/storage/` |
| AWS 배포 | **미구현(코드만 완성)** — deploy-ecs.yml·ECS task 정의는 실물이지만 계정/OIDC/RDS/S3 미생성 (N16 open) | `[FACT]` `docs/tasks/BACKEND_TASKS.md` |
| Access + Refresh Token | **구현** — 해시 저장, 회전, familyId 재사용 감지 | `[FACT]` `backend/src/modules/auth/auth.service.ts` |
| 동의 기반 원본 저장 | **구현** — `diagnosis_image_storage` 동의 시에만 S3 저장, 미동의 시 추론 후 폐기 | `[FACT]` `backend/src/modules/diagnosis/diagnosis.service.ts` |
| 피부 분석 | **구현(검증 미완)** — 실제 학습 모델 서빙, 단 평가 지표 부재 | `[FACT]` `backend/inference-service/assets/` |
| 추천 | **구현** — A(공인 근거)/B(Gemini)/C(개인 통계) 3등급 + fast-path | `[FACT]` `backend/src/modules/recommendations/` |
| 날씨/공기질 | **구현** — 기상청(KMA) UV + 에어코리아 PM/CAI, 측정 불가 시 명시적 UNAVAILABLE | `[FACT]` `backend/src/modules/weather/` |
| 히스토리 | **구현** — 캘린더 + 날짜별 상세 + 점수 추이 그래프 + 랜드마크 오버레이 | `[FACT]` `app/(tabs)/history.tsx` |
| 개인화 | **부분 구현** — 패턴(피부↔날씨 상관) 화면은 있으나 추천 생성에 사용자 선호가 1급 신호로 반영되지 않음 | `[FACT]` `app/trend.tsx`, `recommendation.service.ts` |
| 푸시 알림 | **미구현** — 선호 설정 API만 존재, 발송 채널 없음 (`pushDeliveryAvailable=false`로 UI 비활성) | `[FACT]` `app/(tabs)/settings.tsx` |
| 스토어 릴리스 | **미구현** — eas.json 없음, bundleIdentifier/package 없음, 앱명 "Weatherskin" | `[FACT]` `app.json` |
| 결제/구독 | **미구현(보류)** — F11 명시적 보류, 가짜 가격 카드는 제거됨 | `[FACT]` `docs/tasks/FRONTEND_TASKS.md` |

**주목할 정체성 사실** `[FACT]`: `docs/architecture/ARCHITECTURE.md` 7절은 이 프로젝트의 목표를 "실제 서비스 수준의 백엔드 **포트폴리오**"로 명시한다. 반면 README와 본 리뷰의 목적은 "실사용자 출시"다. 이 두 정체성은 요구 수준이 다르므로(운영 온콜, CS, 규제 대응, 스토어 운영) **어느 쪽인지 팀이 먼저 합의해야 한다** (Decision D-01).

---

# Part B. Product

## 4. Product Audit

### Target User

`[INFERENCE]` 코드와 카피가 가리키는 사용자: 한국 거주(기상청/에어코리아 데이터, 한국어 UI, 국내 화장품 카탈로그), 스마트폰으로 셀피 촬영에 거부감이 없고, 날씨·미세먼지에 따라 피부 컨디션 변화를 체감하는 사용자. 온보딩 카피 "오늘 날씨, 오늘 내 피부"와 제품 시드(더마 코스메틱 중심 33개)를 보면 **20~30대 스킨케어 관심층**이 자연스러운 1차 타깃이다. 다만 **어떤 문서에도 타깃 사용자 정의가 없다** — 페르소나/타깃 문서 부재는 기능 우선순위 판단을 어렵게 한다 (Decision D-03).

### Core Problem

`[INFERENCE]` "내 피부가 오늘 왜 이런지 모르겠고, 오늘 무엇을 발라야/피해야 하는지 판단 근거가 없다." 특히 한국 환경에서 미세먼지·자외선·건조가 피부 컨디션에 주는 영향은 체감되지만 정량화되지 않는다.

### Core Value

측정 가능한 피부 상태(부위별 점수) + 오늘의 환경(UV/PM) + 근거 등급이 붙은 추천을 **한 화면 흐름**으로 제공하는 것.

### Core User Action

자기 전 세안 후 얼굴 촬영 (홈 FAB 카피 "자기 전 세안 후 촬영하기" `[FACT]` `app/(tabs)/index.tsx`).

### Desired Outcome

사용자가 자신의 피부 변화 패턴(어떤 날씨에 나빠지는지)을 이해하고, 그날 환경에 맞는 케어 행동을 하게 되는 것.

### Value Proposition

> **Todayskin은 날씨·대기질 같은 환경 변화에 피부 컨디션이 흔들리는 것을 체감하지만 원인과 대응을 모르는 사용자가, 매일 밤 30초 촬영으로 피부 상태를 객관적 점수로 확인하고 "오늘 환경 × 내 피부"에 맞는 케어 행동과 제품을 근거와 함께 선택할 수 있도록 돕는 서비스다.**

### 현재 제품이 이 가치에 집중되어 있는가?

**부분적으로 그렇다.** `[FACT]` 측정(카메라)·환경(날씨 카드)·추천(근거 등급)은 모두 구현되어 있고 서로 연결도 되어 있다(진단 시 날씨 스냅샷 연결, `wentOutside` 파라미터). 그러나:

- 환경→피부 인과를 보여주는 **패턴 화면이 N일 잠금(LOCKED) 상태로 시작**해 신규 사용자는 핵심 차별 가치를 초기에 경험할 수 없다 `[FACT]` `app/trend.tsx`.
- 질환 분류·여드름 리포트 같은 **의료 인접 기능이 가치 제안 바깥**에서 신뢰 리스크를 만든다 (15장).
- 추천이 "오늘의 환경"에는 반응하지만 "내 피부 이력·선호"에는 아직 약하게 반응한다 (17장).

---

## 5. Product Direction

7개 방향 비교. 평가 척도: 상/중/하.

| 방향 | 사용자 가치 | 차별성 | 개발 비용 | 복잡성 | 장기 확장성 | 위험 |
|------|------------|--------|----------|--------|------------|------|
| ① 핵심 피부 분석 강화 (정확도·재현성) | 상 | 중 (YouCam 등 성숙 경쟁 존재) | 상 (데이터·평가 체계) | 상 | 중 | 모델 투자 대비 체감 낮을 수 있음 |
| ② UX 중심 (촬영 가이드·이해·루틴화) | 상 | 중 | **하~중** | 하 | 중 | 낮음 |
| ③ AI 중심 (LLM 코치·대화형) | 중 | 중 (Skin360 NAIA 등 선례) | 중 | 중 | 상 | 비용·환각·규제 워딩 |
| ④ 개인화 중심 (이력·선호 반영 추천) | 상 | 중~상 | 중 | 중 | 상 | 데이터 축적 전 체감 낮음 |
| ⑤ 데이터 중심 (기록·리포트·상관) | 상 | 상 (이미 C등급 파이프라인 보유) | 중 | 중 | 상 | 사용 빈도 확보 전제 |
| ⑥ 환경 데이터 중심 (날씨×피부) | 상 | **상 (현재 최대 차별점)** | **하 (이미 구현)** | 하 | 중 | 상관≠인과 오해 관리 |
| ⑦ 자동화 중심 (리마인더·알림·자동 리포트) | 중~상 | 하 | 중 (푸시 인프라 신규) | 중 | 중 | 알림 피로 |

`[BENCHMARK]` 신생 경쟁 skncoach가 "high-UV/건조일에 루틴 단계 조정"을 이미 내세우고, TroveSkin은 라이프스타일-피부 상관 추적을 핵심으로 하나 날씨 자동 연동은 없다. 화해는 1,000만 리뷰 기반 제품 궁합으로 방향이 다르다. **"국내 공공 환경 데이터(기상청·에어코리아) × 매일 측정 × 개인 상관 패턴"의 결합은 아직 뚜렷한 국내 선점자가 없다.**

### 최종 방향 추천 `[RECOMMENDATION]`

**주축: ⑥ 환경 데이터 중심 + ⑤ 데이터(기록·패턴) 중심.** 이미 코드가 가장 많이 준비된 방향이면서 차별성이 가장 크다. **보조: ② UX(촬영 품질·이해·재측정 유도)** 를 출시 전 스프린트로. ①(모델 고도화)은 "정확도 개선"이 아니라 "재현성·평가 체계 확보"로 스코프를 좁혀 신뢰 기반만 다지고, ③(LLM 코치)·⑦(자동화 고도화)은 출시 후로 미룬다.

---

## 6. Core Product Loop

**목표 루프:**

```text
측정(촬영) → 분석(AI) → 이해(점수·부위) → 추천(행동·제품) → 행동(루틴 실행)
   ↑                                                        ↓
재측정 유도 ← 변화 확인(추이·패턴) ← 기록(캘린더 히스토리) ←──┘
```

### 단계별 구현 평가

| 루프 단계 | 구현 수준 | 근거 |
|-----------|----------|------|
| 측정 | **양호** — 촬영 가이드(조명/정면/세안 팁) + 앨범 선택, 동의 게이트 | `[FACT]` `app/camera-guide.tsx` |
| 분석 | **양호(신뢰 검증 미완)** — 동기 업로드 45s 타임아웃, 부위 6개 점수 | `[FACT]` `src/api/client.ts` |
| 이해 | **양호** — 종합 점수+등급, 전회 대비 델타, 부위 핀 상세, 보습/탄력 바 | `[FACT]` `app/diagnosis-result.tsx` |
| 추천 | **양호** — A/B/C 근거 등급, 성분 칩, 구매 링크, fast-path 후 AI 갱신 | `[FACT]` `app/recommendation/[id].tsx` |
| **행동** | **공백** — 추천을 "오늘 할 일"로 만들어주는 루틴/체크/완료 개념이 없음 | `[FACT]` 루틴 관련 모델·화면 부재 |
| 기록 | **양호** — 캘린더 + 날짜별 날씨·진단·추천 통합 조회 | `[FACT]` `app/(tabs)/history.tsx` |
| 변화 확인 | **부분** — 점수 폴리라인 + 패턴 화면(잠금 해제형). 전/후 사진 비교 없음 | `[FACT]` `app/trend.tsx` |
| **재측정 유도** | **공백** — 푸시 없음, 스트릭 없음, 리마인더 저장만 존재 | `[FACT]` `expo-notifications` 미설치 |

**결론:** 루프의 전반부(측정→추천)는 시장 수준 이상으로 구현됐지만, **후반부(행동→재측정)가 끊겨 있어 루프가 "1회 체험"으로 끝나기 쉽다.** `[BENCHMARK]` AISkincare의 스트릭, Skin360의 8주 목표 코칭, skncoach의 주간 리스캔 유도가 정확히 이 구간을 공략한다. 출시 전 최소한 "로컬 리마인더 + 어제 대비 변화 강조"라도 루프를 닫아야 한다 `[RECOMMENDATION]`.

---

## 7. User Journey Audit

### 7.1 신규 사용자

| 단계 | 사용자 목적 | 현재 구현 `[FACT]` | 마찰/혼란 | 이탈 위험 | 개선안 `[RECOMMENDATION]` |
|------|------------|--------------------|-----------|----------|---------------------------|
| 앱 진입 | 뭐 하는 앱인지 파악 | `app/index.tsx` 세션 체크 → 온보딩. 가치 제안 화면 "오늘 날씨, 오늘 내 피부" | 낮음 | 낮음 | — |
| 온보딩 | 신뢰 형성 | `structure.tsx`가 A/B/C 추천 체계를 설명 | **추천 "등급 체계" 설명이 첫 만남 콘텐츠로는 추상적** | 중 | 등급 설명은 첫 추천 화면의 툴팁으로 이연, 온보딩은 "촬영→점수→날씨 연결" 시연 중심으로 |
| 회원가입 | 빠른 시작 | 전화 + OTP(MO: 사용자가 문자를 **보내는** 방식) 또는 카카오/구글/애플 | **MO OTP는 일반적 SMS 수신 방식과 반대라 생소** — 문자 앱으로 이동 후 복귀 필요 | **상** | 소셜 로그인을 기본 CTA로 승격, MO 방식은 "문자 1건 발송으로 인증(수신 아님)" 설명 강화. MO 선택은 비용 절감 목적임을 팀이 인지하고 전환율 측정 후 재평가 |
| 로그인 | 재진입 | OTP 자동 검증(문자 앱 복귀 감지) 구현 | 낮음 | 낮음 | — |
| 권한 | 거부감 없이 허용 | 위치 권한 사전 설명 화면(`location.tsx`), 카메라 권한 문구에 "원본 이미지는 저장되지 않습니다" | 낮음 — 잘 설계됨 | 낮음 | 촬영 직전 카메라 권한 요청 유지 |
| 첫 측정 | 성공적 촬영 | 촬영 팁 4종 + 타원 가이드 | **품질 검증 없음** — 어둡거나 흔들린 사진도 그대로 분석 | 상 (첫 결과가 부정확하면 신뢰 상실) | 클라이언트 밝기/얼굴 크기 체크, 서버 blur 검출 → "다시 촬영" 유도 (13장) |
| 첫 분석 | 기다림 견디기 | "분석 중입니다" 정적 화면, 취소/진행률 없음 | 중 | 중 | 단계 표시(얼굴 인식→부위 분석→점수 계산) + 예상 시간 |
| 첫 결과 | 내 피부 이해 | 점수+등급+부위 핀. **단 첫 사용은 델타 없음, 패턴 잠김** | "그래서 좋은 건가?" 기준 부재 | 중 | 또래 분포 대비 위치(백분위) 또는 "75점 이상 양호" 기준 명시 |
| 첫 추천 | 행동 결정 | 결과 화면에서 최대 2개 추천 연결 | 낮음 | 낮음 | 첫 추천에 "오늘 밤 이것만" 단일 행동 강조 |

**신규 여정 종합:** 동의·권한 설계는 업계 상위 수준 `[FACT]`, 그러나 **MO OTP 마찰 + 촬영 품질 게이트 부재 + 첫 결과의 기준점 부재**가 3대 이탈 리스크다.

### 7.2 기존 사용자

| 단계 | 현재 구현 `[FACT]` | 마찰 | 개선안 |
|------|--------------------|------|--------|
| Home | 인사 + 날씨 카드 + 피부 게이지 + 추천 + FAB. 당겨서 새로고침, 실패 시 이전 데이터 유지 + 토스트 | 낮음 — 잘 구성됨 | 오늘 촬영 여부를 카드로 명시("오늘 아직 기록 전") |
| Today's skin | 최신 진단 게이지 + "진단이 아닌 추정값" 명시 | 델타의 의미(며칠 전 대비인지) 불명확 | 델타에 기준일 표기 |
| Analysis | FAB → 촬영 → 동기 분석 | 재촬영 CTA가 결과 화면에 없음 | 결과 화면에 "다시 촬영" 보조 액션 |
| Result | 부위 핀 + 바텀시트 + 베타(여드름/질환) 페이지 | 베타 페이지가 신뢰 경계 흐림 (15장) | 베타 기능 기본 비노출/옵트인 |
| Recommendation | 홈 카드 → 상세(근거·성분·구매 링크). fast-path 후 "최신 추천으로 갱신 중…" | 낮음 — 패턴 우수 | — |
| History | 캘린더 점 + 날짜 상세 + 삭제 | 히스토리 날짜 오류 시 재시도 버튼 없음 | RetryButton 일관 적용 (11장) |
| Settings | 프로필/동의/알림(비활성)/탈퇴 | 알림 토글이 "준비 중"으로 비활성 — 정직하지만 아쉬움 | 푸시 출시와 함께 활성화 |

### 7.3 장기 사용자

| 단계 | 현재 구현 `[FACT]` | 평가 |
|------|--------------------|------|
| 반복 분석 | 제한 없음, 60초 중복 방지만 존재 | 양호 |
| 추세 | 점수 폴리라인(2점 이상), 캘린더 점 | 그래프는 있으나 기간 선택·부위별 추이 없음 |
| 개인화 | `/trend` 패턴: 피부↔날씨 상관을 N일 데이터 후 해제 | **차별화 핵심인데 잠금 해제 전 가치 미리보기 없음** |
| 리포트 | 없음 (주간/월간 리포트 부재) | `[BENCHMARK]` Skin360 8주 리포트, 화해 리포트형 결과 대비 공백 |
| 재관여 | 없음 (푸시/이메일/알림 없음) | **장기 사용자를 되부르는 채널 자체가 없음** |

**장기 여정 종합:** 데이터가 쌓일수록 가치가 커지는 구조(C등급 패턴)는 설계되어 있으나, **그 가치를 사용자에게 되돌려주는 순간(리포트·알림)이 없다.** 이것이 리텐션 공백의 본질이다 (19장).

---

# Part C. UI / UX

## 8. UI / UX 전체 Audit

> 방법 한계: 실기기 실행 없이 화면 코드·토큰·컴포넌트 구조 기반으로 평가했다(2장). 시각 품질의 최종 확인은 실기기 워크스루가 필요하다.

### 영역별 평가

| 영역 | 상태 `[FACT]` | 평가 |
|------|---------------|------|
| Layout | `ScreenContainer` + `Card` 기반, safe-area 적용 | 일관적. 카드 중심 정보 구조가 도메인에 적합 |
| Spacing | `src/theme/spacing.ts` xs~xxxl 토큰 | 토큰화 완료, 화면들이 실제로 참조 |
| Typography | 시스템 폰트. `typography.ts`에 Pretendard 언급만 있고 **폰트 미로딩** | 브랜드 인상이 OS 기본값에 묶임 — 커스텀 폰트 적용 권장 |
| Colors | 웜 오프화이트 `#FAFAF8` + 세이지 그린 + 코랄 액션, 공기질/UV 상태 팔레트 | 뷰티·클린 무드에 적합한 선택 |
| Hierarchy | 점수 게이지 → 부위 핀 → 추천 카드 순 | 홈/결과 화면의 정보 우선순위 명확 |
| Components | 16개 공용 컴포넌트 (`src/components/`) | 재사용 구조 양호. 단 **공용 Button 부재** — 화면별 Pressable 스타일 반복 `[INFERENCE]` |
| Navigation | 4탭(홈/추천 제품/기록/설정) + 모달 스택 | 얕은 depth, 예측 가능 |
| Consistency | R22~R26 리팩토링으로 상태 라벨·색·날짜 유틸 단일화 | 중복 정리 완료 상태 |
| Visual identity | 앱 아이콘·안드로이드 어댑티브 아이콘 존재. 앱명 **"Weatherskin"** | 브랜드명 불일치(Todayskin vs Weatherskin) — 출시 전 통일 필수 |
| Animations | Reanimated 설치되어 있으나 사용 제한적 | 게이지 카운트업·핀 등장 등 마이크로 인터랙션 여지 |
| Loading | 스피너 위주, **스켈레톤 없음** | 34장(체감 성능) 참고 |
| Empty | 홈 "매일 자기 전 피부 상태를 찍어보세요!" 등 empty↔error 구분 | 상태 구분 설계 우수 |
| Error | `RetryButton` + 토스트 + stale 유지 | 부분적으로만 일관 (11장) |
| Success | 결과 화면 + 델타 표시 | 첫 결과의 "기준점" 부재 (7장) |
| Onboarding | 8개 화면 | 가치 설명이 다소 길다 — 압축 여지 `[INFERENCE]` |
| Responsive | `supportsTablet: true`인데 태블릿 레이아웃 검증 흔적 없음 | 태블릿 지원 끄거나 검증 필요 |
| Dark mode | `userInterfaceStyle: "light"` 고정 | 출시 후 검토 항목 |

### 피부·뷰티 서비스로서의 무드 평가

- **청결감**: 상 — 오프화이트 배경 + 낮은 채도 팔레트 + 카드 여백 `[FACT — 토큰 기준]`
- **안정감**: 상 — 파스텔 세이지/코랄, 부드러운 radius 16 + 소프트 섀도
- **신뢰감**: 상 — 근거 등급 배지, 출처 링크, "측정 불가" 정직 표기, 3중 면책 문구
- **전문성**: 중 — 부위별 수치·등급은 전문적이나, 시스템 폰트·마이크로 인터랙션 부재로 "완성도 있는 전문 서비스" 인상은 실기기 검증 필요 `[INFERENCE]`

---

## 9. Design System Audit

| 항목 | 상태 `[FACT]` | 비고 |
|------|---------------|------|
| Color tokens | `src/theme/colors.ts` — 브랜드/상태(공기질·UV)/등급 색 | 양호 |
| Typography | `src/theme/typography.ts` — 크기·굵기 스케일 | 폰트 파일 미로딩이 유일한 공백 |
| Spacing | `src/theme/spacing.ts` xs~xxxl | 양호 |
| Radius | 카드 16 표준 | 양호 |
| Shadows | 소프트 카드 섀도 정의 | 양호 |
| Components | Card, CircularGauge, EvidenceBadge, EvidenceSourceList, FaceIllustration, IngredientChip, LandmarkOverlay, MetricBar, OnboardingScaffold, RecommendationCard, RetryButton, ScreenContainer, SocialLoginButtons, StatusBadge, Toast, WeatherCard | 도메인 컴포넌트가 잘 분리됨 |
| Icons | `@expo/vector-icons`(Ionicons) 직접 사용 | 아이콘 시맨틱 래퍼 없음 — 소규모라 허용 |
| States | `StatusBadge`(공기질/UV), `EvidenceBadge`(A/B/C) | 상태 시각화 일관 |

**중복/화면별 상이 UI**: 과거 대기질 라벨·색 5중 중복(R25), KST 날짜 유틸 중복(R26), 날씨 매핑 4중 중복(R22)은 **모두 리팩토링으로 해소됨** `[FACT]` `docs/tasks/REFACTORING_BACKLOG.md`. 남은 것: 화면 파일 내 대형 StyleSheet 분리(F63 보류), 공용 Button/Typography 컴포넌트 부재.

`[RECOMMENDATION]` 출시 전: Pretendard 로딩 + 공용 Button. 출시 후: 다크모드 토큰, 스타일 분리(F63).

---

## 10. Accessibility Audit

| 항목 | 현재 `[FACT]` | 판정 |
|------|---------------|------|
| Contrast | 저채도 팔레트 — 세이지 그린 텍스트/배경 조합 일부는 대비 미달 가능 `[INFERENCE]` | 검수 필요 |
| Font scaling | `maxFontSizeMultiplier`/`allowFontScaling` **사용 0건** — 큰 글꼴 설정 시 레이아웃 깨짐 위험 | **출시 전 스모크 테스트 필요** |
| Touch targets | 설정 행 52pt, 소셜 버튼 48~52pt 양호. **캘린더 날짜 셀 높이 40pt** — 44pt 가이드 미달 | 개선 |
| Labels | `accessibilityLabel`/`Role` 약 31건, 46개 tsx 중 12개 파일(~25%) | 핵심 흐름(게이지·부위 핀·FAB) 라벨 보강 필요 |
| Screen reader | 게이지/얼굴 일러스트 등 시각 요소 대체 텍스트 부족 | 개선 |
| Keyboard | 모바일 앱 특성상 해당 낮음 (OTP 입력은 기본 키보드) | — |
| Focus | 모달 진입 시 포커스 관리 없음 | 개선 |
| Dynamic type / Reduced motion / Announcements | 미대응 | 개선 |

**판정: 출시 blocker 아님(일반 개선).** 단, **폰트 스케일링 미대응**은 고연령 사용자·접근성 설정 사용자에게 실사용 장애가 될 수 있어 출시 전 최소 스모크 확인을 권장한다 `[RECOMMENDATION]`.

---

## 11. UI State Audit

핵심 기능 × 상태 매트릭스. ✅ 구현 / ⚠️ 부분 / ❌ 부재 `[FACT]`

| 상태 | 홈 | 촬영/분석 | 결과 | 추천 | 히스토리 | 패턴 | 설정 |
|------|-----|----------|------|------|---------|------|------|
| Initial/Loading | ✅ 스피너 | ✅ "분석 중입니다" | ✅ | ✅ | ✅ | ✅ | ✅ |
| Success | ✅ | ✅ | ✅ | ✅ (LIVE 갱신 배지) | ✅ | ✅ | ✅ |
| Empty | ✅ 촬영 유도 | — | — | ✅ 준비 중 섹션 | ✅ 기록 없음 | ✅ LOCKED 안내 | — |
| Error | ✅ 재시도 | ✅ 문구 후 복귀 | ✅ | ✅ 재시도 | ⚠️ **재시도 버튼 없음** | ⚠️ **재시도 없음** | ✅ |
| Offline | ⚠️ 오류로만 표현 (NetInfo 미설치 — 실제 오프라인 감지 없음) | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Timeout | ⚠️ 일반 오류 카피 | ⚠️ 45s abort → 일반 오류 | — | ✅ 잡 실패 시 기존 유지 | — | — | — |
| Retry | ✅ RetryButton | ⚠️ 암묵적 재촬영 | — | ✅ | ❌ | ❌ | ✅ |
| Unauthorized | ✅ 401 → 단일 refresh → 실패 시 로그인 리다이렉트 (`src/api/client.ts`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Permission denied | ✅ 위치 미허용 시 기본 지역 | ✅ 카메라 안내 + 설정 유도 | — | — | — | — | — |
| Partial failure | ✅ 날씨 필드별 `UNAVAILABLE` "측정 불가", stale 유지 + 토스트 | — | ✅ 베타 섹션 없으면 미표시 | ✅ FALLBACK→LIVE 승격 | ✅ 날씨 없는 날 그리드 생략 | — | — |

**우수한 점**: `AsyncState`(loading/success/empty/error) 유니온으로 empty와 error를 구분하는 규율, 부분 실패의 정직한 표기(날씨 "측정 불가"), stale-while-refresh + 토스트.

**공백 3가지** `[RECOMMENDATION]`: ① 오프라인 감지(NetInfo) 도입 — 현재는 모든 네트워크 문제가 "오류"로 뭉개짐, ② 히스토리/패턴 오류 상태에 RetryButton 일관 적용, ③ 분석 타임아웃 전용 카피("네트워크가 느려요. 다시 시도해주세요")와 취소 버튼.

---

## 12. UX Writing Audit

### 대표 카피 인용 `[FACT]`

| 맥락 | 카피 | 평가 |
|------|------|------|
| 의료 면책 (추천) | "참고용 정보이며 의료 진단이 아닙니다. 피부 이상이 지속되면 의료기관에서 진료를 받으세요." | 명확·적절 |
| 결과 면책 | "측정·추정값입니다. 의학적 진단이 아닙니다." | 명확 |
| 홈 게이지 | "진단이 아닌 추정값입니다" | 일관 |
| 카메라 권한 | "카메라 접근 권한이 필요해요" / "원본 이미지는 저장되지 않아요." | 프라이버시 신뢰 형성에 우수 |
| 촬영 팁 | "밝은 곳에서 촬영해주세요" / "세안 후 맨 얼굴로…" | 행동 지향적 |
| 탈퇴 | "탈퇴 시 개인정보와 모든 진단 기록·사진·추천이 즉시 삭제돼요. 복구할 수 없어요." | 결과를 정확히 고지 — 우수 |
| 푸시 설정 | "푸시 알림은 준비 중이에요. 현재 설정은 변경할 수 없어요." | 미구현을 정직하게 노출 — 우수 |
| 패턴 주의 | "이 스결과는 통계적 관찰일 뿐 인과관계를 의미하지 않아요." | 취지는 우수하나 **오타("이 스결과는")** `[FACT]` |

### 종합 평가

- **명확성/간결성/자연스러움**: 상. 해요체 일관, 짧은 문장, 행동 유도형.
- **일관성**: 상 — 면책 문구가 홈/결과/추천 3곳에서 반복되며 표현이 정렬됨.
- **개선점** `[RECOMMENDATION]`:
  1. **"진단(diagnosis)" 용어 재검토** — API·화면 전반에서 "진단"을 사용하는데, 면책 문구와 충돌하는 인상을 주고 의료기기 오인 소지가 있다(15장). 사용자 노출 카피는 "피부 체크"/"피부 측정"으로 통일 검토.
  2. 패턴 화면 오타 수정.
  3. MO OTP 안내에 "문자를 받는 것이 아니라 보내는 방식"임을 첫 화면에서 설명.

---

# Part D. 핵심 기능

## 13. Skin Analysis Audit

### Before (촬영 전) `[FACT]`

| 항목 | 상태 |
|------|------|
| 촬영 안내 | 인트로 팁 4종(밝은 곳/타원 안에 얼굴/세안 후 맨 얼굴/이마 보이게) — `app/camera-guide.tsx` |
| 얼굴 위치 | 전면 카메라 + 점선 타원 오버레이 + "정면을 맞춰주세요" |
| 조명 | **안내만 존재, 실시간 측정 없음** |
| 거리/각도 | **가이드 없음** — 타원만 |
| 사진 품질 | **검증 전무** — 클라이언트·NestJS·FastAPI 어디에도 blur/조도/최소 해상도 검사 없음 (FastAPI는 MIME·10MB·얼굴 존재만 검사) |
| 재촬영 | 실패 시 이전 단계 복귀(암묵적). 명시적 재촬영 CTA 없음 |
| 권한 | 촬영 직전 요청 + 사전 설명 + 설정 유도 — 우수 |

`[BENCHMARK]` 룰루랩 SDK는 "손떨림·기종별 카메라·외부 조명" 대응을 핵심 기술로 내세우고, YouCam은 95% 재현성(test-retest)을 공개한다. TroveSkin류 다이어리도 "같은 조명·같은 거리" 표준화를 강조한다. **촬영 품질 관리가 점수 신뢰의 절반이다.**

### During (분석 중) `[FACT]`

- 동기 업로드(멀티파트, 클라이언트 45s abort) → "분석 중입니다 / AI가 피부 상태를 분석하고 있어요" 정적 화면.
- 진행률·예상 시간·취소 없음. 앱 이탈(백그라운드 전환) 시 요청이 끊길 수 있으나 서버 60초 중복 방지 + DB 예약(idempotency)으로 재시도 시 중복 과금은 방지됨.
- 서버: NestJS→FastAPI 30s 타임아웃 + 429 1회 재시도, FastAPI 내부 25s 타임아웃·큐 대기 5s 초과 시 429.

### After (결과) — "이해→이유→행동" 3단계 평가

| 질문 | 현재 답 | 평가 |
|------|---------|------|
| 피부 상태를 이해하는가? | 종합 점수+등급, 부위 6개 핀, 보습/탄력 바, 전회 대비 델타 | **상** — 구조 우수 |
| 이유를 이해하는가? | 부위 note("주름 보통 · 색소침착 양호") 수준. 왜 이 점수인지, 무엇이 깎았는지 설명 없음 | **중** — 감점 요인 상위 1~2개 표기 권장 |
| 무엇을 해야 하는지 아는가? | 결과→추천 2개 연결, 근거 등급 표시 | **상** |

### 우선 개선 `[RECOMMENDATION]`

1. **품질 게이트 (P1)** — 클라이언트: 얼굴 크기/밝기 간이 체크. 서버(FastAPI): Laplacian blur·평균 휘도·최소 해상도 검사 후 `422 재촬영 필요` 응답. 아키텍처 원칙(추론 서버는 추론만) 안에서 전처리 검증으로 정당화 가능.
2. **분석 중 단계 표시 (P2)** — "얼굴 인식 → 부위 분석 → 점수 계산" 3단계 + 취소.
3. **결과 화면 "왜" 강화 (P1)** — 부위별 최다 감점 항목 1개씩 명시.

---

## 14. AI Audit

세 영역을 분리해 평가한다.

### 14.1 Image Analysis (피부 이미지 분석)

| 질문 | 답 |
|------|-----|
| AI가 필요한가? | **예** — 부위별 주름/색소/모공 등급화는 rule 불가 |
| 현재 구현 | `[FACT]` EfficientNet-B0 부위 등급(epoch 22 체크포인트, AI Hub 프론트 데이터 계열), MediaPipe 478 랜드마크 정규화(800×900 워프, IPD 200), 부위 크롭 224², 결정론적 점수화(등급→0~100, 부위 평균→종합) |
| Latency | FastAPI 타임아웃 25s, 동시성 기본 1(세마포어 1~4), 큐 대기 5s→429 |
| Accuracy | **미검증** — 홀드아웃 F1/MAE가 리포·체크포인트 어디에도 없음. `ml/SKIN_MODEL_TRAINING_PLAN.md` 비교표가 `0.xx` 플레이스홀더 상태 |
| Cost | Fargate 1 vCPU/2GB 상시 1태스크 — 사용자 증가 시 수평 확장 필요(39장) |
| Fallback | 프로덕션 fail-closed(503), 개발 `MOCK_INFERENCE` — 적절 |
| Explainability | 부위 note 텍스트 수준. 신뢰도 미노출(argmax만) |

### 14.2 Recommendation (추천)

| 질문 | 답 |
|------|-----|
| AI가 필요한가? | **부분** — 현재 Hybrid가 정답에 가깝다 |
| 현재 구현 | `[FACT]` A등급: DB 템플릿+공인 출처(WHO/기상청/에어코리아 3종 코드 레지스트리). B등급: Gemini(`gemini-flash-latest`) 텍스트 생성 — 성분 화이트리스트, 서버가 등급·출처 라벨 고정, 카탈로그 SKU만 선택 가능(가상 제품 금지), 재시도+서킷 브레이커. C등급: 개인 통계 관찰. Fast-path: DB LIVE→진행 중 잡→Redis SWR CACHED→rule FALLBACK+비동기 LIVE 잡 |
| Rule vs AI vs Hybrid | **Hybrid 유지 권장** — 등급·근거를 서버가 통제하고 LLM은 문장만 만드는 현 설계는 환각 통제 관점에서 업계 상위 수준 `[RECOMMENDATION]` |
| Latency | fast-path 즉시 응답 + SSE/폴링 갱신 — 우수 |
| Cost | Gemini flash 계열 + SWR 캐시 + 중복 방지로 구조적으로 낮음 |
| Fallback | rule FALLBACK 존재, Gemini 실패 시 가짜 근거 생성 금지 정책 `[FACT]` |
| Explainability | A/B/C 근거 등급 + 출처 링크 — **경쟁 대비 차별점** |

### 14.3 Personalization (개인화)

| 질문 | 답 |
|------|-----|
| AI가 필요한가? | **아직 아님** — 데이터 축적이 선행 조건 |
| 현재 구현 | `[FACT]` C등급 패턴(피부↔날씨 상관, N일 잠금 해제), 추천 생성에 사용자 선호·피부 타입은 미반영 |
| 권장 경로 | 통계 기반 확장(부위별 상관, 제외 성분 필터) → 충분한 데이터 후 학습 기반 검토 `[RECOMMENDATION]` |

---

## 15. AI Trust / Safety Audit

| 항목 | 현재 `[FACT]` | 평가 |
|------|---------------|------|
| Score meaning | 0~100, ≥75 양호 / ≥50 보통 / ≥25 건조 / 미만 매우 건조 (`part_mapping.py`) | 컷 근거가 사용자에게 설명되지 않음 |
| Confidence | 부위 등급 모델 argmax만 — 신뢰도 미노출. 질환 분류만 softmax confidence 반환 | 불확실성 커뮤니케이션 부재 |
| Uncertainty | 조명·각도 변화에 따른 점수 변동을 사용자가 알 수 없음 | "같은 조건 촬영" 안내로 보완 필요 |
| Explanation | 부위 note + 추천 근거 등급 | 근거 등급 체계는 우수 |
| Repeatability | 모델은 결정론적(eval + no_grad)이나 **촬영 조건 재현성 미검증**. `[BENCHMARK]` YouCam은 95% test-retest 공개 | 재현성 실험 및 공개 필요 |
| Incorrect results | 사용자 피드백 채널 없음 | "결과가 이상해요" 신고 버튼 권장 |
| Misleading language | 면책 3중 배치로 양호. 단 "진단" 용어 상존 | 12장 참조 |
| **Medical interpretation risk** | **결과 화면 베타 페이지에 질환 분류(건선/아토피/주사/지루/정상 5클래스 + confidence) 및 여드름 리포트 노출** | **최상위 리스크 — 아래 상세** |

### 의료 경계 상세 분석

`[BENCHMARK]` 식약처 「의료기기와 개인용 건강관리(웰니스) 제품 판단기준」(2026 개정): 일상 미용·건강관리 목적 앱은 웰니스 제품이지만, **질병의 진단·치료·예방 목적이면 의료기기 허가 대상**이다. 스마트폰 사진으로 피부 병변을 감별하는 소프트웨어(라이프시맨틱스 캐노피엠디 SCAI)는 실제로 **의료기기 품목허가**를 받고 출시되었다. 디지털의료제품법 체계도 시행 중이다.

`[INFERENCE]` Todayskin의 부위별 점수·보습/탄력·주름/모공 등급은 미용 관리 목적으로 웰니스 범주에서 소명 가능하다. 그러나 **"건선/아토피/주사(장미증)/지루"는 질병명이고, 이를 confidence와 함께 표시하는 것은 "질병 진단 목적" 판단을 받을 여지가 크다.** "베타 · 검증 중인 분석" 라벨과 면책 문구로는 목적성 판단을 뒤집기 어렵다. 여드름 리포트도 YOLO mAP50 ≈ 0.197 `[FACT]` 수준에서는 오탐/미탐이 잦아 신뢰 손상 위험이 있다.

### 권고 `[RECOMMENDATION]`

1. **질환 분류 UI 노출을 출시 범위에서 제외**하거나(백엔드 필드는 유지 가능), 규제 전문가 검토 후 재도입 — **팀 결정 D-02**.
2. 여드름 리포트는 기본 비노출(옵트인 실험실 메뉴) + 정확도 고지.
3. 피부 관리 조언(웰니스)과 의료 정보의 시각적 분리 원칙 문서화 — 현재 면책 배치는 이미 좋은 기반.

---

## 16. Weather / Environment Audit

| 항목 | 상태 `[FACT]` |
|------|---------------|
| Temperature / Humidity | **수집하지 않음** — `WeatherSnapshot` 스키마에 기온·습도 필드 부재 (UV·오존·PM10/PM2.5·CAI·NO2·SO2·CO만 존재) |
| UV | 기상청(KMA) 생활기상지수, 시간대 피크 포함 |
| Air quality / PM | 에어코리아 CAI·PM10·PM2.5 + 관측소 자동 선택 |
| Weather history | 날짜별 스냅샷 영속화 + 히스토리 조회 연결 |
| Environment history | 진단 시 `weatherSnapshotId` 연결(`wentOutside` 파라미터 게이트) |

### "환경 → 피부 상태 → 분석 → 추천" 흐름 평가

- 환경→분석 연결: **실재** — 진단에 날씨 스냅샷이 붙고, 실외 활동 여부를 사용자에게 묻는다 `[FACT]`.
- 환경→추천 연결: **실재** — B등급 Gemini 프롬프트와 날씨 기반 제품 fast-path가 UV/PM 신호를 사용 `[FACT]`.
- 환경→패턴 연결: **실재** — C등급 상관 분석 `[FACT]`.
- **단순 정보 표시 vs 개인화 활용**: 홈 날씨 카드는 정보 표시이지만, 위 세 연결이 있어 "개인화 활용"이 실제로 구현된 편이다. 국내 경쟁 앱 대비 이 연결의 깊이가 차별점이다 `[BENCHMARK]` (TroveSkin은 날씨 자동 연동 없음, skncoach는 루틴 조정 수준).

### 공백 `[RECOMMENDATION]`

1. **기온·습도 수집 추가** — 피부 건조와 가장 직접 연관된 변수 두 개가 빠져 있다. 기상청 단기예보(온도/습도)로 확장하면 패턴 상관의 설명력이 크게 오른다. 다만 스키마 확장이 필요하므로 팀 논의 후 진행.
2. 환경 경보(UV 매우 높음/PM 나쁨 아침 알림)는 푸시 도입과 함께.

---

## 17. Recommendation Audit

### 추천 입력 신호 실사용 현황 `[FACT]`

| 신호 | 사용 여부 | 근거 |
|------|----------|------|
| 피부 상태(부위 등급) | ✅ | 진단 결과 → 추천 생성 입력 |
| 피부 점수 | ✅ | 동일 |
| 피부 타입(지성/건성 등) | ❌ 수집 자체 없음 | User 스키마에 피부 타입 필드 부재 |
| 날씨(UV) | ✅ | Gemini 프롬프트 신호 |
| 습도 | ❌ 데이터 없음 (16장) | — |
| 공기질(PM/CAI) | ✅ | 프롬프트 + 제품 fast-path |
| History | ⚠️ 부분 | C등급 패턴 관찰에만 사용, 추천 생성에는 미반영 |
| Preference | ❌ | 선호 모델 없음 |
| Routine | ❌ | 루틴 개념 없음 |
| Current products | ❌ | 보유 제품 개념 없음 |
| Ingredient whitelist | ✅ | Gemini 성분 화이트리스트 + 서버 검증 |
| Exclusion data | ❌ | 제외 성분(알러지 등) 없음 |

### 방식 판정

**Hybrid** — rule(A 템플릿·FALLBACK) + AI(B Gemini 텍스트) + personalized 통계(C 관찰). 등급·출처·제품 선택 범위를 서버가 강제하는 통제형 hybrid `[FACT]`.

### 평가와 개선

- 강점: 근거 투명성(A/B/C + 출처 링크), 실제 구매 링크(33개 시드 제품), fast-path 체감 속도.
- 약점: **개인 속성(피부 타입·민감 성분·보유 제품) 부재로 "나에게 맞는" 깊이가 얕다.** 시드 카탈로그 33개는 실서비스에는 소규모 `[FACT]` `backend/prisma/seed-data.ts`.
- `[RECOMMENDATION]` ① 온보딩/설정에서 피부 타입·주의 성분 선택(수집 최소화 원칙 유지) → 제외 필터 적용, ② 카탈로그 확충 + 올리브영 검색 링크의 직링크 검증(시드 주석에 사람 검증 필요 표기 존재), ③ 추천 카드 탭→구매 링크 클릭 전환 측정(애널리틱스 도입 후).

---

## 18. History / Progress Audit

| 기능 | 상태 `[FACT]` | 평가 |
|------|---------------|------|
| Calendar | ✅ 월 스와이프 + 기록 점 표시 | 양호 |
| Trends | ✅ 점수 폴리라인(2점 이상), `/trend` 패턴 화면 | 종합 점수만 — 부위별 추이 없음 |
| Graphs | ✅ SVG 추이선 | 기간 선택(주/월) 없음 |
| Weather correlation | ✅ C등급 패턴 (N일 잠금 해제) | 잠금 전 가치 미리보기 없음 |
| Recommendation history | ✅ 날짜 상세에 당시 추천 요약 | 양호 |
| Before/After | ❌ 사진 나란히 비교 없음 (동의 저장 사용자의 이미지는 존재) | `[BENCHMARK]` TroveSkin·AISkincare의 핵심 기능 |
| Weekly/Monthly report | ❌ | `[BENCHMARK]` Skin360 8주 목표 리포트 |

**사용자가 과거 기록으로 이해할 수 있는 것**: 변화(델타)·추세(추이선)·환경 영향(패턴)은 가능. **개선/악화의 "원인 후보"와 "행동의 효과"는 알 수 없다** — 루틴/행동 기록이 없기 때문 (6장 루프 공백과 동일 원인).

`[RECOMMENDATION]` 우선순위: ① 주간 요약 카드(인앱, 푸시 불요) ② 부위별 추이 ③ 동의 사용자 한정 전/후 비교 ④ (루틴 도입 후) 행동↔점수 상관.

---

## 19. Retention Audit

| 후보 동인 | 현재 | 실가치 판단 `[RECOMMENDATION]` |
|-----------|------|-------------------------------|
| Daily check (촬영 습관) | FAB 카피가 "자기 전" 프레임 제시 | **핵심 — 유지·강화** |
| Reminders | ❌ (설정 저장만, 발송 없음) | **로컬 알림으로 즉시 도입 가능** — 서버 푸시 없이 `expo-notifications` 로컬 스케줄로 "자기 전 체크" 리마인더 구현 가능. 최우선 |
| Push notifications | ❌ 인프라 없음 | 환경 경보·주간 리포트용으로 도입 — P1 |
| History/Trends | ✅ | 유지 |
| Recommendation | ✅ 매일 갱신(날씨 반영) | "오늘 달라진 이유" 강조로 재방문 프레임 강화 |
| Environment alerts | ❌ | **가치 높음** — UV/미세먼지 나쁨 날 아침 알림은 차별점과 직결. 푸시 도입 후 |
| Progress/Reports | ❌ | 주간 요약 인앱 카드 먼저 |
| Goals | ❌ | `[BENCHMARK]` Skin360 8주 목표 — 도입 검토 가치 있음, 출시 후 |
| Streaks | ❌ | **신중** — 피부 상태 앱에서 스트릭 압박은 강박·불안을 자극할 수 있음. 부드러운 "이번 주 3회 기록" 수준 권장 |

**결론**: 리텐션 부재는 기능이 없어서가 아니라 **되부르는 채널(알림)과 되돌아올 이유(요약 리포트)가 없어서**다. 로컬 리마인더 + 주간 요약 + (푸시 후) 환경 경보 3종이면 도메인 특성상 충분하며, 게임화 과잉은 오히려 신뢰 무드와 충돌한다.

---

# Part E. 시장

## 20. Competitive Benchmark

`[BENCHMARK]` 2026-08 웹 리서치 기준. 6개 그룹 / 8개 서비스.

| 서비스 | 유형 | 분석 | 추천 | 개인화 | 기록/리텐션 | 신뢰 장치 | 수익화 |
|--------|------|------|------|--------|-------------|-----------|--------|
| **화해** (국내 대표) | 성분·리뷰 플랫폼 | 사진 분석 아님 — 프로필 기반 | AI 궁합 점수(2026-04 출시), 내 사용템 성분 상호작용 | 1,000만+ 리뷰 데이터 기반 초개인화 방향 | 리뷰·랭킹·어워드, MAU 200만 | 실사용 리뷰 규모 | 커머스·라이브커머스 |
| **Perfect Corp YouCam** (글로벌 기술 대표) | AI 분석 B2B/B2C | 15+ 항목, HD/SD, 마스크 오버레이 | 분석 연동 제품 추천 | 피부 나이, 추적 | 브랜드 통합 다수 | **95% test-retest 공개, 피부과 검증 마케팅, raw/ui 점수 이원화**(표시 점수를 심리적 동기용으로 보정) | B2B API/SDK |
| **Neutrogena Skin360** (브랜드·코칭 UX 우수) | 브랜드 앱/웹 | 셀피 스캔, 150+ 바이오마커 주장 | 브랜드 제품 + 성분 | **NAIA AI 코치 — 수면·스트레스 문답, 8주 목표 플랜** | 8주 행동 코칭·체크인 | 대기업 R&D 신뢰 | 제품 판매 |
| **룰루랩 LUMINI** (국내 AI 전문) | B2B 키오스크/SDK | 16개 지표, 7초, 500만+ 데이터 | 분석 연동 화장품 추천 | 데이터 규모 기반 | B2B 특성상 약함 | **92%+ 정확도 공인 평가 공개** | B2B + 자체 브랜드 |
| **TroveSkin** (다이어리 대표) | 트래커 | 사진 진행 비교(표준 촬영 안내) | 제품/루틴 제안 | 라이프스타일(수면·식단·스트레스) 트리거 상관 | **제품 로깅·유통기한 알림·커뮤니티** | 다이어리 톤 (진단 아님 명시) | 프리미엄 |
| **skncoach / Radien / AISkincare** (신생 AI 앱 그룹) | B2C 앱 | 셀피 스캔 6~14 지표, 피부 나이 | **보유 제품 스캔·궁합 점수**, AM/PM 루틴 | 적응형 루틴(스캔마다 갱신), skncoach는 **고UV·건조일 루틴 조정** | **스트릭, 주간 리스캔, 진행 비교** | "의료기기 아님" 명시 | **freemium $4.99/월 수준** |

### 축별 관찰

- **Onboarding/Navigation**: 신생 앱들은 "1장 셀피 → 즉시 점수"로 가치 도달 시간을 최소화. Todayskin은 온보딩 8화면 + OTP로 상대적으로 길다.
- **Analysis 신뢰**: 선두권은 정확도/재현성 수치를 공개(YouCam 95% 재현성, 룰루랩 92% 정확도). Todayskin은 수치 없음.
- **Result 표현**: YouCam의 raw/ui 점수 이원화는 "정확성 vs 동기부여"를 분리한 흥미로운 설계 — Todayskin 점수 정책 논의에 참고(D-10).
- **Retention**: 스트릭·주간 리스캔·8주 목표가 표준 장비. Todayskin은 전무.
- **Accessibility/Performance**: 공개 정보 부족으로 비교 불가(정직 명시).
- **Monetization**: 신생 앱 freemium, 플랫폼형은 커머스. Todayskin은 구매 링크(어필리에이트 가능성)만.

---

## 21. Competitive Gap Analysis

### Competitors Have / Todayskin Doesn't

1. 리마인더·스트릭·주간 리포트 등 **재방문 장치** (skncoach/AISkincare/Skin360)
2. **정확도·재현성 공개 수치** (YouCam 95% 재현성, 룰루랩 92%)
3. **보유 제품 등록·궁합 판정** (화해 내 사용템, Radien/skncoach 제품 스캐너)
4. **전/후 사진 비교** (TroveSkin, AISkincare)
5. 라이프스타일 변수(수면·스트레스) 결합 (Skin360, TroveSkin)
6. 대화형 코치 (Skin360 NAIA)
7. 수익 모델 (freemium/커머스)

### Todayskin Has / Competitors Do Better

1. 셀피 기반 부위별 분석 — YouCam·룰루랩이 지표 수·검증에서 앞섬
2. 제품 추천 — 화해가 데이터 규모(1,000만 리뷰)에서 압도적
3. 진행 기록 — TroveSkin이 로깅 깊이에서 앞섬

### Todayskin Can Own `[RECOMMENDATION]`

1. **"환경 × 피부" 일일 상관** — 기상청·에어코리아 공공데이터의 지역 정밀도 + 매일 측정 + C등급 개인 상관 패턴. 글로벌 앱은 한국 환경 데이터 해상도를 따라올 수 없고, 국내 앱 중 이 결합의 선점자가 없다. **가장 현실적이고 이미 코드가 존재하는 차별화.**
2. **근거 투명성** — A(공인 가이드라인)/B(AI 생성)/C(개인 통계) 등급 + 출처 링크 + "AI 생성" 정직 라벨. 경쟁 앱 어디에도 없는 신뢰 설계이며 이미 구현됨.
3. **프라이버시 우선 서사** — 미동의 시 원본 미보관·인메모리 추론·탈퇴 시 완전삭제는 얼굴 데이터 민감성이 큰 시장에서 마케팅 가능한 실질 차별점.

---

## 22. Feature Discovery

실가치 있는 것만 선별. Priority: P1(출시 전후 필수) ~ P3(장기).

| 기능 | User Problem | User Value | Competitive Evidence | 차별성 | 복잡도 | 비용 | Priority |
|------|--------------|-----------|----------------------|--------|--------|------|----------|
| 로컬 리마인더 ("자기 전 체크") | 측정을 잊음 → 데이터 끊김 | 루프 재가동 | skncoach 주간 리스캔, AISkincare 스트릭 | 낮음(위생 기능) | 낮음 — 서버 푸시 불요 | 낮음 | **P1** |
| 주간 요약 리포트 (인앱) | 기록의 의미를 모름 | "이번 주 내 피부" 회고 | Skin360 8주 리포트 | 중 — 환경 상관 포함 시 높음 | 중 | 낮음 | **P1** |
| 촬영 품질 게이트 | 부정확한 첫 결과 → 신뢰 상실 | 점수 신뢰 | 룰루랩 재현성 기술, TroveSkin 표준 촬영 | 중 | 중 | 낮음 | **P1** |
| 피부 타입·주의 성분 프로필 | 추천이 덜 "내 것" | 제외 필터·정밀 추천 | 화해 궁합 점수 | 중 | 중 | 낮음 | **P2** |
| 환경 경보 푸시 (UV/미세먼지) | 나쁜 날 무방비 외출 | 사전 행동 | 직접 경쟁 없음 — **Own 영역** | **높음** | 중(푸시 인프라) | 중 | **P2** |
| 전/후 사진 비교 (동의 사용자) | 변화 체감 어려움 | 지속 동기 | TroveSkin 핵심 기능 | 중 | 중 | 낮음 | **P2** |
| 루틴 체크리스트 (행동 기록) | 추천→행동 전환 없음 | 루프의 "행동" 단계 완성 | Skin360·신생 앱 AM/PM 루틴 | 중 | 중 | 낮음 | **P2** |
| 변화 감지 알림 ("3일 연속 하락") | 악화를 늦게 인지 | 조기 대응 | 없음 — Own 후보 | 높음 | 중 | 낮음 | P3 |
| AI 코치 (대화형) | 일반 조언의 한계 | 맞춤 문답 | Skin360 NAIA | 중 | 높음 | 높음(LLM) | P3 |
| 보유 제품 등록·궁합 | 내 화장대와 무관한 추천 | 실구매 연결 | 화해·Radien | 중 | 높음(제품 DB) | 높음 | P3 |
| Goals (8주 목표) | 목적 없는 측정 | 방향성 | Skin360 | 중 | 중 | 낮음 | P3 |
| Skin diary (자유 메모) | 컨텍스트 기록 불가 | 상관 힌트 | TroveSkin | 낮음 | 낮음 | 낮음 | P3 |

---

## 23. Existing Feature Audit

| 분류 | 기능 | 근거 |
|------|------|------|
| **KEEP** | 동의·프라이버시 체계 (3목적 동의, 완전삭제) | 업계 상위 수준 `[FACT]` |
| **KEEP** | 근거 등급 A/B/C + 출처 링크 | 차별화 핵심 |
| **KEEP** | 날씨 "측정 불가" 정직 표기 + 스냅샷 연결 | 신뢰 기반 |
| **KEEP** | fast-path → SSE/폴링 갱신 패턴 | 체감 성능 우수 |
| **KEEP** | 캘린더 히스토리 + 날짜 상세 | 루프 "기록" 단계 |
| **IMPROVE** | 촬영 플로우 — 품질 게이트·진행 단계·재촬영 CTA | 13장 |
| **IMPROVE** | 결과 화면 — 기준점·감점 요인 설명 | 13장 |
| **IMPROVE** | 패턴 화면 — 잠금 전 가치 미리보기, 오타 수정 | 18장 |
| **IMPROVE** | 히스토리/패턴 오류 상태 재시도 일관화 | 11장 |
| **EXPAND** | 날씨 수집 — 기온·습도 추가 | 16장 |
| **EXPAND** | 추천 신호 — 피부 타입·주의 성분 | 17장 |
| **EXPAND** | 점수 추이 — 부위별·기간 선택 | 18장 |
| **REDUCE** | 온보딩 8화면 — 추천 체계 설명(`structure.tsx`)을 툴팁으로 이연 | 7장 |
| **REMOVE (출시 범위에서)** | **질환 분류 UI 노출** (건선/아토피/주사/지루) | 규제 리스크 — 15장, 팀 결정 D-02 |
| **REMOVE (조건부)** | 여드름 리포트 기본 노출 → 옵트인 전환 | mAP50 0.197 `[FACT]` |
| **DEFER** | 구독 결제(F11), EAS 스토어 확장(F12는 출시 시 필수로 승격), 대화형 코치, 제품 스캐너 | 로드맵 47장 |

---

# Part F. 데이터 / 아키텍처

## 24. Database / Data Strategy

`[FACT]` 18개 Prisma 모델, 23개 마이그레이션 기준. 장기 데이터 전략 평가:

| 데이터 | 현재 저장 | 필요성 | 사용자 가치 | 개인정보 | 보존/삭제 정책 | 평가 |
|--------|----------|--------|------------|----------|----------------|------|
| User | ✅ (전화·이름·생일·성별) | 필수 | 계정 | **민감** | 탈퇴 시 PII 스크럽 + 30일 후 퍼지 | 양호 |
| Skin analysis (Diagnosis/SkinMetric) | ✅ 부위 6개 등급·보습·탄력 | 필수 | 히스토리·패턴 | 민감(생체 유래) | 사용자 개별 삭제(N43) + 탈퇴 완전삭제(N44) | 양호 |
| Score | ✅ overallScore | 필수 | 추이 | 민감 | 동일 | 양호 |
| Image metadata | ✅ DiagnosisImage (S3 키·체크섬·암호화) | 동의 시만 | 랜드마크·회고 | **최고 민감** | 2단계 삭제(pendingDelete→S3→deletedAt) + 재시도 | 우수 |
| Weather | ✅ WeatherSnapshot | 필수 | 상관 분석 | 아님(지역 단위) | retention sweep 대상 (N37 미가동) | 기온·습도 확장 필요 |
| Air quality | ✅ 동일 모델 | 필수 | 상관 | 아님 | 동일 | 양호 |
| Recommendation | ✅ | 필수 | 히스토리 | 낮음 | 탈퇴 시 삭제 | 양호 |
| Preference | ⚠️ 알림 선호만 | 확장 필요 | 개인화 | 낮음 | — | 피부 타입·주의 성분 추가 (D-08 범위) |
| Routine | ❌ | 루프 완성에 필요 | 행동 기록 | 낮음 | — | P2 기능과 함께 설계 |
| Product | ✅ 33개 시드 | 필수 | 추천 | 아님 | — | 카탈로그 확충 필요 |
| Ingredient | ⚠️ String[] 태그 | 충분(현 규모) | 성분 매칭 | 아님 | — | 제외 성분 도입 시 정규화 검토 |
| Feedback | ❌ | 신뢰 운영에 필요 | 오답 신고 | 낮음 | — | "결과가 이상해요" 수집 권장 |

**증가 관리**: WeatherSnapshot·AsyncJob·OtpSendLog·RefreshSession은 append-only 성장 — retention sweep(구현 완료, `off` 상태)을 출시와 함께 `dry-run`→`delete`로 가동해야 한다 `[FACT]` N37.

---

## 25. Image / Privacy / Consent

| 항목 | 상태 `[FACT]` | 평가 |
|------|---------------|------|
| 원본 이미지 저장 | `diagnosis_image_storage` 동의 시에만. 미동의 → 추론 후 버퍼 해제 | **우수 — "분석에 필수인 데이터"(추론용 인메모리)와 "저장되는 데이터"(동의 시 히스토리용)가 정확히 구분됨** |
| 저장 위치 | S3 (프로덕션 필수), 개발은 메모리 스토어 | 양호 |
| 암호화 | SSE-S3 AES256 기본, `S3_KMS_KEY_ID` 시 SSE-KMS | 양호 — 프로덕션은 KMS 권장 |
| 접근 제어 | presigned URL 15분 | 양호 |
| Retention | 이미지: 사용자 삭제·동의 철회·탈퇴 시 삭제. 자동 만료는 없음(앱 주도 삭제 설계) | 정책 문서화 필요 |
| Deletion | 2단계 삭제 + 실패 재시도 + 고아 객체 리컨실 + 감사 로그 | 우수 |
| Consent | 목적 3종 버전 관리(`consent.registry.ts`), 철회 시 이미지 퍼지 | 우수 |
| Logs | Pino 경로 마스킹(전화·생일·좌표·토큰). **단 AuditLog metadata는 마스킹 미적용** | 개선 필요 |
| Backup | RDS 스냅샷(배포 전) — 백업에 남은 이미지 메타/PII의 보존 주기는 미정의 | 정책 필요 |
| AI training usage | **동의 항목에 없음 → 학습 사용 불가 상태.** 실제로 학습 사용 코드도 없음 | 향후 학습 활용 원하면 별도 동의 신설 필수 (D-08) |

**추가 권고** `[RECOMMENDATION]`: 개인정보처리방침(`app/legal/privacy.tsx`)의 내용이 위 실제 구현(보존 기간·완전삭제·제3자 제공: Gemini 전송)과 일치하는지 법률 검토 — 특히 `ai_recommendation_data_transfer` 동의가 Google(Gemini) 국외 이전 고지 요건을 충족하는지 확인 필요.

---

## 26. Backend Architecture

### NestJS (메인 백엔드) `[FACT]`

auth/otp/admin/consent/storage/diagnosis/weather/recommendations/products/pattern/notifications/gemini/jobs/idempotency 15개 모듈의 Modular Monolith. 인증·동의·영속화·비즈니스 로직 전부 담당. API 계약은 OpenAPI로 내보내 프론트 타입 생성 + CI 드리프트 검사.

### FastAPI (추론 전용) `[FACT]`

`/infer` 단일 책임 — 점수·등급·랜드마크만 반환, DB/인증/비즈니스 로직 없음, 이미지 인메모리 처리, 공유 시크릿 인증, 미설정 시 fail-closed.

### 책임 분리 평가

**적절하며 실제로 지켜지고 있다.** `docs/architecture/ARCHITECTURE.md`의 금지 규칙(FastAPI에 비즈니스 로직 금지, NestJS에 모델 로드 금지)이 코드와 일치함을 확인했다. Gemini 호출을 NestJS에 둔 것도 "추천은 비즈니스 로직"이라는 원칙과 정합적이다 `[FACT]`.

`[RECOMMENDATION]` 유일한 원칙 보완 제안: 이미지 품질 검증(blur/조도)을 FastAPI 전처리 단계에 추가하는 것은 "추론 결과만 반환" 원칙의 확장(전처리 검증)으로 문서 갱신과 함께 진행.

---

## 27. BullMQ / Async Audit

| 작업 | 현재 방식 `[FACT]` | 적절성 |
|------|---------------------|--------|
| Skin analysis | **동기** (클라 45s 대기) | 현 트래픽에선 적절 — 사용자가 결과를 기다리는 UX. 추론 동시성 1이므로 동시 사용자 증가 시 429 빈발 → 비동기 전환 또는 스케일아웃 재검토 (N38) |
| Recommendation | **비동기** (fast-path 즉시 + LIVE 잡) | 우수 |
| Report | 미구현 | 도입 시 비동기 |
| Notifications | 비동기 큐 (발송 채널만 부재) | 적절 |
| Aggregation/Pattern | 비동기 잡 + 동기 조회 병행 | 적절 |
| Scheduled | 날씨 워밍업·수집, 이미지 리컨실, 소프트삭제 퍼지, retention — Redis 리더 락으로 다중 태스크 중복 방지 (R3) | 적절 |

**BullMQ 필요/불필요**: 큐 4종(recommendation/pattern/notification/dlq)은 모두 실사용처가 있다. 다만 **현 규모에서는 인라인 디스패처로도 동작**하도록 설계되어 있어(동일 상태 계약), 운영 복잡도를 낮추고 싶다면 워커 분리(N36)는 트래픽 증거가 생긴 뒤로 미뤄도 된다 `[RECOMMENDATION]`.

---

## 28. Redis Audit

| 사용처 `[FACT]` | 없을 때 폴백 | 필요성 평가 |
|-----------------|--------------|-------------|
| 날씨 캐시 (TTL 300s / 저하 30s) | 직접 API 호출 | 필요 — 외부 API 호출량·지연 절감 |
| Rate limit 저장소 (`THROTTLE_STORAGE=auto`) | 인메모리 | **다중 인스턴스에서 필수.** 단 Redis 장애 시 fail-open 정책은 보안 트레이드오프 — 로그인·OTP 엔드포인트만이라도 fail-closed 검토 `[RECOMMENDATION]` |
| BullMQ 브로커 | 인라인 디스패처 | 워커 분리 시 필수 |
| Fast-path SWR 캐시 | 미스 → FALLBACK | 필요 — Gemini 비용·지연 절감 핵심 |
| 스케줄러 리더 락 | 태스크 스킵 가능 | 다중 태스크에서 필수 |
| Session | 사용 안 함 (JWT stateless + PG 세션) | 적절 |
| OTP/Idempotency | PostgreSQL (Redis 아님) | 적절 — 내구성 우선 |

---

## 29. PostgreSQL Audit

| 항목 | 평가 `[FACT]` |
|------|---------------|
| Schema | 18개 모델 — 도메인 경계 명확, enum 활용 적절 |
| Relations | FK 정책 세분화 (User cascade, Diagnosis SetNull, Template Restrict) — 의도적 설계 |
| Indexes | 핵심 쿼리 커버 — `diagnoses(userId, capturedAt)`, `recommendations(userId, diagnosisId, createdAt)`, OTP·세션·잡 dedupe 인덱스 (B4에서 보강) |
| Constraints | unique 적절 (`tokenHash`, `[userId, purpose]`, `[diagnosisId, part]`, `[provider, providerUserId]`) |
| Transactions | refresh 회전·진단 저장 트랜잭션 처리 (R21, R35) |
| Migrations | 23개, expand/contract 정책, CI에서 migrate diff 검사. **down migration 없음(Prisma 특성)** — 롤백은 forward-fix 원칙 문서화됨 |
| Queries | 캘린더 N+1 presign 배치 해결(R20), 카탈로그 캐시(R9) |
| Consistency | AsyncJob 상태 계약 단일화, idempotency 예약 |
| History growth | WeatherSnapshot·로그성 테이블 — retention sweep 가동 필요 (24장) |
| Backup | 배포 전 RDS 스냅샷 자동화. PITR·복구 리허설은 미실시 `[RECOMMENDATION]` 출시 전 1회 복구 드릴 |

---

## 30. API Audit

| 항목 | 상태 `[FACT]` | 평가 |
|------|---------------|------|
| Naming | 리소스형 + 일부 동사형(`/recommendations/generate/fast`) | 실용적 — 작업(operation) 성격상 허용 범위 |
| REST semantics | GET/POST/PATCH/DELETE 적절, 202+job 패턴 | 양호 |
| Validation | 전역 ValidationPipe(whitelist·forbidNonWhitelisted·transform) + DTO | 우수 |
| Auth | Bearer JWT, 공개 엔드포인트 명시적 | 양호 |
| Authz | RolesGuard(ADMIN), 리소스 소유권 검사(diagnosis/:id 등) | 양호 |
| Response format | 오류 표준 포맷 + correlationId | 우수 |
| Errors | HttpExceptionFilter — FastAPI 호환 `detail` 포함 | 양호 |
| Pagination | 커서 기반(선택적) — `limit` 미지정 시 전체 배열(FE 호환) | 전체 배열 경로는 데이터 증가 시 위험 — 기본 limit 도입 검토 |
| **Versioning** | **없음** (prefix 없음) | 스토어 배포 후 구버전 앱 호환을 위해 `/v1` 도입 권장 — 앱은 웹과 달리 강제 업데이트 불가 `[RECOMMENDATION]` |
| Idempotency | 진단 60s dedupe + AI 호출 DB 예약, 잡 dedupeKey | 우수 |
| Rate limiting | 전역 60req/60s, Redis 분산 | fail-open 정책 재검토 (28장) |

---

# Part G. 품질 / 운영

## 31. Security Audit

전반 평가: **치명적 취약점은 발견하지 못했다.** R1(토큰 평문 저장)·R2(API 키 쿼리스트링) 등 과거 Critical은 수정 완료 `[FACT]`. 남은 항목:

| # | 문제 | Severity | Evidence `[FACT]` | Impact / Attack Scenario | Recommendation |
|---|------|----------|-------------------|--------------------------|----------------|
| S-1 | 카카오 토큰 앱 바인딩 미검증 | **High** | `kakao.social-provider.ts` — access token으로 `/v2/user/me`만 호출, 어느 앱용 토큰인지 검증 없음 (코드 주석에 MVP 갭 명시) | 제3의 카카오 연동 앱이 수집한 access token으로 Todayskin 계정 생성/로그인 가능 | 토큰 정보 조회 API로 `app_id` 검증 추가 |
| S-2 | Apple id_token nonce 미검증 | Medium | `apple.social-provider.ts` | 토큰 리플레이 여지 (aud/서명은 검증됨) | 클라이언트 nonce 생성→검증 |
| S-3 | JWT 서명키 DB 평문 보관 | Medium | `JwtKeyRotation.secret` 평문 (`schema.prisma`) | DB 유출 시 토큰 위조 가능 | 프로덕션은 Secrets Manager/KMS 봉투 암호화 또는 env 단일 소스로 |
| S-4 | Rate limit fail-open | Medium | `RedisThrottlerStorage` — Redis 장애 시 통과 (테스트 로그에서도 확인) | Redis 장애 중 OTP/로그인 브루트포스 창 | 인증 엔드포인트만 fail-closed 옵션 |
| S-5 | AuditLog metadata 마스킹 미적용 | Low~Medium | `AuditLogService` 주석은 마스킹 언급, 실제 `maskSensitiveData` 미호출 | 호출자가 PII를 넣으면 감사 테이블에 평문 저장 | 서비스 레벨 강제 마스킹 |
| S-6 | 탈퇴 후 SocialAccount 잔존 | Low | `auth.service.ts` — 재로그인 409 "탈퇴한 계정" | "완전삭제" 고지와 불일치 인상 + 재가입 차단 | 정책 명확화(유예 후 삭제) 또는 카피 수정 |
| S-7 | 로컬 `backend/.env`에 실키 존재 | 운영 수칙 | git 미추적 확인 완료, 히스토리에도 없음 | 실수 커밋·백업 유출 리스크 | 프로덕션 이관 시 전 키 로테이션 |

**양호 확인 항목** `[FACT]`: 업로드 매직바이트 검증, presign 15분, SSE-S3/KMS, refresh 해시+회전+family 재사용 감지, OTP 해시+횟수·일일 한도, Helmet+CORS 화이트리스트(기본 차단), 프로덕션 mock 차단 e2e, Swagger 프로덕션 비활성, 시크릿 git 미노출(히스토리 포함), 인젝션(Prisma 파라미터화)·SSRF(고정 호스트)·XSS/CSRF(모바일 Bearer) 저위험.

---

## 32. Reliability Audit

| 시나리오 | 현재 동작 `[FACT]` | 평가 |
|----------|---------------------|------|
| AI 서버 장애 | fail-closed 503 → FE 오류 표시. MOCK은 프로덕션 차단 | 적절. 단 사용자 카피는 "잠시 후 재시도" 수준으로 안내 필요 |
| 외부 API(기상청/에어코리아) 장애 | 필드별 UNAVAILABLE + 짧은 TTL 캐시 + 가짜값 금지 | **우수** |
| DB 장애 | `/health/ready` 503, 앱 부팅 시 마이그레이션 검사 | 적절 |
| Redis 장애 | 캐시 우회·인라인 잡·스로틀 fail-open | 동작 지속 — 보안 트레이드오프만 관리 |
| S3 장애 | 저장 실패 시 진단은 성공 처리?(이미지만 실패) + 삭제 실패는 pendingDelete 재시도 큐 | 삭제 경로 우수. 저장 실패 경로 사용자 고지 확인 필요 `[INFERENCE]` |
| Timeout 계층 | 클라 45s > Nest→FastAPI 30s > FastAPI 내부 25s — 계층 정합 | **올바른 순서** |
| 중복 요청 | 진단 60s dedupe + DB 예약, 잡 dedupeKey | 우수 |
| Race condition | refresh 회전 txn(`updateMany` count=1), 재사용 grace 10s | 우수 |
| Queue 장애 | DLQ 큐 존재, 인라인 폴백 | DLQ 소비/알림 루틴은 미구현 — 운영 절차 필요 |
| Partial failure | 날씨 필드 null, 추천 FALLBACK→LIVE 승격 | 우수 |
| Graceful shutdown | SIGTERM 훅 + stopTimeout 120s (R4) | 완료 |

`[RECOMMENDATION]` 남은 과제: ① CloudWatch 알람(5xx율·잡 실패·DLQ 적체·inference 429율) — 현재 로그만 있고 **알림이 없다**, ② SSE 연결 수 급증 시 리소스 관찰(1s 폴링 기반), ③ 장애 대응 런북 1페이지.

---

## 33. Performance Audit

| 영역 | 문제 | 원인 `[FACT]` | 사용자 영향 | 해결책 `[RECOMMENDATION]` | 우선순위 |
|------|------|---------------|-------------|---------------------------|----------|
| Image upload | 원본 무압축 업로드 (최대 10MB) | 클라이언트 리사이즈/압축 없음 — 카메라 원본 그대로 멀티파트 전송 | LTE에서 업로드 수 초~수십 초 → "분석 중" 체감 지연의 주범 | `expo-image-manipulator`로 장변 1440px·JPEG 품질 0.8 리사이즈 후 업로드 (추론 입력 224²라 정보 손실 없음) | **P1** |
| AI inference | 동시성 1 → 동시 사용자 시 429 | `INFERENCE_CONCURRENCY=1`, 인스턴스 1 | 둘째 사용자부터 대기/재시도 | 출시 초기: 동시성 2~3 + 오토스케일 준비 (N38 로드테스트) | **P1(출시 직후)** |
| Preprocessing | MediaPipe+정규화 CPU 상주 | 1 vCPU 태스크 | 추론 시간 증가 | vCPU 증설은 로드테스트 후 | P2 |
| Recommendations | 없음 — fast-path 즉시 응답 | SWR 캐시 | — | 유지 | — |
| External APIs | 없음 — 300s 캐시 + 워밍업 | — | — | 유지 | — |
| DB | 없음(현 규모) — 인덱스 커버 | — | — | 슬로우 쿼리 로그만 켜기 | P3 |
| History | presign 배치 처리 완료 (R20) | — | — | — | — |
| Rendering | 캘린더·리스트 최적화 미검증 | 실기기 프로파일 없음 | 미상 | 출시 전 실기기 프로파일 1회 | P2 |
| Images | 히스토리 썸네일 presign 15분 — 캐시 어려움 | 서명 URL 특성 | 재방문 시 재다운로드 | 클라이언트 이미지 캐시(expo-image 도입 검토) | P3 |
| Network | 홈 진입 시 순차 요청 여부 | `useHomeDashboard` 병렬화 정도 확인 필요 `[INFERENCE]` | 초기 로드 지연 | 병렬 fetch 보장 + 아래 34장 | P2 |

---

## 34. Perceived Performance Audit

### Technical (실측 성능)

위 33장. 백엔드 응답은 캐시·fast-path로 이미 빠른 구조. 병목은 **이미지 업로드와 추론 대기**.

### Perceived (체감 성능) `[FACT]` 현재 보유

- fast-path(FALLBACK/CACHED 즉시 표시) → "최신 추천으로 갱신 중…" 라이브 승격 — **업계 상위 패턴**
- stale-while-refresh: 새로고침 실패 시 이전 데이터 유지 + 토스트
- 알림 설정 저장 롤백(옵티미스틱) 구현

### 부재 → 권고 `[RECOMMENDATION]`

| 기법 | 적용 지점 | 효과 |
|------|----------|------|
| Skeleton | 홈 첫 진입(날씨·게이지·추천 카드 자리) | 스피너 대비 인지 대기 감소 |
| Optimistic UI | 동의 토글 | 즉시 반응 |
| Cache | 마지막 홈 데이터 AsyncStorage 스냅샷 → 콜드 스타트 즉시 표시 | 재방문 체감 개선 |
| Prefetch | 결과 화면 진입 시 추천 상세 프리페치 | 전환 매끄러움 |
| Progressive loading | 히스토리 썸네일 blur-up | 목록 체감 |
| Background processing | 분석 업로드를 백그라운드 유지(현 동기 요청은 앱 전환 시 취소 위험) — 최소한 "앱을 닫지 마세요" 안내 | 실패율 감소 |

---

## 35. Testing / QA Audit

### 실행 결과 (2026-08-13 로컬) `[FACT]`

| 게이트 | 결과 |
|--------|------|
| 프론트 typecheck / lint | 통과 / 경고 0 |
| 프론트 jest | **10 suites, 105 tests 전부 통과** (0.8s) |
| 백엔드 typecheck / lint | 통과 |
| 백엔드 jest | **52 suites 통과(2 skipped), 541 tests 통과(25 skipped)** (4.8s) |

### Unit

- 백엔드 54개 spec `[FACT]`: 점수/추천 로직(fallback·evidence), 검증(MIME·동의), 비즈니스 로직(auth 회전·재사용, OTP 한도, 날씨 정책, 잡 dedupe) — **리뷰 지시문이 요구한 4개 축 모두 커버**.
- 프론트 10개: API 클라이언트(401 refresh 단일 비행), 계약, 훅(홈 대시보드·OTP·잡), 유틸. **컴포넌트/스크린 테스트 0건**.

### Integration / E2E (백엔드 19개) `[FACT]`

핵심 흐름 커버리지: 회원가입→로그인(`auth`, `otp`) → 이미지 입력→분석(`consent-image`, `diagnosis-*`) → 결과→추천(`recommendation-product`) → 기록(`calendar-history`) 전 구간 e2e 존재. 여기에 timeout/failure(`jobs-async`), unauthorized(`prod-security`), rate limit(`throttle`), CORS/보안 헤더, 프로덕션 mock 차단, 시드/마이그레이션 정합까지.

### 공백 `[RECOMMENDATION]`

1. **모바일 E2E 부재** — 실기기/시뮬레이터 플로우 테스트(Maestro 권장: 온보딩→촬영 mock→결과) 최소 1개.
2. **컴포넌트 테스트 부재** — 최소 EvidenceBadge·WeatherCard·CircularGauge 스냅샷 수준.
3. **모델 회귀 테스트 부재** — 고정 이미지 세트에 대한 점수 스냅샷(모델 교체 시 drift 감지). CI의 inference 테스트는 계약만 검증(모델 스텁).
4. **부하 테스트 미실시** — N38 선행 조건.

---

## 36. DevOps / Infrastructure Audit

### Required for Release (출시 필수)

| 항목 | 상태 `[FACT]` |
|------|---------------|
| AWS 계정·OIDC·ECR/ECS/RDS/ElastiCache/S3/Secrets Manager 프로비저닝 | **미완 (N16)** — deploy 워크플로는 실물이나 자격 증명 단계에서 실패 중 |
| 첫 프로덕션 배포 + 스모크 | 미완 |
| CloudWatch **알람**(5xx·잡 실패·헬스체크) | 없음 — 로그만 존재 |
| 모바일 크래시 리포팅 | 없음 |
| 프로덕션 시크릿 등록(OCTOMO 키 포함) + 로컬 유출 대비 로테이션 | 미완 |
| Retention sweep 가동(N37) | 구현 완료, `off` |

### Recommended (권장)

Dependabot/CODEOWNERS, 스테이징 환경(또는 프로덕션 승인 게이트 유지로 갈음 — D-09), RDS 복구 리허설 1회, DLQ 소비 알림, 배포 후 자동 스모크 확장.

### Overengineering (현 단계 불필요) `[RECOMMENDATION]`

멀티 리전, k8s 전환, 서비스 메시, 마이크로서비스 분리, IaC 전면 도입(현 규모에선 문서화된 콘솔 셋업 + task-def JSON으로 충분), APM 풀스택 도입.

**긍정 평가** `[FACT]`: CI 5종 게이트(FE·계약 드리프트·inference·BE 풀 파이프라인·audit), migrate-before-rollout, RDS 스냅샷, 롤백 경로(`image_tag`+`skip_migrate`), 비루트 컨테이너(uid 10001), 헬스체크, env 레지스트리↔ECS task-def 정합 테스트 — **배포 파이프라인 설계는 이 규모 프로젝트 기준 상위 수준.**

---

## 37. Release Readiness Audit

| 항목 | 상태 | 판정 |
|------|------|------|
| Production build (BE) | Docker 멀티스테이지 완비 `[FACT]` | ✅ |
| Production build (FE) | **EAS 설정 없음 — Expo Go 개발 실행만 가능** `[FACT]` | ❌ |
| Production environment | AWS 미프로비저닝 | ❌ |
| Secret management | Secrets Manager 설계 완료, 등록 미완 | ⚠️ |
| Monitoring | 헬스체크 O, 알람 X | ⚠️ |
| Logging | Pino+마스킹+CloudWatch 설계 | ✅ |
| Crash reporting | BE Sentry O / **모바일 없음** | ❌ |
| Analytics | 없음 (퍼널·리텐션 측정 불가) | ❌ |
| Health checks | live/ready 분리 | ✅ |
| Backup | 배포 전 스냅샷 자동화 | ✅(리허설 필요) |
| Migration / Rollback | expand-contract + skip_migrate 문서화 | ✅ |
| Support (문의 채널) | 없음 — 설정에 문의/신고 진입점 부재 `[FACT]` | ❌ |
| Privacy policy / Terms | 앱 내 화면 존재 (`app/legal/`) — 법률 검토·호스팅 URL(스토어 제출용) 필요 | ⚠️ |
| Account deletion | 앱 내 탈퇴 + 완전삭제 — **스토어 요건 충족** `[FACT]` | ✅ |
| Permissions 문구 | 한국어 목적 설명 완비 | ✅ |
| Icon | iOS/Android 아이콘 존재 | ✅ |
| **Splash** | `splash-icon.png` 파일은 있으나 **app.json에 splash 설정 미연결** `[FACT]` | ❌ |
| Metadata | 앱명 "Weatherskin" — 브랜드 불일치 | ❌ |
| Versioning | version 1.0.0만, **iOS buildNumber/Android versionCode 없음** | ❌ |
| Store requirements | bundleIdentifier/package 없음, App Privacy(데이터 수집 고지) 미준비 | ❌ |

---

## 38. App Store / Mobile Release

| 항목 | 상태 `[FACT]` | 필요 작업 |
|------|---------------|-----------|
| iOS | `usesAppleSignIn: true`, `supportsTablet: true` | bundleIdentifier, buildNumber, App Privacy 라벨(얼굴 이미지·건강 관련 데이터 수집 고지 — 민감 카테고리), 태블릿 레이아웃 검증 또는 지원 해제 |
| Android | adaptive icon 완비, `predictiveBackGestureEnabled: false` | package명, versionCode, 데이터 보안 섹션 작성 |
| Camera 권한 | 목적 문구 완비 ("원본 이미지는 저장되지 않습니다") | 동의 문구와 실제 정책(동의 시 저장) 간 표현 정합 재확인 — 권한 문구는 "미동의 시" 기준이므로 오해 소지 검토 `[INFERENCE]` |
| Notification 권한 | 미사용 (푸시 없음) | 로컬 리마인더 도입 시 권한 플로우 추가 |
| Image picker | 3:4 크롭, 권한 문구 완비 | — |
| Deep links | `weatherskin://oauth`만 | 브랜드 변경 시 스킴 변경 + 소셜 리다이렉트 URI 재등록 |
| Safe area | 적용 | — |
| Lifecycle | 분석 중 백그라운드 전환 시 동기 요청 취소 위험 | 안내 문구 또는 백그라운드 유지 |
| Production build | eas.json 없음 | EAS Build 프로필(development/preview/production) 작성, `extra.apiBaseUrl`(localhost)을 EAS 환경변수로 대체 |
| OAuth 리다이렉트 | Expo Go 기준 — 스탠드얼론 빌드에서 Kakao/Google 콘솔에 실제 스킴/번들 등록 필요 | 소셜 3사 콘솔 설정 |

---

## 39. Cost Audit

정확한 단가는 확인하지 않았다(추측 금지 원칙). **구조적 비용 리스크만** 평가한다.

### 고정비 구조 `[FACT — 리소스 스펙 기준]`

ECS Fargate 상시 3태스크(backend 0.5vCPU/1GB, worker 0.5/1, inference 1/2) + RDS + ElastiCache + ALB — **사용자 0명이어도 발생하는 최소 고정비**. 학생/사이드 프로젝트라면 워커 태스크 보류(인라인 잡)·inference 스케줄 축소로 절감 가능.

### 규모별 리스크

| 규모 | 지배 요인 | 리스크 분석 |
|------|----------|-------------|
| 100명 | 고정비 | 변동비 미미. Gemini flash + SWR 캐시로 LLM 비용 통제됨. S3는 동의 사용자 이미지만(수 MB×일 1회) |
| 1,000명 | **inference 컴퓨팅** | 동시성 1 태스크로는 저녁 피크(자기 전 촬영 프레임) 429 빈발 → 태스크 2~4개 수평 확장 = 고정비 배수 증가. 업로드 대역폭은 클라 리사이즈로 1/5 이하 절감 가능 |
| 10,000명 | inference + 스토리지 누적 | 이미지 누적(동의율×일일 촬영×보존 무기한)이 단조 증가 — 보존 정책(D-08) 필요. WeatherSnapshot 등 로그성 테이블은 sweep으로 통제. Gemini는 캐시 히트율이 유지되면 선형 미만 |

**최대 비용 리스크 = inference 상시 자원** `[INFERENCE]`. 피크 시간대(21~24시 집중 예상)가 뚜렷한 서비스라 오토스케일 or 요청 큐잉 설계가 비용 효율을 좌우한다. LLM은 이미 잘 통제되고 있다.

---

## 40. Code Quality / Technical Debt

| 항목 | 근거 `[FACT]` | 심각도 |
|------|---------------|--------|
| 대형 파일 | `diagnosis.service.ts` 879줄, `env.registry.ts` 810줄, `auth.service.ts` 685줄, `gemini.client.ts` 636줄 | 중 — 응집도는 유지 중, 진단 서비스는 분할 후보 |
| 브랜드 잔재 | `app.json` name/slug/scheme "weatherskin", 세션 키 `weatherskin.session.user`, package name "weatherskin" | 중 — 출시 전 일괄 정리 필요 (스킴 변경은 소셜 리다이렉트 연동 재설정 수반) |
| 문서 드리프트 | `inference-service/README.md`가 MobileNetV3 표기(실제 EfficientNet-B0), `docs/README.md` 허브의 Open 목록이 보드와 불일치 | 낮음 — 혼란 유발 |
| 커밋된 잔재 | 루트 `image.png` 227KB (git 추적 중) | 낮음 |
| 보류 리팩토링 | F63(화면 StyleSheet 분리, 수기 타입 re-export, 로그인 훅 재사용), R9 잔여(카탈로그 쿼리 협소화) | 낮음 — 보드에 이미 기록됨 |
| TODO | src 전체 1건 (`generate-recommendation.dto.ts` — diagnosisId 단일화) | 낮음 |
| 오타 | 패턴 화면 "이 스결과는" | 낮음 |
| 타입/데드코드 | strict 양쪽 적용, 데드 API 정리 완료(R29), `any` 경고 워닝 수준 | 건전 |

**총평: 기술 부채는 "관리되고 있는" 상태다.** R1~R35 실행 기록과 남은 항목의 보드 관리가 성실하다. 가장 실질적인 부채는 코드가 아니라 **브랜드 이원화와 문서-코드 표기 불일치**다.

---

# Part I. 종합

## 41. Current vs Recommended

| Area | Current | Problem | Recommended | Priority |
|------|---------|---------|-------------|----------|
| Product | 측정→추천 루프 전반부 완성, 정체성은 "포트폴리오" 문서화 | 행동·재측정 공백, 출시 제품으로서의 정체성 미합의 | 환경×피부 상관을 주축으로 정체성 확정, 루프 후반 닫기 | P0(결정)/P1(기능) |
| UI | 토큰 기반, 클린 무드, 시스템 폰트 | 폰트 미로딩, 스켈레톤 부재, 실기기 미검증 | Pretendard + 스켈레톤 + 실기기 워크스루 | P1~P2 |
| UX | 동의·상태 설계 우수 | MO OTP 마찰, 품질 게이트 부재, 첫 결과 기준점 부재 | 소셜 우선 + 촬영 게이트 + 기준점 카피 | P1 |
| Design System | 토큰+16 컴포넌트 | 공용 Button 부재, 다크모드 없음 | Button 컴포넌트, 다크모드는 P3 | P2 |
| Features | 분석·추천·기록·패턴 | 리마인더·리포트·전후 비교 부재 | 로컬 리마인더+주간 요약 우선 | P1 |
| AI | 실학습 모델 + 통제형 Gemini | 평가 지표 부재, 질환 분류 규제 리스크, 여드름 저성능 | 홀드아웃 평가 공개, 질환 UI 제외, 여드름 옵트인 | P0(규제)/P1 |
| Mobile | Expo Go 개발 완성 | EAS/스토어 체인 전무, 크래시·애널리틱스 없음 | EAS+식별자+Sentry+최소 애널리틱스 | P0 |
| Backend | 15모듈 성숙, 계약 드리프트 CI | 버저닝 없음, 일부 소셜 검증 갭 | /v1 도입, Kakao 앱 바인딩 | P0(보안)/P1 |
| Database | 인덱스·마이그레이션 규율 | sweep 미가동, 로그성 성장 | N37 가동 + 복구 리허설 | P1 |
| Security | Critical 정리 완료 | S-1~S-7 잔여 | 31장 표 순서대로 | P0~P2 |
| Performance | fast-path 우수 | 원본 업로드, 추론 동시성 1 | 클라 리사이즈, 스케일 플랜 | P1 |
| Testing | 646 테스트 통과, e2e 19 | 모바일 E2E·모델 회귀 부재 | Maestro 1본 + 점수 스냅샷 | P2 |
| DevOps | CI/CD 설계 상위 | AWS 미프로비저닝, 알람 없음 | N16 완수 + 알람 4종 | P0 |
| Release | 탈퇴·권한·법적 화면 준비 | 스토어 메타데이터·스플래시·지원 채널 부재 | 37장 체크리스트 소거 | P0 |

## 42. KEEP / CHANGE / ADD / REMOVE / DEFER (프로젝트 레벨)

- **KEEP**: NestJS/FastAPI 경계와 아키텍처 원칙 문서 규율, 동의·완전삭제 프라이버시 체계, 근거 등급 추천 설계, fast-path+SSE 패턴, CI 계약 드리프트 검사, 테스트 문화.
- **CHANGE**: 브랜드 통일(앱명·스킴·세션 키), "진단" 워딩, MO OTP의 온보딩 내 위상(소셜 우선), 점수 화면의 기준점 커뮤니케이션, 스로틀 fail-open(인증 한정 fail-closed), README·inference 문서의 모델 표기.
- **ADD**: EAS 릴리스 체인, 모바일 Sentry+최소 애널리틱스, CloudWatch 알람, 촬영 품질 게이트, 클라 이미지 리사이즈, 로컬 리마인더, 주간 요약, 문의/신고 채널, 모델 평가 리포트, API /v1, 기온·습도 수집.
- **REMOVE**: 질환 분류 UI 노출(출시 범위), 루트 `image.png`, 여드름 리포트 기본 노출(옵트인 전환), 태블릿 지원 선언(검증 전까지).
- **DEFER**: 구독 결제(F11), 대화형 AI 코치, 보유 제품 스캐너, 다크모드, 커뮤니티, 목표(8주 플랜), 마이크로서비스 분리·IaC 전면 도입.

## 43. Team Decisions (AI가 단독 결정하면 안 되는 사항)

### Product

- **정체성(포트폴리오 vs 출시 제품)** — Why: 요구 수준(운영·CS·규제)이 다름. Options: A 포트폴리오 완성 / B 소규모 실출시 / C 공개 베타(TestFlight). Pros/Cons: A는 비용 0·경력 가치, B는 실사용 데이터·운영 부담, C는 중간. **Recommendation: C — TestFlight/내부 테스트 트랙으로 실사용 검증 후 B 판단.** Question: "우리는 앞으로 6개월간 주당 몇 시간을 운영에 쓸 수 있는가?"
- **타깃 사용자·MVP 범위** — 20~30대 스킨케어 관심층 가설 확정 여부, 남성 포함 여부(FaceIllustration은 남녀 대응 `[FACT]`). Question: "첫 100명은 누구이며 어디서 오는가?"

### UI / UX

- **브랜드명 확정** — Todayskin(리포명·문서) vs Weatherskin(앱 설정·스킴). 스킴 변경은 소셜 리다이렉트 재설정 수반 → 빠를수록 저렴. **Recommendation: Todayskin으로 통일.**
- **온보딩 구조** — 8화면 유지 vs 3화면 압축. **Recommendation: 압축 A/B는 애널리틱스 도입 후.**
- **점수 표시 정책** — 실측 그대로 vs 동기부여 보정(`[BENCHMARK]` YouCam raw/ui 이원화). **Recommendation: 실측 유지 + 긍정 프레임 카피(신뢰 포지셔닝과 일관).**

### AI

- **질환 분류·여드름 노출**(15장) — Options: 제외 / 옵트인 베타 / 규제 자문 후 결정. **Recommendation: 출시 범위 제외 + 자문 병행.**
- **모델 품질 기준** — 출시 최소선(예: 홀드아웃 macro-F1, 재촬영 재현성 ±N점) 합의. **Recommendation: 수치 합의 전 "점수 변동 안내" 카피로 보완.**
- **Rule vs AI 경계 유지** — 현 통제형 hybrid 유지 여부. **Recommendation: 유지.**

### Data / Privacy

- **이미지 보존 기간** — 현재 무기한(사용자 삭제 시까지). Options: 무기한 / 1년 / 90일 자동 만료. **Recommendation: 1년 + 만료 전 고지.**
- **AI 학습 사용** — 현재 불가(동의 없음). 학습 활용하려면 별도 옵트인 동의 신설 + 처리방침 개정. **Recommendation: 출시 후 별도 논의, 기본 미사용 유지.**
- **Gemini 국외 이전 고지** — 처리방침 법률 검토와 함께.

### Architecture

- **NestJS/FastAPI 책임** — 품질 게이트를 FastAPI 전처리에 둘지(26장). **Recommendation: FastAPI 전처리 + 원칙 문서 갱신.**
- **Redis/BullMQ 운영 범위** — 워커 태스크(N36) 즉시 vs 트래픽 후. **Recommendation: 트래픽 증거 후.**
- **스테이징 환경** — 없음(현재 프로덕션 승인 게이트로 갈음). **Recommendation: 초기엔 승인 게이트 유지, 유료 사용자 발생 시 스테이징.**
- **AWS 아키텍처/스케일링** — inference 오토스케일 정책(타깃 추적 vs 스케줄 기반). **Recommendation: 저녁 피크 스케줄 기반이 단순·저렴.**

## 44. Decision Log

| ID | Topic | Decision Needed | Options | Recommendation | Status |
|----|-------|-----------------|---------|----------------|--------|
| D-01 | 제품 정체성 | 포트폴리오 vs 실출시 vs 공개 베타 | A/B/C | C (베타 트랙) | Pending |
| D-02 | 질환·여드름 기능 | 출시 포함 여부 | 제외/옵트인/자문 후 | 제외 + 자문 | Pending |
| D-03 | 타깃·MVP | 첫 사용자 정의 | 페르소나 후보 | 20~30 스킨케어 관심층 | Pending |
| D-04 | 브랜드명 | Todayskin vs Weatherskin | 통일안 | Todayskin | Pending |
| D-05 | 알림 전략 | 로컬 vs 서버 푸시 시점 | 로컬 먼저/동시 | 로컬 → 서버(경보) | Pending |
| D-06 | 모델 품질 기준 | 최소 지표·재현성 목표 | F1/MAE/±N점 | 홀드아웃 평가 후 합의 | Pending |
| D-07 | 수익화 | 구독 vs 어필리에이트 vs 무료 | 3안 | 출시 후 어필리에이트 검증 | Pending |
| D-08 | 데이터 정책 | 이미지 보존·학습 사용·프로필 확장 | 보존 기간 3안 | 1년 보존, 학습 미사용 | Pending |
| D-09 | 스테이징 | 도입 여부 | 도입/승인 게이트 유지 | 승인 게이트 유지 | Pending |
| D-10 | 점수 표시 | 실측 vs 보정 | 2안 | 실측 + 긍정 카피 | Pending |
| D-11 | OTP 전략 | MO 유지 vs 소셜 우선 | 2안 | 소셜 우선 노출 | Pending |
| D-12 | API 버저닝 | /v1 도입 시점 | 출시 전/후 | 스토어 출시 전 | Pending |

## 45. Release Blockers

| # | Problem | Evidence `[FACT]` | Impact | Why It Blocks Release | Required Fix | Priority |
|---|---------|-------------------|--------|----------------------|--------------|----------|
| B-1 | AWS 프로덕션 부재 | N16 open, OIDC 실패 (`docs/tasks/BACKEND_TASKS.md`) | 서비스 자체가 없음 | 배포 불가 | 계정·OIDC·리소스 프로비저닝 + 첫 배포 + 스모크 + OCTOMO 프로덕션 키 | P0 |
| B-2 | 스토어 릴리스 체인 부재 | eas.json 없음, bundleIdentifier/package/versionCode 없음, splash 미연결, 앱명 Weatherskin | 심사 제출 불가 | 사용자에게 도달 불가 | EAS 프로필 + 식별자 + 버저닝 + 스플래시 + 브랜드 통일(D-04) + 소셜 콘솔 재설정 | P0 |
| B-3 | 질환 분류 노출 | `diagnosis-result` 베타 페이지 5클래스+confidence | 의료기기 오인 → 규제·스토어 리젝 리스크 | 심사·법적 리스크 | D-02 결정 → 기본 제외 | P0 |
| B-4 | 모바일 크래시 리포팅 부재 | `src/`에 Sentry 없음 | 출시 후 장애 원인 파악 불가 | 운영 최소선 미달 | `@sentry/react-native` + 소스맵 업로드 | P0 |
| B-5 | 법적 문서·스토어 고지 미검토 | legal 화면은 존재, 처리방침 URL·App Privacy·국외 이전(Gemini) 고지 미준비 | 심사 거절·법적 리스크 | 얼굴 이미지 = 민감 데이터 | 법률 검토 + 호스팅 URL + 스토어 데이터 고지 작성 | P0 |
| B-6 | 소셜 인증 검증 갭 | Kakao 앱 바인딩 미검증(S-1), Apple nonce(S-2) | 타 앱 토큰으로 계정 접근 가능 | 인증 우회는 출시 불가 결함 | app_id 검증 + nonce | P0 |

## 46. Priority

### P0 — Release Blocker
45장 B-1 ~ B-6.

### P1 — High Impact (출시 품질 좌우)
① 촬영 품질 게이트(클라+서버) ② 클라이언트 이미지 리사이즈 업로드 ③ 로컬 리마인더 + 주간 요약 카드 ④ 모델 홀드아웃 평가 문서화(+ 여드름 옵트인 전환) ⑤ CloudWatch 알람 4종 + 장애 런북 ⑥ 최소 애널리틱스(퍼널 5이벤트) ⑦ retention sweep 가동(N37) ⑧ API `/v1` 도입(D-12) ⑨ inference 동시성·스케일 플랜(N38 로드테스트) ⑩ "진단" 워딩 정리 + 패턴 오타 ⑪ 히스토리/패턴 재시도 일관화 ⑫ 인증 엔드포인트 스로틀 fail-closed.

### P2 — Medium (출시 후 가능)
피부 타입·주의 성분 프로필, 환경 경보(서버 푸시), 전/후 비교, 루틴 체크리스트, 기온·습도 수집, 스켈레톤+콜드스타트 캐시, 부위별 추이·기간 선택, a11y(라벨·폰트 스케일·44pt), 온보딩 압축 실험, 모바일 E2E(Maestro), 컴포넌트 테스트, Dependabot/CODEOWNERS, 워커 태스크 분리(N36).

### P3 — Long Term
대화형 코치, 보유 제품 등록·궁합, 목표(8주), 변화 감지 알림, 다크모드, 구독 결제(F11), 카탈로그 대량 확충, 학습 데이터 옵트인 체계.

## 47. Recommended Roadmap

| Phase | 목적 | 핵심 작업 |
|-------|------|----------|
| **Phase 0 — Team Decisions** (몇 시간~1주) | 방향 확정으로 재작업 방지 | D-01~D-12 일괄 결정, 특히 D-01(정체성)·D-02(질환)·D-04(브랜드) |
| **Phase 1 — Release Blockers** (1~3주) | 출시 가능 상태 | B-1 AWS 배포, B-2 EAS 체인, B-3 질환 제외, B-4 Sentry RN, B-5 법적 검토, B-6 소셜 검증 |
| **Phase 2 — Core Product** (1~2주) | 첫인상·신뢰·루프 | 품질 게이트, 이미지 리사이즈, 로컬 리마인더, 주간 요약, 모델 평가 문서화 |
| **Phase 3 — UI/UX** (1주) | 완성도 | 워딩 정리, 재시도 일관화, 스켈레톤, Pretendard, 첫 결과 기준점, 실기기 워크스루 |
| **Phase 4 — Security/Reliability/Performance** (1주) | 운영 안정 | 알람+런북, 스로틀 fail-closed, sweep 가동, /v1, 복구 리허설, 로드테스트(N38) |
| **Phase 5 — Differentiation** (2~4주) | "환경×피부" 심화 | 기온·습도 수집, 환경 경보 푸시, 패턴 미리보기·부위별 추이, 전/후 비교, 피부 타입 프로필 |
| **Phase 6 — Post Launch** (지속) | 성장 | 애널리틱스 기반 온보딩 실험, 루틴·목표, 수익화 실험(D-07), 카탈로그 확충, 코치 검토 |

## 48. Final Todayskin Direction

- **Product Vision**: "오늘의 환경이 내 피부에 주는 영향을 매일 확인하고 대응하는, 가장 정직한 피부 관리 도구."
- **Target User**: 한국 거주 20~30대, 환경성 피부 민감(건조·미세먼지·자외선)을 체감하는 스킨케어 관심층.
- **Core Problem**: 피부 컨디션 변동의 원인을 모르고, 오늘 무엇을 해야 할지 근거가 없다.
- **Core Value**: 매일 밤 30초 측정 → 오늘 환경과 결합한 객관 점수 → 근거 있는 행동 1가지.
- **Core Product Loop**: 측정→분석→이해→추천→**행동(루틴 체크)**→기록→변화 확인(주간 요약·패턴)→**재측정(리마인더)** — 굵은 두 단계를 신설해 루프를 닫는다.
- **Core Features**: 부위별 피부 점수, 날씨·대기질 결합, 근거 등급 추천, 캘린더 히스토리, 개인 상관 패턴, 주간 요약, 리마인더.
- **Differentiation**: ① 환경×피부 일일 상관(공공데이터 정밀도) ② 근거 등급 투명성 ③ 프라이버시 우선(미동의 미보관·완전삭제).
- **UX Direction**: "측정 도구"가 아니라 "매일 밤의 짧은 의식(ritual)" — 마찰 최소(소셜 로그인 우선), 정직한 상태 표기 유지, 첫 결과에 기준점 제공.
- **UI Direction**: 현 클린·저채도 무드 유지 + 브랜드 폰트 + 스켈레톤·마이크로 인터랙션으로 완성도 보강. 다크모드는 후순위.
- **AI Strategy**: CV는 "검증 가능한 만큼만 노출"(질환 제외, 여드름 옵트인, 평가 공개), LLM은 텍스트 생성으로 역할 제한 유지, 개인화는 통계 우선.
- **Data Strategy**: 최소 수집 유지, 이미지 보존 1년 정책(D-08), 학습 사용은 별도 옵트인 전까지 금지, 로그성 테이블 sweep 상시 가동.
- **Retention Strategy**: 로컬 리마인더 → 주간 요약 → (푸시 후) 환경 경보. 스트릭·게임화는 절제.
- **Technical Architecture**: 현 구조 유지(Modular Monolith + 추론 분리). 변경은 /v1 버저닝, FastAPI 전처리 게이트, 피크 스케줄 오토스케일만.
- **Release Strategy**: TestFlight/내부 트랙 베타(D-01) → 피드백 2~4주 → 정식 심사. 안드로이드·iOS 동시 준비하되 심사 리스크 낮은 쪽 먼저.

## 49. Release Readiness Final Assessment

### 판정: `Major Changes Required`

**왜 `Not Ready`가 아닌가**: 코드·테스트·CI/CD 설계는 이미 릴리스 후보급이다. 646개 테스트 통과, 계약 드리프트 CI, 마이그레이션 규율, 동의·삭제 체계, fail-closed AI 경로 등 "만들다 만 프로젝트"가 아니다 `[FACT]`.

**왜 `Minor Changes Required`가 아닌가**: 남은 것이 사소하지 않다 — ① 프로덕션 인프라가 물리적으로 없다(N16) ② 스토어 제출 체인이 통째로 없다(EAS·식별자·스플래시·브랜드) ③ 질환 분류라는 규제 경계 결정이 미결이다 ④ 크래시 리포팅·알람 등 운영 관측이 없다 ⑤ 인증 우회 소지(S-1)가 남아 있다. 이는 "수정"이 아니라 "구축·결정"이 필요한 항목들이다.

**한 줄 요약**: **코드는 Release Candidate, 제품·운영·규제는 Major Changes Required.**

## 50. Final Questions

1. **현재 Todayskin은 어떤 서비스인가?** — 날씨·대기질과 얼굴 AI 분석을 결합해 부위별 피부 점수와 근거 등급 추천을 주는, 기술적으로 성숙하지만 아직 배포되지 않은 모바일 서비스.
2. **어떤 서비스가 되어야 하는가?** — "환경×피부"의 일일 상관을 축으로, 매일 밤 30초 의식이 되는 정직한 피부 관리 도구 (48장).
3. **핵심 사용자는 누구인가?** — 환경성 피부 민감을 체감하는 국내 20~30대 스킨케어 관심층 (확정은 D-03).
4. **핵심 문제는 무엇인가?** — 피부 컨디션 변동의 원인 불명 + 오늘의 행동 근거 부재.
5. **현재 가장 강한 기능은?** — 근거 등급(A/B/C) 추천 체계와 동의 기반 프라이버시 파이프라인.
6. **현재 가장 약한 기능은?** — 재방문 장치(알림·리포트) 전무.
7. **가장 심각한 UX 문제는?** — 촬영 품질 게이트 부재로 첫 결과의 신뢰가 운에 좌우되는 것.
8. **가장 심각한 UI 문제는?** — 치명적 결함은 없음. 시스템 폰트·스켈레톤 부재로 완성 인상 부족 + 실기기 미검증.
9. **AI가 실제 가치를 높이는가?** — 예. 부위별 등급화는 rule로 불가능하고, LLM은 통제된 역할로 비용 대비 효용이 있다. 단 가치의 절반(신뢰)은 평가 공개 전까지 미완.
10. **AI의 가장 큰 문제는?** — 검증 지표 부재(메인 그레이더)와 저성능 부속 모델(여드름 mAP50 0.197)·질환 분류의 규제 리스크.
11. **경쟁 대비 가장 부족한 것은?** — 리텐션 장치와 정확도·재현성 공개 수치.
12. **Todayskin이 더 잘할 수 있는 것은?** — 한국 공공 환경 데이터 해상도 기반의 환경×피부 개인 상관.
13. **가장 현실적인 차별화 포인트는?** — 이미 구현된 C등급 패턴 + 날씨 스냅샷 연결을 전면에 세우는 것 (신규 개발 최소).
14. **반드시 추가해야 할 기능은?** — 로컬 리마인더 + 주간 요약 + 촬영 품질 게이트.
15. **제거/보류할 기능은?** — 질환 분류 노출 제거(출시 범위), 여드름 기본 노출 보류, 구독·코치·제품 스캐너 보류.
16. **반드시 수정할 architecture는?** — 구조 변경 불요. API /v1 도입과 FastAPI 전처리 게이트 추가 정도.
17. **가장 큰 보안 문제는?** — Kakao 소셜 토큰 앱 바인딩 미검증(S-1).
18. **가장 큰 성능 문제는?** — 원본 무압축 업로드 + 추론 동시성 1의 결합(피크 시간 대기).
19. **가장 큰 기술 부채는?** — 브랜드 이원화(Weatherskin 잔재)와 문서-코드 표기 드리프트.
20. **현재 출시 가능한가?** — 아니오. 배포 인프라와 스토어 체인이 물리적으로 없다.
21. **출시 blocker는 무엇인가?** — B-1~B-6 (45장).
22. **팀원이 반드시 결정해야 할 사항은?** — D-01 정체성, D-02 질환 기능, D-04 브랜드, D-08 데이터 정책.
23. **지금 결정하지 않아도 되는 사항은?** — 수익화(D-07), 스테이징(D-09), 다크모드, 워커 분리 시점.
24. **지금부터 어떤 순서로 작업해야 하는가?** — Phase 0 결정 → Phase 1 블로커 → Phase 2 신뢰·루프 → Phase 3~4 완성도·운영 → 베타 → Phase 5 차별화 (47장).

## 51. Final TOP 10

### Release Blockers TOP 10
1. AWS 프로덕션 프로비저닝+첫 배포(N16) 2. EAS·스토어 식별자 체인 3. 브랜드 통일(앱명·스킴) 4. 질환 분류 노출 결정(D-02) 5. 모바일 Sentry 6. 법적 문서 검토+스토어 고지 7. Kakao 앱 바인딩 검증 8. Apple nonce 9. 프로덕션 시크릿 등록+로테이션 10. 스플래시·버저닝 설정

### UX Improvement TOP 10
1. 촬영 품질 게이트 2. 분석 중 단계 표시+취소 3. 첫 결과 기준점 카피 4. "진단" 워딩 정리 5. 소셜 로그인 우선 배치(MO OTP 마찰 완화) 6. 히스토리/패턴 재시도 일관화 7. 스켈레톤 도입 8. 패턴 잠금 전 가치 미리보기 9. 결과 화면 재촬영 CTA 10. 오프라인 감지·전용 카피

### Product / Feature TOP 10
1. 로컬 리마인더 2. 주간 요약 카드 3. 환경 경보 푸시 4. 기온·습도 수집 5. 부위별 추이 6. 전/후 비교 7. 피부 타입·주의 성분 프로필 8. 루틴 체크리스트 9. 결과 신고("이상해요") 채널 10. 목표(8주) — 후순위

### Technical Improvement TOP 10
1. 클라 이미지 리사이즈 2. 모델 홀드아웃 평가 문서화 3. CloudWatch 알람+런북 4. API /v1 5. retention sweep 가동 6. 인증 스로틀 fail-closed 7. inference 로드테스트+스케일 플랜(N38) 8. JWT 키 보관 개선(S-3) 9. 최소 애널리틱스 10. 모바일 E2E 1본

### Team Decisions TOP 10
1. D-01 정체성 2. D-02 질환 기능 3. D-04 브랜드 4. D-03 타깃 5. D-08 데이터 정책 6. D-05 알림 전략 7. D-06 모델 기준 8. D-11 OTP 전략 9. D-10 점수 정책 10. D-07 수익화

## 52. Final Action Table

| Rank | Action | Type | Why | User Impact | Technical Impact | Effort | Priority |
|------|--------|------|-----|-------------|------------------|--------|----------|
| 1 | 팀 결정 워크숍(D-01~D-12) | Decision | 모든 후속 작업의 전제 | 간접 | 재작업 방지 | 반나절 | P0 |
| 2 | AWS 프로비저닝+첫 배포 | Infra | 서비스 존재 조건 | 서비스 접근 가능 | 파이프라인 검증 완료 | 3~5일 | P0 |
| 3 | EAS 체인+브랜드 통일 | Release | 스토어 도달 조건 | 설치 가능 | 스킴·소셜 재설정 | 2~4일 | P0 |
| 4 | 질환 분류 노출 제외+여드름 옵트인 | Product/규제 | 규제·신뢰 리스크 차단 | 신뢰 보호 | FE 플래그 수준 | 1일 | P0 |
| 5 | 모바일 Sentry+최소 애널리틱스 | Ops | 출시 후 눈과 귀 | 간접 | 관측 확보 | 1~2일 | P0 |
| 6 | Kakao 앱 바인딩+Apple nonce | Security | 인증 우회 차단 | 계정 보호 | 소셜 검증 강화 | 1~2일 | P0 |
| 7 | 촬영 품질 게이트+이미지 리사이즈 | UX/Perf | 첫 결과 신뢰+업로드 속도 | 체감 큼 | FastAPI 전처리+클라 | 3~4일 | P1 |
| 8 | 로컬 리마인더+주간 요약 | Retention | 루프 닫기 | 재방문 동인 | expo-notifications 로컬 | 3~4일 | P1 |
| 9 | 모델 홀드아웃 평가 문서화 | AI 신뢰 | 점수 신뢰의 근거 | 신뢰 | ml 평가 리포트 | 2~3일 | P1 |
| 10 | CloudWatch 알람+런북+sweep 가동 | Ops | 무인 운영 방지 | 안정성 | 알람 4종+N37 | 1~2일 | P1 |

> **작업 보드 반영 (2026-08-13)**: 위 항목 중 즉시 착수 가능한 개선은 각 보드 규칙에 따라 등록했다 —
> 프론트 [`FRONTEND_TASKS.md`](../tasks/FRONTEND_TASKS.md) **F71~F77**
> (Sentry, 이미지 리사이즈, 로컬 리마인더, 워딩 정리, 재시도 일관화, 폰트 스케일링, 브랜드 통일),
> 백엔드 [`BACKEND_TASKS.md`](../tasks/BACKEND_TASKS.md) **N46~N51** (소셜 토큰 검증, 인증 fail-closed,
> 감사 로그 마스킹, 품질 게이트, 알람·런북, JWT 키 보관) + 보류 **N52~N53** (/v1 버저닝, 기온·습도 확장).
> 팀 결정(D-01~D-12)과 인프라 작업(N16·N35~N37)은 기존 보드 항목·본 문서로 관리한다.

---

# Review Summary

## Todayskin Review by Fable5

본 리뷰는 Todayskin의 제품 방향성, 사용자 경험, UI/UX, 기능,
AI, 데이터, 아키텍처, 보안, 성능, 테스트, 운영 및 출시 준비 상태를
종합적으로 검토하고 향후 개발 우선순위와 팀 의사결정 사항을 정의하기 위해 작성되었다.

본 문서는 GitHub Pull Request를 통해 팀원들과 검토하고,
합의된 사항을 기준으로 후속 개발 작업을 진행한다.

**Review by:** Fable5  
**Project:** Todayskin  
**Date:** 2026-08-13 (목) 06:15 KST  
**Document:** Fable5_ProjectReview.md



