import { Module, forwardRef } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { GeminiModule } from '../gemini/gemini.module';
import { WeatherModule } from '../weather/weather.module';
import { JobsModule } from '../jobs/jobs.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';

/**
 * ProductModule — T7/N12.
 * 제품 카탈로그 목록과 날씨 기반 제품 생성을 담당한다.
 * GeminiClient는 GeminiModule에서 주입받는다 (RecommendationModule과 공유).
 * N12: 서버 소유 날씨 계약 — WeatherModule의 WeatherService로 날씨를 직접 조회한다.
 * N31/N29: JobService로 날씨 제품 LIVE 생성 job을 enqueue한다 (JobsModule과 순환 의존은 forwardRef).
 */
@Module({
  imports: [GeminiModule, WeatherModule, forwardRef(() => JobsModule), IdempotencyModule],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
