# Todayskin 협업 가이드

## 기본 원칙

- `main`에서 직접 작업하거나 직접 push하지 않습니다.
- 모든 변경은 Issue → 작업 브랜치 → Pull Request → 리뷰 → merge 순서로 진행합니다.
- PR 하나에는 하나의 기능 또는 하나의 설계 주제만 포함합니다.
- 기존 사용자 데이터와 프론트 API 계약을 임의로 변경하지 않습니다.
- secret, 얼굴 이미지, 실사용자 개인정보, 로컬 DB를 커밋하지 않습니다.

## 작업 시작

```bash
git switch main
git pull --ff-only origin main
git switch -c <task-branch>
```

T0~T14 사전 생성 브랜치는 완료된 과거 작업입니다. N9 이후 새 작업은 최신 `origin/main`에서 변경 성격에 맞는 브랜치를 새로 생성합니다.

## 브랜치 이름

- `feature/<name>`: 기능
- `fix/<name>`: 버그
- `refactor/<name>`: 구조 개선
- `test/<name>`: 테스트
- `chore/<name>`: 설정과 도구
- `docs/<name>`: 문서

## 커밋

Conventional Commits 형식을 사용합니다.

```text
feat: add Prisma PostgreSQL schema
fix: prevent duplicate recommendation generation
refactor: separate weather API clients
test: add diagnosis ownership tests
docs: document backend migration tasks
chore: configure pull request checks
```

커밋 전 다음을 확인합니다.

```bash
git status
git diff
git diff --cached
```

`git add .`보다 변경 목적에 해당하는 파일 경로를 명시적으로 stage합니다.

## Pull Request

PR 본문에는 다음을 작성합니다.

- 변경 내용과 이유
- 실행한 테스트와 결과
- API 변경 여부
- DB schema 또는 migration 변경 여부
- 환경변수 변경 여부
- 남은 작업과 보류 사항
- 리뷰어가 중점적으로 확인할 위험

권장 병합 방식은 `Squash and merge`입니다. 최소 한 명의 팀원이 승인하고 CI가 통과한 뒤 병합합니다.

현재 비공개 저장소 플랜에서는 branch protection/ruleset을 사용할 수 없으므로 아래 항목을 팀 규칙으로 준수합니다.

- `main` 직접 push 금지
- 승인 최소 1명
- CI 성공 후 merge
- 작성자가 자기 PR을 리뷰 없이 merge하지 않기

저장소 플랜이 지원되면 위 규칙을 GitHub branch protection으로 즉시 강제합니다.

### 한시적 예외: N24~N34 / FE F0~F16 버그픽스·제품 웨이브

이 웨이브에 한해 **리뷰어 1명 강제와 “자기 PR self-merge 금지”를 일시 해제**한다. 작업자(또는 FE AI)가 CI를 확인한 뒤 squash merge하고 `main`을 pull한 다음 Task로 넘어간다. N16 AWS·총리팩·결제 등 이 웨이브 밖 작업에는 위 기본 규칙을 다시 적용한다.

## 코드 리뷰

리뷰어는 다음을 확인합니다.

- 기존 API와 프론트 호환성이 유지되는가?
- Controller와 Service 책임이 분리되어 있는가?
- 인증, 권한, 사용자 데이터 소유권 검사가 있는가?
- migration과 seed를 다시 실행할 수 있는가?
- 중복 저장, race condition, 트랜잭션 누락이 없는가?
- 외부 API timeout과 실패 상태가 처리되는가?
- secret과 개인정보가 로그 또는 diff에 포함되지 않았는가?
- 성공뿐 아니라 실패·빈 데이터·권한 부족 테스트가 있는가?

## Prisma와 DB

- 로컬 DB 파일은 커밋하지 않습니다.
- `schema.prisma`와 `prisma/migrations/`는 커밋합니다.
- 공유된 migration을 수정하거나 삭제하지 않습니다.
- 스키마 변경은 가능한 한 별도 PR로 진행합니다.
- seed는 `upsert`를 사용해 반복 실행해도 중복되지 않게 합니다.
- 여러 명이 동시에 migration을 생성하지 않도록 담당자를 먼저 공유합니다.

## 보안

다음 항목은 절대 커밋하지 않습니다.

```text
.env
.env.bak
backend/.env
API key
JWT secret
DB password
Access/Refresh Token
얼굴 이미지
실사용자 개인정보
SQLite DB
```

환경변수 이름과 예시는 `.env.example`에만 기록합니다.

## 현재 Backend Task 담당 범위

백엔드 Task와 브랜치 목록은 [docs/BACKEND_TASKS.md](docs/BACKEND_TASKS.md)의 `다음 과정`을, 프론트는 [docs/FRONTEND_TASKS.md](docs/FRONTEND_TASKS.md)를 기준으로 합니다. 작업 시작 전 Issue에 담당자와 수정 예정 파일을 댓글로 남겨 충돌을 예방합니다.
