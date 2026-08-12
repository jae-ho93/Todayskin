import { ServiceUnavailableException } from '@nestjs/common';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import { SENSITIVE_THROTTLER } from './sensitive-throttle';

describe('RedisThrottlerStorage (N11)', () => {
  let redis: {
    incrementCounter: jest.Mock;
    getCounterTtlMs: jest.Mock;
  };
  let storage: RedisThrottlerStorage;

  beforeEach(() => {
    redis = {
      incrementCounter: jest.fn(),
      getCounterTtlMs: jest.fn().mockResolvedValue(50_000),
    };
    storage = new RedisThrottlerStorage(redis as never);
  });

  it('limit 이하 hit는 isBlocked=false', async () => {
    redis.incrementCounter.mockResolvedValue(5);

    const rec = await storage.increment('ip:1.2.3.4', 60_000, 60, 0, 'default');

    expect(redis.incrementCounter).toHaveBeenCalledWith('throttle:default:ip:1.2.3.4', 60);
    expect(rec).toEqual({
      totalHits: 5,
      timeToExpire: 50_000,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('limit 초과 hit는 isBlocked=true', async () => {
    redis.incrementCounter.mockResolvedValue(61);

    const rec = await storage.increment('ip:1.2.3.4', 60_000, 60, 0, 'default');

    expect(rec.isBlocked).toBe(true);
    expect(rec.timeToBlockExpire).toBe(50_000);
  });

  it('Redis 장애 시 fail-open — 요청을 차단하지 않는다', async () => {
    redis.incrementCounter.mockResolvedValue(null);

    const rec = await storage.increment('ip:1.2.3.4', 60_000, 60, 0, 'default');

    expect(rec).toEqual({
      totalHits: 0,
      timeToExpire: 0,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  // N47: 인증·OTP(sensitive)는 fail-open과 반대로 동작해야 한다 — 별도 케이스로 분리.
  it('Redis 장애 시 sensitive throttler는 fail-closed — 503으로 거부한다', async () => {
    redis.incrementCounter.mockResolvedValue(null);

    await expect(
      storage.increment('ip:1.2.3.4', 60_000, 30, 0, SENSITIVE_THROTTLER),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('Redis 정상이면 sensitive throttler도 카운터로 동작한다', async () => {
    redis.incrementCounter.mockResolvedValue(31);

    const rec = await storage.increment(
      'ip:1.2.3.4',
      60_000,
      30,
      0,
      SENSITIVE_THROTTLER,
    );

    expect(rec.isBlocked).toBe(true);
  });

  it('TTL 남은 시간이 없으면 ttl 원본을 사용한다', async () => {
    redis.incrementCounter.mockResolvedValue(3);
    redis.getCounterTtlMs.mockResolvedValue(0);

    const rec = await storage.increment('ip:1.2.3.4', 60_000, 60, 0, 'default');

    expect(rec.timeToExpire).toBe(60_000);
  });
});
