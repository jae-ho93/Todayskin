# Todayskin 협업 가이드

## 원칙

- **`main`에서 작업·커밋·push 금지.** 최신 `main` pull 후 **새 브랜치**.
- 변경은 Issue → 브랜치 → PR → merge. PR은 주제 하나.
- **merge 후 브랜치 삭제 금지** (`--delete-branch` / Delete branch 사용 금지).
- API 계약·사용자 데이터를 임의로 깨지 않음. secret·얼굴 이미지·실사용자 PII·로컬 DB 커밋 금지.

```bash
git switch main && git pull --ff-only origin main
git switch -c <task-branch>
```

브랜치: `feature/` · `fix/` · `refactor/` · `test/` · `chore/` · `docs/`  
커밋: Conventional Commits. `git add .` 대신 관련 경로만 stage.

## PR · 리뷰

본문: 변경/이유, 테스트, API·DB·env 변경, 남은 일, 위험 포인트.  
권장: Squash and merge. 기본은 승인 1명 + CI 통과. merge 후 브랜치 삭제 안 함.

비공개 플랜이라 branch protection 미강제 — 팀 규칙으로 `main` 직접 push 금지·브랜치 보존을 지킨다.

### FE 웨이브 예외 (F0~F16만)

BE는 **API freeze**. FE만 리뷰어 대기 없이 `gh pr merge --squash`(`--delete-branch` 금지) 후 `main` pull → **새 브랜치**.  
N16·총리팩·결제·BE 계약 변경은 기본 규칙.

## AI 코딩 보조 도구 공동저자 금지

모든 커밋은 **사람 계정(author/committer)으로만** 작성한다. 커밋 메시지에 AI 코딩
보조 도구(Codebuff·Cursor·Copilot·Claude·ChatGPT·Gemini 등)의 `Co-Authored-By:`
트레일러나 `Generated with/by` 표기를 붙이지 않는다. CI(`ai-author-guard`)가
PR 커밋을 검사해 위반 시 실패시킨다.

로컬에서도 같은 규칙을 강제하려면 (클론당 1회):

```bash
git config core.hooksPath .githooks
```

## DB · 보안

- 커밋: `schema.prisma`, `prisma/migrations/`. 공유 migration 수정·삭제 금지.
- seed는 upsert. 스키마 변경은 가능하면 별도 PR.
- env 이름/예시는 `.env.example`만. 실제 `.env`·키·토큰 커밋 금지.

## 지금 할 일

- **FE:** [docs/FRONTEND_TASKS.md](docs/FRONTEND_TASKS.md) · [docs/FE_HANDOFF.md](docs/FE_HANDOFF.md)
- **BE:** freeze. 이력·N16 → [docs/BACKEND_TASKS.md](docs/BACKEND_TASKS.md)
- 셋업: [docs/SETUP.md](docs/SETUP.md) · 원칙: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
