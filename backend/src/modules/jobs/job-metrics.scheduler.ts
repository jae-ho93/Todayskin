import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeaderElectedScheduler } from '../../common/scheduler/leader-elected.scheduler';
import { SchedulerLeaderService } from '../../common/scheduler/scheduler-leader.service';
import { JOB_DISPATCHER } from './jobs.constants';
import type { JobDispatcher } from './dispatchers/job-dispatcher.interface';

/**
 * N11: BullMQ queue/DLQ 운영 지표 수집 스케줄러.
 *
 * JOB_METRICS_INTERVAL_MS(기본 60초)마다 활성 dispatcher의 collectMetrics()를
 * 호출해 구조화 로그로 남긴다. Inline(개발/테스트)은 지원하지 않으므로 스킵.
 *
 * R3: 지표는 Redis의 큐 상태를 읽는 것이라 모든 인스턴스가 같은 값을 본다.
 * 리더만 기록해 인스턴스 수만큼 중복되는 로그를 없앤다.
 */
@Injectable()
export class JobMetricsScheduler extends LeaderElectedScheduler {
  protected readonly logger = new Logger(JobMetricsScheduler.name);
  protected readonly schedulerName = 'job-metrics';
  protected readonly intervalEnvKey = 'JOB_METRICS_INTERVAL_MS';
  protected readonly defaultIntervalMs = 60_000;

  constructor(
    @Inject(JOB_DISPATCHER) private readonly dispatcher: JobDispatcher,
    config: ConfigService,
    leader: SchedulerLeaderService,
  ) {
    super(config, leader);
  }

  protected async tick(): Promise<void> {
    if (typeof this.dispatcher.collectMetrics !== 'function') return;
    const metrics = await this.dispatcher.collectMetrics();
    if (!metrics) return;
    this.logger.log(`job_metrics ${JSON.stringify(metrics)}`);
  }
}
