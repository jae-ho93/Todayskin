import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

/**
 * Correlation ID middleware.
 *
 * 들어오는 요청에 x-request-id 헤더가 있으면 재사용하고, 없으면 새 UUID를 생성한다.
 * 모든 요청에 고유 식별자를 부여해 분산 환경에서 요청 흐름을 추적할 수 있다.
 *
 * nestjs-pino의 pino-http는 req.id를 로그 컨텍스트로 자동 사용하므로,
 * 이 middleware가 설정한 ID가 모든 로그 레코드에 포함된다.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incomingId = req.headers['x-request-id'] as string | undefined;
    const correlationId =
      incomingId && incomingId.length <= 128 ? incomingId : randomUUID();

    // Express의 req.id를 설정해 pino-http가 사용하도록 한다.
    (req as unknown as { id: string }).id = correlationId;

    // 응답 헤더에 포함해 클라이언트가 추적할 수 있게 한다.
    res.setHeader('x-request-id', correlationId);

    next();
  }
}
