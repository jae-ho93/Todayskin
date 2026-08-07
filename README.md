# Todayskin

날씨·대기질과 피부 이미지 분석을 결합해 피부 상태와 스킨케어 추천을 제공하는 Expo 모바일 애플리케이션.

<p align="center">
  <a href="https://docs.expo.dev/versions/v54.0.0/"><img src="https://img.shields.io/badge/Expo-SDK%2054-000020?style=for-the-badge&logo=expo&logoColor=white" alt="Expo SDK 54"></a>
  <a href="https://reactnative.dev/"><img src="https://img.shields.io/badge/React%20Native-Expo%20Router-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React Native"></a>
  <a href="https://nestjs.com/"><img src="https://img.shields.io/badge/NestJS-11-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS 11"></a>
  <a href="https://www.prisma.io/"><img src="https://img.shields.io/badge/Prisma-7-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma 7"></a>
  <a href="https://www.postgresql.org/"><img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"></a>
</p>
<p align="center">
  <a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/FastAPI-MobileNetV3-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI inference"></a>
  <a href="https://redis.io/"><img src="https://img.shields.io/badge/Redis-cache-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis"></a>
  <a href="https://docs.bullmq.io/"><img src="https://img.shields.io/badge/BullMQ-queue-e6484c?style=for-the-badge" alt="BullMQ"></a>
  <a href="https://aws.amazon.com/ko/fargate/"><img src="https://img.shields.io/badge/AWS-ECS%20Fargate-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white" alt="AWS ECS Fargate"></a>
  <a href="https://github.com/features/actions"><img src="https://img.shields.io/badge/GitHub%20Actions-CI%2FCD-2088FF?style=for-the-badge&logo=githubactions&logoColor=white" alt="GitHub Actions"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/T0--T14-완료-38A169?style=flat-square" alt="T0-T14 done">
  <img src="https://img.shields.io/badge/N0--N8-완료-38A169?style=flat-square" alt="N0-N8 done">
  <img src="https://img.shields.io/badge/N9%2B-운영%20공개%20전%20후속작업-D69E2E?style=flat-square" alt="N9+ pending">
</p>

---

## 개요

**NestJS가 인증·동의·진단·추천·날씨·데이터 영속화**를 담당하고, **FastAPI는 이미지 추론 결과만 반환**한다. 동의한 진단 이미지만 S3에 암호화 저장하며, 미동의 이미지는 추론 후 즉시 삭제한다.

```mermaid
flowchart LR
    APP["📱 Expo App<br/>React Native · Expo Router"] -->|REST| API["NestJS 11<br/>Modular Monolith (BFF)"]
    API --> PG[("PostgreSQL<br/>Prisma 7")]
    API --> REDIS[("Redis<br/>날씨 캐시 · BullMQ broker")]
    API -->|추론 요청| AI["FastAPI<br/>MobileNetV3 추론 서버"]
    API -->|동의 시만| S3[("S3<br/>암호화 저장")]
    REDIS --> QUEUE["BullMQ<br/>추천 · 패턴 · 알림"]
    subgraph AWS["AWS ECS Fargate"]
        API
        AI
    end
```

## 구성

| 레이어 | 스택 | 역할 |
|---|---|---|
| 프론트엔드 | Expo SDK 54 · React Native · Expo Router | 온보딩, 촬영, 진단 결과, 추천, 히스토리 UI |
| 메인 백엔드 | NestJS 11 Modular Monolith · Prisma 7 · PostgreSQL | 인증·OTP·동의·진단·추천·날씨·데이터 영속화 |
| AI 추론 | `backend/inference-service/` FastAPI + MobileNetV3 | 이미지 → 부위별 등급/수치 추론 결과만 반환 |
| 비동기·캐시 | Redis · BullMQ | 날씨 캐시, 추천/패턴/알림 비동기 처리 |
| 운영 | AWS ECS Fargate · RDS · S3 · CloudWatch · GitHub Actions | CI → ECR → Fargate 배포 |

## 진행 상태

- ✅ **T0~T14** — 초기 구조(NestJS/Prisma/인증/진단/추천 등 MVP 기능) 완료
- ✅ **N0~N8** — 운영 보안, 구조화 로깅, S3+동의 연동, BullMQ, ECS 배포, Soft Delete, 레거시 FastAPI 정리, 히스토리 캘린더까지 완료
- ⏳ **N9 이후** — 운영 공개 전 후속 작업. 특히:
  - 실제 SMS OTP 게이트웨이 연결 (현재는 개발용 Mock OTP만 동작)
  - AWS 운영 리소스 프로비저닝 및 첫 배포

## 문서

- [전체 설치 가이드](docs/SETUP.md)
- [온보딩](docs/ONBOARDING.md)
- [백엔드 아키텍처](docs/ARCHITECTURE.md)
- [백엔드 실행과 API 개요](backend/README.md)
- [백엔드 작업 현황과 다음 과정](backend/BACKEND_TASKS.md)
- [설계 결정](backend/decision.md)
- [협업 규칙](CONTRIBUTING.md)

## 관련 저장소

- Todayskin Skin-AI (준비 중) — `backend/inference-service/`가 서빙하는 피부 진단 모델(백본 비교실험, 학습 파이프라인) 전용 저장소

---

<p align="center"><sub>날씨 × 피부 데이터를 결합한 개인 맞춤 스킨케어 추천 서비스</sub></p>
