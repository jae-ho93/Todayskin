import { Injectable, Logger } from '@nestjs/common';
import {
  SocialProfile,
  SocialProvider,
  SocialProviderError,
} from './social-provider.interface';

/**
 * N33: Kakao 소셜 제공자.
 *
 * 카카오 access token을 서버에서 카카오 사용자 조회 API로 검증한다
 * (클라이언트 토큰을 그대로 신뢰하지 않음). 사용자 id를 providerUserId로 쓴다.
 * 클라이언트 시크릿이 필요 없어 서버 설정이 간단하다.
 *
 * 알려진 한계: user/me는 발급 앱과 무관하게 프로필을 반환하므로, 다른 카카오 앱의
 * 토큰으로도 계정이 생성될 수 있다. 카카오 client_secret 검증(KOI)은 앱 단위 연동
 * 결정 후 보강한다 (인지된 tradeoff, MVP 허용).
 */
@Injectable()
export class KakaoSocialProvider implements SocialProvider {
  readonly name = 'kakao' as const;

  private readonly logger = new Logger(KakaoSocialProvider.name);
  private readonly endpoint = 'https://kapi.kakao.com/v2/user/me';

  async verify(accessToken: string): Promise<SocialProfile> {
    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      this.logger.warn(
        `Kakao verify request failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw new SocialProviderError('카카오 토큰 검증 요청에 실패했습니다');
    }

    if (!res.ok) {
      throw new SocialProviderError('카카오 토큰이 유효하지 않습니다');
    }

    const data = (await res.json()) as {
      id?: number;
      kakao_account?: {
        profile?: { nickname?: string };
        email?: string;
      };
    };
    if (typeof data.id !== 'number') {
      throw new SocialProviderError('카카오 응답에 사용자 식별자가 없습니다');
    }

    return {
      providerUserId: String(data.id),
      name: data.kakao_account?.profile?.nickname ?? null,
      email: data.kakao_account?.email ?? null,
    };
  }
}
