import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JOB_DISPATCHER } from './jobs.constants';
import { JobController } from './job.controller';
import { JobService } from './job.service';
import { JobStateService } from './job-state.service';
import { JobHandlerRegistry } from './handlers/job-handler.registry';
import { DomainJobHandlers } from './handlers/domain-job.handlers';
import { InlineJobDispatcher } from './dispatchers/inline.job-dispatcher';
import { BullMqJobDispatcher } from './dispatchers/bullmq.job-dispatcher';
import { JobMetricsScheduler } from './job-metrics.scheduler';
import { RecommendationModule } from '../recommendations/recommendation.module';
import { PatternModule } from '../pattern/pattern.module';
import { NotificationModule } from '../notifications/notification.module';

/**
 * JobsModule — N4 BullMQ 비동기 처리.
 *
 * JOB_DISPATCHER=auto(기본): REDIS_URL 있으면 BullMQ, 없으면 Inline.
 * JOB_DISPATCHER=inline: Redis 여부와 무관하게 Inline.
 * JOB_DISPATCHER=bullmq: REDIS_URL 필수.
 * 테스트 환경(NODE_ENV=test)은 항상 Inline.
 *
 * Domain 모듈과의 순환 의존은 forwardRef로 해소한다.
 */
@Module({
  imports: [
    ConfigModule,
    forwardRef(() => RecommendationModule),
    forwardRef(() => PatternModule),
    forwardRef(() => NotificationModule),
  ],
  controllers: [JobController],
  providers: [
    JobStateService,
    JobHandlerRegistry,
    DomainJobHandlers,
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
  exports: [JobService],
})
export class JobsModule {}