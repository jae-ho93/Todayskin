# Todayskin 로컬 셋업

Expo(프론트) + NestJS(백엔드) + PostgreSQL·Redis. 추론은 mock 또는 FastAPI.

**요구:** Node 22+, npm 10+, Docker Compose v2. 실제 추론만 Python 3.11.

## 1. 설치

```bash
git clone https://github.com/jae-ho93/Todayskin.git
cd Todayskin
npm install
cd backend && npm install && cd ..
```

## 2. 프론트

```bash
cp .env.example .env
# 시뮬레이터: EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
# 실기기:    EXPO_PUBLIC_API_BASE_URL=http://<PC-LAN-IP>:3000
npm start
```

## 3. 백엔드

```bash
cd backend
cp .env.example .env
# 최소: DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
# 로컬 편의: OTP_ALLOWLIST_PHONES, MOCK_GEMINI=true, MOCK_INFERENCE=true

docker compose up -d          # postgres:5432, redis:6379
npm run prisma:generate && npm run prisma:migrate && npm run prisma:seed
npm run start:dev             # http://localhost:3000  ·  Swagger /api/docs
```

JWT: `openssl rand -base64 48` 두 번. 변수 전체는 `backend/.env.example`.

## 4. 추론 (선택)

`MOCK_INFERENCE=true`면 FastAPI 불필요.

```bash
# Docker
docker compose --profile inference up -d --build
# .env: MOCK_INFERENCE=false, INFERENCE_SERVICE_URL=http://127.0.0.1:8000

# 또는 전부 컨테이너
docker compose --profile backend up -d --build
```

## 5. 스모크

1. `POST /otp/send` (allowlist 번호) → `POST /otp/verify` (개발 코드 `123456`)
2. `POST /auth/signup` 또는 `/auth/login` → Bearer 토큰
3. `POST /consents` — 진단 전 `diagnosis_image_processing` 필수

```bash
cd backend && npm test && npm run lint
# 루트: npx tsc --noEmit
```

## 문제 빠른 확인

| 증상 | 확인 |
|------|------|
| API 연결 실패 | `GET /health`, 실기기 LAN IP, `ALLOWED_ORIGINS` |
| DB 실패 | `docker compose ps`, `DATABASE_URL` host |
| 진단 403 | processing 동의 |
| 진단/추천 503 | `MOCK_INFERENCE` / `MOCK_GEMINI` 또는 실제 URL·키 |

운영 배포: `backend/docker/DEPLOYMENT.md`. secret·mock flag·얼굴 이미지 커밋 금지.
