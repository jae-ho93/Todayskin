import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import {
  ThrottlerModule,
  ThrottlerGuard,
  ThrottlerStorageService,
} from '@nestjs/throttler';
import { validateEnvWithRegistry } from './config/env.validation';
import { SoftDeleteModule } from './common/soft-delete/soft-delete.module';
import { SchedulerModule } from './common/scheduler/scheduler.module';
import { RedisThrottlerStorage } from './common/rate-limit/redis-throttler.storage';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';
import {
  MiddlewareConsumer,
  NestModule,
} from '@nestjs/common';
import { LoggerModule } from './common/logging/logger.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { AuthModule } from './modules/auth/auth.module';
import { OtpModule } from './modules/otp/otp.module';
import { AdminModule } from './modules/admin/admin.module';
import { WeatherModule } from './modules/weather/weather.module';
import { RecommendationModule } from './modules/recommendations/recommendation.module';
import { ProductModule } from './modules/products/product.module';
import { DiagnosisModule } from './modules/diagnosis/diagnosis.module';
import { PatternModule } from './modules/pattern/pattern.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { ConsentModule } from './modules/consent/consent.module';
import { StorageModule } from './modules/storage/storage.module';
import { JobsModule } from './modules/jobs/jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      validate: validateEnvWithRegistry,
    }),
    // N1: 구조화 로깅 — nestjs-pino JSON 로거, correlation ID, 민감정보 마스킹.
    LoggerModule,
    // N0/N11: Rate Limit. N11부터 Redis 분산 저장소 지원.
    // THROTTLE_STORAGE=redis(또는 auto+REDIS_URL 설정) → RedisThrottlerStorage,
    // 그 외(개발/테스트·Redis 미설정) → 메모리 저장소.
    // Redis 장애 시 fail-open(요청 통과) — rate limit이 서비스 가용성을 깨지 않게 한다.
    // limit/window는 환경변수로 조정 가능하며, 테스트 환경은 skipIf로 비활성화한다.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, RedisModule],
      inject: [ConfigService, RedisService],
      useFactory: (config: ConfigService, redis: RedisService) => {
        const mode = config.get<string>('THROTTLE_STORAGE') ?? 'auto';
        const url = (config.get<string>('REDIS_URL') ?? '').trim();
        const useRedis = mode === 'redis' || (mode === 'auto' && Boolean(url));
        if (mode === 'redis' && !url) {
          // JOB_DISPATCHER=bullmq와 동일하게 설정 오류를 조용히 넘기지 않는다.
          // 조용한 fail-open 전환은 rate limit이 무한정 꺼진 것처럼 보이게 한다.
          throw new Error('THROTTLE_STORAGE=redis requires REDIS_URL');
        }
        return {
          throttlers: [
            {
              name: 'default',
              limit: config.get<number>('THROTTLE_LIMIT', 60),
              ttl: config.get<number>('THROTTLE_TTL_MS', 60_000),
            },
          ],
          storage: useRedis
            ? new RedisThrottlerStorage(redis)
            : new ThrottlerStorageService(),
          errorMessage: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
          skipIf: () => config.get<string>('NODE_ENV') === 'test',
        };
      },
    }),
    PrismaModule,
    RedisModule,
    // R3: 스케줄러 리더 선출(Redis SET NX). 다중 인스턴스에서 주기 작업 중복 실행 방지.
    SchedulerModule,
    HealthModule,
    SoftDeleteModule,
    AuthModule,
    OtpModule,
    AdminModule,
    WeatherModule,
    RecommendationModule,
    ProductModule,
    DiagnosisModule,
    PatternModule,
    NotificationModule,
    ConsentModule,
    StorageModule,
    JobsModule,
  ],
  providers: [
    // ThrottlerGuard를 전역 가드로 등록해 모든 라우트에 Rate Limit 적용.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  // N1: 모든 요청에 correlation ID를 부여하는 미들웨어.
  // nestjs-pino보다 먼저 실행되어야 req.id가 로그에 포함된다.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
