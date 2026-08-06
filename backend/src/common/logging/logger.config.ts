import type { Params } from 'nestjs-pino';
import type { Options } from 'pino-http';
import type { ConfigService } from '@nestjs/config';

/**
 * nestjs-pino 설정 팩토리.
 *
 * 운영(production): JSON 포맷 구조화 로그
 * 개발/테스트: pino-pretty로 가독성 좋게 출력
 *
 * 모든 로그 레코드에서 민감정보(전화번호·생년월일·좌표·token)를 마스킹한다.
 * HTTP 요청/응답 로깅과 자동 correlation ID(x-request-id)를 포함한다.
 */
export function createPinoLoggerOptions(
  config: ConfigService,
): Params {
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  const isTest = config.get<string>('NODE_ENV') === 'test';

  const pinoHttp: Options = {
    level: config.get<string>('LOG_LEVEL', isProduction ? 'info' : 'debug'),
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.phoneNumber',
        'req.body.password',
        'req.body.birthDate',
        'req.body.lat',
        'req.body.lon',
        'req.body.latitude',
        'req.body.longitude',
        'res.headers["set-cookie"]',
      ],
      censor: '[REDACTED]',
    },
    transport: isProduction || isTest
      ? undefined
      : {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname,req,res',
          },
        },
    serializers: {
      req(req: Record<string, unknown>) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
          remoteAddress: req.remoteAddress,
        };
      },
      res(res: Record<string, unknown>) {
        return { statusCode: res.statusCode };
      },
    },
    autoLogging: {
      ignore: (req) => {
        return req.url === '/health' || req.url === '/health/live' || req.url === '/health/ready';
      },
    },
  };

  return {
    pinoHttp,
    exclude: [],
  };
}
