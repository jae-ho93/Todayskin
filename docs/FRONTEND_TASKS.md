# Todayskin Frontend Tasks

Expo SDK 54 기준. 백엔드 규칙은 `docs/BACKEND_TASKS.md`, 협업은 `CONTRIBUTING.md` 참고.
복붙 실행 지시서는 `docs/FE_HANDOFF.md`.

## 운영 (이 웨이브)

- **BE API freeze** (`docs/BACKEND_TASKS.md` Next). `rec-fast-path`·N24~N34 계약은 `main`에 있음.
- **Task 하나 = 브랜치 하나 = PR 하나 = squash merge 후 `main` pull → 다음 Task(새 브랜치).**
- `main`에서 작업·커밋 금지. merge 후 브랜치 삭제 금지 (`--delete-branch` 금지).
- `backend/` 수정 금지. API를 새로 만들지 말 것. 이 문서·Swagger에 적힌 계약만 사용.
- 리뷰어 1명 강제 없음. **일하는 FE(또는 FE AI)가 자기 PR을 squash merge.**
- 비밀번호·아이디/비번 찾기·이름+생일 찾기 UI **신설 금지**.
- 품질 다듬기·구조 정리 = 나중 **총리팩** 웨이브.
- 가상 제품·가짜 구독 가격 카드·목업 성공 로그인 금지.

## FE 구현 순서 (사이클 반복)

```text
F0 → F1 → F2 → F3 → F6 → F4 → F16 → F8 → F10 → F15 → F13 → F7 → F9
```

선행 BE: F1/F6·F2·F15·F16에 필요한 API는 **모두 main에 머지됨** (rec-fast-path, N24/N27, N33, N28/N34).

## Task

### F0. API client / job poll 선행 — P0

브랜치: `feature/fe-api-client-jobs`

- [x] `pollJob` 유틸
- [x] generate / weather-based 빠른 경로 client (`source`, jobId)
- [x] `getMe`, `updateMe`, `Product.purchaseUrl` 타입
- [x] (N33 후) 소셜 로그인 API client 자리

완료: 이후 Task가 쓸 client 준비. 화면 UX 대변경 없음.

### F1. 추천 빠른 경로 UI — P0 (`rec-fast-path` 후)

브랜치: `fix/recommendation-fast-path-ui`

- [x] `app/(tabs)/index.tsx` 동기 `generate` 제거
- [x] `CACHED` | `FALLBACK` 실제품 즉시 표시
- [x] job poll → `LIVE` 교체, stale/갱신 중 표시
- [x] 실패/timeout UX (목업 추천 금지)

완료: 첫 페인트에 실제품, 갱신 후 최신 추천.

### F2. 구매 링크 openURL — P0 (N24 후)

브랜치: `feature/product-open-url`

- [x] Product 타입에 `purchaseUrl`
- [x] `app/recommendation/[id].tsx` 관련 제품 → `Linking.openURL`
- [x] products 탭 카드 동일
- [x] URL 없으면 탭 비활성 또는 안내

완료: 시드 실제품 탭 시 구매 페이지로 이동.

### F3. 랜드마크 UI — P1 (N26 후)

브랜치: `fix/history-landmarks-without-image`

- [x] `history.tsx` MediaBlock: landmarks만 있어도 SVG
- [x] 메시지: 미동의 / 이미지없음+랜드마크 / URL 만료 구분

완료: 저장 동의·랜드마크 있는 진단에서 점 오버레이 보임.

### F4. 희소 추천 레이아웃 — P1 (N27 후)

브랜치: `fix/sparse-recommendation-layout`

- [x] 관련 제품 0~1개일 때 큰 여백 제거 / 빈 상태 카피

완료: 제품이 적어도 화면이 비어 보이지 않음.

### F6. weather/products 빠른 경로 — P1 (`rec-fast-path` 후)

브랜치: `fix/weather-products-fast-path`

- [x] F1과 동일: 즉시 실제품 + job → LIVE
- [x] `app/(tabs)/products.tsx` — 가상 제품·긴 동기 대기 제거

완료: 제품 탭도 실링크 실제품이 바로 보임.

### F16. 설정 전면 재구성 — P1 (N28 후, N34 권장)

브랜치: `feature/settings-screen-overhaul`  
(기존 프로필·동의 요구 F5를 이 Task에 통합.)

목표 IA:

```text
[프로필 헤더] 이름 · 마스킹 전화 · 수정
[알림] 실제 동작하는 항목만 (미구현이면 준비 중/숨김)
[개인정보·동의] 목적별 동의하기 + 철회
[계정] 소셜 연동(N33 후) · 로그아웃(확인) · 탈퇴
[앱] 버전
```

- [x] 프로필: `getMe` / `PATCH /me`
- [x] 동의 등록+철회 (철회만 모달 폐기)
- [x] 알림 라벨·실동작 정합 (거짓 토글 금지)
- [x] **가짜 구독 ₩0 / ₩4,900 카드 삭제**
- [x] 로그아웃 확인, 버전, (N33 후) 소셜 연동 행

완료: 실계정 설정 화면. 바이브코더 구독 UI 없음.

### F8. 카메라 동의 안내 — P2

브랜치: `fix/camera-consent-intro`

- [x] `camera-guide.tsx` intro에 저장 동의 상태/안내

완료: 촬영 시작 전 동의 인지 가능.

### F10. signup 자동 포커스 — P2

브랜치: `fix/signup-autofocus`

- [x] 이름 유효 시 전화번호 필드로 자동 진행/포커스

완료: “다음”만 눌러야 진행되는 UX 완화. (비밀번호 필드 추가 금지)

### F15. 소셜 로그인 UI — P1 (N33 후)

브랜치: `feature/social-login-client`

- [x] 로그인/회원가입에 **카카오 · 구글 · 애플** 버튼 (스토어 미배포여도 Apple 포함)
- [x] N33 API 연동, 세션은 기존 refresh 흐름
- [x] 미가입 소셜 → 온보딩(동의·필요 시 전화 연결)
- [x] 실패/취소 UX, 목업 로그인 금지

완료: 세 제공자로 로그인·가입 가능. 아이디/비번 찾기 UI 없음.

### F13. 인증 화면 정리 — P2 (F15와 맞춤)

브랜치: `fix/auth-screens-cleanup`

- [x] “아이디 찾기 / 비밀번호 찾기” 넣지 않음·있으면 제거
- [x] 전화+OTP와 소셜 진입을 한 화면에서 이해하기 쉽게
- [x] 약관/에러 카피 정리

완료: 비밀번호·찾기 없는 인증 UX.

### F7. UI 정리 묶음 — P2/P3

브랜치: `fix/history-recommendation-ui-cleanup`

- [x] 진단 카드 `모델 ${modelVersion}` 제거
- [x] “전체 기록” 섹션 제거
- [x] 공인 가이드라인 기본 펼침 또는 높이 축소
- [x] 부위 행: 고정폭 제거, 1줄/말줄임

완료: 히스토리·추천 표시가 리포트 #10~#13 기준 정리됨.

### F9. 월간 캘린더 — P2

브랜치: `feature/history-month-calendar`

- [x] 14일 스트립 → 월간 + 촬영일 마커
- [x] 기존 `history/:date` API 유지

완료: 기록 있는 날짜가 달력으로 보임.

### F17. OTP MO 화면 전환 — P0 ✅ (머지: PR #94)

브랜치: `feature/otp-mo-ui`

백엔드가 알리고(MT — 서비스가 문자 발송) → **OCTOMO(MO — 사용자가 문자 발송)** 로 전환됨.
`POST /otp/send`가 더 이상 문자를 보내지 않으므로 **응답의 `code`를 화면에 표시**하고,
사용자가 `recipientNumber`(1666-3538)로 그 코드를 문자 보내게 안내한다.

- [x] `src/api/client.ts` — `sendOtp` 응답 타입에 `code`·`recipientNumber` 추가
- [x] `app/onboarding/signup.tsx`·`login.tsx` OTP 단계: "인증번호 입력" → "아래 번호로 '인증코드 XXXX'를 보내주세요" 안내
- [x] `Linking.openURL('sms:1666-3538?body=인증코드 XXXX')` — 문자앱 자동 열기 (iOS/Android)
- [x] "문자를 보냈어요" 버튼 → `POST /otp/verify` (401 "확인되지 않았습니다"면 재시도 안내)
- [x] 재전송: `/otp/send` 재호출 → 새 코드 표시 (기존 재전송 쿨다운 유지)
- [x] 소셜 전화 연결(`social_link`) OTP 화면도 동일 적용

완료: 가입/로그인 OTP가 "문자 보내기" 방식으로 동작. (개발 allowlist 번호는 화면에 고정 코드 `123456` 표시)

### F18. 홈 화면 한글 텍스트 손상 복구 — P0 (신규, 2026-08-12 점검)

브랜치: `fix/home-korean-text-restore`

> **원인**: `9e0608a`(2026-08-10, "fix: typecheck errors")가 `app/(tabs)/index.tsx`의 한글
> 문자열을 대량으로 망가뜨림. 타입체크 오류 수정 중 문자열까지 잘못 편집된 것으로 보임.
> 나머지 3개 파일(history/products/recommendation-[id])은 들여쓰기만 변경 — 손상 없음.
> 원문은 직전 정상 커밋(`aa46e59`)에서 복원 가능.

- [ ] `안녕하세요 , {userName ?? '희 원'}님` → `안녕하세요, {userName ?? '회원'}님`
- [ ] `아침 자기 전 \n'카메라'페부 상태를 찍어보세요` → `매일 자기 전{'\n'}피부 상태를 찍어보세요!`
- [ ] `찰영을 시작하면...` → `촬영을 시작하면...`
- [ ] `종 합 점 수` → `종합 점수`
- [ ] `오늘 의 피부 스코어` → `오늘의 피부 스코어`
- [ ] `진 날 밤 새 언 후 ... ('\n')진단 마다 값이 다르고 추천 정보입니다 .` → `전날 밤 세안 후 촬영 기준으로 측정된 값이에요.{'\n'}진단이 아닌 추정값입니다.`
- [ ] `오늘 의 추천` → `오늘의 추천` / `추천 를` → `추천을`
- [ ] `자기 전 새 현 하기` → `자기 전 세안 후 촬영하기`

완료: 홈 화면(빈 상태·스코어 카드·FAB) 문구가 정상 한글로 표시.

### F19. 카메라 가이드 permission null 크래시 — P0 (신규, 2026-08-12 점검)

브랜치: `fix/camera-permission-null-crash`

> **원인**: `app/camera-guide.tsx`에서 `useCameraPermissions()`의 `permission`이 첫 렌더에
> `null`인데 4곳(143·158·160·199행)에서 `permission.granted`를 null 체크 없이 접근.
> 홈 FAB → `/camera-guide` 진입 즉시
> `Cannot read properties of null (reading 'granted')` 크래시 → 화면 진입 불가.

- [ ] `permission.granted` → `permission?.granted` (camera-guide.tsx 4곳)
- [ ] (필요 시) 권한 로딩 중 상태 UI — permission이 null일 때 "권한 확인 중" 표시 후 렌더

완료: 홈의 촬영 버튼을 누르면 카메라 가이드 화면으로 정상 이동.

### F21. 캘린더 날짜 표시 형식 정리 — P2 (신규, 2026-08-12 점검)

> `app/(tabs)/history.tsx` — 날짜 단위 표기가 섞여 있음.

- [ ] 캘린더 타이틀 `2026년 08월` → `2026년 8월` (월 앞자리 0 제거, `currentMonth.replace('-', '년 ')` 처리)
- [ ] 스코어 추이 범위 `2026-08-01 ~ 2026-08-31`(ISO) → 앱 전체 날짜 형식과 통일
      (예: `8월 1일 ~ 8월 31일` 또는 `2026.08.01 ~ 2026.08.31`)

완료: 캘린더·추이·상세 카드의 날짜 단위가 일관되게 표시.

### F24. 홈 첫 진입 시 데이터 미로드 — P0 (신규, 2026-08-12 기능 점검)

> **증상**: 홈 탭 첫 진입 시 "위치 파악 중 ..."에서 멈추고 날씨·스코어·추천이 안 뜸.
> pull-to-refresh하면 로드됨. 네트워크 로그에 `/weather` 호출 자체가 없음.
> **원인**: `9e0608a`가 `useEffect(() => { if (locationLoading) return; load(); }, [locationLoading, load])`
> (mount 시 로드)를 제거 — 현재 `load()`는 `handleRefresh`에서만 호출됨.
> 원문: `aa46e59`의 73~77행.

- [ ] `app/(tabs)/index.tsx`에 mount 시 `load()` useEffect 복원 (위치 권한 결정 대기 후)

완료: 홈 첫 진입부터 날씨/스코어/추천이 로드된다.

### F23. 회원가입 스텝 진행 핫픽스 — 수정 완료 · 커밋 대기

> 2026-08-12: `signup.tsx`의 `useEffect`가 `handleNameSubmit` 함수 안에 잘못 중첩되어
> "이름 입력 → 전화번호 칸 자동 표시"가 동작하지 않던 버그. **코드는 이미 수정됨**(메인 폴더
> 워킹트리에 미커밋). 브랜치로 커밋/PR 필요.

- [ ] `app/onboarding/signup.tsx` 수정분 브랜치 커밋 + PR (F17 이후 핫픽스)

### F22. 내 정보 화면 — 완료 (2026-08-12, PR #99)

> 현재: 설정 탭 상단 프로필 카드(이름+마스킹 전화) + "수정" 버튼 → **이름만 수정하는 모달**.
> 비교 조사(카카오톡/토스/배민/쿠팡): 대부분 **상단 프로필 카드 = 진입점**이고,
> 수정은 **별도 회원정보 화면**(배민형) 또는 전용 프로필 화면(카톡/토스형)으로 진행.
> 인라인 모달 수정은 드묾.

- [x] 프로필 카드 전체를 탭 영역으로 → 별도 **"내 정보" 화면**(`app/my-info.tsx`) 이동 (모달 제거)
- [x] 내 정보 화면: 이름·전화(마스킹)·생년월일·성별 표시
- [x] 이름/성별은 화면에서 수정 (`PATCH /auth/me`), 전화 변경은 OTP 흐름 연결(추후)
- [x] 소셜 연동 행은 계정 섹션 유지

완료: 설정에서 내 정보를 카드 탭으로 열고 항목별 수정.

> ⚠️ 발견·수정: `api.updateMe`가 PUT(/auth/me)으로 보내 404 — 백엔드는 PATCH만 노출.
> `authPatchJson` 헬퍼 추가로 PATCH 호출 수정 (기존 설정 모달 이름 수정도 동일하게 깨져 있었음).

### F20. 인증 화면 한 화면 리디자인 — 완료 (2026-08-12, PR #99)

- [x] 로그인: 스크롤 없는 한 화면 (헤드라인 + 전화 CTA + 소셜 아이콘 원형 48px)
- [x] 회원가입 2단계 분리: ① 전화번호+OTP ② 이름·생년월일·성별 (당근 패턴)
- [x] 소셜 버튼 풀폭 텍스트 → 아이콘 원형 48px × 3 (토스/배민 스타일, `SocialLoginButtons compact`)

완료 기준: 로그인/회원가입에 스크롤·고정푸터 분리 없음 — 웹 미리보기로 확인 완료.

### F11. 구독 화면 — 보류

결제·권한 범위 미정. 이번 웨이브 제외. 설정에 가짜 가격 카드 넣지 말 것.

### F12 / N23. EAS 배포 — 보류

배포 준비 후 별도.
