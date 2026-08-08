import { createHash } from 'node:crypto';
import {
  SocialProfile,
  SocialProvider,
  SocialProviderError,
  SocialProviderName,
} from './social-provider.interface';

/**
 * N33: 개발/테스트용 mock 소셜 제공자 (MOCK_SOCIAL=true).
 *
 * 실제 제공자 API를 호출하지 않고, 토큰 문자열에서 결정적으로 providerUserId를
 * 파생한다 — 같은 토큰은 항상 같은 소셜 계정으로 매핑되어 e2e에서 반복 로그인을
 * 검증할 수 있다. 운영에서는 절대 활성화되지 않는다(mock flag registry 게이트).
 */
export class MockSocialProvider implements SocialProvider {
  readonly name: SocialProviderName;

  constructor(private readonly providerName: SocialProviderName) {
    this.name = providerName;
  }

  async verify(accessToken: string): Promise<SocialProfile> {
    if (!accessToken || accessToken.trim().length < 3) {
      throw new SocialProviderError('소셜 토큰이 올바르지 않습니다');
    }
    const hash = createHash('sha1')
      .update(accessToken.trim())
      .digest('hex')
      .slice(0, 16);
    return {
      providerUserId: `${this.name}-${hash}`,
      name: `${this.providerLabel()} 테스트 회원`,
      email: `social-${hash}@todayskin.dev`,
    };
  }

  private providerLabel(): string {
    switch (this.name) {
      case 'kakao':
        return '카카오';
      case 'google':
        return '구글';
      case 'apple':
        return '애플';
    }
  }
}
