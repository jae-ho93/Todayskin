# BE Handoff Prompt (복붙용)

아래 구분선 안 블록을 Cursor(또는 다른) 에이전트에 **그대로** 붙여넣는다.
사람은 복붙만 한다. 구현·테스트·커밋·푸시·PR·squash merge·`main` 동기화는 에이전트가 한다.

상세 체크리스트·완료 기준: `docs/BACKEND_TASKS.md` (N24~N34)  
결정: `backend/decision.md` (2026-08-08 제품·인증) · 아키텍처: `docs/ARCHITECTURE.md` · 협업: `CONTRIBUTING.md`

---

당신은 Todayskin **NestJS 백엔드**(`backend/`)만 수정한다. Expo 앱·루트 FE 화면은 건드리지 않는다 (계약 문서·Swagger·DTO 동기화에 필요한 최소 문서 갱신은 허용).

## 절대 규칙

- NestJS Modular Monolith + FastAPI `inference-service` 역할 분리 유지 (`docs/ARCHITECTURE.md`). FastAPI에 비즈니스 로직·DB·인증을 넣지 말 것.
- **한 사이클 = 아래 순서의 한 항목 = 브랜치 하나 = PR 하나 = squash merge → main sync → 다음.**  
  **유일한 예외:** N31+N32+N29는 epic `feature/rec-fast-path` **한 브랜치·한 PR** (나눠 merge 금지).
- N24와 N27은 **같은 PR 권장** (`feature/real-product-catalog` 등 한 브랜치에 purchaseUrl+실제품 시드).
- **`main`에서 절대 커밋하지 말 것.** 매 사이클마다 `main` pull 후 **새 브랜치를 만들어** 작업한다.
- **merge 후 브랜치 삭제 금지** (`gh pr merge --delete-branch` / GitHub Delete branch 사용 금지).
- 매 Task 사이클:
  1. `docs/BACKEND_TASKS.md`에서 해당 Task 체크리스트·완료 기준 읽기
  2. `git switch main && git pull --ff-only origin main`
  3. `git switch -c <브랜치명>`
  4. 구현 + 가능하면 `cd backend && npm test` (또는 관련 unit/e2e) + `tsc`/`lint` 깨지지 않게
  5. Conventional Commit으로 커밋 (관련 파일만 stage; `.env`·secret·`.freebuff`·`.omc`·무관 `requirements.txt` 변경 금지)
  6. `git push -u origin HEAD`
  7. `gh pr create` (Summary + Test plan)
  8. **`gh pr merge --squash`** (리뷰어 대기 금지 — 이 웨이브 self-merge 허용. **`--delete-branch` 금지**)
  9. `git switch main && git pull --ff-only origin main`
  10. `docs/BACKEND_TASKS.md`에서 해당 항목을 `[x]`로 갱신하는 후속 문서 커밋이 필요하면 **같은 Task에 포함**하거나 아주 짧은 `docs/` follow-up을 **새 브랜치** PR로 즉시 처리 후 다시 sync
  11. 다음 Task는 **새 브랜치**로 (merge된 브랜치에 이어서 커밋하지 말 것)
- 충돌·CI 실패·불명확한 제품 결정 → rebase/force-push/`--no-verify` 하지 말고 멈추고 보고
- **금지:** 비밀번호·아이디/비번 찾기·이름+생일 찾기 API (N30 취소)
- **금지:** 허구 Skinlab/Greenfield 유지, 가상 `gemini-product-*`, 크롤링으로 상품 수집, 날씨/추천 목업 수치로 LIVE처럼 위장
- **하지 말 것:** N16 AWS 첫 배포, N23 EAS, FE Task(F*), 총리팩·결제

## Task 순서 (이 순서만, 각각 풀 사이클)

0. **N24+N27** — 브랜치 예: `feature/real-product-catalog`  
   - `Product.purchaseUrl` schema/DTO/응답  
   - 허구 시드 삭제, 실제 화장품 30~50 큐레이션 시드 + 동작 URL  
   - whitelist 성분 매칭, 0건 시 규칙 실제품 fallback, Gemini는 productId 선택 우선  
   - 크롤링 없음

1. **N25** — `fix/weather-collect-parallel`  
   - UV/관측/대기질 병렬·워밍, LIVE/CACHED/UNAVAILABLE 유지

2. **N26** — `fix/landmarks-storage-consent`  
   - 저장 동의와 landmarks 영속화 정합 + 회귀 테스트

3. **N28** — `feature/auth-patch-me`  
   - `PATCH /auth/me` { name?, gender? }, GET /me 정합, Swagger

4. **Epic rec-fast-path (N31+N32+N29)** — `feature/rec-fast-path` **한 PR**  
   - **선행:** 0번(N24+N27)이 main에 있어야 함. 아니면 멈추고 보고  
   - 실제품만, Redis SWR `CACHED`, miss→규칙 `FALLBACK` 즉시, job→`LIVE`  
   - `source` + jobId 계약, 가상 제품 경로 제거

5. **N33** — `feature/auth-social-oauth`  
   - Kakao · Google · Apple 토큰 검증·계정·세션 (기존 refresh)  
   - 미가입→온보딩 계약, env.registry, 비밀번호/찾기 API 없음

6. **N34 (선택)** — `feature/settings-notification-contract`  
   - `pushDeliveryAvailable` 등 FE 거짓 토글 방지. 시간 없으면 skip하고 freeze 보고

## API / 제품 계약 (이 웨이브에서 FE에 넘길 것)

- 제품: 노출 품목은 DB 실제품 + `purchaseUrl`. 가상 브랜드 없음
- 추천/weather-based 빠른 경로: 즉시 응답 `source`: `CACHED` | `FALLBACK` | `LIVE`, 필요 시 `jobId` → 기존 `GET /jobs/:id`
- `PATCH /auth/me`, 기존 `GET /auth/me`
- N33: 소셜 토큰 교환·세션 (Swagger에 명시). 비밀번호/찾기 없음
- 날씨: 실패 시 None + LIVE/CACHED/UNAVAILABLE (목업 수치 금지)

## 사이클마다 출력

- PR URL, merge 여부, `main` SHA
- 다음 Task 이름
- 막히면: 이유 한 줄 + 재개에 필요한 정보

## 전부 끝나면

- N24+N27, rec-fast-path, N33 (및 한 N25/N26/N28/N34) merge 목록
- **API freeze 선언** (FE는 `docs/FE_HANDOFF_PROMPT.md`로 넘김)
- `docs/BACKEND_TASKS.md` 체크박스 최종 상태 확인

시작: `main` pull 후 **0번 N24+N27**부터.
