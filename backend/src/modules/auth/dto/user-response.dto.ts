import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '../enums/gender.enum';

export class UserResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  // N33: 소셜 계정은 전화 연결 전까지 null이다 (온보딩 후 채워짐).
  @ApiProperty({ example: '01012345678', nullable: true })
  phoneNumber!: string | null;

  @ApiProperty({ example: '홍길동' })
  name!: string;

  // N33: 소셜 계정은 생년월일 입력 전까지 null이다.
  @ApiProperty({ example: '2000-01-01', nullable: true })
  birthDate!: string | null;

  @ApiPropertyOptional({ enum: Gender, example: 'male' })
  gender?: Gender | null;

  @ApiProperty({ example: '2026-08-04T10:00:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({ example: 'eyJhbGciOiJIUzI1NiIs...', description: 'JWT Access Token (signup/me 응답에 포함)' })
  accessToken?: string;

  @ApiPropertyOptional({ example: 'eyJhbGciOiJIUzI1NiIs...', description: 'Refresh Token (login 응답에 포함)' })
  refreshToken?: string;

  @ApiPropertyOptional({ example: 900, description: 'Access Token 만료(초) (login 응답에 포함)' })
  expiresIn?: number;
}
