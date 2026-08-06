import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/**
 * HealthModule — /health, /health/live, /health/ready.
 * PrismaModule/RedisModule은 AppModule에서 전역 제공.
 */
@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
