import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { GeminiModule } from '../gemini/gemini.module';

/**
 * ProductModule — T7.
 * 제품 카탈로그 목록과 날씨 기반 제품 생성을 담당한다.
 * GeminiClient는 GeminiModule에서 주입받는다 (RecommendationModule과 공유).
 */
@Module({
  imports: [GeminiModule],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
