import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveJobRole, runsSchedulers } from '../../config/job-role';
import { SchedulerLeaderService, leaderLockTtlMs } from './scheduler-leader.service';

/**
 * R3/R13: 주기 실행 스케줄러 공통 베이스.
 *
 * 세 스케줄러가 같은 판단(테스트 환경 skip · 역할 확인 · 인터벌 파싱 · 리더 선출 ·
 * unref 타이머 · 겹침 방지)을 각자 복제하고 있었고, 그 중 리더 선출만 빠져 있었다.
 * 여기에 한 번만 두어 새 스케줄러가 리더 선출을 빠뜨릴 수 없게 한다.
 *
 * 서브클래스는 이름·인터벌 환경변수·tick만 정의한다.
 */
export abstract class LeaderElectedScheduler implements OnModuleInit, OnModuleDestroy {
  protected abstract readonly logger: Logger;
  /** 락 키(`scheduler:{name}:leader`)와 로그에 쓰이는 식별자. */
  protected abstract readonly schedulerName: string;
  /** 인터벌(ms)을 읽을 환경변수 이름. 0 이하면 비활성. */
  protected abstract readonly intervalEnvKey: string;
  protected abstract readonly defaultIntervalMs: number;
  /** 부팅 직후 1회 실행까지의 지연(ms). 0이면 첫 인터벌까지 기다린다. */
  protected readonly initialDelayMs: number = 0;

  private timer: NodeJS.Timeout | null = null;
  private running = false;

  protected constructor(
    protected readonly config: ConfigService,
    private readonly leader: SchedulerLeaderService,
  ) {}

  protected abstract tick(): Promise<void>;

  /** 서브클래스가 추가 비활성 조건을 둘 때 override한다. */
  protected isEnabled(): boolean {
    return true;
  }

  onModuleInit(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') return;

    const role = resolveJobRole(this.config);
    if (!runsSchedulers(role)) {
      this.logger.log(`${this.schedulerName} scheduler disabled (JOB_ROLE=${role})`);
      return;
    }
    if (!this.isEnabled()) return;

    const intervalMs = Number(
      this.config.get<number>(this.intervalEnvKey) ?? this.defaultIntervalMs,
    );
    if (!intervalMs || intervalMs <= 0) {
      this.logger.log(`${this.schedulerName} scheduler disabled (${this.intervalEnvKey}=0)`);
      return;
    }

    this.timer = setInterval(() => {
      void this.runTick(intervalMs);
    }, intervalMs);
    // 이 타이머만으로 프로세스를 살려두지 않는다.
    this.timer.unref?.();

    if (this.initialDelayMs > 0) {
      const warmup = setTimeout(() => {
        void this.runTick(intervalMs);
      }, this.initialDelayMs);
      warmup.unref?.();
    }

    this.logger.log(
      `${this.schedulerName} scheduler started intervalMs=${intervalMs}` +
        (this.initialDelayMs > 0 ? ` warmup=${this.initialDelayMs}ms` : ''),
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runTick(intervalMs: number): Promise<void> {
    // 이전 tick이 아직 안 끝났으면(외부 API가 느릴 때) 겹쳐 돌지 않는다.
    if (this.running) {
      this.logger.warn(`${this.schedulerName}: previous run still in progress, skipping tick`);
      return;
    }
    this.running = true;
    try {
      await this.leader.runIfLeader(this.schedulerName, leaderLockTtlMs(intervalMs), () =>
        this.tick(),
      );
    } catch (e) {
      this.logger.error(`${this.schedulerName} tick failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
