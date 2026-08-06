import { CorrelationIdMiddleware } from './correlation-id.middleware';
import type { Request, Response, NextFunction } from 'express';

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      setHeader: jest.fn(),
    };
    nextFunction = jest.fn();
  });

  it('x-request-id 헤더가 없으면 새 UUID를 생성한다', () => {
    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction,
    );

    const reqId = (mockRequest as unknown as { id: string }).id;
    expect(reqId).toBeDefined();
    expect(reqId).toHaveLength(36); // UUID 형식
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      reqId,
    );
    expect(nextFunction).toHaveBeenCalled();
  });

  it('x-request-id 헤더가 있으면 재사용한다', () => {
    const incomingId = '550e8400-e29b-41d4-a716-446655440000';
    mockRequest.headers = { 'x-request-id': incomingId };

    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction,
    );

    const reqId = (mockRequest as unknown as { id: string }).id;
    expect(reqId).toBe(incomingId);
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      incomingId,
    );
  });

  it('x-request-id가 128자를 초과하면 새 UUID를 생성한다', () => {
    const tooLongId = 'a'.repeat(129);
    mockRequest.headers = { 'x-request-id': tooLongId };

    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction,
    );

    const reqId = (mockRequest as unknown as { id: string }).id;
    expect(reqId).not.toBe(tooLongId);
    expect(reqId).toHaveLength(36);
  });

  it('next를 호출한다', () => {
    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFunction,
    );
    expect(nextFunction).toHaveBeenCalledTimes(1);
  });
});
