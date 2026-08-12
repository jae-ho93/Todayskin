import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SocialProfile,
  SocialProvider,
  SocialProviderError,
  SocialProviderName,
  SocialVerifyContext,
} from './social-provider.interface';
import { KakaoSocialProvider } from './kakao.social-provider';
import { GoogleSocialProvider } from './google.social-provider';
import { AppleSocialProvider } from './apple.social-provider';
import { MockSocialProvider } from './mock.social-provider';

/**
 * N33: 소셜 토큰 검증 파사드.
 *
 * MOCK_SOCIAL=true(dev/test 전용)면 모든 제공자를 MockSocialProvider로 대체해
 * e2e·개발이 외부 API 없이 동작한다. 그 외에는 실제 제공자 검증을 사용한다.
 * 검증 실패(SocialProviderError)는 401로, 미지원 제공자는 400으로 매핑한다.
 */
@Injectable()
export class SocialAuthService {
  private readonly logger = new Logger(SocialAuthService.name);
  private readonly providers = new Map<SocialProviderName, SocialProvider>();

  constructor(
    config: ConfigService,
    kakao: KakaoSocialProvider,
    google: GoogleSocialProvider,
    apple: AppleSocialProvider,
  ) {
    // ConfigService가 .env 우선이라 e2e에서 process.env를 바꿔도 반영 안 될 수 있어
    // mock flag는 process.env를 우선 확인한다 (OtpService와 동일 패턴).
    const mockEnabled =
      (process.env.MOCK_SOCIAL ?? config.get<string>('MOCK_SOCIAL')) === 'true';

    if (mockEnabled) {
      this.logger.warn(
        'MOCK_SOCIAL=true — 모든 소셜 토큰 검증이 mock으로 동작합니다 (dev/test 전용)',
      );
      this.providers.set('kakao', new MockSocialProvider('kakao'));
      this.providers.set('google', new MockSocialProvider('google'));
      this.providers.set('apple', new MockSocialProvider('apple'));
      return;
    }
    this.providers.set('kakao', kakao);
    this.providers.set('google', google);
    this.providers.set('apple', apple);
  }

  async verify(
    provider: SocialProviderName,
    accessToken: string,
    context?: SocialVerifyContext,
  ): Promise<SocialProfile> {
    const impl = this.providers.get(provider);
    if (!impl) {
      throw new BadRequestException(
        `지원하지 않는 소셜 로그인 제공자입니다: ${provider}`,
      );
    }
    try {
      return await impl.verify(accessToken, context);
    } catch (e) {
      if (e instanceof SocialProviderError) {
        throw new UnauthorizedException(e.message);
      }
      throw e;
    }
  }
}
