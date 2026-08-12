import { ConfigService } from '@nestjs/config';
import { KakaoSocialProvider } from './kakao.social-provider';
import { SocialProviderError } from './social-provider.interface';

/**
 * N46: Kakao 앱 바인딩 검증 단위 테스트.
 * access_token_info의 app_id가 우리 앱과 다르면(타 앱 토큰) 거부하는지 확인한다.
 */
describe('KakaoSocialProvider', () => {
  const configMock = (appId?: string) =>
    ({
      get: jest.fn((key: string) =>
        key === 'KAKAO_APP_ID' ? appId : undefined,
      ),
    }) as unknown as ConfigService;

  const jsonResponse = (body: unknown): Response =>
    ({ ok: true, json: async () => body }) as unknown as Response;

  const tokenInfo = (appId: number) => jsonResponse({ id: 999, app_id: appId });
  const userMe = () =>
    jsonResponse({
      id: 999,
      kakao_account: { profile: { nickname: '철수' }, email: 'a@b.c' },
    });

  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('우리 앱에서 발급된 토큰이면 프로필을 반환한다', async () => {
    fetchSpy
      .mockResolvedValueOnce(tokenInfo(123456))
      .mockResolvedValueOnce(userMe());
    const provider = new KakaoSocialProvider(configMock('123456'));

    const profile = await provider.verify('valid-token');

    expect(profile).toEqual({
      providerUserId: '999',
      name: '철수',
      email: 'a@b.c',
    });
    // 첫 호출이 access_token_info, 두 번째가 user/me여야 한다.
    expect(fetchSpy.mock.calls[0][0]).toContain('access_token_info');
    expect(fetchSpy.mock.calls[1][0]).toContain('/v2/user/me');
  });

  it('다른 앱에서 발급된 토큰(app_id 불일치)은 거부한다', async () => {
    fetchSpy.mockResolvedValueOnce(tokenInfo(777777));
    const provider = new KakaoSocialProvider(configMock('123456'));

    await expect(provider.verify('other-app-token')).rejects.toThrow(
      '다른 앱에서 발급된 카카오 토큰입니다',
    );
    // 바인딩 검증에서 끊겨 user/me는 호출되지 않는다.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('access_token_info가 401이면(무효 토큰) 거부한다', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 401 } as Response);
    const provider = new KakaoSocialProvider(configMock('123456'));

    await expect(provider.verify('expired')).rejects.toThrow(
      SocialProviderError,
    );
  });

  it('KAKAO_APP_ID 미설정이면 네트워크 호출 없이 거부한다 (fail-closed)', async () => {
    const provider = new KakaoSocialProvider(configMock(undefined));

    await expect(provider.verify('any')).rejects.toThrow(
      '카카오 로그인 검증을 사용할 수 없어요',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('토큰 정보에 app_id가 없으면 거부한다', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 999 }));
    const provider = new KakaoSocialProvider(configMock('123456'));

    await expect(provider.verify('weird')).rejects.toThrow(
      SocialProviderError,
    );
  });
});
