import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { GeminiModule } from '../gemini/gemini.module';
import { WeatherModule } from '../weather/weather.module';

/**
 * ProductModule — T7/N12.
 * 제품 카탈로그 목록과 날씨 기반 제품 생성을 담당한다.
 * GeminiClient는 GeminiModule에서 주입받는다 (RecommendationModule과 공유).
 * N12: 서버 소유 날씨 계약 — WeatherModule의 WeatherService로 날씨를 직접 조회한다.
 */
@Module({
  imports: [GeminiModule, WeatherModule],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
