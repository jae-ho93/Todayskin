import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SocialProfile,
  SocialProvider,
  SocialProviderError,
} from './social-provider.interface';
import { JwksClient, verifyIdTokenWithJwks } from './jwt-verify';

/**
 * N33: Apple 소셜 제공자.
 *
 * Sign in with Apple의 identity token을 서버에서 RS256 서명 검증한다.
 * aud(우리 번들 id)·iss(https://appleid.apple.com)·exp를 확인해 스푸핑을 막는다.
 * 사용자 식별자는 sub(Apple 고유 사용자 id)를 쓴다. 이메일은 동의에 따라 없을 수 있다.
 *
 * Apple은 클라이언트 시크릿(client_secret)이 있어야 userinfo로 이메일을 조회할 수
 * 있지만, identity token 자체에 email claim이 포함되어 별도 조회 없이 쓸 수 있다.
 * (스토어 미배포여도 API·설정은 포함 — F15에서 Dev 계정 연동)
 *
 * 알려진 한계: replay 방지를 위한 nonce claim 검증은 아직 없다 (exp로만 제한).
 * F15에서 앱 비밀번호·nonce 흐름 연동 시 보강한다.
 */
@Injectable()
export class AppleSocialProvider implements SocialProvider {
  readonly name = 'apple' as const;

  private readonly logger = new Logger(AppleSocialProvider.name);
  private readonly bundleId: string;
  private readonly jwks = new JwksClient('https://appleid.apple.com/auth/keys');

  constructor(config: ConfigService) {
    this.bundleId = (config.get<string>('APPLE_BUNDLE_ID') ?? '').trim();
  }

  async verify(accessToken: string): Promise<SocialProfile> {
    if (!this.bundleId) {
      // 서버 설정 누락은 클라이언트에 구체 원인을 노출하지 않는다 (로그에만 기록).
      this.logger.warn('Apple verify failed: APPLE_BUNDLE_ID not configured');
      throw new SocialProviderError('애플 로그인 검증을 사용할 수 없어요');
    }

    let payload;
    try {
      payload = await verifyIdTokenWithJwks(accessToken, {
        issuer: 'https://appleid.apple.com',
        audience: this.bundleId,
        getJwks: () => this.jwks.getKeys(),
      });
    } catch (e) {
      if (e instanceof SocialProviderError) throw e;
      this.logger.warn(
        `Apple verify failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw new SocialProviderError('애플 identity token 검증에 실패했습니다');
    }

    return {
      providerUserId: payload.sub,
      name: null,
      email: payload.email ?? null,
    };
  }
}
