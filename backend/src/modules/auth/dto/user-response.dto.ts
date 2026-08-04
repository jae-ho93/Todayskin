import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '../enums/gender.enum';

export class UserResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: '01012345678' })
  phoneNumber!: string;

  @ApiProperty({ example: '홍길동' })
  name!: string;

  @ApiProperty({ example: '2000-01-01' })
  birthDate!: string;

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
