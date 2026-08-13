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

### AI 에이전트 규칙 (2026-08-12)

AI 코딩 보조로 작업할 때도 아래를 **반드시** 지킨다.

- **모든 브랜치 규칙은 AI 에이전트에도 동일하게 적용**된다 — `main` 직접 작업 금지,
  작업 하나당 새 브랜치, merge 후 브랜치 삭제 금지.
- **각 작업마다 브랜치를 만들고**, 작업이 끝나면 **커밋 → 푸시 → 머지** 순서로 진행한다.
- **CI 기준**: 배포 관련 CI(Deploy ECS 등)는 실패해도 진행할 수 있다.
  단 **백엔드 빌드/테스트와 프론트엔드 빌드(타입체크)는 반드시 성공**해야 머지한다.
- **CI가 실패하면**: 실패 이유를 찾아 원인을 수정한다. 그대로 두지 않는다.
  수정도 같은 규칙을 따른다 — **새 `fix/` 브랜치**를 만들어 커밋 → 푸시 → 머지 →
  로컬 동기화 순서로 진행한다 (기존 브랜치에 이어서 커밋하지 않는다).
- **머지 후에는 반드시 로컬 `main`을 동기화** (`git pull --ff-only origin main`)한 뒤
  다음 작업으로 넘어간다.

## PR · 리뷰

본문: 변경/이유, 테스트, API·DB·env 변경, 남은 일, 위험 포인트.  
권장: Squash and merge. 기본은 승인 1명 + CI 통과. merge 후 브랜치 삭제 안 함.

비공개 플랜이라 branch protection 미강제 — 팀 규칙으로 `main` 직접 push 금지·브랜치 보존을 지킨다.

### FE 웨이브 예외 (F0~F16만)

BE는 **API freeze**. FE만 리뷰어 대기 없이 `gh pr merge --squash`(`--delete-branch` 금지) 후 `main` pull → **새 브랜치**.  
N16·총리팩·결제·BE 계약 변경은 기본 규칙.

## DB · 보안

- 커밋: `schema.prisma`, `prisma/migrations/`. 공유 migration 수정·삭제 금지.
- seed는 upsert. 스키마 변경은 가능하면 별도 PR.
- env 이름/예시는 `.env.example`만. 실제 `.env`·키·토큰 커밋 금지.

## 지금 할 일

- **FE:** [docs/tasks/FRONTEND_TASKS.md](docs/tasks/FRONTEND_TASKS.md) (작업 절차·계약 통합 관리)
- **BE:** freeze. 활성 보드(배포 계열) → [docs/tasks/BACKEND_TASKS.md](docs/tasks/BACKEND_TASKS.md) · 완료 이력 → [docs/tasks/BACKEND_ARCHIVE.md](docs/tasks/BACKEND_ARCHIVE.md)
- 셋업: [docs/guides/SETUP.md](docs/guides/SETUP.md) · 원칙: [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md)
