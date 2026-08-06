import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SoftDeleteService } from './soft-delete.service';

/**
 * Soft Delete 최종 purge 스케줄러.
 * 기본 1시간 간격. SOFT_DELETE_PURGE_INTERVAL_MS=0 이면 비활성(테스트용).
 */
@Injectable()
export class SoftDeletePurgeScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SoftDeletePurgeScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly softDelete: SoftDeleteService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return;
    }
    const interval = Number(
      this.config.get<number>('SOFT_DELETE_PURGE_INTERVAL_MS') ?? 3_600_000,
    );
    if (!interval || interval <= 0) {
      this.logger.log('SoftDelete purge scheduler disabled');
      return;
    }
    this.timer = setInterval(() => {
      void this.softDelete.purgeExpired().catch((e) => {
        this.logger.error(`purge failed: ${(e as Error).message}`);
      });
    }, interval);
    // unref so it does not keep process alive alone
    this.timer.unref?.();
    this.logger.log(`SoftDelete purge scheduler started intervalMs=${interval}`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
