import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SocialProfile,
  SocialProvider,
  SocialProviderError,
} from './social-provider.interface';
import { JwksClient, verifyIdTokenWithJwks } from './jwt-verify';

/**
 * N33: Google 소셜 제공자.
 *
 * Google 로그인 클라이언트가 받은 id_token을 서버에서 RS256 서명 검증한다.
 * aud가 우리 GOOGLE_CLIENT_ID인지 확인해 다른 앱용 토큰 스푸핑을 막는다.
 * 사용자 식별자는 sub(불변)를 쓴다 — 이메일은 변경될 수 있어 키로 쓰지 않는다.
 */
@Injectable()
export class GoogleSocialProvider implements SocialProvider {
  readonly name = 'google' as const;

  private readonly logger = new Logger(GoogleSocialProvider.name);
  private readonly clientId: string;
  private readonly jwks = new JwksClient('https://www.googleapis.com/oauth2/v3/certs');

  constructor(config: ConfigService) {
    this.clientId = (config.get<string>('GOOGLE_CLIENT_ID') ?? '').trim();
  }

  async verify(accessToken: string): Promise<SocialProfile> {
    if (!this.clientId) {
      // 서버 설정 누락은 클라이언트에 구체 원인을 노출하지 않는다 (로그에만 기록).
      this.logger.warn('Google verify failed: GOOGLE_CLIENT_ID not configured');
      throw new SocialProviderError('구글 로그인 검증을 사용할 수 없어요');
    }

    let payload;
    try {
      payload = await verifyIdTokenWithJwks(accessToken, {
        issuer: 'https://accounts.google.com',
        audience: this.clientId,
        getJwks: () => this.jwks.getKeys(),
      });
    } catch (e) {
      if (e instanceof SocialProviderError) throw e;
      this.logger.warn(
        `Google verify failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw new SocialProviderError('구글 id_token 검증에 실패했습니다');
    }

    return {
      providerUserId: payload.sub,
      name: payload.name ?? null,
      email: payload.email ?? null,
    };
  }
}
