import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * RedisModule — T12 날씨 캐시.
 * 전역에서 RedisService를 주입할 수 있도록 한다.
 * 연결 실패 시에도 부팅는 계속되므로 다른 모듈의 동작에 영향을 주지 않는다.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
