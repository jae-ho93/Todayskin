import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import {
  ThrottlerModule,
  ThrottlerGuard,
  ThrottlerStorageService,
} from '@nestjs/throttler';
import request from 'supertest';
import { HealthModule } from '../src/health/health.module';
import { HealthService } from '../src/health/health.service';

/**
 * N0: Rate Limit e2e.
 * 제한을 초과하면 429 Too Many Requests가 반환되는지 확인한다.
 * 테스트는 메모리 저장소를 사용해 Redis 의존성 없이 동작한다.
 */
describe('Throttler Rate Limit (e2e)', () => {
  function buildApp(limit: number, ttl: number): Promise<INestApplication> {
    return Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              NODE_ENV: 'development',
              THROTTLE_LIMIT: String(limit),
              THROTTLE_TTL_MS: String(ttl),
            }),
          ],
        }),
        ThrottlerModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            throttlers: [
              {
                name: 'default',
                limit: config.get<number>('THROTTLE_LIMIT', limit),
                ttl: config.get<number>('THROTTLE_TTL_MS', ttl),
              },
            ],
            storage: new ThrottlerStorageService(),
            errorMessage: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
          }),
        }),
        HealthModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    })
      .overrideProvider(HealthService)
      .useValue({
        check: () => ({ status: 'ok', timestamp: new Date().toISOString() }),
        live: () => ({ status: 'ok', probe: 'live', timestamp: new Date().toISOString() }),
        ready: async () => ({
          status: 'ok',
          probe: 'ready',
          timestamp: new Date().toISOString(),
          dependencies: [],
        }),
      })
      .compile()
      .then(async (moduleRef) => {
        const app = moduleRef.createNestApplication();
        await app.init();
        return app;
      });
  }

  it('제한 이내 요청은 200, 초과 시 429', async () => {
    // limit=2, ttl=60s
    const app = await buildApp(2, 60_000);
    const server = app.getHttpServer();

    await request(server).get('/health').expect(200);
    await request(server).get('/health').expect(200);
    // 3번째 요청은 제한 초과
    await request(server).get('/health').expect(429);
    await app.close();
  });

  it('429 응답에 한국어 메시지 포함', async () => {
    const app = await buildApp(1, 60_000);
    const server = app.getHttpServer();

    await request(server).get('/health').expect(200);
    await request(server)
      .get('/health')
      .expect(429)
      .expect((res: request.Response) => {
        const body = JSON.stringify(res.body);
        expect(body).toContain('요청이 너무 많습니다');
      });
    await app.close();
  });
});
