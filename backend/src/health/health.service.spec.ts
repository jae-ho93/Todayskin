import { HealthService } from './health.service';

describe('HealthService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    $queryRawUnsafe: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'NODE_ENV') return 'test';
      if (key === 'DATABASE_URL') return 'postgresql://x';
      if (key === 'JWT_ACCESS_SECRET') return 'x'.repeat(40);
      if (key === 'JWT_REFRESH_SECRET') return 'y'.repeat(40);
      if (key === 'REDIS_URL') return '';
      // 개발/테스트는 mock inference를 사용한다고 가정
      if (key === 'MOCK_INFERENCE') return 'true';
      if (key === 'INFERENCE_SERVICE_URL') return '';
      if (key === 'OCTOMO_API_KEY') return '';
      return undefined;
    }),
  };
  const redis = { isAvailable: jest.fn().mockReturnValue(false) };

  let service: HealthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HealthService(prisma as never, config as never, redis as never);
  });

  it('live is always ok', () => {
    expect(service.live().probe).toBe('live');
  });

  it('ready ok when db/migrations/config up', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    prisma.$queryRawUnsafe.mockResolvedValue([{ count: 3 }]);
    const body = await service.ready();
    expect(body.status).toBe('ok');
    expect(body.dependencies.find((d) => d.name === 'database')?.status).toBe('up');
    expect(body.dependencies.find((d) => d.name === 'redis')?.status).toBe('skipped');
    // N11: mock inference는 skipped로 취급해 ready를 깨지 않는다
    expect(body.dependencies.find((d) => d.name === 'inference')?.status).toBe('skipped');
  });

  it('ready error when db down', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('db down'));
    prisma.$queryRawUnsafe.mockResolvedValue([{ count: 1 }]);
    const body = await service.ready();
    expect(body.status).toBe('error');
  });

  it('N11: production에서 inference URL 없으면 required down', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'production';
      if (key === 'DATABASE_URL') return 'postgresql://x';
      if (key === 'JWT_ACCESS_SECRET') return 'x'.repeat(40);
      if (key === 'JWT_REFRESH_SECRET') return 'y'.repeat(40);
      if (key === 'REDIS_URL') return '';
      if (key === 'MOCK_INFERENCE') return 'false';
      if (key === 'INFERENCE_SERVICE_URL') return '';
      if (key === 'OCTOMO_API_KEY') return 'key';
      return undefined;
    });
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    prisma.$queryRawUnsafe.mockResolvedValue([{ count: 3 }]);

    const body = await service.ready();

    const inference = body.dependencies.find((d) => d.name === 'inference');
    expect(inference?.status).toBe('down');
    expect(inference?.required).toBe(true);
    expect(body.status).toBe('error');
  });

  it('N11: production에서 OCTOMO 미설정이면 required down', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'production';
      if (key === 'DATABASE_URL') return 'postgresql://x';
      if (key === 'JWT_ACCESS_SECRET') return 'x'.repeat(40);
      if (key === 'JWT_REFRESH_SECRET') return 'y'.repeat(40);
      if (key === 'REDIS_URL') return '';
      if (key === 'MOCK_INFERENCE') return 'false';
      if (key === 'INFERENCE_SERVICE_URL') return 'http://inference:8000';
      if (key === 'OCTOMO_API_KEY') return '';
      return undefined;
    });
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    prisma.$queryRawUnsafe.mockResolvedValue([{ count: 3 }]);

    const body = await service.ready();

    const octomo = body.dependencies.find((d) => d.name === 'octomo');
    expect(octomo?.status).toBe('down');
    expect(octomo?.required).toBe(true);
    expect(body.status).toBe('error');
  });
});
