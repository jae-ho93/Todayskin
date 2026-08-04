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

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  accessToken?: string;
}
