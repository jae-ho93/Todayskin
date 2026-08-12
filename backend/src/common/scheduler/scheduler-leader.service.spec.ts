import { Test } from '@nestjs/testing';
import { RedisService } from '../../redis/redis.service';
import { SchedulerLeaderService, leaderLockTtlMs } from './scheduler-leader.service';

describe('SchedulerLeaderService (R3)', () => {
  let leader: SchedulerLeaderService;
  const redis = {
    isAvailable: jest.fn(),
    acquireLock: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SchedulerLeaderService,
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    leader = moduleRef.get(SchedulerLeaderService);
  });

  it('락을 획득하면 작업을 실행한다', async () => {
    redis.isAvailable.mockReturnValue(true);
    redis.acquireLock.mockResolvedValue(true);
    const task = jest.fn().mockResolvedValue(undefined);

    await expect(leader.runIfLeader('weather-collection', 5_000, task)).resolves.toBe(true);
    expect(task).toHaveBeenCalledTimes(1);
    expect(redis.acquireLock).toHaveBeenCalledWith(
      'scheduler:weather-collection:leader',
      5_000,
      expect.any(String),
    );
  });

  it('다른 인스턴스가 락을 쥐고 있으면 작업을 실행하지 않는다', async () => {
    redis.isAvailable.mockReturnValue(true);
    redis.acquireLock.mockResolvedValue(false);
    const task = jest.fn();

    await expect(leader.runIfLeader('soft-delete-purge', 5_000, task)).resolves.toBe(false);
    expect(task).not.toHaveBeenCalled();
  });

  it('Redis가 없으면 락 없이 실행한다 (로컬·단일 인스턴스 동작 유지)', async () => {
    redis.isAvailable.mockReturnValue(false);
    const task = jest.fn().mockResolvedValue(undefined);

    await expect(leader.runIfLeader('image-reconciliation', 5_000, task)).resolves.toBe(true);
    expect(task).toHaveBeenCalledTimes(1);
    expect(redis.acquireLock).not.toHaveBeenCalled();
  });

  it('작업이 던진 예외를 삼키지 않는다 (호출부가 로깅한다)', async () => {
    redis.isAvailable.mockReturnValue(true);
    redis.acquireLock.mockResolvedValue(true);

    await expect(
      leader.runIfLeader('soft-delete-purge', 5_000, () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
  });

  it('TTL은 인터벌보다 길다 — 작업이 인터벌을 넘겨도 중복 실행되지 않는다', () => {
    expect(leaderLockTtlMs(60_000)).toBe(90_000);
    expect(leaderLockTtlMs(3_600_000)).toBeGreaterThan(3_600_000);
  });
});
