import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

describe('RedisService', () => {
  let service: RedisService;
  let configGet: jest.Mock;

  beforeEach(async () => {
    configGet = jest.fn((key: string, def?: unknown) => def);

    const moduleRef = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    service = moduleRef.get(RedisService);
  });

  it('REDIS_URL 없음 시 isAvailable=false, 부팅는 성공', async () => {
    configGet.mockImplementation((key: string, def?: unknown) =>
      key === 'REDIS_URL' ? '' : def,
    );
    await service.onModuleInit();
    expect(service.isAvailable()).toBe(false);
  });

  it('isAvailable=false면 getJson/setJson/invalidate는 no-op', async () => {
    await service.onModuleInit();
    expect(await service.getJson('x')).toBeNull();
    expect(await service.setJson('x', { a: 1 })).toBe(false);
    expect(await service.invalidate('x')).toBe(false);
    expect(await service.invalidatePattern('*')).toBe(0);
  });

  it('WEATHER_CACHE_TTL_SECONDS 기본값은 300', async () => {
    configGet.mockImplementation((key: string, def?: unknown) =>
      key === 'WEATHER_CACHE_TTL_SECONDS' ? def : '',
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();
    const svc = moduleRef.get(RedisService);
    expect(svc.weatherTtl).toBe(300);
  });
});
