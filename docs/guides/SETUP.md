# Todayskin 로컬 셋업 가이드

이 문서는 **개발 경험이 적어도** 따라 할 수 있게 만든 로컬 실행 가이드입니다.
복잡한 설명 없이, 순서대로 명령어를 복사-붙여넣기 하면 **앱 + 백엔드 + DB**가
내 컴퓨터에서 동작합니다.

> 총 3개의 프로그램이 한꺼번에 돌아갑니다.
> | 프로그램 | 역할 | 주소 |
> |---|---|---|
> | **앱 (Expo)** | 우리가 만드는 화면 (휴대폰/시뮬레이터) | `http://localhost:8081` |
> | **백엔드 (NestJS)** | 로그인·진단·추천을 처리하는 서버 | `http://localhost:3000` |
> | **DB/캐시 (Docker)** | 데이터 저장 (PostgreSQL·Redis) | 내부 전용 |

---

## 0. 준비물 (아직 없으면 설치)

| 준비물 | 설치 방법 | 필요한 이유 |
|---|---|---|
| **Git** | https://git-scm.com/downloads | 코드를 내려받기 |
| **Node.js 22 이상** | https://nodejs.org (LTS 권장) | 앱·백엔드 실행 엔진 |
| **npm** | Node.js 설치 시 함께 설치됨 | 패키지 설치 도구 |
| **Docker Desktop** | https://www.docker.com/products/docker-desktop/ | DB·Redis·추론 서버 |
| **Xcode 시뮬레이터** (Mac) | App Store에서 Xcode 설치 후 실행 1회 | 앱을 컴퓨터에서 미리보기 |
| **Expo Go 앱** (실기기) | 앱스토어/플레이스토어에서 설치 | 휴대폰에서 앱 미리보기 |

> **확인 방법**: 터미널(맥: Spotlight에서 "터미널")을 열고 아래를 입력하면 버전이 보입니다.
> ```bash
> node -v   # v22.x.x 이상이면 OK
> npm -v    # 10.x.x 이상이면 OK
> docker --version
> ```

---

## 1. 프로젝트 받기 (1회)

```bash
git clone https://github.com/jae-ho93/Todayskin.git
cd Todayskin
npm install                 # 앱 의존성 설치 (몇 분 걸림)
cd backend && npm install   # 백엔드 의존성 설치
cd ..
```

> ⚠️ `npm install`이 끝나기 전에 다음 단계로 넘어가지 마세요.
> 에러가 나면 맨 아래 **문제 해결** 표를 확인하세요.

---

## 2. 백엔드 켜기

백엔드는 3단계입니다: **① 환경설정 → ② DB 켜기 → ③ 서버 켜기**

### 2-1. 환경설정 파일 만들기

```bash
cd backend
cp .env.example .env
```

이제 `.env` 파일을 편집해야 합니다. (에디터: VSCode 등에서 `backend/.env` 열기)

**반드시 채워야 하는 3가지** (다른 값은 그대로 두면 됩니다):

```bash
# ① DB 연결 주소 — Docker 기본값 그대로
DATABASE_URL=postgresql://todayskin:secret@localhost:5432/todayskin_dev

# ② 로그인 보안 키 2개 — 아래 터미널 명령어로 랜덤 생성
#    터미널에서 아래 명령을 각각 실행해 나온 긴 문자열을 붙여넣으세요
openssl rand -base64 48
```

`openssl rand -base64 48`을 **두 번** 실행해서 나온 값을 각각
`JWT_ACCESS_SECRET=` 와 `JWT_REFRESH_SECRET=` 뒤에 붙여넣습니다.

**개발 편의용으로 켜두면 좋은 것** (아래 값을 그대로):

```bash
# 로그인 테스트용 허용 번호 — 아무 010 번호나 넣으면 그 번호로 가입 가능
OTP_ALLOWLIST_PHONES=01000000000

# AI 추천·진단을 목업(가짜 응답)으로 대체 — 실제 API 키 없이 테스트 가능
MOCK_GEMINI=true
MOCK_INFERENCE=true
```

> **이게 무슨 뜻?** 개발 환경에서는 문자 알림이나 실제 AI 없이도
> 테스트할 수 있도록 "가짜 응답"을 켜는 것입니다. 배포할 때는 반드시 꺼야 합니다.

### 2-2. DB·Redis 켜기 (Docker)

```bash
docker compose up -d
```

정상이면 아래처럼 "Running/Started"가 보입니다:

```bash
✔ Container todayskin-postgres  Started
✔ Container todayskin-redis     Running
```

> ⚠️ "Cannot connect to the Docker daemon" 에러 = **Docker Desktop을 아직 안 켬**.
> Docker Desktop 앱을 실행하고 30초 기다린 뒤 다시 시도하세요.

### 2-3. 데이터베이스 준비 + 서버 켜기

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run start:dev
```

마지막 명령이 **실행 중인 상태로 계속 떠 있어야** 합니다 (서버가 켜져 있음).
`Found 0 errors. Watching for file changes...` 같은 문구가 보이면 성공입니다.

**확인 방법**: 브라우저에서 아래 주소를 열어보세요.
- 서버 상태 확인: http://localhost:3000/health → `{"status":"ok"}` 같은 응답
- API 문서(Swagger): http://localhost:3000/api/docs

> 이 터미널 창은 닫지 마세요. 서버가 꺼집니다. (나중에 다시 켤 땐
> `cd backend && docker compose up -d && npm run start:dev` 두 줄이면 됩니다.)

### 2-4. E2E 테스트 돌리기 (PostgreSQL 필요, N61)

백엔드 E2E(`backend/test/*.e2e-spec.ts`)는 **실제 PostgreSQL**이 필요하다.
DB가 없으면 테스트가 `PrismaClientKnownRequestError`(연결 실패)로 전부 실패하니
**코드 버그로 오해하지 말 것.** docker compose가 이미 `todayskin_test` DB를
만들어 준다 (init 스크립트).

```bash
cd backend
docker compose up -d   # PostgreSQL + Redis (todayskin_test 자동 생성)
DATABASE_URL="postgresql://todayskin:secret@localhost:5432/todayskin_test" npx prisma migrate deploy
DATABASE_URL="postgresql://todayskin:secret@localhost:5432/todayskin_test" npx prisma db seed
npm run test:e2e -- --runInBand
```

> CI(`.github/workflows/ci.yml`)도 postgres service 컨테이너로 동일한
> migrate deploy → seed → E2E를 매 PR마다 실행한다. 로컬 docker가 없으면
> **CI 통과를 검증 기준**으로 삼으면 된다.

---

## 3. 앱(Expo) 켜기

**새 터미널 창**을 열고 (기존 백엔드 창은 그대로 두기):

```bash
cd ~/Dev/Todayskin      # 실제로는 프로젝트가 있는 폴더 경로
cp .env.example .env
npm start
```

그러면 터미널에 **QR 코드**가 나타납니다.

| 실행 방법 | 어떻게 |
|---|---|
| **실기기 (권장)** | 휴대폰에 **Expo Go** 설치 → 휴대폰과 컴퓨터를 **같은 Wi-Fi**에 연결 → 카메라로 QR 스캔 |
| **iOS 시뮬레이터** | 터미널에서 `i` 키 입력 |
| **웹 브라우저** | 터미널에서 `w` 키 입력 |

> - 8081 포트가 이미 쓰이면 "Use port 8082 instead?"라고 물어봅니다 → `y` 입력
> - 앱 안에서 무언가 고치면 터미널에서 `r` 키로 **즉시 새로고침**할 수 있습니다

### 실기기에서 백엔드 연결 주소 바꾸기

실기기는 `localhost`가 "휴대폰 자신"을 가리켜서 백엔드에 연결되지 않습니다.
`app/.env`(프로젝트 루트의 `.env`)에서:

```bash
# 컴퓨터의 LAN IP로 변경 (터미널에서 ipconfig getifaddr en0 입력해 확인)
EXPO_PUBLIC_API_BASE_URL=http://192.168.0.10:3000
```

이후 `npm start`를 **다시 실행**해야 반영됩니다.

---

## 4. (선택) 실제 AI 추론 켜기

기본 설정(`MOCK_INFERENCE=true`)이면 **이 단계는 건너뛰어도 됩니다.**
실제 AI 모델로 진단을 해보려면 Docker로 추론 서버를 추가로 켭니다:

```bash
cd backend
docker compose --profile inference up -d --build
```

그리고 `backend/.env`에서:

```bash
MOCK_INFERENCE=false
```

> 첫 빌드는 몇 분 걸립니다. `todayskin-inference` 컨테이너가 Started면 끝.

---

## 5. 동작 확인 (스모크 테스트)

앱이 열리면 순서대로 확인해보세요:

1. **회원가입** — 전화번호 입력 (`OTP_ALLOWLIST_PHONES`에 넣은 번호) → "문자 인증 시작하기"
   - 개발 환경에서는 **인증코드가 `123456`으로 고정**입니다
   - 화면에 "1666-3538로 인증코드를 보내주세요" 같은 안내가 나오면 **그대로 입력/확인**해도 됩니다
2. **이름·생년월일 입력** → 가입 완료
3. **홈 화면** — 날씨·피부 점수·추천 제품 표시 확인
4. **진단** — 사진 촬영 → 동의 → 결과 화면 (부위별 점수·랜드마크)
5. **기록 탭** — 날짜별 기록, 캘린더 좌우 스와이프

테스트가 끝나면 터미널에서 **Ctrl+C**를 눌러 서버를 끌 수 있습니다
(백엔드 창과 앱 창 모두).

---

## 6. 코드 어디를 보면 되나요?

수정하고 싶은 화면/기능이 있으면 대략 이 위치를 보면 됩니다:

| 찾고 싶은 것 | 파일 위치 |
|---|---|
| 로그인/회원가입 화면 | `app/onboarding/login.tsx` · `signup.tsx` |
| 홈 (날씨·점수·추천) | `app/(tabs)/index.tsx` |
| 마이 히스토리 (캘린더) | `app/(tabs)/history.tsx` |
| 추천 제품/성분 탭 | `app/(tabs)/products.tsx` |
| 설정 탭 | `app/(tabs)/settings.tsx` |
| 공용 컴포넌트 (카드·버튼 등) | `src/components/` |
| API 호출 (서버와 주고받는 곳) | `src/api/client.ts` |
| 백엔드 API (로그인·진단·추천 로직) | `backend/src/modules/` |

**수정 → 바로 확인 방법**: 파일을 고치고 저장한 뒤, 앱 터미널에서 `r` 키를 누르면
바뀐 화면이 바로 반영됩니다. (백엔드는 `start:dev`가 자동 재시작해줍니다.)

**테스트 명령** (수정 후 잘못된 게 없는지):

```bash
# 앱 타입 오류·린트·테스트 확인 (프로젝트 루트, CI와 동일)
npm run typecheck && npm run lint && npm test

# 백엔드 테스트·검사 (backend 폴더)
cd backend && npm test && npm run lint
```

---

## 7. 문제 해결

| 증상 | 원인 / 확인 방법 |
|---|---|
| `Cannot connect to the Docker daemon` | **Docker Desktop을 안 켠 상태**. 앱 실행 후 30초 대기 → `docker compose up -d` 재시도 |
| `Port 8081 is running this app in another window` | 이전에 앱을 켠 창이 남아 있음. `y` 입력(8082 사용) 또는 이전 창 정리 |
| `source: no such file or directory` / `command not found: pip` | 터미널을 잘못된 폴더에서 실행. `cd ~/Dev/Todayskin` 후 다시 |
| 앱이 "서버에 연결할 수 없어요" | ① 백엔드 창이 켜져 있는지 ② `http://localhost:3000/health` 열리는지 ③ 실기기면 `.env`의 `EXPO_PUBLIC_API_BASE_URL`이 **LAN IP**인지 |
| `DATABASE_URL` 관련 에러 | `docker compose ps`에서 `todayskin-postgres`가 Running인지 확인 |
| 진단/추천이 403 | 사진 촬영 시 **데이터 처리 동의**를 안 한 상태 → 동의 후 재시도 |
| 진단/추천이 503 | `MOCK_INFERENCE=false`인데 추론 서버가 꺼져 있음 → true로 바꾸거나 4단계 실행 |
| 문자 인증이 안 됨 | 개발 환경은 코드 `123456` 고정. 안내된 수신 번호로 입력 |
| 사진/랜드마크가 안 보임 | 실기기면 `backend/.env`에 `DEV_STORAGE_BASE_URL=http://<LAN IP>:3000` 추가 후 백엔드 재시작 |
| 백엔드 창에 빨간 에러가 계속 나옴 | `.env`의 `DATABASE_URL`·JWT 키 3개가 빠졌는지 확인 |

---

## 참고 문서

- 전체 문서 지도: [docs/README.md](README.md)
- 백엔드 구조·원칙: [docs/architecture/ARCHITECTURE.md](../architecture/ARCHITECTURE.md)
- 실제 배포(운영): [docs/guides/DEPLOYMENT.md](DEPLOYMENT.md)
- 협업 규칙: [CONTRIBUTING.md](../../CONTRIBUTING.md)
