import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Request, Response } from 'express';
import { captureException } from '../logging/sentry.config';
import { maskSensitiveData } from '../logging/redact.logger';

/**
 * 모든 HTTP 예외를 하나의 응답 계약으로 변환한다.
 *
 * N1: NestJS 기본 Logger 대신 pino 로거를 사용해 구조화 로그로 남긴다.
 * 500 에러는 Sentry에 캡처하고(민감정보 마스킹), 로그 메시지에서도
 * 민감정보를 마스킹한다.
 *
 * HttpException만 잡으면 Prisma/외부 클라이언트의 예기치 않은 오류가
 * Nest 기본 응답으로 새어 나가 프론트의 `detail` 계약이 깨지고, DB 내부
 * 메시지가 사용자에게 노출될 수 있다. 알 수 없는 오류는 항상 일반화한다.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(HttpExceptionFilter.name)
    // 수동 new HttpExceptionFilter() 호출(e2e)에서 주입되지 않을 수 있어
    // optional로 두고 안전 호출(logger?.warn)한다. DI 환경에서는 정상 주입된다.
    private readonly logger?: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, error, code } = this.toErrorDetails(exception);

    const correlationId = (request as unknown as { id?: string }).id;
    const logContext = {
      method: request.method,
      url: request.url,
      statusCode: status,
      correlationId,
      errorName: exception instanceof Error ? exception.name : 'UnknownError',
    };

    if (status >= 500) {
      this.logger?.error(
        {
          ...logContext,
          err: exception instanceof Error ? exception.stack : String(exception),
        },
        `${request.method} ${request.url} -> ${status} ${logContext.errorName}`,
      );
      // 500 에러만 Sentry에 캡처 (민감정보는 sentry.config에서 마스킹)
      captureException(exception);
    } else {
      const safeMsg =
        typeof message === 'string' ? maskSensitiveData(message) : message;
      this.logger?.warn(
        logContext,
        `${request.method} ${request.url} -> ${status} ${JSON.stringify(safeMsg)}`,
      );
    }

    const body: Record<string, unknown> = {
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (correlationId) {
      body.correlationId = correlationId;
    }

    // N49: 기계 판독용 사유 코드(TOO_DARK 등) — FE가 코드별 안내를 분기한다.
    if (code) {
      body.code = code;
    }

    // 기존 FastAPI 에러 응답 호환: 프론트(src/api/client.ts extractErrorMessage)는
    // { detail: "메시지" } 형태에서 에러 메시지를 추출한다. NestJS 표준 필드와 함께
    // detail을 같이 제공해 프론트 변경 없이 사용자 친화적 메시지가 노출되도록 한다.
    // class-validator의 배열 메시지도 그대로 보존한다. 기존 프론트는 문자열과
    // 배열을 모두 처리하므로 첫 항목만 버리지 않는다.
    body.detail = message;

    response.status(status).json(body);
  }

  private toErrorDetails(exception: unknown): {
    status: number;
    message: string | string[];
    error: string;
    code?: string;
  } {
    if (exception instanceof HttpException) {
      const raw = exception.getResponse();
      const response =
        typeof raw === 'object' && raw !== null
          ? (raw as Record<string, unknown>)
          : undefined;
      const rawMessage = response?.message ?? raw;
      const message = this.normalizeMessage(rawMessage, exception.message);
      return {
        status: exception.getStatus(),
        message,
        error:
          typeof response?.error === 'string'
            ? response.error
            : exception.name,
        code:
          typeof response?.code === 'string' ? response.code : undefined,
      };
    }

    // Prisma KnownRequestError의 내부 타입을 애플리케이션 공통 계층에
    // 직접 의존시키지 않고 code만 읽어, ORM 교체에도 필터가 동작하게 한다.
    const code = this.prismaErrorCode(exception);
    if (code === 'P2002') {
      return {
        status: HttpStatus.CONFLICT,
        message: '이미 존재하는 데이터입니다',
        error: 'Conflict',
      };
    }
    if (code === 'P2025') {
      return {
        status: HttpStatus.NOT_FOUND,
        message: '요청한 데이터를 찾을 수 없습니다',
        error: 'Not Found',
      };
    }
    if (code === 'P2003') {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: '참조하는 데이터가 유효하지 않습니다',
        error: 'Bad Request',
      };
    }

    // Multer가 multipart 제한을 위반하면 HttpException이 아닌 자체 오류를
    // 던진다. 이를 500으로 처리하면 클라이언트가 재시도 가능한 입력 오류를
    // 서버 장애로 오인하므로 명시적으로 400으로 변환한다.
    if (
      code === 'LIMIT_FILE_SIZE' ||
      code === 'LIMIT_FILE_COUNT' ||
      code === 'LIMIT_PART_COUNT' ||
      code === 'LIMIT_UNEXPECTED_FILE'
    ) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: '업로드 파일 수 또는 크기 제한을 초과했습니다',
        error: 'Bad Request',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: '서버 내부 오류가 발생했습니다',
      error: 'Internal Server Error',
    };
  }

  private normalizeMessage(value: unknown, fallback: string): string | string[] {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }
    return fallback;
  }

  private prismaErrorCode(exception: unknown): string | undefined {
    if (!exception || typeof exception !== 'object') return undefined;
    const code = (exception as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
}
