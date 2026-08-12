import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialAuthService } from './social-auth.service';
import { KakaoSocialProvider } from './kakao.social-provider';
import { GoogleSocialProvider } from './google.social-provider';
import { AppleSocialProvider } from './apple.social-provider';

/**
 * N33: SocialAuthService 단위 테스트.
 * MOCK_SOCIAL 게이트·제공자 라우팅·에러 매핑을 검증한다 (네트워크 없음).
 */
describe('SocialAuthService', () => {
  const configMock = (overrides: Record<string, unknown> = {}) =>
    ({
      get: jest.fn((key: string, fallback?: unknown) =>
        key in overrides ? overrides[key] : (fallback ?? undefined),
      ),
    }) as unknown as ConfigService;

  const realProviders = (
    config: ConfigService,
  ): [KakaoSocialProvider, GoogleSocialProvider, AppleSocialProvider] => [
    new KakaoSocialProvider(config),
    new GoogleSocialProvider(config),
    new AppleSocialProvider(config),
  ];

  afterEach(() => {
    delete process.env.MOCK_SOCIAL;
  });

  it('MOCK_SOCIAL=true면 모든 제공자가 mock으로 동작하고 같은 토큰은 같은 계정으로 매핑된다', async () => {
    process.env.MOCK_SOCIAL = 'true';
    const service = new SocialAuthService(
      configMock(),
      ...realProviders(configMock()),
    );

    const first = await service.verify('kakao', 'social-token-1');
    const second = await service.verify('kakao', 'social-token-1');
    const other = await service.verify('google', 'social-token-1');

    expect(first.providerUserId).toBe(second.providerUserId);
    expect(first.providerUserId).toMatch(/^kakao-/);
    expect(other.providerUserId).toMatch(/^google-/);
    expect(first.providerUserId).not.toBe(other.providerUserId);
    expect(first.name).toBeDefined();
  });

  it('mock 모드에서 빈 토큰은 401로 매핑된다', async () => {
    process.env.MOCK_SOCIAL = 'true';
    const service = new SocialAuthService(
      configMock(),
      ...realProviders(configMock()),
    );
    await expect(service.verify('kakao', '')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('지원하지 않는 제공자는 400', async () => {
    process.env.MOCK_SOCIAL = 'true';
    const service = new SocialAuthService(
      configMock(),
      ...realProviders(configMock()),
    );
    await expect(
      service.verify('naver' as never, 'token'),
    ).rejects.toThrow(BadRequestException);
  });

  it('MOCK_SOCIAL 미설정이면 실제 제공자를 라우팅한다 (kakao는 검증 시 네트워크 실패 → 401)', async () => {
    const config = configMock({ KAKAO_APP_ID: '123456' });
    const service = new SocialAuthService(config, ...realProviders(config));
    // 실제 KakaoSocialProvider는 kapi.kakao.com을 호출한다 — 테스트에서는
    // 네트워크 실패도 401 매핑으로 이어지는지만 확인한다.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    try {
      await expect(service.verify('kakao', 'any-token')).rejects.toThrow(
        UnauthorizedException,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('google 제공자는 GOOGLE_CLIENT_ID가 없으면 명시적 401 (서버 설정 누락)', async () => {
    const service = new SocialAuthService(
      configMock(),
      ...realProviders(configMock({ GOOGLE_CLIENT_ID: '' })),
    );
    await expect(service.verify('google', 'any-id-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('kakao 제공자는 KAKAO_APP_ID가 없으면 명시적 401 (서버 설정 누락, N46)', async () => {
    const service = new SocialAuthService(
      configMock(),
      ...realProviders(configMock()),
    );
    await expect(service.verify('kakao', 'any-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
