import { Module } from '@nestjs/common';
import { RetentionService } from './retention.service';

/** R11: 보존 정책 스윕. 스케줄러는 SoftDeletePurgeScheduler가 겸한다(리더 락 하나로 충분). */
@Module({
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
