# Documentation

Todayskin 문서 허브. 코드 옆에 두지 않고 **역할별로 여기(`docs/`)에 모은다.**

**지금 할 일을 찾는다면 작업 보드**(`*_TASKS.md`)를, **왜 그렇게 했는지를 찾는다면 기록 문서**
(`*_ARCHIVE.md`, `REFACTORING_BACKLOG.md`)를 본다. 기록 문서에 새 작업을 적지 않는다.

| 문서 | 용도 |
|------|------|
| [SETUP.md](SETUP.md) | 로컬 개발 (앱 + API + DB) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 백엔드 아키텍처 원칙 (NestJS ↔ FastAPI) |
| [DEPLOYMENT.md](DEPLOYMENT.md) | AWS ECS 실배포 · CI/CD · 롤백 |
| [BACKEND_TASKS.md](BACKEND_TASKS.md) | **백엔드·배포 작업 보드** — Open: N39~N41(실기기 버그), N16(첫 배포·OIDC), N35~N37(배포 후속), OCTOMO 키 |
| [FRONTEND_TASKS.md](FRONTEND_TASKS.md) | **프론트 작업 보드** — Open: F64(등급 라벨), F65(랜드마크 렌더링). 작업 절차·계약 포함 |
| [BACKEND_ARCHIVE.md](BACKEND_ARCHIVE.md) | 백엔드 완료 기록 (T/N/P 체크리스트) |
| [REFACTORING_BACKLOG.md](REFACTORING_BACKLOG.md) | 리팩토링 R1~R35 실행 기록 — **완료.** 문제 진단·해법·하지 않기로 한 것의 근거 |

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
