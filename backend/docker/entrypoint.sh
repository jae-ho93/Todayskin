#!/bin/sh
# NestJS container entrypoint (N5).
# Production ECS tasks must NOT migrate on startup — the release job runs
# backup → prisma migrate deploy before app rollout (N55: drift check is CI-only).
# Local/test compose sets RUN_MIGRATIONS_ON_START=true.
# Extra args replace the default app process (used by one-shot migrate tasks).
set -e

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

if [ "${RUN_MIGRATIONS_ON_START:-false}" = "true" ]; then
  echo "Applying Prisma migrations (local/test startup)..."
  npx prisma migrate deploy
fi

exec node dist/main.js
