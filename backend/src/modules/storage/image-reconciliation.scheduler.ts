import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageStorageService } from './image-storage.service';

/**
 * N10 이미지 저장소 reconciliation 스케줄러.
 *
 * - 미완료 삭제(pendingDeleteAt && !deletedAt) 재시도
 * - orphan 객체 탐지(dry-run — 로그/감사만, 실제 삭제는 ADMIN API로만)
 *
 * 기본 1시간 간격. IMAGE_RECONCILE_INTERVAL_MS=0 이면 비활성(테스트용).
 */
@Injectable()
export class ImageReconciliationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImageReconciliationScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly imageStorage: ImageStorageService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return;
    }
    const interval = Number(
      this.config.get<number>('IMAGE_RECONCILE_INTERVAL_MS') ?? 3_600_000,
    );
    if (!interval || interval <= 0) {
      this.logger.log('Image reconciliation scheduler disabled');
      return;
    }
    this.timer = setInterval(() => {
      void this.run().catch((e) => {
        this.logger.error(`image reconciliation failed: ${(e as Error).message}`);
      });
    }, interval);
    // unref so it does not keep process alive alone
    this.timer.unref?.();
    this.logger.log(`Image reconciliation scheduler started intervalMs=${interval}`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async run(): Promise<void> {
    const retry = await this.imageStorage.retryPendingDeletes();
    // orphan은 안전 기본 dry-run만 수행. 실제 cleanup은 ADMIN 재처리 경로로만.
    const orphans = await this.imageStorage.detectOrphans({ dryRun: true });
    this.logger.log(
      `reconciliation run complete retry=${JSON.stringify(retry)} orphans=${JSON.stringify(orphans)}`,
    );
  }
}
