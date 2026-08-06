import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  const healthService = {
    check: jest.fn().mockReturnValue({ status: 'ok', timestamp: 't' }),
    live: jest.fn().mockReturnValue({ status: 'ok', probe: 'live', timestamp: 't' }),
    ready: jest.fn().mockResolvedValue({
      status: 'ok',
      probe: 'ready',
      timestamp: 't',
      dependencies: [],
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    controller = module.get(HealthController);
  });

  it('check returns ok', () => {
    expect(controller.check().status).toBe('ok');
  });

  it('live returns probe', () => {
    expect(controller.live().probe).toBe('live');
  });

  it('ready returns body', async () => {
    const res = { status: jest.fn() } as never;
    const body = await controller.ready(res);
    expect(body.probe).toBe('ready');
  });
});
