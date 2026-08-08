import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import type { SocialProviderName } from '../social/social-provider.interface';

/**
 * POST /auth/social 요청 (N33).
 *
 * - kakao: 카카오 SDK가 준 access token (kapi.kakao.com/v2/user/me로 검증)
 * - google: Google id_token (JWKS RS256 서명 검증)
 * - apple: Sign in with Apple identity token (JWKS RS256 서명 검증)
 */
export class SocialLoginDto {
  @ApiProperty({ enum: ['kakao', 'google', 'apple'], example: 'kakao' })
  @IsIn(['kakao', 'google', 'apple'], {
    message: 'provider는 kakao, google, apple 중 하나여야 합니다',
  })
  provider!: SocialProviderName;

  @ApiProperty({
    description: '제공자별 토큰 (kakao: access token, google/apple: id token)',
    example: 'eyJhbGciOiJSUzI1NiIs...',
  })
  @IsString()
  @IsNotEmpty({ message: 'accessToken이 필요합니다' })
  accessToken!: string;
}
