import { Module, forwardRef } from '@nestjs/common';
import { RecommendationController } from './recommendation.controller';
import { RecommendationService } from './recommendation.service';
import { GeminiModule } from '../gemini/gemini.module';
import { ConsentModule } from '../consent/consent.module';
import { JobsModule } from '../jobs/jobs.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';

/**
 * RecommendationModule — T7 + N4 async enqueue.
 */
@Module({
  imports: [GeminiModule, ConsentModule, forwardRef(() => JobsModule), IdempotencyModule],
  controllers: [RecommendationController],
  providers: [RecommendationService],
  exports: [RecommendationService],
})
export class RecommendationModule {}
