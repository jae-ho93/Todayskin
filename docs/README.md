# Documentation

Todayskin 문서 허브. 문서는 **역할별 폴더**로 분류한다 —
설계는 `architecture/`, 실행 방법은 `guides/`, 할 일과 이력은 `tasks/`, 외부 리뷰는 `reviews/`.

**지금 할 일을 찾는다면 작업 보드**(`tasks/*_TASKS.md`)를, **왜 그렇게 했는지를 찾는다면
기록 문서**(`tasks/BACKEND_ARCHIVE.md`, `tasks/REFACTORING_BACKLOG.md`)를 본다.
기록 문서에 새 작업을 적지 않는다.

## architecture/ — 설계 원칙

| 문서 | 용도 |
|------|------|
| [ARCHITECTURE.md](architecture/ARCHITECTURE.md) | 시스템 아키텍처 원칙 (NestJS ↔ FastAPI 경계, 금지 규칙) |

## guides/ — 실행 가이드

| 문서 | 용도 |
|------|------|
| [SETUP.md](guides/SETUP.md) | 로컬 개발 환경 (앱 + API + DB) — 처음 온 사람은 여기부터 |
| [DEPLOYMENT.md](guides/DEPLOYMENT.md) | AWS ECS 실배포 · CI/CD · 롤백 · 배포 체크리스트 · 장애 런북 |
| [DEPLOYMENT_CHECKLIST.md](guides/DEPLOYMENT_CHECKLIST.md) | 배포 시크릿·변수·리소스 **입력 양식** (N16 진행용 — 채워서 쓰는 표) |

## tasks/ — 작업 보드와 이력

| 문서 | 용도 |
|------|------|
| [FRONTEND_TASKS.md](tasks/FRONTEND_TASKS.md) | **프론트 작업 보드** (Open + 완료, 작업 절차·계약 포함) |
| [BACKEND_TASKS.md](tasks/BACKEND_TASKS.md) | **백엔드·배포 작업 보드** (N16 실배포 완료 — Open: N35~N37·N50·N51) |
| [BACKEND_ARCHIVE.md](tasks/BACKEND_ARCHIVE.md) | 백엔드 완료 기록 (T/N/P 체크리스트 + 판단 근거) |
| [REFACTORING_BACKLOG.md](tasks/REFACTORING_BACKLOG.md) | 리팩토링 R1~R35 실행 기록 — **완료.** 문제 진단·해법·하지 않기로 한 것의 근거 |

## reviews/ — 리뷰와 감사

| 문서 | 용도 |
|------|------|
| [Fable5_ProjectReview.md](reviews/Fable5_ProjectReview.md) | 2026-08-13 종합 프로젝트 리뷰 (52장) — 후속 태스크의 출처 |

## 저장소 루트 (GitHub 관례)

| 파일 | 용도 |
|------|------|
| [`README.md`](../README.md) | 제품·스택 대문 |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | 브랜치 · PR · 보안 규칙 |

## 패키지 README (코드 옆)

| 파일 | 용도 |
|------|------|
| [`backend/README.md`](../backend/README.md) | NestJS 모듈·디렉터리 구조 지도 |
| [`backend/inference-service/README.md`](../backend/inference-service/README.md) | FastAPI 추론 서버 |
| [`backend/docker/DEPLOYMENT.md`](../backend/docker/DEPLOYMENT.md) | → `docs/guides/DEPLOYMENT.md` 안내 |

## ML

| 파일 | 용도 |
|------|------|
| [`ml/SKIN_MODEL_TRAINING_PLAN.md`](../ml/SKIN_MODEL_TRAINING_PLAN.md) | 피부 모델 학습 계획 (별도 트랙) |
