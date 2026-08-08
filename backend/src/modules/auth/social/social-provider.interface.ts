/**
 * N33: 소셜 로그인 제공자 계약.
 *
 * 제공자별 토큰 검증을 SocialProvider 구현으로 추상화한다.
 * - kakao: 카카오 access token (kapi.kakao.com/v2/user/me)
 * - google: Google id_token (JWKS RS256 서명 검증)
 * - apple: Apple identity token (JWKS RS256 서명 검증)
 *
 * 검증 실패는 SocialProviderError — AuthService가 401로 매핑한다.
 */
export type SocialProviderName = 'kakao' | 'google' | 'apple';

/** 제공자가 검증 후 돌려주는 정규화된 프로필. providerUserId로 계정 연결 키를 만든다. */
export interface SocialProfile {
  providerUserId: string;
  name: string | null;
  email: string | null;
}

export interface SocialProvider {
  readonly name: SocialProviderName;
  verify(accessToken: string): Promise<SocialProfile>;
}

/** 제공자 토큰 검증 실패 — 클라이언트가 보낸 토큰 문제(401). */
export class SocialProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SocialProviderError';
  }
}
