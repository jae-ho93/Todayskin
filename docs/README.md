# Documentation

Todayskin 문서 허브. 코드 옆에 두지 않고 **역할별로 여기(`docs/`)에 모은다.**

| 문서 | 용도 |
|------|------|
| [SETUP.md](SETUP.md) | 로컬 개발 (앱 + API + DB) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 백엔드 아키텍처 원칙 (NestJS ↔ FastAPI) |
| [DEPLOYMENT.md](DEPLOYMENT.md) | AWS ECS 실배포 · CI/CD · 롤백 |
| [BACKEND_TASKS.md](BACKEND_TASKS.md) | 백엔드 활성 작업 보드 · Open(N16·OCTOMO) |
| [BACKEND_ARCHIVE.md](BACKEND_ARCHIVE.md) | 백엔드 완료 이력 (T/P/N 전환 기록) |
| [REFACTORING_BACKLOG.md](REFACTORING_BACKLOG.md) | 리팩토링 제안 R1~R35 (승인 전 금지) |
| [FRONTEND_TASKS.md](FRONTEND_TASKS.md) | 프론트 Task 보드 · 작업 절차·계약 통합 관리 |

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
| [`backend/docker/DEPLOYMENT.md`](../backend/docker/DEPLOYMENT.md) | → `docs/DEPLOYMENT.md` 안내 |

## ML

| 파일 | 용도 |
|------|------|
| [`ml/SKIN_MODEL_TRAINING_PLAN.md`](../ml/SKIN_MODEL_TRAINING_PLAN.md) | 피부 모델 학습 계획 (별도 트랙) |
