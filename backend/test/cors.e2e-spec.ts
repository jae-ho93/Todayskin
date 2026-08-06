import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { HealthModule } from '../src/health/health.module';
import { HealthService } from '../src/health/health.service';

/**
 * CORS 허용/차단 시나리오 e2e.
 * ConfigModule에 ALLOWED_ORIGINS를 주입해 검증한다.
 */
describe('CORS (e2e)', () => {
  function buildApp(origins: string): Promise<INestApplication> {
    return Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              PORT: 3101,
              ALLOWED_ORIGINS: origins,
            }),
          ],
        }),
        HealthModule,
      ],
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
        const rawOrigins = origins
          .split(',')
          .map((o) => o.trim())
          .filter((o) => o.length > 0);
        app.enableCors({
          origin: rawOrigins.length > 0 ? rawOrigins : false,
          credentials: true,
        });
        app.useGlobalPipes(
          new ValidationPipe({ whitelist: true, transform: true }),
        );
        await app.init();
        return app;
      });
  }

  it('허용된 origin → CORS 헤더 반환', async () => {
    const app = await buildApp('http://localhost:8081');
    await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:8081')
      .expect(200)
      .expect('access-control-allow-origin', 'http://localhost:8081');
    await app.close();
  });

  it('허용되지 않은 origin → CORS 헤더 없음', async () => {
    const app = await buildApp('http://localhost:8081');
    await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://evil.example.com')
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
      });
    await app.close();
  });

  it('ALLOWED_ORIGINS 비어있으면 origin 차단', async () => {
    const app = await buildApp('');
    await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:8081')
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
      });
    await app.close();
  });
});
