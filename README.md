# Todayskin

날씨·대기질과 피부 이미지 분석을 결합해 피부 상태와 스킨케어 추천을 제공하는 Expo 모바일 애플리케이션입니다.

## 구성

- 프론트엔드: Expo SDK 54, React Native, Expo Router
- 메인 백엔드: NestJS 11 Modular Monolith, Prisma 7, PostgreSQL
- AI 추론: `backend/inference-service/`의 FastAPI + MobileNetV3
- 비동기·캐시: Redis, BullMQ
- 운영: AWS ECS Fargate, RDS, S3, CloudWatch, GitHub Actions

NestJS가 인증·동의·진단·추천·날씨·데이터 영속화를 담당하고, FastAPI는 이미지 추론 결과만 반환합니다. 동의한 진단 이미지만 S3에 암호화 저장하며, 미동의 이미지는 추론 후 보관하지 않습니다.

현재 T0~T14와 N0~N8 구현이 반영되어 있습니다. 운영 전 실제 SMS OTP 게이트웨이 연결과 AWS 리소스 프로비저닝은 후속 작업입니다.

## 빠른 시작

```bash
npm install
cp .env.example .env

cd backend
npm install
cp .env.example .env
docker compose up -d
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run start:dev
```

프론트엔드는 저장소 루트에서 `npm start`, 백엔드는 기본 `http://localhost:3000`, Swagger는 개발 환경에서 `http://localhost:3000/api/docs`로 실행됩니다.

## 문서

- [전체 설치 가이드](docs/SETUP.md)
- [온보딩](docs/ONBOARDING.md)
- [백엔드 아키텍처](docs/ARCHITECTURE.md)
- [백엔드 실행과 API 개요](backend/README.md)
- [백엔드 작업 현황과 다음 과정](backend/BACKEND_TASKS.md)
- [설계 결정](backend/decision.md)
- [협업 규칙](CONTRIBUTING.md)