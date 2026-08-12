import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeaderElectedScheduler } from '../scheduler/leader-elected.scheduler';
import { SchedulerLeaderService } from '../scheduler/scheduler-leader.service';
import { RetentionService } from '../retention/retention.service';
import { SoftDeleteService } from './soft-delete.service';

/**
 * Soft Delete 최종 purge + R11 보존 정책 스윕 스케줄러.
 * 기본 1시간 간격. SOFT_DELETE_PURGE_INTERVAL_MS=0 이면 비활성(테스트용).
 *
 * R3: 물리 삭제이므로 되돌릴 수 없다 — 다중 인스턴스 중복 실행을 반드시 막아야 한다.
 * 리더 선출은 LeaderElectedScheduler가 담당한다.
 */
@Injectable()
export class SoftDeletePurgeScheduler extends LeaderElectedScheduler {
  protected readonly logger = new Logger(SoftDeletePurgeScheduler.name);
  protected readonly schedulerName = 'soft-delete-purge';
  protected readonly intervalEnvKey = 'SOFT_DELETE_PURGE_INTERVAL_MS';
  protected readonly defaultIntervalMs = 3_600_000;

  constructor(
    private readonly softDelete: SoftDeleteService,
    private readonly retention: RetentionService,
    config: ConfigService,
    leader: SchedulerLeaderService,
  ) {
    super(config, leader);
  }

  protected async tick(): Promise<void> {
    await this.softDelete.purgeExpired();
    // R11: 보존 스윕은 기본 off다. 실패해도 purge 결과를 되돌리지 않는다
    // (서로 독립적인 정리 작업이라 하나가 다른 하나를 막지 않게 한다).
    await this.retention.sweep();
  }
}
