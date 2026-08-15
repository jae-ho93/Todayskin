import { Module } from '@nestjs/common';
import { CareController } from './care.controller';
import { CareService } from './care.service';
import { CareJobHandler } from './care.job-handler';
import { OpenAiModule } from '../openai/openai.module';
import { ProductCatalogModule } from '../products/product-catalog.module';
import { WeatherModule } from '../weather/weather.module';
import { JobsModule } from '../jobs/jobs.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';

/**
 * CareModule — 케어 루틴+제품 추천(OpenAI Responses API + web_search).
 * ProductModule과 같은 의존 구성: OpenAiClient는 OpenAiModule에서 공유하고,
 * 날씨는 WeatherModule로 서버가 직접 조회한다(N12). Prisma/Redis는 전역 모듈이라
 * 여기서 따로 import하지 않는다.
 */
@Module({
  imports: [OpenAiModule, ProductCatalogModule, WeatherModule, JobsModule, IdempotencyModule],
  controllers: [CareController],
  providers: [CareService, CareJobHandler],
  exports: [CareService],
})
export class CareModule {}
