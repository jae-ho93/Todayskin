import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { buildOpenApiConfig } from '../src/openapi.config';

/**
 * R28: OpenAPI 스펙을 JSON으로 덤프한다. 프론트의 `src/types/api.generated.ts`는
 * 이 결과에서 생성되고, CI가 생성물과 커밋본을 비교해 계약 드리프트를 막는다.
 *
 * preview 모드로 만들어 provider를 실제로 인스턴스화하지 않는다 — DB·Redis 연결이나
 * 스케줄러 없이 컨트롤러 메타데이터만 읽으면 되기 때문이다.
 */

/**
 * AppModule을 import하는 순간 ConfigModule.forRoot의 env 스키마 검증이 돌기 때문에,
 * 스펙만 뽑는 이 스크립트에서도 필수 값이 없으면 부팅 전에 죽는다. 실제 연결은 하지
 * 않으므로(.env 없는 CI 러너에서도 돌아야 한다) 비어 있을 때만 자리표시자를 넣는다.
 */
const PLACEHOLDER_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://openapi:openapi@localhost:5432/openapi',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  JWT_REFRESH_SECRET: 'y'.repeat(32),
};

for (const [key, value] of Object.entries(PLACEHOLDER_ENV)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

async function main(): Promise<void> {
  // env 자리표시자를 채운 뒤에 로드해야 한다(정적 import는 검증보다 먼저 실행된다).
  // ts-node(CJS)에서 동적 import()는 .ts를 해석하지 못하므로 require를 쓴다.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');

  const outPath = resolve(__dirname, '..', 'openapi.json');
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
  });
  const document = SwaggerModule.createDocument(app, buildOpenApiConfig());
  await app.close();

  writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  process.stdout.write(`OpenAPI spec written to ${outPath}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
