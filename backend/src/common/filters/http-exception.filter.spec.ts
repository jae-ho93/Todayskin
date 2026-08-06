import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
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
