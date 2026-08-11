# FE Handoff (복붙용)

아래 구분선 안 블록을 Cursor 에이전트에 **그대로** 붙여넣는다.
사람은 복붙만 한다. git·PR·머지는 에이전트가 한다.

> **상태 (2026-08-12)**: F0~F17 웨이브를 포함해 **F0~F62까지 전부 완료**.
> 이 문서는 그 웨이브 당시 실행 지시(히스토리·계약 기준)로 유지한다.
> **현재 작업 보드는 `docs/FRONTEND_TASKS.md`** — 새 task는 거기서 관리한다.

BE가 `rec-fast-path`·관련 API를 `main`에 올린 뒤, API freeze 상태에서 실행한다.
(**현재 freeze 완료** — `docs/BACKEND_TASKS.md` Next 참고.)

---

당신은 Todayskin Expo SDK 54 프론트엔드만 수정한다.

## 절대 규칙

- `backend/` 수정 금지
- API·엔드포인트를 새로 만들지 말 것. `docs/FRONTEND_TASKS.md`와 아래 계약·Swagger만 사용
- **한 Task = 한 브랜치 = 한 PR**. 여러 Task를 한 브랜치에 몰지 말 것
- **`main`에서 절대 커밋하지 말 것.** 매 Task마다 `main` pull 후 **새 브랜치 생성**
- **merge 후 브랜치 삭제 금지** (`--delete-branch` / Delete branch 사용 금지)
- 매 Task 사이클:
  1. `docs/FRONTEND_TASKS.md`에서 다음 Task 읽기
  2. `git switch main && git pull --ff-only origin main`
  3. `git switch -c <그 Task 브랜치명>`
  4. 작업 + 검증(가능하면 typecheck)
  5. 커밋 → 푸시 → PR 생성
  6. **`gh pr merge --squash`** (네가 함. 리뷰어·BE 승인 대기 금지. **`--delete-branch` 넣지 말 것**)
  7. `git switch main && git pull --ff-only origin main` 로 동기화
  8. 다음 Task는 **새 브랜치**로 (이전 브랜치에 이어서 커밋하지 말 것)
- 충돌 나면 rebase/강제 push 하지 말고 멈추고 보고
- 비밀번호·아이디/비번 찾기·이름+생일 찾기 UI 신설 금지
- 가상 제품·가짜 구독 가격 카드·목업 로그인 금지

## Task 순서 (이 순서만, 각각 풀 사이클)

0. F0 — `feature/fe-api-client-jobs` — pollJob, 빠른 경로 client, getMe/updateMe, purchaseUrl 타입
1. F1 — `fix/recommendation-fast-path-ui` — index: CACHED|FALLBACK 즉시 → LIVE 교체 (**rec-fast-path 후**)
2. F2 — `feature/product-open-url` — Linking.openURL(purchaseUrl)
3. F3 — `fix/history-landmarks-without-image` — MediaBlock landmarks
4. F6 — `fix/weather-products-fast-path` — products 빠른 경로 (**rec-fast-path 후**)
5. F4 — `fix/sparse-recommendation-layout` — 희소 레이아웃
6. F16 — `feature/settings-screen-overhaul` — 설정 전면 재구성, 가짜 구독 삭제
7. F8 — `fix/camera-consent-intro` — 카메라 동의 안내
8. F10 — `fix/signup-autofocus` — signup 포커스
9. F15 — `feature/social-login-client` — 카카오·구글·애플 (**N33 후**)
10. F13 — `fix/auth-screens-cleanup` — 찾기/비번 UI 없이 OTP+소셜만
11. F7 — `fix/history-recommendation-ui-cleanup` — UI 정리
12. F9 — `feature/history-month-calendar` — 월간 캘린더
13. F17 — `feature/otp-mo-ui` — OTP MO 화면 전환 (코드 표시 + sms: 딥링크, **OTP MO 전환 후**)

상세 체크리스트: `docs/FRONTEND_TASKS.md`  
하지 말 것: F11 구독 결제, EAS, backend/ 임의 변경  
N33·`rec-fast-path`는 main에 머지됨 — F1/F6/F15 선행 충족. 계약이 Swagger와 다르면 멈추고 보고.

## API 계약 (freeze)

- 추천 빠른 경로: `POST /recommendations/generate/fast` { diagnosisId } (또는 호환: skinScore+weather) →
  `{ source: 'CACHED' | 'FALLBACK' | 'LIVE', jobId?, generatedAt?, recommendations[] }`
  - `CACHED`(Redis SWR) / `FALLBACK`(규칙 기반 실제품)이면 `jobId`로 `GET /jobs/:id` polling → LIVE 교체
  - `LIVE`는 저장 완료 결과. `generatedAt`은 stale 표시용 메타 (FE: `jobId` 있으면 "갱신 중" 표시)
  - FALLBACK 추천의 `sourceLabel`: `규칙 기반 빠른 응답 · AI 분석 전` (AI 문구 금지)
- `POST /recommendations/generate/async` { diagnosisId } → { jobId } (202) — 기존 유지
- **`POST /products/weather-based` 응답 형태 변경 (F6 대상)**: `ProductDto[]` → `{ source: 'CACHED'|'FALLBACK'|'LIVE', jobId?, generatedAt?, items[] }`
  - items는 전부 DB 실제품 + purchaseUrl, 가상 `gemini-product-*` 없음. LIVE job type: `WEATHER_PRODUCTS_GENERATE`
- `Product.purchaseUrl`: string (노출 제품)
- `GET /auth/me`, `PATCH /auth/me` { name?, gender? }
- `GET`/`POST /consents` (기존)
- N33 이후: Kakao/Google/Apple 소셜 토큰 교환·세션 (Swagger). 비밀번호/찾기 API 없음
- N33 계약 (F15 대상):
  - `POST /auth/social` { provider: 'kakao'|'google'|'apple', accessToken } →
    `UserResponseDto + { isNewUser }` (accessToken/refreshToken 포함)
    - kakao: 카카오 SDK access token / google: id_token / apple: identity token
    - `isNewUser: true` → 온보딩: 동의(기존 /consents) + 선택 전화 연결
    - 소셜 계정은 연결 전까지 `phoneNumber`/`birthDate`가 **null** — FE 타입 nullable 처리
  - `POST /auth/social/link-phone` { phoneNumber, birthDate? } (JWT) — OTP(`social_link`) 본인확인 후 연결,
    사용 중 번호 409. 미연결 상태에서도 세션은 정상 동작
  - OTP: `/otp/send|verify` purpose `'social_link'` 추가
- **OTP MO 계약 (F17 대상 — 백엔드 OCTOMO 전환)**:
  - `POST /otp/send` 응답: `{ code, recipientNumber, message }` — 백엔드가 문자를 **발송하지 않음**
  - `code`를 화면에 표시하고 `recipientNumber`(기본 1666-3538)로 문자를 보내게 안내 (sms: 딥링크 권장)
  - `POST /otp/verify`는 사용자가 보낸 문자의 **수신 여부**로 검증 — 401 `"인증 문자가 확인되지 않았습니다"`는
    아직 문자를 안 보낸 상태이므로 재시도 안내 (시도 횟수 소모 없음)
  - 개발 allowlist 번호: `code` = 고정 `123456`
- N34 계약 (F16 설정 전면 재구성 대상):
  - `GET/PUT /notifications/preferences` 응답에 **읽기 전용 `pushDeliveryAvailable: boolean`** 추가.
    - `false`(현재 기본)면 pushEnabled/uvAlertEnabled/dustAlertEnabled/morningReminder는 **선호 저장일 뿐**
      실제 푸시가 발송되지 않는다 — F16은 토글을 "되는 것처럼 보이게" 활성화하지 말고
      비활성/"준비 중"으로 표시해야 한다 (게이트웨이 연동 시 배포에서 true로 flip).
    - `morningReminder`는 저장 전용·발송 스케줄 미구현(unsupported) — 활성 토글로 노출 금지

모든 Task 사이클 끝나면: 마지막 merge 확인 + 브랜치/PR URL 목록 출력.
