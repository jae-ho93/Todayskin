import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = exception.getResponse();

    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as Record<string, unknown>).message ??
          exception.message;

    this.logger.warn(
      `${request.method} ${request.url} → ${status} ${JSON.stringify(message)}`,
    );

    const body: Record<string, unknown> = {
      statusCode: status,
      error:
        typeof exceptionResponse === 'object' && exceptionResponse !== null
          ? (exceptionResponse as Record<string, unknown>).error ??
            exception.name
          : exception.name,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // 기존 FastAPI 에러 응답 호환: 프론트(src/api/client.ts extractErrorMessage)는
    // { detail: "메시지" } 형태에서 에러 메시지를 추출한다. NestJS 표준 필드와 함께
    // detail을 같이 제공해 프론트 변경 없이 사용자 친화적 메시지가 노출되도록 한다.
    // message가 배열(class-validator)인 경우 첫 번째 항목, 문자열인 경우 그대로 사용.
    if (Array.isArray(message)) {
      body.detail = message[0] ?? message.join(' ');
    } else {
      body.detail = message;
    }

    response.status(status).json(body);
  }
}
