import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import {
  ThrottlerModule,
  ThrottlerGuard,
  ThrottlerStorageService,
} from '@nestjs/throttler';
import { envValidationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    // N1: 구조화 로깅 — nestjs-pino JSON 로거, correlation ID, 민감정보 마스킹.
    LoggerModule,
    // N0: Rate Limit. 메모리 저장소를 기본으로 사용한다(외부 의존성 최소화).
    // limit/window는 환경변수로 조정 가능하며, 테스트 환경은 skipIf로 비활성화한다.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            limit: config.get<number>('THROTTLE_LIMIT', 60),
            ttl: config.get<number>('THROTTLE_TTL_MS', 60_000),
          },
        ],
        storage: new ThrottlerStorageService(),
        errorMessage: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        skipIf: () => config.get<string>('NODE_ENV') === 'test',
      }),
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
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
