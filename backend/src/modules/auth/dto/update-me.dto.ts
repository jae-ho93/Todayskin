import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Gender } from '../enums/gender.enum';

/**
 * PATCH /auth/me — 내 프로필 수정.
 *
 * N28 범위: name, gender만 수정 가능.
 * - phoneNumber 변경은 OTP 본인확인이 필요해 이번 범위 밖이다.
 * - birthDate는 법적/본인확인 속성이라 임의 수정 금지.
 * - 빈 본문(수정 필드 없음)은 서비스에서 400으로 거부한다.
 * - gender: null을 보내면 초기화(미선택)로 처리한다.
 */
export class UpdateMeDto {
  @ApiPropertyOptional({ example: '홍길동', description: '이름 (1~20자)' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1, { message: '이름은 1~20자여야 합니다' })
  @MaxLength(20, { message: '이름은 1~20자여야 합니다' })
  @Matches(/\S/, { message: '이름은 공백만 입력할 수 없습니다' })
  name?: string;

  @ApiPropertyOptional({
    enum: Gender,
    example: 'female',
    description: '성별. null을 보내면 미선택으로 초기화',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(Gender, { message: 'gender는 male 또는 female이어야 합니다' })
  gender?: Gender | null;
}
