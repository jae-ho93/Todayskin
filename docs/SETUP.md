# Todayskin 전체 셋업 가이드

Expo 프론트엔드, NestJS 백엔드, PostgreSQL·Redis, 선택적 FastAPI 추론 서버를 로컬에서 실행하는 방법입니다.

## 1. 요구 사항

- Node.js 22 LTS 이상
- npm 10 이상
- Docker Engine 또는 Docker Desktop + Compose v2
- Git
- 실제 추론 서버를 로컬 Python으로 실행할 때만 Python 3.11

```bash
node --version
docker compose version
git --version
```

## 2. 저장소 구조

```text
Todayskin/
├─ app/                         # Expo Router 화면
├─ src/                         # 프론트 API, 컴포넌트, 훅, 타입, 테마
├─ assets/
├─ backend/
│  ├─ src/                      # NestJS 메인 백엔드
│  ├─ prisma/                   # Prisma schema, migrations, seed
│  ├─ test/                     # E2E 테스트
│  ├─ inference-service/        # FastAPI + MobileNetV3 추론
│  ├─ docker/                   # DB 초기화, ECS 정의, 배포 문서
│  └─ docker-compose.yml
├─ docs/
└─ .github/workflows/           # CI와 ECS 배포
```

NestJS가 인증·동의·비즈니스 로직·DB를 담당하고, FastAPI는 이미지 추론 결과만 반환합니다.

## 3. 저장소와 의존성

```bash
git clone https://github.com/jae-ho93/Todayskin.git
cd Todayskin
npm install

cd backend
npm install
cd ..
```

프론트와 백엔드는 각각 독립된 `package.json`과 `node_modules`를 사용합니다.

## 4. 프론트엔드 설정과 실행

루트 환경변수를 준비합니다.

```bash
cp .env.example .env
```

`.env`의 주소를 실행 환경에 맞춥니다.

```bash
# 웹/같은 PC의 시뮬레이터
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000

# 실기기
EXPO_PUBLIC_API_BASE_URL=http://<개발-PC-LAN-IP>:3000
```

실기기에서 `localhost`는 휴대폰 자신을 가리키므로 PC의 LAN IP가 필요합니다.

```bash
npm start
# 또는
npm run web
npm run android
npm run ios
```

## 5. 백엔드 환경변수

```bash
cd backend
cp .env.example .env
```

전체 변수와 설명은 `backend/.env.example`을 기준으로 합니다. 로컬 최소 예시는 다음과 같습니다.

```bash
NODE_ENV=development
PORT=3000
ALLOWED_ORIGINS=http://localhost:8081

DATABASE_URL=postgresql://todayskin:secret@localhost:5432/todayskin_dev
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=<32자 이상의 개발용 무작위 값>
JWT_REFRESH_SECRET=<32자 이상의 다른 무작위 값>

OTP_ALLOWLIST_PHONES=01012345678
MOCK_GEMINI=true
MOCK_INFERENCE=true
JOB_DISPATCHER=auto
```

JWT secret은 각각 `openssl rand -base64 48`로 만들 수 있습니다.

- `REDIS_URL`은 애플리케이션 시작의 필수값은 아닙니다. 없으면 날씨 캐시는 fallback하고 job은 Inline dispatcher를 사용합니다.
- `MOCK_GEMINI`, `MOCK_INFERENCE`는 개발·테스트 전용이며 운영에서는 사용할 수 없습니다.
- 개발·테스트에서 `S3_BUCKET`이 비어 있으면 Memory image store를 사용합니다.
- 운영에서는 `S3_BUCKET`이 필수이고 누락 시 서버가 시작되지 않습니다.
- 운영 SMS OTP 게이트웨이(알리고) 호출은 구현되어 있으며, `SMS_API_KEY`·`SMS_USER_ID`·`SMS_SENDER`·`SMS_ENDPOINT`가 필요합니다. 개발·테스트는 `OTP_ALLOWLIST_PHONES`의 mock OTP를 사용합니다.

## 6. PostgreSQL과 Redis 실행

```bash
cd backend
docker compose up -d
docker compose ps
```

기본 profile은 다음 두 컨테이너를 실행합니다.

| 서비스 | 포트 | 용도 |
|---|---:|---|
| PostgreSQL 16 | 5432 | `todayskin_dev`, `todayskin_test` |
| Redis 7 | 6379 | 날씨 캐시, BullMQ |

`docker/postgres-init.sh`는 볼륨을 처음 만들 때 test DB를 함께 생성합니다.

## 7. Prisma 준비

```bash
cd backend
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

- `schema.prisma`와 `prisma/migrations/`가 스키마 기준입니다.
- seed는 추천 템플릿과 제품을 upsert하므로 반복 실행할 수 있습니다.
- 공유된 migration은 수정하거나 삭제하지 않습니다.

DB를 GUI로 확인하려면 `npm run prisma:studio`를 사용합니다.

## 8. NestJS 실행

```bash
cd backend
npm run start:dev
```

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/api/docs` (운영에서는 비활성)
- Health: `GET /health`
- Liveness: `GET /health/live`
- Readiness: `GET /health/ready`

프로덕션 형태의 로컬 실행은 다음과 같습니다.

```bash
npm run build
npm run start:prod
```

## 9. 추론 서버 실행

개발에서 `MOCK_INFERENCE=true`면 FastAPI 없이 고정 추론 응답을 사용합니다. 실제 로컬 추론은 다음 중 하나로 실행합니다.

```bash
# Docker inference만 실행하고 NestJS는 watch로 실행
docker compose --profile inference up -d --build

# .env
MOCK_INFERENCE=false
INFERENCE_SERVICE_URL=http://127.0.0.1:8000
```

또는 Python으로 직접 실행합니다.

```bash
cd backend/inference-service
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python3 -m uvicorn main:app --host 127.0.0.1 --port 8000
```

`curl http://127.0.0.1:8000/health`로 확인합니다.

## 10. Docker 통합 실행

```bash
cd backend
docker compose --profile backend up -d --build
```

PostgreSQL, Redis, FastAPI inference-service, NestJS를 함께 실행합니다. 통합 profile은 실제 inference 컨테이너를 사용하고 로컬 migration을 시작 시 적용합니다.

```bash
docker compose --profile backend down
```

볼륨까지 지우는 `docker compose down -v`는 로컬 DB 데이터를 모두 삭제하므로 초기화가 필요한 경우에만 사용합니다.

## 11. 인증·동의 흐름 확인

현재 엔드포인트는 `/auth/register`가 아니라 `/auth/signup`입니다.

1. allowlist 번호로 `POST /otp/send`
2. 개발 고정 코드 `123456`으로 `POST /otp/verify`
3. `POST /auth/signup` 또는 `/auth/login`
4. 응답의 Access Token을 `Authorization: Bearer <token>`으로 사용
5. 진단 전 `POST /consents`로 `diagnosis_image_processing`에 동의
6. 이미지·landmarks 저장을 원할 때만 `diagnosis_image_storage`에 동의

Swagger의 Authorize에는 Bearer token을 입력합니다.

## 12. 테스트와 정적 검사

```bash
cd backend
npm test
npm run lint
npm run build
```

E2E는 실제 test DB를 사용하며 순차 실행됩니다.

```bash
DATABASE_URL=postgresql://todayskin:secret@localhost:5432/todayskin_test \
JWT_ACCESS_SECRET=test_access_secret_at_least_32_characters_long \
JWT_REFRESH_SECRET=test_refresh_secret_at_least_32_characters_long \
MOCK_INFERENCE=true \
npm run test:e2e
```

프론트 TypeScript 검사는 저장소 루트에서 실행합니다.

```bash
npx tsc --noEmit
```

## 13. 자주 확인할 문제

### API 연결 실패

- 백엔드 `GET /health`가 응답하는지 확인합니다.
- 실기기는 루트 `.env`에 PC LAN IP를 사용합니다.
- Expo 웹 origin이 `ALLOWED_ORIGINS`에 포함되는지 확인합니다.

### DB 연결 실패

```bash
cd backend
docker compose ps
docker compose up -d
```

`DATABASE_URL`의 host는 로컬 NestJS 실행이면 `localhost`, Compose의 backend 컨테이너 안에서는 `postgres`입니다.

### 진단이 403

`diagnosis_image_processing`의 현재 version 동의가 필요합니다. 저장 동의는 선택입니다.

### 진단이 503

`MOCK_INFERENCE=true`를 사용하거나 `INFERENCE_SERVICE_URL`의 FastAPI가 실행 중인지 확인합니다.

### 추천이 503

개발에서는 `MOCK_GEMINI=true`를 사용하거나 실제 `GEMINI_API_KEY`를 설정합니다.

### OTP 발송 실패

개발·테스트는 전화번호가 `OTP_ALLOWLIST_PHONES`에 있어야 mock OTP를 사용할 수 있습니다. 운영 `SmsOtpProvider`는 알리고 게이트웨이 설정(`SMS_API_KEY` 등)이 누락되면 fail-closed로 503을 반환하며, 설정이 정상이면 실제 SMS를 발송합니다. 번호별 일일 발송 한도(`OTP_DAILY_LIMIT_PER_PHONE`)와 재전송 쿨다운도 적용됩니다.

## 14. 운영 주의사항

- `.env`, token, 개인정보, 얼굴 이미지, 로컬 DB를 커밋하지 않습니다.
- 운영 mock flag는 모두 false입니다.
- 운영은 RDS, Redis, S3, inference-service와 실제 SMS gateway(알리고)를 준비합니다.
- 운영 migration은 앱 시작이 아니라 승인된 단일 release task에서 수행합니다.
- 자세한 절차는 `backend/docker/DEPLOYMENT.md`를 따릅니다.
