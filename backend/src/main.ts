import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { initSentry, flushSentry } from './common/logging/sentry.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService);
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  // N1: pino 로거를 애플리케이션 로거로 설정
  app.useLogger(app.get(Logger));

  // N1: Sentry 초기화 — SENTRY_DSN이 있을 때만 활성화.
  // Sentry 요청 핸들러와 트레이싱 핸들러는 Helmet/CORS 이전에 적용.
  const sentryEnabled = initSentry(configService);
  if (sentryEnabled) {
    Sentry.setupExpressErrorHandler(app as never);
  }

  // N0: Helmet 보안 헤더. 운영에서는 강제, 개발에서는 Swagger UI 호환을
  // 위해 crossOriginResourcePolicy를 완화한다.
  app.use(
    helmet({
      crossOriginResourcePolicy: isProduction
        ? { policy: 'same-origin' }
        : false,
      // Swagger UI가 작동하도록 개발 환경에서는 일부 완화.
      contentSecurityPolicy: isProduction ? undefined : false,
    }),
  );

  // 전역 ValidationPipe: 들어오는 모든 요청 DTO를 검증하고 변환
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // 공통 예외 응답 포맷 (N1: pino 로거 + Sentry 캡처 통합)
  app.useGlobalFilters(new HttpExceptionFilter(app.get(Logger)));

  // CORS 허용 목록 환경변수화
  const rawOrigins = configService.get<string>('ALLOWED_ORIGINS', '');
  const allowedOrigins = rawOrigins
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // N0: 운영 환경에서는 Swagger 노출을 차단한다.
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Todayskin API')
      .setDescription('날씨 연동 AI 피부 진단 및 맞춤형 화장품 추천 서비스')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`Server running on http://localhost:${port}`);
  if (!isProduction) {
    logger.log(`Swagger UI at http://localhost:${port}/api/docs`);
  }
  if (sentryEnabled) {
    logger.log('Sentry error tracking enabled');
  }

  // 종료 시 Sentry 이벤트 플러시
  process.on('beforeExit', () => {
    void flushSentry();
  });
}
bootstrap();
