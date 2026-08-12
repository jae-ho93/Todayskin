import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { ProductJobHandler } from './product.job-handler';
import { GeminiModule } from '../gemini/gemini.module';
import { WeatherModule } from '../weather/weather.module';
import { JobsModule } from '../jobs/jobs.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { ProductCatalogModule } from './product-catalog.module';

/**
 * ProductModule — T7/N12.
 * 제품 카탈로그 목록과 날씨 기반 제품 생성을 담당한다.
 * GeminiClient는 GeminiModule에서 주입받는다 (RecommendationModule과 공유).
 * N12: 서버 소유 날씨 계약 — WeatherModule의 WeatherService로 날씨를 직접 조회한다.
 * N31/N29: JobService로 날씨 제품 LIVE 생성 job을 enqueue한다.
 * R12: JobsModule 의존은 단방향이다(forwardRef 불필요). 잡 핸들러는 이 모듈이 등록한다.
 */
@Module({
  imports: [
    GeminiModule,
    WeatherModule,
    JobsModule,
    IdempotencyModule,
    ProductCatalogModule,
  ],
  controllers: [ProductController],
  providers: [ProductService, ProductJobHandler],
  exports: [ProductService],
})
export class ProductModule {}
