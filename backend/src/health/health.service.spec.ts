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
  });

  it('ready error when db down', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('db down'));
    prisma.$queryRawUnsafe.mockResolvedValue([{ count: 1 }]);
    const body = await service.ready();
    expect(body.status).toBe('error');
  });
});
