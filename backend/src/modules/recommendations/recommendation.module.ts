import { Module } from '@nestjs/common';
import { RecommendationController } from './recommendation.controller';
import { RecommendationService } from './recommendation.service';
import { RecommendationRepository } from './recommendation.repository';
import { RecommendationJobHandler } from './recommendation.job-handler';
import { GeminiModule } from '../gemini/gemini.module';
import { ConsentModule } from '../consent/consent.module';
import { JobsModule } from '../jobs/jobs.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { ProductCatalogModule } from '../products/product-catalog.module';

/**
 * RecommendationModule — T7 + N4 async enqueue.
 * R12: JobsModule 의존은 단방향이다(forwardRef 불필요). 잡 핸들러는 이 모듈이 등록한다.
 */
@Module({
  imports: [
    GeminiModule,
    ConsentModule,
    JobsModule,
    IdempotencyModule,
    ProductCatalogModule,
  ],
  controllers: [RecommendationController],
  providers: [
    RecommendationService,
    RecommendationRepository,
    RecommendationJobHandler,
  ],
  exports: [RecommendationService],
})
export class RecommendationModule {}
