# Todayskin 전체 셋업 가이드 (초보자용)

> 프론트엔드(Expo)와 백엔드(NestJS)를 처음부터 설치하고 실행하고 테스트하는 방법을 단계별로 설명합니다.
> 백엔드 대규모 마이그레이션(Python FastAPI → NestJS) 이후 최신 구조 기준입니다.

---

## 목차

1. [프로젝트 구조 한눈에 보기](#1-프로젝트-구조-한눈에-보기)
2. [필요한 프로그램 설치 (초기 설정)](#2-필요한-프로그램-설치-초기-설정)
3. [저장소 받아오기](#3-저장소-받아오기)
4. [프론트엔드 실행하기 (Expo)](#4-프론트엔드-실행하기-expo)
5. [백엔드 환경변수 파일 만들기 (.env)](#5-백엔드-환경변수-파일-만들기-env)
6. [외부 API 키 발급받기 (선택)](#6-외부-api-키-발급받기-선택)
7. [데이터베이스 준비하기 (Docker)](#7-데이터베이스-준비하기-docker)
8. [백엔드 실행하기](#8-백엔드-실행하기)
9. [프론트엔드 + 백엔드 함께 실행하기](#9-프론트엔드--백엔드-함께-실행하기)
10. [Swagger UI에서 API 테스트하기](#10-swagger-ui에서-api-테스트하기)
11. [테스트 실행하기](#11-테스트-실행하기)
12. [Docker로 전체 한 번에 실행하기](#12-docker로-전체-한-번에-실행하기)
13. [자주 발생하는 문제와 해결법](#13-자주-발생하는-문제와-해결법)
14. [유의사항 정리](#14-유의사항-정리)

---

## 1. 프로젝트 구조 한눈에 보기

Todayskin은 **프론트엔드(Expo / React Native) + 백엔드(NestJS)** 구조입니다.

```
Todayskin/
├── app/                           ← 프론트엔드 화면 (Expo Router)
│   ├── (tabs)/                    ← 탭 화면 (홈, 추천, 트렌드 등)
│   ├── onboarding/                ← 온보딩 화면
│   ├── recommendation/            ← 추천 관련 화면
│   ├── camera-guide.tsx           ← 촬영 가이드
│   ├── diagnosis-result.tsx       ← 진단 결과 화면
│   ├── weather-detail.tsx         ← 날씨 상세 화면
│   ├── trend.tsx                  ← 트렌드 화면
│   ├── index.tsx                  ← 시작 화면
│   └── _layout.tsx                ← 전체 라우트 레이아웃
├── src/                           ← 프론트엔드 공통 코드
│   ├── api/                       ← 백엔드 API 호출 함수
│   ├── components/                ← 재사용 컴포넌트
│   ├── hooks/                      ← 커스텀 훅 (위치 정보 등)
│   ├── lib/                        ← 유틸리티 (세션 토큰 관리 등)
│   ├── theme/                      ← 색상/스타일 정의
│   └── types/                      ← TypeScript 타입 정의
├── assets/                         ← 아이콘, 이미지
├── app.json                        ← Expo 설정 (앱 이름, 권한, 슬러그 등)
├── metro.config.js                 ← Metro 번들러 설정
├── tsconfig.json                   ← 프론트엔드 TypeScript 설정
├── package.json                    ← 프론트엔드 의존성과 스크립트
├── .env.example                    ← 프론트엔드 환경변수 템플릿
│
├── backend/                        ← 백엔드 (NestJS)
│   ├── src/                        ← NestJS 소스 코드 (TS)
│   │   ├── main.ts                 ← 서버 시작점 (포트 3000)
│   │   ├── app.module.ts           ← 전체 모듈 조립
│   │   ├── config/                 ← 환경변수 검증 (Joi)
│   │   ├── prisma/                 ← DB 연결 (Prisma 7)
│   │   ├── redis/                  ← Redis 캐시 연결
│   │   ├── health/                 ← /health 엔드포인트
│   │   └── modules/                ← 비즈니스 모듈 (auth, diagnosis, weather 등)
│   ├── prisma/
│   │   ├── schema.prisma           ← DB 테이블 정의
│   │   ├── migrations/             ← DB 마이그레이션 파일
│   │   └── seed.ts                  ← 초기 더미 데이터
│   ├── test/                       ← e2e 테스트 파일
│   ├── docker-compose.yml          ← 로컬 DB (PostgreSQL + Redis)
│   ├── docker/postgres-init.sh     ← dev/test DB 자동 생성 스크립트
│   ├── Dockerfile                  ← 백엔드 컨테이너 이미지
│   ├── .env.example                ← 백엔드 환경변수 템플릿
│   └── package.json                ← 백엔드 의존성과 스크립트
│
├── .github/workflows/ci.yml        ← CI (GitHub Actions) 설정
├── CONTRIBUTING.md                 ← 협업 규칙 (브랜치/커밋/PR)
├── .gitignore                      ← Git 제외 파일 목록
└── docs/                           ← 문서 (이 파일도 여기 있음)
```

**기술 스택 요약:**

| 영역 | 기술 |
|------|------|
| 프론트엔드 | Expo SDK 54, React Native 0.81, Expo Router 6, React 19 |
| 백엔드 | NestJS 11, TypeScript, Prisma 7, PostgreSQL 16, Redis 7 |
| 인프라 | Docker, docker-compose, GitHub Actions CI |
| 외부 API | 기상청(KMA), 에어코리아, Google Gemini |
| AI 추론 | FastAPI (`backend/inference-service/`, 피부 이미지 추론만) |

---

## 2. 필요한 프로그램 설치 (초기 설정)

이 프로젝트를 실행하려면 다음 세 가지가 필요합니다. 운영체제에 맞게 설치하세요.

### 2.1 Node.js (버전 22 이상)

프론트엔드와 백엔드 모두 Node.js 위에서 동작합니다. LTS(장기 지원) 버전인 22를 권장합니다.

**설치 방법:**

- **macOS** (Homebrew): `brew install node@22`
- **Windows**: [nodejs.org](https://nodejs.org)에서 LTS 버전 installer 다운로드 후 설치
- **공통** (nvm 사용 권장 — 버전 관리가 편합니다):
  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
  # 터미널 재시작 후
  nvm install 22
  nvm use 22
  ```

**설치 확인:**

```bash
node --version    # v22.x.x 이상이 나와야 합니다
npm --version     # 10.x.x 이상
```

### 2.2 Docker (백엔드 데이터베이스 실행용)

백엔드는 PostgreSQL과 Redis를 Docker로 실행합니다. 프론트엔드만 테스트한다면 Docker 없이도 가능하지만, 백엔드 API까지 함께 쓰려면 Docker가 필요합니다.

**설치 방법:**

- **macOS**: [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/) 다운로드 후 설치
- **Windows**: [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) 다운로드 후 설치 (WSL2 필요)
- **Linux**: `sudo apt install docker.io docker-compose-plugin` 또는 [Docker Engine 설치 가이드](https://docs.docker.com/engine/install/)

**설치 확인:**

```bash
docker --version          # Docker version 27.x 이상
docker compose version    # Docker Compose v2.x 이상
```

> **주의**: Docker Desktop을 설치한 후 앱을 실행해야 `docker` 명령어가 동작합니다.
> 터미널에서 `docker info`를 입력했을 때 에러가 없으면 준비된 것입니다.

### 2.3 Git

저장소를 복제(clone)하기 위해 필요합니다. 대부분의 시스템에 이미 설치되어 있습니다.

```bash
git --version    # 아무 버전이나 상관없음
```

설치되어 있지 않다면 [git-scm.com](https://git-scm.com)에서 다운로드하세요.

### 2.4 (선택) Expo CLI와 Expo Go 앱

프론트엔드를 실기기에서 테스트하려면 스마트폰에 **Expo Go** 앱을 설치해야 합니다.

- **iOS**: App Store에서 "Expo Go" 검색 후 설치
- **Android**: Google Play Store에서 "Expo Go" 검색 후 설치

시뮬레이터/웹 브라우저에서만 테스트한다면 Expo Go 앱은 필요 없습니다.

---

## 3. 저장소 받아오기

```bash
# 저장소 복제
git clone https://github.com/jae-ho93/Todayskin.git
cd Todayskin

# 최신 main 브랜치 확인
git switch main
git pull --ff-only origin main
```

---

## 4. 프론트엔드 실행하기 (Expo)

프론트엔드는 프로젝트 루트(`Todayskin/`)에서 실행합니다. 백엔드 없이도 UI 화면 자체는 띄울 수 있지만, API 호출은 실패합니다.

### 4.1 프론트엔드 환경변수 파일 만들기

프로젝트 루트에 `.env` 파일을 만듭니다:

```bash
cp .env.example .env
```

`.env` 파일 내용:

```bash
# 시뮬레이터/웹에서 테스트할 때 (백엔드도 같은 PC에서 실행 중일 때)
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000

# 실기기(Expo Go)로 테스트할 때 — 자신의 PC LAN IP로 변경
# (아래 명령어로 확인한 IPv4 주소 사용)
#   macOS: ifconfig | grep "inet " | grep -v 127.0.0.1
#   Windows: ipconfig (IPv4 주소 확인)
# EXPO_PUBLIC_API_BASE_URL=http://192.168.0.10:3000
```

> **핵심**: 실기기(스마트폰)로 테스트할 때는 `localhost` 대신 PC의 LAN IP를 넣어야 합니다.
> 폰에서 `localhost`는 폰 자신을 가리키기 때문에 백엔드에 연결되지 않습니다.
> 시뮬레이터나 웹 브라우저에서만 테스트한다면 `localhost` 그대로 써도 됩니다.

### 4.2 의존성 설치

```bash
# 프로젝트 루트에서
npm install
```

> **참고**: `.npmrc`에 `legacy-peer-deps=true`가 설정되어 있습니다.
> Expo 패키지 간 peer dependency 충돌을 방지하기 위한 설정이므로 그대로 두세요.

### 4.3 프론트엔드 실행

```bash
# 웹 브라우저에서 실행 (http://localhost:8081)
npm run web

# Android 에뮬레이터/실기기
npm run android

# iOS 시뮬레이터/실기기 (macOS 전용)
npm run ios
```

> **처음 실행하면**: Metro 번들러가 시작되면서 브라우저나 기기에 앱이 로드됩니다.
> 처음 빌드는 1-2분 정도 걸릴 수 있습니다.

---

## 5. 백엔드 환경변수 파일 만들기 (.env)

백엔드는 환경변수(`.env` 파일)로 DB 연결 정보, JWT 비밀키, 외부 API 키 등을 읽습니다.
이 파일이 없거나 내용이 비어있으면 서버가 실행되지 않습니다.

### 5.1 템플릿 복사

```bash
cd backend
cp .env.example .env
```

### 5.2 .env 파일 편집

텍스트 편집기(VS Code, 메모장 등)로 `backend/.env`를 열고 다음 항목을 채웁니다.

**반드시 채워야 하는 항목 (최소 실행 조건):**

```bash
NODE_ENV=development
PORT=3000
ALLOWED_ORIGINS=http://localhost:8081

# ── DB ──
# Docker로 DB를 실행할 때 사용하는 기본 연결 문자열 (그대로 복사)
DATABASE_URL=postgresql://todayskin:secret@localhost:5432/todayskin_dev

# ── Redis ──
# Docker로 Redis를 실행할 때 사용하는 기본 연결 문자열 (그대로 복사)
REDIS_URL=redis://localhost:6379
WEATHER_CACHE_TTL_SECONDS=300

# ── JWT 비밀키 ──
# ⚠️ 최소 32자 이상이어야 합니다. 아래 값은 개발용 예시입니다.
# 운영 환경에서는 다른 키를 사용해야 합니다.
JWT_ACCESS_SECRET=local_dev_access_secret_at_least_32_characters_long
JWT_REFRESH_SECRET=local_dev_refresh_secret_at_least_32_characters_long
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=14d

# ── 외부 API 키 (선택, 비워도 실행 가능) ──
KMA_API_KEY=
AIRKOREA_API_KEY=
KMA_AREA_NO=
AIRKOREA_STATION_NAME=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-flash-latest

# ── 개발용 mock 설정 ──
# true로 설정하면 실제 외부 API/Gemini/AI 추론 없이 고정된 가짜 응답을 반환합니다.
# 초보자는 true로 두는 것을 권장합니다.
MOCK_GEMINI=true
MOCK_INFERENCE=true
```

> **핵심**: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
> 이 네 가지가 비어있으면 서버가 시작되지 않습니다. 위 예시 값을 그대로 복사하면 됩니다.

### 5.3 JWT 비밀키 직접 생성하기 (권장)

보안상 예시 키 대신 직접 생성한 무작위 키를 사용하는 것이 좋습니다.
터미널에서 다음 명령어를 실행하면 32자 이상의 무작위 문자열이 생성됩니다:

```bash
openssl rand -base64 48
```

출력된 문자열을 `JWT_ACCESS_SECRET` 값으로 넣고, 한 번 더 실행해서 `JWT_REFRESH_SECRET` 값으로 넣으세요.

---

## 6. 외부 API 키 발급받기 (선택)

실제 날씨 데이터와 AI 추천을 사용하려면 아래 키들이 필요합니다.
초보자 단계에서는 `MOCK_GEMINI=true`, `MOCK_INFERENCE=true`로 설정하면
키 없이도 백엔드가 정상 동작하므로, 이 단계는 건너뛰어도 됩니다.

### 6.1 기상청 API 키 (KMA_API_KEY)

[공공데이터포털](https://www.data.go.kr)에서 회원가입 후:

1. "기상청_생활기상지수 조회서비스" 신청
2. 발급받은 서비스 키를 `KMA_API_KEY`에 입력
3. `KMA_AREA_NO`에 행정구역 코드 10자리 입력 (기본값: `1111000000` = 서울 종로구)

### 6.2 에어코리아 API 키 (AIRKOREA_API_KEY)

[공공데이터포털](https://www.data.go.kr)에서:

1. "에어코리아_대기오염정보 조회 서비스" 신청
2. 발급받은 키를 `AIRKOREA_API_KEY`에 입력
3. `AIRKOREA_STATION_NAME`에 측정소명 입력 (기본값: `종로구`)

### 6.3 Google Gemini API 키 (GEMINI_API_KEY)

[Google AI Studio](https://aistudio.google.com/apikey)에서:

1. 구글 계정으로 로그인
2. "Create API Key" 클릭
3. 발급된 키를 `GEMINI_API_KEY`에 입력
4. `GEMINI_MODEL`은 `gemini-flash-latest` 권장

> 키를 입력한 경우 `MOCK_GEMINI=false`로 변경해야 실제 API를 호출합니다.
> 키를 입력하지 않은 상태에서 `MOCK_GEMINI=false`로 두면 추천 생성 API가 503 에러를 반환합니다.

---

## 7. 데이터베이스 준비하기 (Docker)

백엔드는 PostgreSQL(메인 DB)과 Redis(날씨 캐시)를 사용합니다.
Docker Compose를 사용하면 두 DB를 한 번에 실행할 수 있습니다.

### 7.1 DB 컨테이너 실행

```bash
cd backend
docker compose up -d
```

이 명령어는 다음 두 컨테이너를 백그라운드로 실행합니다:

| 컨테이너 | 포트 | 용도 |
|---------|------|------|
| `todayskin-postgres` | 5432 | PostgreSQL 16 (dev + test DB 자동 생성) |
| `todayskin-redis` | 6379 | Redis 7 (날씨 캐시) |

`postgres-init.sh` 스크립트가 자동으로 `todayskin_dev`와 `todayskin_test` 두 개의 DB를 생성합니다.

### 7.2 실행 확인

```bash
docker compose ps
```

출력에서 두 컨테이너 모두 `running` (healthy) 상태인지 확인합니다:

```
NAME                 STATUS
todayskin-postgres   Up (healthy)
todayskin-redis      Up (healthy)
```

### 7.3 백엔드 의존성 설치

```bash
npm install
```

`backend/package.json`에 정의된 모든 패키지가 `backend/node_modules/`에 설치됩니다.
프론트엔드 의존성(루트 `node_modules/`)과 별개입니다.

### 7.4 Prisma Client 생성

```bash
npm run prisma:generate
```

Prisma가 `schema.prisma`를 읽고 TypeScript용 DB 클라이언트 코드를 생성합니다.
DB 연결이 필요 없으므로 DB가 켜져 있지 않아도 실행할 수 있습니다.

### 7.5 DB 마이그레이션 (스키마 적용)

```bash
npm run prisma:migrate
```

이 명령어는 `prisma/migrations/`에 있는 SQL 파일을 `todayskin_dev` DB에 적용합니다.
DB 컨테이너가 실행 중이어야 합니다.

> **처음 실행하면** 마이그레이션 이름을 물어볼 수 있습니다. `init`이라고 입력하면 됩니다.

### 7.6 초기 데이터 입력 (seed)

```bash
npm run prisma:seed
```

전역 추천 템플릿(A등급 고정 문구)과 제품 카탈로그 더미 데이터가 DB에 들어갑니다.
이 명령어는 여러 번 실행해도 중복 데이터가 생성되지 않습니다 (upsert 방식).

### 7.7 (선택) Prisma Studio로 DB 내용 확인

```bash
npm run prisma:studio
```

브라우저에서 `http://localhost:5555`가 열리며, DB 테이블 데이터를 GUI로 조회/편집할 수 있습니다.

---

## 8. 백엔드 실행하기

### 8.1 개발 모드 실행 (핫 리로드)

```bash
cd backend
npm run start:dev
```

이 명령어는 파일을 저장할 때마다 서버가 자동으로 재시작되는 개발 모드입니다.
코드를 수정하면서 테스트할 때 사용합니다.

**성공 시 출력:**

```
[Nest] LOG [Bootstrap] Server running on http://localhost:3000
[Nest] LOG [Bootstrap] Swagger UI at http://localhost:3000/api/docs
```

### 8.2 일반 실행 (파일 변경 감지 없음)

```bash
npm run start
```

### 8.3 프로덕션 빌드 후 실행

```bash
npm run build        # dist/ 폴더에 컴파일된 JS 생성
npm run start:prod   # dist/main.js 실행
```

### 8.4 서버 확인

```bash
curl http://localhost:3000/health
```

정상 응답 예시:

```json
{"status":"ok","timestamp":"2026-08-05T12:00:00.000Z"}
```

### 8.5 서버 중지

개발 모드(`start:dev`)는 터미널에서 `Ctrl + C`를 눌러 중지합니다.

---

## 9. 프론트엔드 + 백엔드 함께 실행하기

실제 앱을 테스트하려면 프론트엔드와 백엔드를 동시에 실행해야 합니다.
터미널을 두 개 띄워서 각각 실행합니다.

### 터미널 1: 백엔드

```bash
cd backend
docker compose up -d          # DB 실행 (이미 실행 중이면 생략)
npm run start:dev             # 백엔드 실행 (http://localhost:3000)
```

### 터미널 2: 프론트엔드

```bash
# 프로젝트 루트에서
npm run web                   # 웹에서 실행 (http://localhost:8081)
# 또는
npm run android                # Android에서 실행
npm run ios                    # iOS에서 실행 (macOS 전용)
```

### 실기기(Expo Go)에서 테스트할 때

1. 루트 `.env`의 `EXPO_PUBLIC_API_BASE_URL`을 PC LAN IP로 변경
   (예: `http://192.168.0.10:3000`)
2. 백엔드 `.env`의 `ALLOWED_ORIGINS`에 프론트엔드 주소 추가
   (예: `http://localhost:8081,http://192.168.0.10:8081`)
3. 스마트폰에 Expo Go 앱 설치
4. 터미널에 표시되는 QR 코드를 폰으로 스캔

---

## 10. Swagger UI에서 API 테스트하기

백엔드가 실행 중일 때 브라우저에서 다음 주소를 엽니다:

```
http://localhost:3000/api/docs
```

Swagger UI에서 모든 API 엔드포인트를 확인하고 직접 요청을 보낼 수 있습니다.

### 인증이 필요한 API 테스트 방법

1. `/auth/register` 또는 `/auth/login`으로 계정 생성/로그인
2. 응답에서 `accessToken` 복사
3. Swagger UI 상단의 "Authorize" 버튼 클릭
4. `Bearer <복사한 accessToken>` 입력
5. 이제 인증이 필요한 API들을 호출할 수 있습니다

---

## 11. 테스트 실행하기

프론트엔드와 백엔드 각각 테스트 방법이 다릅니다.

### 11.1 프론트엔드: TypeScript 타입 검사

```bash
# 프로젝트 루트에서
npx tsc --noEmit
```

프론트엔드 코드에 타입 오류가 없는지 확인합니다. CI에서도 동일한 검사를 실행합니다.

### 11.2 백엔드: 단위 테스트 (Unit Test)

```bash
cd backend
npm test
```

Service / Guard 단위 로직을 검증합니다. DB 연결 없이 mock 객체로 동작합니다.

### 11.3 백엔드: e2e 테스트

e2e 테스트는 실제 PostgreSQL(test DB)에 연결하므로, 테스트용 환경변수를 먼저 설정해야 합니다.

**macOS / Linux:**

```bash
export DATABASE_URL=postgresql://todayskin:secret@localhost:5432/todayskin_test
export JWT_ACCESS_SECRET=test_access_secret_at_least_32_characters_long
export JWT_REFRESH_SECRET=test_refresh_secret_at_least_32_characters_long
export MOCK_INFERENCE=true
npm run test:e2e
```

**Windows (PowerShell):**

```powershell
$env:DATABASE_URL="postgresql://todayskin:secret@localhost:5432/todayskin_test"
$env:JWT_ACCESS_SECRET="test_access_secret_at_least_32_characters_long"
$env:JWT_REFRESH_SECRET="test_refresh_secret_at_least_32_characters_long"
$env:MOCK_INFERENCE="true"
npm run test:e2e
```

e2e 테스트 범위 (T13 기준):

| 테스트 파일 | 검증 내용 |
|------------|-----------|
| `auth.e2e-spec.ts` | 회원가입, 로그인, 토큰 갱신, 권한(USER/ADMIN) |
| `cors.e2e-spec.ts` | CORS 허용 오리진 검증 |
| `health.e2e-spec.ts` | `/health` 엔드포인트 응답 |
| `seed-migration.e2e-spec.ts` | 마이그레이션/seed 멱등성, 스키마 무결성 |
| `weather-persist.e2e-spec.ts` | 날씨 파서/fallback (UNAVAILABLE, 근접측정소) |
| `recommendation-product.e2e-spec.ts` | 추천 중복 생성 방지 (diagnosisId 기반) |
| `diagnosis-pattern.e2e-spec.ts` | 진단 multipart 파일 검증, 패턴 locked/ready |
| `api-contract.e2e-spec.ts` | 프론트 API response contract (camelCase) |
| `prod-mock-disabled.e2e-spec.ts` | 운영 환경 mock fallback 비활성화 검증 |

### 11.4 백엔드: 코드 품질 검사

```bash
cd backend
npm run lint     # ESLint — 코드 스타일/잠재 오류 검사 (수정하지 않음)
npm run format   # Prettier — 코드 자동 포맷팅
```

### 11.5 백엔드: 테스트 커버리지

```bash
cd backend
npm run test:cov
```

테스트가 커버하는 코드 비율을 `coverage/` 폴더에 HTML 리포트로 생성합니다.

---

## 12. Docker로 전체 한 번에 실행하기

Node.js를 로컬에 설치하지 않고 Docker만으로 백엔드와 DB를 실행할 수 있습니다.
프론트엔드는 여전히 Node.js가 필요합니다 (Expo).

### 12.1 백엔드 + DB를 Docker로 실행

```bash
cd backend
docker compose --profile backend up -d --build
```

이 명령어는 PostgreSQL, Redis, NestJS 백엔드 세 컨테이너를 모두 실행합니다.
백엔드는 `http://localhost:3000`에서 접근할 수 있습니다.

### 12.2 전체 중지

```bash
docker compose --profile backend down
```

### 12.3 DB 데이터까지 삭제 (처음부터 다시 시작하고 싶을 때)

```bash
docker compose down -v
```

> Docker 백엔드 컨테이너는 운영용 임시 시크릿을 사용하므로
> 운영 배포에는 이 compose 설정을 그대로 사용하지 말고 별도 시크릿을 주입해야 합니다.

---

## 13. 자주 발생하는 문제와 해결법

### 백엔드 "DATABASE_URL is required" 에러

`backend/.env` 파일의 `DATABASE_URL`이 비어있거나 파일 자체가 없습니다.
[5. 백엔드 환경변수 파일 만들기](#5-백엔드-환경변수-파일-만들기-env)를 다시 확인하세요.

### 백엔드 "JWT_ACCESS_SECRET must be at least 32 characters" 에러

JWT 비밀키가 32자 미만입니다. `.env`에서 `JWT_ACCESS_SECRET`과 `JWT_REFRESH_SECRET`
값을 32자 이상으로 설정하세요. [5.3절](#53-jwt-비밀키-직접-생성하기-권장) 참조.

### 백엔드 "Cannot connect to database" 에러

Docker DB 컨테이너가 실행 중이지 않습니다.

```bash
docker compose ps          # 컨테이너 상태 확인
docker compose up -d       # DB 실행
```

### 프론트엔드에서 API 호출 시 네트워크 에러

1. 백엔드가 실행 중인지 확인 (`curl http://localhost:3000/health`)
2. 루트 `.env`의 `EXPO_PUBLIC_API_BASE_URL`이 올바른지 확인
3. 실기기 테스트 시 `localhost` 대신 PC LAN IP 사용
4. 백엔드 `.env`의 `ALLOWED_ORIGINS`에 프론트엔드 주소 포함 여부 확인

### CORS 에러 (프론트엔드에서 백엔드 호출 시)

백엔드 `.env`의 `ALLOWED_ORIGINS`에 프론트엔드 주소가 포함되어 있는지 확인하세요.
Expo 웹은 `http://localhost:8081`, 실기기는 LAN IP(예: `http://192.168.0.10:8081`)를 추가해야 합니다.

```bash
ALLOWED_ORIGINS=http://localhost:8081,http://192.168.0.10:8081
```

### 포트 3000이 이미 사용 중이다 (백엔드)

다른 프로그램이 3000번 포트를 사용하고 있습니다. `.env`에서 `PORT=3001` 등으로 변경하거나,
사용 중인 프로세스를 종료하세요:

```bash
# macOS / Linux
lsof -i :3000              # 3000번 포트 사용 프로세스 확인
kill -9 <PID>              # 해당 프로세스 종료

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### 포트 8081이 이미 사용 중이다 (프론트엔드 웹)

```bash
# 다른 포트로 실행
npx expo start --web --port 8082
```

### "prisma migrate dev"에서 마이그레이션 이름을 물어볼 때

처음 마이그레이션을 실행하면 이름을 입력하라고 나옵니다. `init`이라고 입력하면 됩니다.
이후 스키마를 변경했을 때는 변경 내용을 설명하는 이름(예: `add_user_gender`)을 입력하세요.

### Docker 컨테이너가 unhealthy로 표시됨

Docker Desktop이 실행 중인지 확인하고, 컨테이너를 재시작해 보세요:

```bash
docker compose down
docker compose up -d
```

### npm install 실패 (권한 에러)

macOS / Linux에서 `sudo npm install`은 사용하지 마세요.
대신 Node.js를 nvm으로 설치하거나, npm 권한을 수정하세요:

```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc  # 또는 ~/.zshrc
source ~/.bashrc
```

### Metro 번들러 에러 (프론트엔드)

캐시가 꼬였을 때 캐시를 지우고 다시 시작합니다:

```bash
npx expo start --clear
```

### macOS에서 AppleDouble 파일 관련 에러

외장 SSD(exFAT)에서 프로젝트를 열 때 발생할 수 있습니다.
`metro.config.js`에 이미 `._` 파일을 무시하는 설정이 들어있으므로, 그대로 두면 됩니다.

---

## 14. 유의사항 정리

### 보안

- `.env` 파일은 절대 커밋하지 마세요. `.gitignore`에 이미 포함되어 있습니다.
- JWT 비밀키, 외부 API 키는 절대 공개 저장소에 올리면 안 됩니다.
- 운영 환경에서는 `MOCK_GEMINI=false`, `MOCK_INFERENCE=false`여야 합니다.
- 운영 DB 비밀번호는 Docker compose의 `secret` 대신 강력한 별도 비밀번호를 사용하세요.

### 개발 규칙

- `main` 브랜치에서 직접 작업하지 마세요. 항상 새 브랜치를 만들어 작업합니다.
- 브랜치 이름 규칙: `feature/<name>`, `fix/<name>`, `docs/<name>` 등 ([CONTRIBUTING.md](../CONTRIBUTING.md) 참조)
- 커밋 메시지는 Conventional Commits 형식 (`feat:`, `fix:`, `docs:` 등)
- 백엔드 코드 변경 후 `npm run lint`와 `npm test`를 실행하세요.
- 프론트엔드 코드 변경 후 `npx tsc --noEmit`으로 타입 검사를 하세요.

### 데이터베이스

- `docker compose down`은 데이터를 유지합니다. 데이터를 완전히 삭제하려면 `docker compose down -v`를 사용하세요.
- 개발 DB(`todayskin_dev`)와 테스트 DB(`todayskin_test`)는 분리되어 있습니다.
- 테스트 실행 전 반드시 `DATABASE_URL`을 `todayskin_test`로 변경하세요.
- `schema.prisma`와 `prisma/migrations/`는 커밋하지만, 로컬 DB 파일은 커밋하지 않습니다.

### 환경변수 정리

| 위치 | 파일 | 용도 |
|------|------|------|
| 프로젝트 루트 | `.env` | 프론트엔드: `EXPO_PUBLIC_API_BASE_URL` (백엔드 주소) |
| `backend/` | `.env` | 백엔드: DB 연결, JWT, Redis, 외부 API 키, mock 설정 |

두 `.env` 파일은 서로 다른 위치에 있고 내용도 다릅니다. 혼동하지 마세요.

### 실행 순서 요약 (처음 설정 후 매번)

```bash
# 1. DB 실행 (최초 1회 + 재부팅 후 매번)
cd backend
docker compose up -d

# 2. 백엔드 실행 (터미널 1)
npm run start:dev

# 3. 프론트엔드 실행 (터미널 2, 프로젝트 루트에서)
cd /path/to/Todayskin
npm run web
```
