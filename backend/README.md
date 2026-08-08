# Todayskin Backend

NestJS(BFF·비즈니스) + `inference-service/` FastAPI(이미지 추론만).  
로컬 전체 절차는 **[docs/SETUP.md](../docs/SETUP.md)**. 운영은 **[docker/DEPLOYMENT.md](docker/DEPLOYMENT.md)**.

```bash
cd backend
cp .env.example .env          # DATABASE_URL, JWT_* 필수
docker compose up -d
npm install && npm run prisma:generate && npm run prisma:migrate && npm run prisma:seed
npm run start:dev             # :3000  ·  /api/docs  ·  /health
```

| 명령 | 용도 |
|---|---|
| `npm run start:dev` | watch |
| `npm test` / `npm run test:e2e` | 단위 / E2E(test DB) |
| `npm run lint` · `npm run build` | 검사·빌드 |
| `npm run prisma:*` | generate / migrate / seed |

추론: `MOCK_INFERENCE=true`(기본 로컬) 또는 `docker compose --profile inference up -d --build`.  
Task·API 이력: [docs/BACKEND_TASKS.md](../docs/BACKEND_TASKS.md). FK·보존: `prisma/schema.prisma`.
