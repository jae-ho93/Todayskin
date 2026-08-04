import { Module } from '@nestjs/common';
import { GeminiClient } from './gemini.client';

/**
 * GeminiModule — GeminiClient를 다른 모듔에서 주입받을 수 있도록 제공.
 * RecommendationModule, ProductModule이 모두 GeminiClient를 사용한다.
 */
@Module({
  providers: [GeminiClient],
  exports: [GeminiClient],
})
export class GeminiModule {}
