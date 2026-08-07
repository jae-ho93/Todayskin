import { ConfigService } from '@nestjs/config';
import { OtpGatewayError } from './otp-provider.interface';
import { SmsOtpProvider } from './sms-otp.provider';

/**
 * SmsOtpProvider(알리고) 단위 테스트.
 * 실제 게이트웨이는 외부 서비스이므로 global.fetch를 mock해서
 * 요청 구성·성공 판별·오류 매핑·재시도·민감정보 미노출만 검증한다.
 */
describe('SmsOtpProvider', () => {
  const phone = '01012345678';
  const code = '123456';
  const ENDPOINT = 'https://apis.aligo.in/send/';

  function makeProvider(env: Record<string, string>): SmsOtpProvider {
    return new SmsOtpProvider(new ConfigService(env));
  }

  const fullEnv: Record<string, string> = {
    SMS_API_KEY: 'test-api-key',
    SMS_USER_ID: 'todayskin',
    SMS_SENDER: '01099998888',
    SMS_ENDPOINT: ENDPOINT,
    SMS_TESTMODE: '',
    SMS_TIMEOUT_MS: '1000',
    SMS_MAX_RETRIES: '1',
  };

  afterEach(() => {
    jest.restoreAllMocks();
    // @ts-expect-error 전역 fetch를 원복한다.
    delete global.fetch;
  });

  it('설정 누락 시 fail-closed — fetch를 호출하지 않고 OtpGatewayError', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = makeProvider({});
    await expect(provider.send(phone, code)).rejects.toBeInstanceOf(OtpGatewayError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('성공(result_code>0) 시 resolve — 알리고 form body로 발송', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result_code: 1, message: '', msg_id: 100 }),
    }) as unknown as typeof fetch;

    const provider = makeProvider(fullEnv);
    await expect(provider.send(phone, code)).resolves.toBeUndefined();

    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe('POST');

    const body = init.body as URLSearchParams;
    expect(body.get('key')).toBe('test-api-key');
    expect(body.get('user_id')).toBe('todayskin');
    expect(body.get('sender')).toBe('01099998888');
    expect(body.get('receiver')).toBe(phone);
    expect(body.get('msg')).toContain(code);
    expect(body.get('msg_type')).toBe('SMS');
    // testmode 미설정 시 testmode_yn 미포함
    expect(body.get('testmode_yn')).toBeNull();
  });

  it('testmode_yn=Y 설정 시 testmode_yn=Y 포함', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result_code: 1 }),
    }) as unknown as typeof fetch;

    const provider = makeProvider({ ...fullEnv, SMS_TESTMODE: 'Y' });
    await provider.send(phone, code);

    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect((init.body as URLSearchParams).get('testmode_yn')).toBe('Y');
  });

  it('API 거부(result_code<0) 시 OtpGatewayError — 재시도하지 않음(중복 발송 방지)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result_code: -101, message: '인증오류입니다.' }),
    }) as unknown as typeof fetch;

    const provider = makeProvider(fullEnv);
    await expect(provider.send(phone, code)).rejects.toBeInstanceOf(OtpGatewayError);
    expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it('HTTP 오류 응답 시 OtpGatewayError — 재시도하지 않음', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    const provider = makeProvider(fullEnv);
    await expect(provider.send(phone, code)).rejects.toBeInstanceOf(OtpGatewayError);
    expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it('네트워크 오류 시 제한 재시도 후 OtpGatewayError', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    const provider = makeProvider(fullEnv); // SMS_MAX_RETRIES=1 → 총 2회
    await expect(provider.send(phone, code)).rejects.toBeInstanceOf(OtpGatewayError);
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
      await provider.send(phone, code);
      err = new Error('should have thrown');
    } catch (e) {
      err = e as Error;
    }
    const logs = [...loggerSpy.mock.calls, ...warnSpy.mock.calls]
      .map((c) => String(c[0]))
      .join('\n');
    const message = err.message + '\n' + logs;

    expect(message).not.toContain(phone);
    expect(message).not.toContain(code);
    expect(message).not.toContain('test-api-key');
  });
});
