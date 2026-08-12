import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SocialProfile,
  SocialProvider,
  SocialProviderError,
  SocialVerifyContext,
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
 * N46: 리플레이 방지 nonce 검증. 클라이언트가 로그인 요청마다 임의 nonce를 만들어
 * Apple 로그인에 넣고(id_token nonce 클레임으로 반환됨) 서버에도 같은 값을 보낸다.
 * 클라이언트 라이브러리에 따라 클레임에 원문이 실리기도, SHA-256(hex)이 실리기도
 * 하므로 두 형태 모두 허용한다. nonce 없는 요청은 401 (fail-closed).
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

  async verify(
    accessToken: string,
    context?: SocialVerifyContext,
  ): Promise<SocialProfile> {
    if (!this.bundleId) {
      // 서버 설정 누락은 클라이언트에 구체 원인을 노출하지 않는다 (로그에만 기록).
      this.logger.warn('Apple verify failed: APPLE_BUNDLE_ID not configured');
      throw new SocialProviderError('애플 로그인 검증을 사용할 수 없어요');
    }

    const nonce = context?.nonce?.trim();
    if (!nonce) {
      // N46: nonce 없는 요청은 리플레이 여지가 있어 거부한다 (fail-closed).
      throw new SocialProviderError('애플 로그인 요청에 nonce가 없습니다');
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

    this.assertNonceMatches(payload.nonce, nonce);

    return {
      providerUserId: payload.sub,
      name: null,
      email: payload.email ?? null,
    };
  }

  /**
   * N46: id_token nonce 클레임이 클라이언트가 보낸 nonce와 일치하는지 확인한다.
   * 클라이언트 라이브러리가 nonce를 그대로 전달하거나 SHA-256 해시해 전달할 수
   * 있어 원문 일치 또는 SHA-256(hex) 일치를 모두 허용한다.
   */
  private assertNonceMatches(claim: unknown, nonce: string): void {
    if (typeof claim !== 'string' || claim.length === 0) {
      throw new SocialProviderError('애플 identity token에 nonce가 없습니다');
    }
    const hashed = createHash('sha256').update(nonce).digest('hex');
    if (claim !== nonce && claim !== hashed) {
      this.logger.warn('Apple verify failed: nonce mismatch');
      throw new SocialProviderError('애플 로그인 nonce가 일치하지 않습니다');
    }
  }
}
