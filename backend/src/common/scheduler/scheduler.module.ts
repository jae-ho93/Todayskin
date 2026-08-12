import { Global, Module } from '@nestjs/common';
import { SchedulerLeaderService } from './scheduler-leader.service';

/**
 * R3: 리더 선출을 모든 스케줄러가 쓰므로 전역으로 노출한다.
 * (RedisModule과 동일한 이유 — 모듈마다 import를 반복하지 않는다.)
 */
@Global()
@Module({
  providers: [SchedulerLeaderService],
  exports: [SchedulerLeaderService],
})
export class SchedulerModule {}
