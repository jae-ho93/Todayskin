import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { CorrelationIdMiddleware } from '../middleware/correlation-id.middleware';
import { createPinoLoggerOptions } from './logger.config';

/**
 * 구조화 로깅 모듈.
 *
 * nestjs-pino를 통해 JSON 구조화 로그를 제공하고, 모든 요청에
 * correlation ID를 부여한다. 환경에 따라 JSON(운영) 또는
 * pino-pretty(개발) 포맷을 사용한다.
 *
 * Sentry 초기화는 이 모듈이 아닌 main.ts bootstrap에서 수행한다.
 * (Sentry는 HTTP 미들웨어로 Express에 연결되어야 하므로)
 */
@Module({
  imports: [
    ConfigModule,
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createPinoLoggerOptions(config),
    }),
  ],
  providers: [CorrelationIdMiddleware],
  exports: [PinoLoggerModule, CorrelationIdMiddleware],
})
export class LoggerModule {}
