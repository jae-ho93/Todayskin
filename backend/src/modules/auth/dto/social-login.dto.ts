import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { SocialProviderName } from '../social/social-provider.interface';

/**
 * POST /auth/social 요청 (N33).
 *
 * - kakao: 카카오 SDK가 준 access token (앱 바인딩 확인 후 user/me로 검증, N46)
 * - google: Google id_token (JWKS RS256 서명 검증)
 * - apple: Sign in with Apple identity token (JWKS RS256 서명 검증 + nonce, N46)
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

  @ApiPropertyOptional({
    description:
      'apple 전용(필수): 클라이언트가 로그인 요청마다 생성한 리플레이 방지 nonce (N46)',
    example: 'b1c2d3e4-...',
  })
  @IsOptional()
  @IsString()
  @MaxLength(256, { message: 'nonce가 너무 깁니다' })
  nonce?: string;
}
