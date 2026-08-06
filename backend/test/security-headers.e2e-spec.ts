import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import request from 'supertest';
import { HealthModule } from '../src/health/health.module';

/**
 * N0: Helmet 보안 헤더 e2e.
 * 운영 모드에서 보안 헤더가 설정되는지, 개발 모드에서 Swagger 호환이
 * 유지되는지 확인한다.
 */
describe('Helmet 보안 헤더 (e2e)', () => {
  function buildApp(production: boolean): Promise<INestApplication> {
    return Test.createTestingModule({
      imports: [HealthModule],
    })
      .compile()
      .then(async (moduleRef) => {
        const app = moduleRef.createNestApplication();
        app.use(
          helmet({
            crossOriginResourcePolicy: production
              ? { policy: 'same-origin' }
              : false,
            contentSecurityPolicy: production ? undefined : false,
          }),
        );
        await app.init();
        return app;
      });
  }

  it('운영 모드: 보안 헤더가 설정된다', async () => {
    const app = await buildApp(true);
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect('x-content-type-options', 'nosniff')
      .expect('x-frame-options', 'SAMEORIGIN')
      .expect('strict-transport-security', /max-age/);
    await app.close();
  });

  it('개발 모드: Swagger 호환을 위해 CSP 비활성화', async () => {
    const app = await buildApp(false);
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect('x-content-type-options', 'nosniff')
      .expect((res: request.Response) => {
        // 개발 모드는 CSP를 비활성화하므로 헤더가 없어야 한다.
        expect(res.headers['content-security-policy']).toBeUndefined();
      });
    await app.close();
  });
});
