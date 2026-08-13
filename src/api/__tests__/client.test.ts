import { api, DiagnosisCanceledError } from '../client';
import * as session from '../../lib/session';

/**
 * R16: 401 → refresh 회전 → 재시도 경로. 이 로직이 조용히 깨지면 access token이
 * 만료되는 15분마다 사용자가 로그아웃되거나, 반대로 무효한 세션이 계속 남는다.
 */

const BASE_URL = 'http://localhost:3000';

type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit?]>;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = jest.fn() as FetchMock;
  global.fetch = fetchMock as unknown as typeof fetch;
  jest.spyOn(session, 'getToken').mockResolvedValue('access-1');
  jest.spyOn(session, 'getRefreshToken').mockResolvedValue('refresh-1');
  jest.spyOn(session, 'updateTokens').mockResolvedValue(undefined);
  jest.spyOn(session, 'clearSession').mockResolvedValue(undefined);
});

function calledPaths(): string[] {
  return fetchMock.mock.calls.map(([url]) => url.replace(BASE_URL, ''));
}

describe('authFetch 401 처리', () => {
  it('401이면 refresh 후 원 요청을 1회 재시도한다', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'access-2', expiresIn: 900 }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'diag-1' }));

    const result = await api.getSkinScore();

    expect(result).toEqual({ status: 'ok', data: { id: 'diag-1' } });
    expect(calledPaths()).toEqual([
      '/diagnosis/latest',
      '/auth/refresh',
      '/diagnosis/latest',
    ]);
    expect(session.updateTokens).toHaveBeenCalledWith('access-2', undefined, 900);
  });

  it('재시도도 401이면 refresh를 반복하지 않고 실패를 반환한다', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'access-2' }))
      .mockResolvedValueOnce(jsonResponse(401, {}));

    await expect(api.getSkinScore()).resolves.toEqual({ status: 'error' });
    expect(calledPaths().filter((p) => p === '/auth/refresh')).toHaveLength(1);
  });

  it('동시에 401을 받은 여러 요청이 refresh를 1회만 보낸다', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url.endsWith('/auth/refresh')) {
        return jsonResponse(200, { accessToken: 'access-2' });
      }
      // 첫 호출은 401, refresh 뒤 재시도는 200.
      const previous = fetchMock.mock.calls.filter(([u]) => u === url).length;
      return previous > 1 ? jsonResponse(200, { id: 'ok' }) : jsonResponse(401, {});
    });

    const [latest, pattern, consents] = await Promise.all([
      api.getSkinScore(),
      api.getPattern(),
      api.getMyConsents(),
    ]);

    expect(latest.status).toBe('ok');
    expect(pattern).toEqual({ id: 'ok' });
    expect(consents).toEqual({ id: 'ok' });
    expect(calledPaths().filter((p) => p === '/auth/refresh')).toHaveLength(1);
  });

  it('refresh 토큰이 없으면 요청을 재시도하지 않고 세션을 정리한다', async () => {
    jest.spyOn(session, 'getRefreshToken').mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));

    await expect(api.getSkinScore()).resolves.toEqual({ status: 'error' });
    expect(session.clearSession).toHaveBeenCalled();
    expect(calledPaths()).toEqual(['/diagnosis/latest']);
  });

  it('refresh가 거부되면(401) 세션을 정리한다', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(401, {}));

    await expect(api.getSkinScore()).resolves.toEqual({ status: 'error' });
    expect(session.clearSession).toHaveBeenCalled();
    expect(session.updateTokens).not.toHaveBeenCalled();
  });

  it('refresh 요청이 네트워크 오류면 세션을 정리한다', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockRejectedValueOnce(new Error('network down'));

    await expect(api.getSkinScore()).resolves.toEqual({ status: 'error' });
    expect(session.clearSession).toHaveBeenCalled();
  });

  it('refresh 실패 후 다음 401도 다시 refresh를 시도한다 (in-flight 잠금이 남지 않는다)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(401, {}));
    await api.getSkinScore();

    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'access-2' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'diag-1' }));

    await expect(api.getSkinScore()).resolves.toEqual({
      status: 'ok',
      data: { id: 'diag-1' },
    });
  });
});

describe('authFetch 상태 구분', () => {
  it('404는 not_found로, 5xx는 error로 구분한다', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, {}));
    await expect(api.getSkinScore()).resolves.toEqual({ status: 'not_found' });

    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
    await expect(api.getSkinScore()).resolves.toEqual({ status: 'error' });
  });

  it('Authorization 헤더에 access token을 붙인다', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'diag-1' }));

    await api.getSkinScore();

    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
  });

  it('토큰이 없으면 Authorization 헤더를 붙이지 않는다', async () => {
    jest.spyOn(session, 'getToken').mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'diag-1' }));

    await api.getSkinScore();

    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe('submitDiagnosis 취소·타임아웃 구분 (F81)', () => {
  function abortError(): Error {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    return err;
  }

  it('사용자가 취소하면 DiagnosisCanceledError를 던진다', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementationOnce(async () => {
      // 요청이 나간 직후 사용자가 취소 버튼을 누른 상황.
      controller.abort();
      throw abortError();
    });

    await expect(
      api.submitDiagnosis(
        { front: 'file://front.jpg', wentOutside: false },
        { signal: controller.signal },
      ),
    ).rejects.toBeInstanceOf(DiagnosisCanceledError);
  });

  it('취소 없이 abort(타임아웃)면 네트워크 안내 문구로 던진다', async () => {
    fetchMock.mockRejectedValueOnce(abortError());

    await expect(
      api.submitDiagnosis({ front: 'file://front.jpg', wentOutside: false }),
    ).rejects.toThrow('네트워크가 느려 분석이 오래 걸리고 있어요');
  });

  it('이미 취소된 신호로는 요청이 즉시 취소로 끝난다', async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValueOnce(abortError());

    await expect(
      api.submitDiagnosis(
        { front: 'file://front.jpg', wentOutside: false },
        { signal: controller.signal },
      ),
    ).rejects.toBeInstanceOf(DiagnosisCanceledError);
  });
});

describe('쓰기 요청 오류 메시지', () => {
  it('detail 문자열을 그대로 Error 메시지로 던진다', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { detail: '이미 가입된 번호입니다' }));

    await expect(api.login('01012345678')).rejects.toThrow('이미 가입된 번호입니다');
  });

  it('detail이 배열이면 msg를 줄바꿈으로 합친다 (FastAPI 형식)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, { detail: [{ msg: '전화번호 형식' }, { msg: '이름 필수' }] }),
    );

    await expect(api.login('01012345678')).rejects.toThrow('전화번호 형식\n이름 필수');
  });

  it('detail이 없으면 상태 코드를 담은 기본 메시지를 던진다', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));

    await expect(api.login('01012345678')).rejects.toThrow('요청에 실패했습니다 (500)');
  });
});
