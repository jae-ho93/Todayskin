# 배포 시크릿·변수 입력 양식 (N16 진행용)

> 이 문서는 배포 당일에 **값을 채워 넣는 양식**이다. 절차·원칙은
> [`DEPLOYMENT.md`](DEPLOYMENT.md)가 기준이고, 여기 값들은 전부 `backend/docker/ecs/*.json`
> task definition 템플릿과 `.github/workflows/deploy-ecs.yml`에서 추출한 **정확한 이름**이다.
> 채운 뒤 task definition의 `ACCOUNT_ID` 치환값과 대조한다.

## 0. 준비 순서

1. AWS 계정/자격 증명 준비 → 2. 이 양식 채우기 → 3. Secrets Manager·GitHub에 입력 →
   4. 인프라 프로비저닝(N16) → 5. `main` push → CI → 배포 승인 → 6. 스모크 검증

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
| 5 | `todayskin/prod/KMA_API_KEY` | backend·worker | ✅ | 기상청 키 | ☐ |
| 6 | `todayskin/prod/AIRKOREA_API_KEY` | backend·worker | ✅ | 에어코리아 키 | ☐ |
| 7 | `todayskin/prod/OPENAI_API_KEY` | backend·worker | ✅ | OpenAI 키 | ☐ |
| 8 | `todayskin/prod/OCTOMO_API_KEY` | backend·worker | ✅ | octomo.octoverse.kr 키 (없으면 가입/로그인 차단) | ☐ |
| 9 | `todayskin/prod/ALLOWED_ORIGINS` | backend·worker | ✅ | 앱 웹 오리진 (없으면 빈 값) | ☐ |
| 10 | `todayskin/prod/S3_BUCKET` | backend·worker | ✅ | 운영 S3 버킷명 (없으면 부팅 거부) | ☐ |
| 11 | `todayskin/prod/INFERENCE_SERVICE_URL` | backend·worker | ✅ | `http://<inference-task-ip>:8000` (내부망) | ☐ |
| 12 | `todayskin/prod/INFERENCE_SHARED_SECRET` | backend·worker·inference | ✅ | backend/inference 동일 값 (랜덤) | ☐ |
| 13 | `todayskin/prod/SENTRY_DSN` | backend·worker | ⬜ 선택 | 비우면 Sentry 비활성 | ☐ |

> ⚠️ **SENTRY_DSN은 빈 문자열도 시크릿으로 생성**해야 한다 — `secrets[]`에 있으므로
> 키가 없으면 부팅 시 Config registry error. 비활성화하려면 값을 `""`로 둔다.

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
| ElastiCache Redis | 백엔드가 접근 가능한 VPC 내 | | ☐ |
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
