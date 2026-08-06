import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            check: () => ({ status: 'ok', timestamp: new Date().toISOString() }),
            live: () => ({
              status: 'ok',
              probe: 'live',
              timestamp: new Date().toISOString(),
            }),
            ready: async () => ({
              status: 'ok',
              probe: 'ready',
              timestamp: new Date().toISOString(),
              dependencies: [],
            }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('/health (GET) → 200 ok', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.timestamp).toBeDefined();
      });
  });

  it('/health/live (GET) → 200', () => {
    return request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.probe).toBe('live');
      });
  });

  it('/health/ready (GET) → 200', () => {
    return request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect((res: request.Response) => {
        expect(res.body.probe).toBe('ready');
      });
  });
});
