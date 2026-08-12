import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
 * N46: user/me는 발급 앱과 무관하게 프로필을 반환하므로, 먼저
 * access_token_info로 토큰의 발급 app_id가 우리 앱(KAKAO_APP_ID)과 일치하는지
 * 검증한다. 다른 카카오 연동 앱이 수집한 토큰으로는 로그인할 수 없다.
 * KAKAO_APP_ID 미설정 시 kakao 요청만 401(명시적 실패) — Google/Apple과 동일 정책.
 */
@Injectable()
export class KakaoSocialProvider implements SocialProvider {
  readonly name = 'kakao' as const;

  private readonly logger = new Logger(KakaoSocialProvider.name);
  private readonly tokenInfoEndpoint =
    'https://kapi.kakao.com/v1/user/access_token_info';
  private readonly userEndpoint = 'https://kapi.kakao.com/v2/user/me';
  private readonly appId: string;

  constructor(config: ConfigService) {
    this.appId = (config.get<string>('KAKAO_APP_ID') ?? '').trim();
  }

  async verify(accessToken: string): Promise<SocialProfile> {
    if (!this.appId) {
      // 서버 설정 누락은 클라이언트에 구체 원인을 노출하지 않는다 (로그에만 기록).
      this.logger.warn('Kakao verify failed: KAKAO_APP_ID not configured');
      throw new SocialProviderError('카카오 로그인 검증을 사용할 수 없어요');
    }

    await this.assertIssuedForOurApp(accessToken);

    const res = await this.fetchKakao(this.userEndpoint, accessToken);
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

  /** N46: 토큰 정보 조회로 발급 앱 바인딩을 확인한다 (불일치 = 타 앱 토큰 → 401). */
  private async assertIssuedForOurApp(accessToken: string): Promise<void> {
    const res = await this.fetchKakao(this.tokenInfoEndpoint, accessToken);
    if (!res.ok) {
      throw new SocialProviderError('카카오 토큰이 유효하지 않습니다');
    }
    const info = (await res.json()) as { app_id?: number };
    if (typeof info.app_id !== 'number') {
      throw new SocialProviderError('카카오 토큰 정보에 앱 식별자가 없습니다');
    }
    if (String(info.app_id) !== this.appId) {
      this.logger.warn(
        `Kakao token app_id mismatch: expected=${this.appId} actual=${info.app_id}`,
      );
      throw new SocialProviderError(
        '다른 앱에서 발급된 카카오 토큰입니다',
      );
    }
  }

  private async fetchKakao(url: string, accessToken: string): Promise<Response> {
    try {
      return await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      this.logger.warn(
        `Kakao verify request failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw new SocialProviderError('카카오 토큰 검증 요청에 실패했습니다');
    }
  }
}
