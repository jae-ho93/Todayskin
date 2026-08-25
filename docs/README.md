# Documentation

Todayskin 문서 허브. 문서는 **역할별 폴더**로 분류한다 —
설계는 `architecture/`, 실행 방법은 `guides/`, 할 일과 이력은 `tasks/`, 외부 리뷰는 `reviews/`.

`tasks/` 문서는 프로젝트 종료 시점의 작업 이력과 판단 근거를 보존한 아카이브다.
활성 작업 보드로 사용하지 않으며 기록 문서에 새 작업을 추가하지 않는다.

## architecture/ — 설계 원칙

| 문서 | 용도 |
|------|------|
| [ARCHITECTURE.md](architecture/ARCHITECTURE.md) | 시스템 아키텍처 원칙 (NestJS ↔ FastAPI 경계, 금지 규칙) |

## guides/ — 실행 가이드

| 문서 | 용도 |
|------|------|
| [SETUP.md](guides/SETUP.md) | 로컬 개발 환경 (앱 + API + DB) — 처음 온 사람은 여기부터 |
| [DEPLOYMENT.md](guides/DEPLOYMENT.md) | **역사 문서** — AWS ECS 실배포 · CI/CD · 롤백 · 장애 런북 (운영 종료) |
| [DEPLOYMENT_CHECKLIST.md](guides/DEPLOYMENT_CHECKLIST.md) | **역사 문서** — 배포 시크릿·변수·리소스 입력 양식 (재구성 참고용) |

## tasks/ — 작업 보드와 이력

| 문서 | 용도 |
|------|------|
| [FRONTEND_TASKS.md](tasks/FRONTEND_TASKS.md) | 프론트 작업 이력 (완료·보류 항목 포함, 역사 문서) |
| [BACKEND_TASKS.md](tasks/BACKEND_TASKS.md) | 백엔드·배포 작업 이력 (완료·보류 항목 포함, 역사 문서) |
| [BACKEND_ARCHIVE.md](tasks/BACKEND_ARCHIVE.md) | 백엔드 완료 기록 (T/N/P 체크리스트 + 판단 근거) |
| [REFACTORING_BACKLOG.md](tasks/REFACTORING_BACKLOG.md) | 리팩토링 R1~R35 실행 기록 — **완료.** 문제 진단·해법·하지 않기로 한 것의 근거 |

## reviews/ — 리뷰와 감사

| 문서 | 용도 |
|------|------|
| ~~[ProjectReview_2026-08-13.md](reviews/ProjectReview_2026-08-13.md)~~ | ~~2026-08-13 종합 프로젝트 리뷰 (52장) — 후속 태스크 전부 반영 완료~~ |

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
