import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JOB_DISPATCHER } from './jobs.constants';
import type { JobDispatcher } from './dispatchers/job-dispatcher.interface';

/**
 * N11: BullMQ queue/DLQ 운영 지표 수집 스케줄러.
 *
 * JOB_METRICS_INTERVAL_MS(기본 60초)마다 활성 dispatcher의 collectMetrics()를
 * 호출해 구조화 로그로 남긴다. Inline(개발/테스트)은 지원하지 않으므로 스킵.
 * 지표는 로그에만 남기며(CloudWatch 등에서 집계), ECS 다중 task에서도
 * Redis에 실시간 카운트가 있으므로 인스턴스별 분산 없이 일관된다.
 */
@Injectable()
export class JobMetricsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobMetricsScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(JOB_DISPATCHER) private readonly dispatcher: JobDispatcher,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return;
    }
    const interval = Number(
      this.config.get<number>('JOB_METRICS_INTERVAL_MS') ?? 60_000,
    );
    if (!interval || interval <= 0) {
      this.logger.log('Job metrics scheduler disabled');
      return;
    }
    this.timer = setInterval(() => {
      void this.collect().catch((e) => {
        this.logger.warn(`job metrics collection failed: ${(e as Error).message}`);
      });
    }, interval);
    this.timer.unref?.();
    this.logger.log(`Job metrics scheduler started intervalMs=${interval}`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async collect(): Promise<void> {
    if (typeof this.dispatcher.collectMetrics !== 'function') return;
    const metrics = await this.dispatcher.collectMetrics();
    if (!metrics) return;
    this.logger.log(`job_metrics ${JSON.stringify(metrics)}`);
  }
}
