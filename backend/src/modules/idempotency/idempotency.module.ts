import { Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';

/**
 * IdempotencyModule (N14) — 외부 AI 호출(진단 추론/Gemini)의 동시 중복 방지.
 * DiagnosisModule과 RecommendationModule이 공유한다.
 */
@Module({
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
