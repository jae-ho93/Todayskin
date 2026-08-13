import { Module } from '@nestjs/common';
import { EvidencePolicy } from './evidence.policy';
import { OpenAiClient } from './openai.client';

/**
 * OpenAiModule — OpenAiClient를 다른 모듈에서 주입받을 수 있도록 제공.
 * RecommendationModule, ProductModule이 모두 OpenAiClient를 사용한다.
 * (구 GeminiModule을 대체)
 */
@Module({
  providers: [OpenAiClient, EvidencePolicy],
  exports: [OpenAiClient, EvidencePolicy],
})
export class OpenAiModule {}
