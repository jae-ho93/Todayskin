# Todayskin Frontend Tasks

Expo SDK 54 기준. 백엔드 규칙은 `docs/BACKEND_TASKS.md`, 협업은 `CONTRIBUTING.md` 참고.
복붙 실행 지시서는 `docs/FE_HANDOFF_PROMPT.md`.

## 운영 (이 웨이브)

- BE가 실제품·`rec-fast-path`·필요 API(N24~N34 해당분)를 `main`에 올린 뒤에만 FE 시작.
- **Task 하나 = 브랜치 하나 = PR 하나 = squash merge 후 `main` pull → 다음 Task.**
- `backend/` 수정 금지. API를 새로 만들지 말 것. 이 문서·Swagger에 적힌 계약만 사용.
- 리뷰어 1명 강제 없음. **일하는 FE(또는 FE AI)가 자기 PR을 squash merge.**
- 비밀번호·아이디/비번 찾기·이름+생일 찾기 UI **신설 금지**.
- 품질 다듬기·구조 정리 = 나중 **총리팩** 웨이브.
- 가상 제품·가짜 구독 가격 카드·목업 성공 로그인 금지.

## FE 구현 순서 (사이클 반복)

```text
F0 → F1 → F2 → F3 → F6 → F4 → F16 → F8 → F10 → F15 → F13 → F7 → F9
```

선행 BE: F1/F6은 **`feature/rec-fast-path` 머지 후**, F2는 N24(+N27), F15는 N33, F16은 N28(권장 N34).

## Task

### F0. API client / job poll 선행 — P0

브랜치: `feature/fe-api-client-jobs`

- [ ] `pollJob` 유틸
- [ ] generate / weather-based 빠른 경로 client (`source`, jobId)
- [ ] `getMe`, `updateMe`, `Product.purchaseUrl` 타입
- [ ] (N33 후) 소셜 로그인 API client 자리

완료: 이후 Task가 쓸 client 준비. 화면 UX 대변경 없음.

### F1. 추천 빠른 경로 UI — P0 (`rec-fast-path` 후)

브랜치: `fix/recommendation-fast-path-ui`

- [ ] `app/(tabs)/index.tsx` 동기 `generate` 제거
- [ ] `CACHED` | `FALLBACK` 실제품 즉시 표시
- [ ] job poll → `LIVE` 교체, stale/갱신 중 표시
- [ ] 실패/timeout UX (목업 추천 금지)

완료: 첫 페인트에 실제품, 갱신 후 최신 추천.

### F2. 구매 링크 openURL — P0 (N24 후)

브랜치: `feature/product-open-url`

- [ ] Product 타입에 `purchaseUrl`
- [ ] `app/recommendation/[id].tsx` 관련 제품 → `Linking.openURL`
- [ ] products 탭 카드 동일
- [ ] URL 없으면 탭 비활성 또는 안내

완료: 시드 실제품 탭 시 구매 페이지로 이동.

### F3. 랜드마크 UI — P1 (N26 후)

브랜치: `fix/history-landmarks-without-image`

- [ ] `history.tsx` MediaBlock: landmarks만 있어도 SVG
- [ ] 메시지: 미동의 / 이미지없음+랜드마크 / URL 만료 구분

완료: 저장 동의·랜드마크 있는 진단에서 점 오버레이 보임.

### F4. 희소 추천 레이아웃 — P1 (N27 후)

브랜치: `fix/sparse-recommendation-layout`

- [ ] 관련 제품 0~1개일 때 큰 여백 제거 / 빈 상태 카피

완료: 제품이 적어도 화면이 비어 보이지 않음.

### F6. weather/products 빠른 경로 — P1 (`rec-fast-path` 후)

브랜치: `fix/weather-products-fast-path`

- [ ] F1과 동일: 즉시 실제품 + job → LIVE
- [ ] `app/(tabs)/products.tsx` — 가상 제품·긴 동기 대기 제거

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

- [ ] 프로필: `getMe` / `PATCH /me`
- [ ] 동의 등록+철회 (철회만 모달 폐기)
- [ ] 알림 라벨·실동작 정합 (거짓 토글 금지)
- [ ] **가짜 구독 ₩0 / ₩4,900 카드 삭제**
- [ ] 로그아웃 확인, 버전, (N33 후) 소셜 연동 행

완료: 실계정 설정 화면. 바이브코더 구독 UI 없음.

### F8. 카메라 동의 안내 — P2

브랜치: `fix/camera-consent-intro`

- [ ] `camera-guide.tsx` intro에 저장 동의 상태/안내

완료: 촬영 시작 전 동의 인지 가능.

### F10. signup 자동 포커스 — P2

브랜치: `fix/signup-autofocus`

- [ ] 이름 유효 시 전화번호 필드로 자동 진행/포커스

완료: “다음”만 눌러야 진행되는 UX 완화. (비밀번호 필드 추가 금지)

### F15. 소셜 로그인 UI — P1 (N33 후)

브랜치: `feature/social-login-client`

- [ ] 로그인/회원가입에 **카카오 · 구글 · 애플** 버튼 (스토어 미배포여도 Apple 포함)
- [ ] N33 API 연동, 세션은 기존 refresh 흐름
- [ ] 미가입 소셜 → 온보딩(동의·필요 시 전화 연결)
- [ ] 실패/취소 UX, 목업 로그인 금지

완료: 세 제공자로 로그인·가입 가능. 아이디/비번 찾기 UI 없음.

### F13. 인증 화면 정리 — P2 (F15와 맞춤)

브랜치: `fix/auth-screens-cleanup`

- [ ] “아이디 찾기 / 비밀번호 찾기” 넣지 않음·있으면 제거
- [ ] 전화+OTP와 소셜 진입을 한 화면에서 이해하기 쉽게
- [ ] 약관/에러 카피 정리

완료: 비밀번호·찾기 없는 인증 UX.

### F7. UI 정리 묶음 — P2/P3

브랜치: `fix/history-recommendation-ui-cleanup`

- [ ] 진단 카드 `모델 ${modelVersion}` 제거
- [ ] “전체 기록” 섹션 제거
- [ ] 공인 가이드라인 기본 펼침 또는 높이 축소
- [ ] 부위 행: 고정폭 제거, 1줄/말줄임

완료: 히스토리·추천 표시가 리포트 #10~#13 기준 정리됨.

### F9. 월간 캘린더 — P2

브랜치: `feature/history-month-calendar`

- [ ] 14일 스트립 → 월간 + 촬영일 마커
- [ ] 기존 `history/:date` API 유지

완료: 기록 있는 날짜가 달력으로 보임.

### F11. 구독 화면 — 보류

결제·권한 범위 미정. 이번 웨이브 제외. 설정에 가짜 가격 카드 넣지 말 것.

### F12 / N23. EAS 배포 — 보류

배포 준비 후 별도.
