import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeaderElectedScheduler } from '../../common/scheduler/leader-elected.scheduler';
import { SchedulerLeaderService } from '../../common/scheduler/scheduler-leader.service';
import { ImageStorageService } from './image-storage.service';

/**
 * N10 이미지 저장소 reconciliation 스케줄러.
 *
 * - 미완료 삭제(pendingDeleteAt && !deletedAt) 재시도
 * - orphan 객체 탐지(dry-run — 로그/감사만, 실제 삭제는 ADMIN API로만)
 *
 * 기본 1시간 간격. IMAGE_RECONCILE_INTERVAL_MS=0 이면 비활성(테스트용).
 * R3: S3 삭제 재시도가 인스턴스마다 중복 실행되지 않게 리더만 실행한다.
 */
@Injectable()
export class ImageReconciliationScheduler extends LeaderElectedScheduler {
  protected readonly logger = new Logger(ImageReconciliationScheduler.name);
  protected readonly schedulerName = 'image-reconciliation';
  protected readonly intervalEnvKey = 'IMAGE_RECONCILE_INTERVAL_MS';
  protected readonly defaultIntervalMs = 3_600_000;

  constructor(
    private readonly imageStorage: ImageStorageService,
    config: ConfigService,
    leader: SchedulerLeaderService,
  ) {
    super(config, leader);
  }

  protected async tick(): Promise<void> {
    const retry = await this.imageStorage.retryPendingDeletes();
    // orphan은 안전 기본 dry-run만 수행. 실제 cleanup은 ADMIN 재처리 경로로만.
    const orphans = await this.imageStorage.detectOrphans({ dryRun: true });
    this.logger.log(
      `reconciliation run complete retry=${JSON.stringify(retry)} orphans=${JSON.stringify(orphans)}`,
    );
  }
}
