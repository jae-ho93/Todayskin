import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { initSentry, flushSentry } from './common/logging/sentry.config';
import { buildOpenApiConfig } from './openapi.config';
import { resolveJobRole } from './config/job-role';

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
    const document = SwaggerModule.createDocument(app, buildOpenApiConfig());
    SwaggerModule.setup('api/docs', app, document);
  }

  // R4: SIGTERM(ECS 배포·스케일인)에서도 모듈 lifecycle이 돌아가야 한다.
  // enableShutdownHooks()의 기본 시그널 핸들러는 정리 후 시그널을 재발생시켜
  // 프로세스를 즉시 끝내므로 Sentry flush가 유실된다. 그래서 직접 핸들러를 달고
  // app.close()로 OnModuleDestroy/OnApplicationShutdown을 호출한 뒤 flush한다.
  registerShutdownHandlers(app);

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);

  const logger = app.get(Logger);
  // R13: 워커 전용 프로세스도 HTTP를 계속 띄운다 — ECS가 컨테이너 헬스체크로
  // /health를 호출하기 때문이다(ALB 타깃 그룹에는 등록하지 않는다).
  logger.log(`Server running on http://localhost:${port} (JOB_ROLE=${resolveJobRole(configService)})`);
  if (!isProduction) {
    logger.log(`Swagger UI at http://localhost:${port}/api/docs`);
  }
  if (sentryEnabled) {
    logger.log('Sentry error tracking enabled');
  }
}

/**
 * R4: graceful shutdown.
 *
 * ECS는 배포·스케일인 때 SIGTERM을 보내고 stopTimeout 후 SIGKILL한다.
 * `beforeExit`는 이벤트 루프가 비어 정상 종료될 때만 발생하므로 SIGTERM에서는
 * 절대 호출되지 않는다 — 그 결과 DB/Redis 커넥션과 처리 중인 BullMQ 잡이
 * 정리되지 않고 Sentry 이벤트도 유실됐다.
 *
 * 순서: app.close()(진행 중 요청 종료 + lifecycle hook) → Sentry flush → exit.
 */
function registerShutdownHandlers(app: Awaited<ReturnType<typeof NestFactory.create>>): void {
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    // 두 번째 시그널(배포 중 재전송 등)에 close()가 중복 실행되지 않게 한다.
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await app.close();
    } catch (e) {
      // 로거가 이미 닫혔을 수 있으므로 stderr로 남긴다.
      console.error(`Graceful shutdown failed on ${signal}:`, e);
    } finally {
      await flushSentry();
      process.exit(0);
    }
  };

  for (const signal of signals) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }

  // 이벤트 루프가 비어 정상 종료되는 경로(로컬 스크립트 등)도 계속 flush한다.
  process.on('beforeExit', () => {
    void flushSentry();
  });
}

bootstrap().catch((e) => {
  // 부팅 실패는 조용히 죽지 않게 로깅하고 non-zero로 종료한다
  // (ECS가 태스크 실패를 인지해 롤백 판단을 할 수 있어야 한다).
  // Nest 로거가 아직 없으므로 stderr로 남긴다.
  console.error('Nest application failed to start:', e);
  process.exit(1);
});
