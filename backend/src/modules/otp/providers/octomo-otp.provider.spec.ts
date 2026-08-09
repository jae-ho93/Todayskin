import { ConfigService } from '@nestjs/config';
import { OtpGatewayError } from './otp-provider.interface';
import { OctomoOtpProvider } from './octomo-otp.provider';

/**
 * OctomoOtpProvider(OCTOMO MO 인증) 단위 테스트.
 * 실제 게이트웨이는 외부 서비스이므로 global.fetch를 mock해서
 * 요청 구성·성공 판별·미수신(false) 처리·오류 매핑·재시도·민감정보 미노출만 검증한다.
 */
describe('OctomoOtpProvider', () => {
  const phone = '01012345678';
  const text = '123456';
  const ENDPOINT = 'https://api.octoverse.kr/octomo/v1/public/message/exists';

  function makeProvider(env: Record<string, string>): OctomoOtpProvider {
    return new OctomoOtpProvider(new ConfigService(env));
  }

  const fullEnv: Record<string, string> = {
    OCTOMO_API_KEY: 'test-api-key',
    OCTOMO_ENDPOINT: ENDPOINT,
    OCTOMO_RECIPIENT_NUMBER: '1666-3538',
    OCTOMO_TIMEOUT_MS: '1000',
    OCTOMO_MAX_RETRIES: '1',
  };

  afterEach(() => {
    jest.restoreAllMocks();
    // @ts-expect-error 전역 fetch를 원복한다.
    delete global.fetch;
  });

  it('recipientNumber — 기본값 1666-3538, env로 오버라이드 가능', () => {
    expect(makeProvider({}).recipientNumber).toBe('1666-3538');
    expect(makeProvider({ OCTOMO_RECIPIENT_NUMBER: '080-0000-0000' }).recipientNumber).toBe(
      '080-0000-0000',
    );
  });

  it('설정 누락 시 fail-closed — fetch를 호출하지 않고 OtpGatewayError', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = makeProvider({});
    await expect(provider.verifySent(phone, text)).rejects.toBeInstanceOf(OtpGatewayError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('verified=true 응답 시 true 반환 — Octomo Authorization 헤더와 JSON body로 호출', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ verified: true }),
    }) as unknown as typeof fetch;

    const provider = makeProvider(fullEnv);
    await expect(provider.verifySent(phone, text)).resolves.toBe(true);

    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Octomo test-api-key');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({ mobileNum: phone, text });
  });

  it('verified=false 응답 시 false 반환 — 오류가 아닌 "아직 수신 안 됨"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ verified: false }),
    }) as unknown as typeof fetch;

    const provider = makeProvider(fullEnv);
    await expect(provider.verifySent(phone, text)).resolves.toBe(false);
  });

  it('verified 필드가 없는 응답 시 OtpGatewayError — 가짜 성공 금지', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'unexpected' }),
    }) as unknown as typeof fetch;

    const provider = makeProvider(fullEnv);
    await expect(provider.verifySent(phone, text)).rejects.toBeInstanceOf(OtpGatewayError);
  });

  it('HTTP 오류 응답 시 OtpGatewayError — 재시도하지 않음', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    const provider = makeProvider(fullEnv);
    await expect(provider.verifySent(phone, text)).rejects.toBeInstanceOf(OtpGatewayError);
    expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it('네트워크 오류 시 제한 재시도 후 OtpGatewayError', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    const provider = makeProvider(fullEnv); // OCTOMO_MAX_RETRIES=1 → 총 2회
    await expect(provider.verifySent(phone, text)).rejects.toBeInstanceOf(OtpGatewayError);
    expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(2);
  });

  it('오류 메시지/로거에 전화번호·OTP 코드·API key가 노출되지 않는다', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    const provider = makeProvider(fullEnv);
    const loggerSpy = jest.spyOn(
      (provider as unknown as { logger: { error: (msg: unknown) => void; warn: (msg: unknown) => void } }).logger,
      'error',
    );
    const warnSpy = jest.spyOn(
      (provider as unknown as { logger: { error: (msg: unknown) => void; warn: (msg: unknown) => void } }).logger,
      'warn',
    );

    let err: Error;
    try {
      await provider.verifySent(phone, text);
      err = new Error('should have thrown');
    } catch (e) {
      err = e as Error;
    }
    const logs = [...loggerSpy.mock.calls, ...warnSpy.mock.calls]
      .map((c) => String(c[0]))
      .join('\n');
    const message = err.message + '\n' + logs;

    expect(message).not.toContain(phone);
    expect(message).not.toContain(text);
    expect(message).not.toContain('test-api-key');
  });
});
