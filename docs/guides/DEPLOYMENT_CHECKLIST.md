# 배포 시크릿·변수 입력 양식 (N16 진행용)

> 이 문서는 배포 당일에 **값을 채워 넣는 양식**이다. 절차·원칙은
> [`DEPLOYMENT.md`](DEPLOYMENT.md)가 기준이고, 여기 값들은 전부 `backend/docker/ecs/*.json`
> task definition 템플릿과 `.github/workflows/deploy-ecs.yml`에서 추출한 **정확한 이름**이다.
> 채운 뒤 task definition의 `ACCOUNT_ID` 치환값과 대조한다.

## 0. 준비 순서

1. AWS 계정/자격 증명 준비 → 2. 이 양식 채우기 → 3. Secrets Manager·GitHub에 입력 →
   4. 인프라 프로비저닝(N16) → 5. `main` push → CI → 배포 승인 → 6. 스모크 검증

### ⚠️ 네이밍 규칙 (실배포에서 대문자 T로 인한 장애 확인 — 2026-08-16)

**콘솔에서 AWS 리소스를 만들 때 이름은 전부 소문자 `todayskin-*`로 통일한다.**
대문자(`Todayskin`)는 VPC·보안 그룹 등 **표시용 태그에만** 허용되고,
기능적으로 참조되는 이름(DB 사용자·DB 이름·버킷·클러스터·서비스·시크릿·IAM·파라미터 그룹)은
**전부 소문자**여야 한다. 특히:

- **RDS 마스터 사용자 이름**: 소문자 `todayskin` — PostgreSQL은 대소문자를 구분해서
  `Todayskin`으로 만들면 `DATABASE_URL`과 불일치 → P1000 인증 실패
- **ECR 리포지토리 / S3 버킷 / ALB**: AWS가 소문자만 허용 (대문자 불가)
- **ECS 클러스터·서비스·task family**: GitHub 변수와 소문자로 일치시킨다
- **RDS 엔진 버전**: 프로젝트 기준 **PostgreSQL 16** 고정 (최신 18 선택 금지)

---

## 1. AWS Secrets Manager 입력 양식

**이름 규칙**: `todayskin/prod/<KEY>` (모두 `ap-northeast-2`, task definition ARN은
`arn:aws:secretsmanager:ap-northeast-2:ACCOUNT_ID:secret:todayskin/prod/<KEY>`)

| # | 시크릿 이름 | 필요한 곳 | 필수 | 값 (작성칸) | 확인 |
|---|---|---|---|---|---|
| 1 | `todayskin/prod/DATABASE_URL` | backend·worker·migrate | ✅ | `postgresql://...` | ☐ |
| 2 | `todayskin/prod/REDIS_URL` | backend·worker | ✅ | `redis://...` | ☐ |
| 3 | `todayskin/prod/JWT_ACCESS_SECRET` | backend·worker | ✅ | 32자 이상 랜덤 | ☐ |
| 4 | `todayskin/prod/JWT_REFRESH_SECRET` | backend·worker | ✅ | 32자 이상 랜덤 | ☐ |
| 5 | `todayskin/prod/KMA_API_KEY` | backend·worker | ✅ | 기상청 **동네예보(초단기실황)** 키 — 온도/습도 | ☐ |
| 5-1 | `todayskin/prod/KMA_UV_API_KEY` | backend·worker | ⬜ 선택 | 기상청 **생활기상지수(자외선)** 키 — 비우면 KMA_API_KEY로 폴백 (data.go.kr은 API별 키 발급) | ☐ |
| 6 | `todayskin/prod/AIRKOREA_API_KEY` | backend·worker | ✅ | 에어코리아 키 | ☐ |
| 7 | `todayskin/prod/OPENAI_API_KEY` | backend·worker | ✅ | OpenAI 키 | ☐ |
| 8 | `todayskin/prod/OCTOMO_API_KEY` | backend·worker | ✅ | octomo.octoverse.kr 키 (없으면 가입/로그인 차단) | ☐ |
| 9 | `todayskin/prod/ALLOWED_ORIGINS` | backend·worker | ✅ | 앱 웹 오리진 (없으면 빈 값) | ☐ |
| 10 | `todayskin/prod/S3_BUCKET` | backend·worker | ✅ | 운영 S3 버킷명 (없으면 부팅 거부) | ☐ |
| 11 | `todayskin/prod/INFERENCE_SERVICE_URL` | backend·worker | ✅ | `http://inference.todayskin.local:8000` — **Cloud Map DNS (고정)** — 배포 후 IP 갱신 불필요 | ☐ |
| 12 | `todayskin/prod/INFERENCE_SHARED_SECRET` | backend·worker·inference | ✅ | backend/inference 동일 값 (랜덤) | ☐ |
| 12-1 | `todayskin/prod/GOOGLE_CLIENT_ID` | backend | ⬜ 선택 | Google id_token aud 검증용 — 플랫폼별(웹/iOS/Android) 클라이언트를 쓰면 **쉼표 구분 목록**으로 등록 (N46 확장, 2026-08-17) | ☐ |
| 12-2 | `todayskin/prod/KAKAO_APP_ID` | backend | ⬜ 선택 | 카카오 앱 ID(숫자) — 타 앱 발급 토큰 차단. 프론트 키(`EXPO_PUBLIC_KAKAO_REST_API_KEY`)와 함께 발급 | ☐ |
| 12-3 | ~~`todayskin/prod/APPLE_BUNDLE_ID`~~ | backend | — | iOS 전용(유료 계정 필요) — Android 데모에선 불필요. iOS 진행 시 추가 | ☐ |
| 13 | ~~`todayskin/prod/SENTRY_DSN`~~ | — | — | **task definition `secrets[]`에서 제거됨 (2026-08-16, PR #227)** — registry가 `optional`이라 없으면 기본값 → Sentry 비활성. **시크릿 생성 불필요** | ☐ |

> ⚠️ 참고: Secrets Manager는 빈 문자열 저장이 불가하고, `"0"`을 넣으면 env 검증(`must be a valid uri`)에서
> 부팅 실패한다. 그래서 **SENTRY_DSN은 task definition에서 제거하는 것이 정답**이다(아래 6-4번).

**비밀이 아닌 값은 task definition `environment`에 이미 하드코딩** — 입력 불필요:
`NODE_ENV=production` · `PORT` · `AWS_REGION=ap-northeast-2` · `RUN_MIGRATIONS_ON_START=false` ·
`MOCK_OPENAI=false` · `MOCK_INFERENCE=false` · `JOB_DISPATCHER` · `LOG_LEVEL=info` ·
`OCTOMO_ENDPOINT` · `OCTOMO_RECIPIENT_NUMBER=1666-3538` · (inference) `INFERENCE_CONCURRENCY=1`

---

## 2. GitHub 입력 양식 (Deploy ECS Fargate 워크플로우)

**Secret** (Repository):

| 이름 | 값 (작성칸) | 확인 |
|---|---|---|
| `AWS_ROLE_ARN` | OIDC로 assume할 IAM role ARN | ☐ |

**Variables** (Repository 또는 `production` Environment — 기본값이 있는 항목은 그대로면 생략):

| 이름 | 기본값 | 값 (작성칸) | 확인 |
|---|---|---|---|
| `AWS_REGION` | `ap-northeast-2` | | ☐ |
| `ECR_BACKEND_REPO` | `todayskin-backend` | | ☐ |
| `ECR_INFERENCE_REPO` | `todayskin-inference` | | ☐ |
| `ECS_CLUSTER` | — | **필수** | ☐ |
| `ECS_SERVICE_BACKEND` | — | **필수** | ☐ |
| `ECS_SERVICE_INFERENCE` | — | **필수** | ☐ |
| `ECS_SERVICE_WORKER` | 비움 = 워커 rollout 스킵 | (선택) | ☐ |
| `ECS_MIGRATE_TASK_FAMILY` | `todayskin-migrate` | | ☐ |
| `ECS_SUBNETS` | — | **필수** (쉼표 구분 subnet id) | ☐ |
| `ECS_SECURITY_GROUPS` | — | **필수** (쉼표 구분 sg id — backend/inference 각각) | ☐ |
| `ECS_ASSIGN_PUBLIC_IP` | `ENABLED` | (NAT 전환 시 `DISABLED`) | ☐ |
| `RDS_INSTANCE_ID` | 비움 = 스냅샷 스킵 | (선택) | ☐ |

**Environment**: `production` — required reviewer 1명 이상 (승인 게이트).

---

## 3. 인프라 리소스 입력 양식 (N16 프로비저닝)

| 리소스 | 이름 규칙/필수값 | 값 (작성칸) | 확인 |
|---|---|---|---|
| VPC / public subnet ×2 | 배포용 | | ☐ |
| Security Group — backend | ALB(`:3000`) 인그레스 + IGW 아웃바운드 | | ☐ |
| Security Group — inference | **backend SG로만** `:8000` 인그레스 (SG reference) | | ☐ |
| ECR 2개 | `todayskin-backend` · `todayskin-inference` | | ☐ |
| RDS PostgreSQL | 퍼블릭 접근 OFF · 자동 백업 ON | | ☐ |
| ElastiCache Redis | 백엔드가 접근 가능한 VPC 내 · 파라미터 그룹 `todayskin-redis-pg`(`maxmemory-policy=noeviction`, BullMQ) | | ☐ |
| S3 | SSE-S3(또는 KMS) — 동의 이미지 | | ☐ |
| CloudWatch Logs | `/ecs/todayskin-backend` · `-worker` · `-inference` · `-migrate` | | ☐ |
| IAM — OIDC role | `AWS_ROLE_ARN` (ECR push·ECS update·RDS snapshot) | | ☐ |
| IAM — execution role | ECR pull · Secrets Manager read · Logs | | ☐ |
| IAM — task role (backend) | S3 read/write · (선택) KMS | | ☐ |
| IAM — task role (inference) | 최소 권한 (로그만) | | ☐ |

---

## 4. 로컬 `.env` 입력 양식 (개발용 — 커밋 금지)

**`backend/.env`** (`.env.example` 복사 후):

| 키 | 값 (작성칸) |
|---|---|
| `DATABASE_URL` | `postgresql://todayskin:secret@localhost:5432/todayskin_dev` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | 32자 이상 |
| `OCTOMO_API_KEY` | **(실기기 MO 인증 테스트 시)** octomo 키 |
| `KMA_API_KEY` / `AIRKOREA_API_KEY` | (선택) 실측 날씨 테스트 시 |
| `OPENAI_API_KEY` | (선택) `MOCK_OPENAI=false` 실측 시 |
| `S3_BUCKET` | 비우면 개발용 memory store |

**루트 `.env`** (Expo — `.env.example` 복사 후):

| 키 | 값 (작성칸) |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | 실기기 테스트 시 `http://<PC LAN IP>:3000` |
| `EXPO_PUBLIC_KAKAO_REST_API_KEY` | 카카오 앱 키 |
| `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` | 구글 OAuth 클라이언트 ID |

---

## 5. 채우고 나서 검증 (배포 전)

- [ ] `backend/src/config/task-definition-env.spec.ts`가 CI에서 통과하는지 — `environment ∪ secrets`
      키 집합이 `getRequiredEnvKeys('production')`과 일치하는지 대조
- [ ] `backend/docker/ecs/*.json`의 `ACCOUNT_ID` 자리표시자가 실제 계정 ID로 치환되는지
      (워크플로가 ECR registry에서 추출해 자동 치환 — task definition 등록 로그로 확인)
- [ ] Secrets Manager 값 입력 후 **프로덕션 부팅 스모크**: `/health/live` 200 · `/health/ready` 200
      (dependencies 전부 up — `octomo`·`database`·`inference`·`migrations` 포함)
- [ ] 실기기 스모크: OTP 가입 → 측정 → 결과 1회

---

## 6. 2026-08-16 실배포 교훈 (N16 완료 후 반영)

실제 배포 과정에서 확인해 **양식에 반영한 사항**:

1. **RDS 마스터 사용자 이름은 대소문자 구분** — 콘솔에서 `Todayskin`(대문자)으로 만들면
   `DATABASE_URL`도 같은 대소문자를 써야 한다 (`todayskin` ≠ `Todayskin`, P1000 인증 실패).
   **PG16 재생성 시 소문자 `todayskin`으로 통일** (로컬 docker-compose와 동일).
2. **RDS PostgreSQL 버전은 프로젝트 기준(16)으로 생성** — 콘솔 최신(18.x)을 고르면
   `rds.force_ssl=1` 기본값 등 동작이 달라진다. 엔진 선택 화면에서 **PostgreSQL 16.x**를 직접 고른다.
3. **`rds.force_ssl`** — RDS PG16+는 SSL 강제가 기본. 로컬(PG16-alpine)은 SSL 미강제라
   프로덕션에서만 `no pg_hba.conf entry ... no encryption` 오류가 난다. 해결: 커스텀 파라미터 그룹
   (`rds.force_ssl=0`)을 만들어 적용(재부팅 필요)하거나, DATABASE_URL에 `sslmode=require&sslaccept=accept_invalid_certs`.
   프로젝트는 VPC 내부 통신이므로 `force_ssl=0` + 평문 URL을 기본으로 한다.
4. **SENTRY_DSN 빈 값은 Secrets Manager에 저장 불가** (최소 1자) — `""` 대신 `"0"`을 넣으면
   env 검증(`must be a valid uri`)에서 부팅 실패. **SENTRY_DSN을 task definition `secrets[]`에서 제거**
   하는 것이 정답 (registry가 `optional`이라 없으면 기본값 → Sentry 비활성).
5. **시드(제품 카탈로그)는 migrate와 별도** — `prisma migrate deploy`는 스키마만. 운영 데이터는
   `npx tsx prisma/seed.ts`가 필요. 프로덕션 이미지엔 tsx가 없으므로 Fargate 태스크로
   `npx --yes tsx prisma/seed.ts` 실행(migrate task def에 command override).
6. ~~**INFERENCE_SERVICE_URL은 배포마다 갱신 필요**~~ — **해결 (2026-08-16): Cloud Map 서비스 디스커버리 적용.**
   네임스페이스 `todayskin.local` + 서비스 `inference`(A 레코드)를 만들고 ECS inference 서비스에
   `serviceRegistries`를 연결했다. 시크릿 값은 고정 `http://inference.todayskin.local:8000` —
   배포 후 IP 조회·시크릿 갱신·backend 재배포가 **더 이상 필요 없다** (아래 8번).
7. **Redis eviction policy** — ElastiCache 기본은 `volatile-lru`. **해결 (2026-08-16): 커스텀 파라미터
   그룹 `todayskin-redis-pg`(`maxmemory-policy=noeviction`) 생성·복제 그룹에 적용 완료**.
8. **Cloud Map 서비스 디스커버리 적용 (N13 후속)** — inference 태스크 IP가 배포마다 바뀌는 문제를
   DNS 이름(`inference.todayskin.local`)으로 고정해 해결. 절차는 `docs/guides/DEPLOYMENT.md`
   "서비스 디스커버리 (Cloud Map)" 절 참고. 네임스페이스·서비스 생성 → ECS `serviceRegistries` 연결 →
   시크릿을 DNS 이름으로 교체 → backend 재배포 순서다.
9. **GitHub OIDC 신뢰 정책의 `sub` 클레임 형식** — GitHub가 최근 `sub`를
   `repo:owner@owner_id/repo@repo_id:ref:refs/heads/main` 형태로 보낸다 (레거시
   `repo:owner/repo:ref:...` 아님). OIDC role 신뢰 정책의 `StringLike` 조건을 이 형식에 맞추지
   않으면 `AssumeRoleWithWebIdentity`가 `Not authorized`로 거부된다. 실제 토큰 형식은 임시
   디버그 워크플로(`ACTIONS_ID_TOKEN_REQUEST_URL`로 토큰을 받아 `sub` 클레임을 출력)로 확인한다.
10. **ECR push 정책 오타** — IAM 정책의 ECR 액션은 `ecr:UploadLayerPart`다
    (`ecr:UploadPart` 아님). 오타가 있으면 push 단계에서 AccessDenied.
