import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeaderElectedScheduler } from './leader-elected.scheduler';
import { SchedulerLeaderService } from './scheduler-leader.service';

class TestScheduler extends LeaderElectedScheduler {
  protected readonly logger = new Logger('TestScheduler');
  protected readonly schedulerName = 'test';
  protected readonly intervalEnvKey = 'TEST_INTERVAL_MS';
  protected readonly defaultIntervalMs = 1_000;
  ticks = 0;
  enabled = true;
  /** tick이 끝나는 시점을 테스트가 제어한다 — 겹침 방지 검증용. */
  release: (() => void) | null = null;

  constructor(config: ConfigService, leader: SchedulerLeaderService) {
    super(config, leader);
  }

  protected isEnabled(): boolean {
    return this.enabled;
  }

  protected async tick(): Promise<void> {
    this.ticks++;
    if (this.release) return;
    await Promise.resolve();
  }

  hold(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.release = resolve;
    });
  }
}

function makeConfig(env: Record<string, unknown>): ConfigService {
  return {
    get: (key: string, fallback?: unknown) => env[key] ?? fallback,
  } as unknown as ConfigService;
}

describe('LeaderElectedScheduler (R3/R13)', () => {
  const leaderService = {
    runIfLeader: jest.fn(),
  } as unknown as jest.Mocked<SchedulerLeaderService>;

  beforeEach(() => {
    jest.useFakeTimers();
    (leaderService.runIfLeader as jest.Mock).mockImplementation(
      async (_name: string, _ttl: number, task: () => Promise<void>) => {
        await task();
        return true;
      },
    );
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function start(env: Record<string, unknown>): TestScheduler {
    const scheduler = new TestScheduler(makeConfig(env), leaderService);
    scheduler.onModuleInit();
    return scheduler;
  }

  it('인터벌마다 리더 선출을 거쳐 tick을 실행한다', async () => {
    const scheduler = start({ TEST_INTERVAL_MS: 1_000 });
    // 각 tick의 마이크로태스크가 소진되도록 async 버전으로 진행한다.
    await jest.advanceTimersByTimeAsync(2_000);

    expect(scheduler.ticks).toBe(2);
    expect(leaderService.runIfLeader).toHaveBeenCalledWith(
      'test',
      1_500, // 인터벌 × 1.5
      expect.any(Function),
    );
    scheduler.onModuleDestroy();
  });

  it('리더가 아니면 tick을 실행하지 않는다', async () => {
    (leaderService.runIfLeader as jest.Mock).mockResolvedValue(false);
    const scheduler = start({ TEST_INTERVAL_MS: 1_000 });
    jest.advanceTimersByTime(3_000);
    await Promise.resolve();

    expect(scheduler.ticks).toBe(0);
    scheduler.onModuleDestroy();
  });

  it('NODE_ENV=test에서는 타이머를 걸지 않는다', () => {
    const scheduler = start({ NODE_ENV: 'test', TEST_INTERVAL_MS: 1_000 });
    jest.advanceTimersByTime(5_000);
    expect(scheduler.ticks).toBe(0);
  });

  it('JOB_ROLE=api면 스케줄러를 띄우지 않는다', () => {
    const scheduler = start({ JOB_ROLE: 'api', TEST_INTERVAL_MS: 1_000 });
    jest.advanceTimersByTime(5_000);
    expect(scheduler.ticks).toBe(0);
  });

  it('JOB_ROLE=worker면 스케줄러를 띄운다', async () => {
    const scheduler = start({ JOB_ROLE: 'worker', TEST_INTERVAL_MS: 1_000 });
    jest.advanceTimersByTime(1_000);
    await Promise.resolve();
    expect(scheduler.ticks).toBe(1);
    scheduler.onModuleDestroy();
  });

  it('인터벌 0이면 비활성이다', () => {
    const scheduler = start({ TEST_INTERVAL_MS: 0 });
    jest.advanceTimersByTime(5_000);
    expect(scheduler.ticks).toBe(0);
  });

  it('isEnabled()가 false면 비활성이다 (WEATHER_COLLECTOR_ENABLED 킬 스위치)', () => {
    const scheduler = new TestScheduler(makeConfig({ TEST_INTERVAL_MS: 1_000 }), leaderService);
    scheduler.enabled = false;
    scheduler.onModuleInit();
    jest.advanceTimersByTime(5_000);
    expect(scheduler.ticks).toBe(0);
  });

  it('이전 tick이 끝나지 않았으면 겹쳐 실행하지 않는다', async () => {
    const scheduler = start({ TEST_INTERVAL_MS: 1_000 });
    const held = scheduler.hold();
    (leaderService.runIfLeader as jest.Mock).mockImplementation(async () => {
      scheduler.ticks++;
      await held;
      return true;
    });

    jest.advanceTimersByTime(3_000);
    await Promise.resolve();
    expect(scheduler.ticks).toBe(1);

    scheduler.release?.();
    await held;
    scheduler.onModuleDestroy();
  });

  it('tick이 던진 예외로 타이머가 죽지 않는다', async () => {
    const scheduler = start({ TEST_INTERVAL_MS: 1_000 });
    (leaderService.runIfLeader as jest.Mock).mockRejectedValue(new Error('boom'));

    jest.advanceTimersByTime(1_000);
    await Promise.resolve();
    await Promise.resolve();

    (leaderService.runIfLeader as jest.Mock).mockImplementation(
      async (_n: string, _t: number, task: () => Promise<void>) => {
        await task();
        return true;
      },
    );
    jest.advanceTimersByTime(1_000);
    await Promise.resolve();
    expect(scheduler.ticks).toBe(1);
    scheduler.onModuleDestroy();
  });

  it('onModuleDestroy 이후에는 tick이 돌지 않는다', async () => {
    const scheduler = start({ TEST_INTERVAL_MS: 1_000 });
    scheduler.onModuleDestroy();
    jest.advanceTimersByTime(5_000);
    await Promise.resolve();
    expect(scheduler.ticks).toBe(0);
  });
});
