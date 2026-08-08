import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from './user-response.dto';

/**
 * POST /auth/social 응답 (N33).
 *
 * 기존 login과 동일한 UserResponseDto(+accessToken/refreshToken/expiresIn)에
 * isNewUser를 추가한다. isNewUser=true면 미가입 소셜 계정 — FE는 온보딩
 * (동의 + 선택적 전화번호 연결 POST /auth/social/link-phone)을 진행한다.
 */
export class SocialLoginResponseDto extends UserResponseDto {
  @ApiProperty({
    description:
      'true면 이번에 생성된 미가입 소셜 계정 (온보딩 필요). false면 기존 계정 로그인.',
    example: true,
  })
  isNewUser!: boolean;
}
