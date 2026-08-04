import path from 'node:path';
import { defineConfig, env } from '@prisma/config';

type Env = {
  DATABASE_URL: string;
};

/**
 * Prisma 7 설정.
 * datasource URL은 schema.prisma가 아닌 prisma.config.ts에서 관리한다.
 * 런타임 연결에는 driver adapter(@prisma/adapter-pg)를 PrismaService에서 사용한다.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'npx tsx prisma/seed.ts',
  },
  datasource: {
    url: env<Env>('DATABASE_URL'),
  },
});
