import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  UnprocessableEntityException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter(undefined);

  function mockHost(url = '/x') {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const response = { status, json };
    const request = { method: 'GET', url, id: 'cid-1' };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;
    return { host, status, json };
  }

  it('maps HttpException to contract body', () => {
    const { host, status, json } = mockHost('/auth/login');
    filter.catch(new BadRequestException('bad'), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        path: '/auth/login',
        correlationId: 'cid-1',
      }),
    );
  });

  it('N49: passes through machine-readable code for quality rejections', () => {
    const { host, status, json } = mockHost('/diagnosis');
    filter.catch(
      new UnprocessableEntityException({
        message: '사진이 너무 어두워요. 밝은 곳에서 다시 촬영해주세요.',
        error: 'Unprocessable Entity',
        code: 'TOO_DARK',
      }),
      host,
    );
    expect(status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422,
        code: 'TOO_DARK',
        detail: '사진이 너무 어두워요. 밝은 곳에서 다시 촬영해주세요.',
      }),
    );
  });

  it('code가 없는 예외에는 code 필드를 넣지 않는다', () => {
    const { host, json } = mockHost('/auth/login');
    filter.catch(new BadRequestException('bad'), host);
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect('code' in body).toBe(false);
  });

  it('maps unknown errors to 500 generic body', () => {
    const { host, status, json } = mockHost('/boom');
    filter.catch(new Error('secret db detail'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        path: '/boom',
      }),
    );
  });
});
