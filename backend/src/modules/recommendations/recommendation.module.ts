import { Module } from '@nestjs/common';
import { RecommendationController } from './recommendation.controller';
import { RecommendationService } from './recommendation.service';
import { GeminiModule } from '../gemini/gemini.module';
import { ConsentModule } from '../consent/consent.module';

/**
 * RecommendationModule — T7.
 * 전역 추천 템플릿 목록, B등급 생성, 상세 조회(소유권 검사)를 담당한다.
 * GeminiClient는 GeminiModule에서 주입받는다 (ProductModule과 공유).
 */
@Module({
  imports: [GeminiModule, ConsentModule],
  controllers: [RecommendationController],
  providers: [RecommendationService],
  exports: [RecommendationService],
})
export class RecommendationModule {}
