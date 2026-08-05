import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from '@prisma/config';

/**
 * Prisma 7 설정.
 * datasource URL은 schema.prisma가 아닌 prisma.config.ts에서 관리한다.
 * 런타임 연결에는 driver adapter(@prisma/adapter-pg)를 PrismaService에서 사용한다.
 *
 * 참고: prisma generate는 DB 연결이 필요 없으므로 DATABASE_URL이 없어도
 * 동작해야 한다. env() 헬퍼는 변수가 없으면 에러를 던지므로 process.env를
 * 직접 읽어 undefined를 허용한다.
 *
 * shadowDatabaseUrl은 `prisma migrate diff --from-migrations` 검사에 필요하다.
 * 단, main DB와 동일하면 Prisma가 거부하므로 SHADOW_DATABASE_URL이
 * 명시적으로 별도 값으로 설정된 경우에만 추가한다.
 * (migrate deploy, migrate status에는 shadow DB가 필요 없다.)
 */
const databaseUrl = process.env.DATABASE_URL;
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;
const useShadow =
  shadowDatabaseUrl && shadowDatabaseUrl !== databaseUrl;

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'npx tsx prisma/seed.ts',
  },
  ...(databaseUrl
    ? {
        datasource: {
          url: databaseUrl,
          ...(useShadow ? { shadowDatabaseUrl } : {}),
        },
      }
    : {}),
});
