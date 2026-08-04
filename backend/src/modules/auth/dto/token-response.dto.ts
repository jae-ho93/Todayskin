import { ApiProperty } from '@nestjs/swagger';

export class TokenResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...', description: 'JWT Access Token (Authorization: Bearer ...)' })
  accessToken!: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...', description: 'Refresh Token (쿠키 또는 본문으로 전달)' })
  refreshToken!: string;

  @ApiProperty({ example: 900, description: 'Access Token 만료(초)' })
  expiresIn!: number;
}
