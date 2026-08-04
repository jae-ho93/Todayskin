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
 */
const databaseUrl = process.env.DATABASE_URL;

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
        },
      }
    : {}),
});
