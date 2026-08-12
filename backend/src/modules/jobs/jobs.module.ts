import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JOB_DISPATCHER } from './jobs.constants';
import { JobController } from './job.controller';
import { JobService } from './job.service';
import { JobStateService } from './job-state.service';
import { JobHandlerRegistry } from './handlers/job-handler.registry';
import { InlineJobDispatcher } from './dispatchers/inline.job-dispatcher';
import { BullMqJobDispatcher } from './dispatchers/bullmq.job-dispatcher';
import { JobMetricsScheduler } from './job-metrics.scheduler';

/**
 * JobsModule — N4 BullMQ 비동기 처리.
 *
 * JOB_DISPATCHER=auto(기본): REDIS_URL 있으면 BullMQ, 없으면 Inline.
 * JOB_DISPATCHER=inline: Redis 여부와 무관하게 Inline.
 * JOB_DISPATCHER=bullmq: REDIS_URL 필수.
 * 테스트 환경(NODE_ENV=test)은 항상 Inline.
 *
 * R12: 도메인 모듈을 import하지 않는다. 인프라인 이 모듈이 도메인을 알면 의존이
 * 역방향이 되고, 잡 타입이 늘 때마다 forwardRef가 하나씩 붙는다. 비어 있는
 * `JobHandlerRegistry`만 노출하고 각 도메인 모듈이 자기 핸들러를 등록한다.
 */
@Module({
  imports: [ConfigModule],
  controllers: [JobController],
  providers: [
    JobStateService,
    JobHandlerRegistry,
    InlineJobDispatcher,
    BullMqJobDispatcher,
    {
      provide: JOB_DISPATCHER,
      inject: [ConfigService, InlineJobDispatcher, BullMqJobDispatcher],
      useFactory: (
        config: ConfigService,
        inline: InlineJobDispatcher,
        bullmq: BullMqJobDispatcher,
      ) => {
        const mode = config.get<string>('JOB_DISPATCHER') ?? 'auto';
        const isTest = config.get<string>('NODE_ENV') === 'test';
        if (isTest || mode === 'inline') {
          return inline;
        }
        if (mode === 'bullmq') {
          return bullmq;
        }
        // auto: REDIS_URL 있으면 BullMQ, 없으면 Inline.
        const url = (config.get<string>('REDIS_URL') ?? '').trim();
        return url ? bullmq : inline;
      },
    },
    JobService,
    JobMetricsScheduler,
  ],
  // R10: dedupe 조회를 위해 JobStateService도 노출한다. 도메인 서비스가
  // async_jobs를 직접 쿼리하지 않고 이 파사드만 쓰게 해 dedupe 키 규칙을 한곳에 묶는다.
  // R12: 도메인 모듈이 자기 핸들러를 등록할 수 있도록 레지스트리를 노출한다.
  exports: [JobService, JobStateService, JobHandlerRegistry],
})
export class JobsModule {}