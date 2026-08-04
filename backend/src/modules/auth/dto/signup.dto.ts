import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Gender } from '../enums/gender.enum';

/**
 * 전화번호 정규식 — FastAPI schemas.py의 PHONE_PATTERN와 동일 기준.
 * 하이픈은 선택이며 서버 저장 시 제거한다.
 * 예: 010-1234-5678, 01012345678
 */
const PHONE_PATTERN = /^01[016789]-?\d{3,4}-?\d{4}$/;

export class SignupDto {
  @ApiProperty({ example: '010-1234-5678', description: '휴대폰 번호' })
  @IsString()
  @Matches(PHONE_PATTERN, { message: '올바른 휴대폰 번호 형식이 아닙니다 (예: 010-1234-5678)' })
  phoneNumber!: string;

  @ApiProperty({ example: '홍길동', description: '이름 (1~20자)' })
  @IsString()
  @MinLength(1, { message: '이름은 1~20자여야 합니다' })
  @MaxLength(20, { message: '이름은 1~20자여야 합니다' })
  name!: string;

  @ApiProperty({ example: '2000-01-01', description: '생년월일 (YYYY-MM-DD)' })
  @IsString()
  @IsISO8601({ strict: true }, { message: '생년월일 형식이 올바르지 않습니다 (예: 2000-01-01)' })
  birthDate!: string;

  @ApiPropertyOptional({ enum: Gender, example: 'male', description: '선택 입력. 모델 학습 전에는 추천 로직에 임의 사용 안 함' })
  @IsOptional()
  @IsEnum(Gender, { message: 'gender는 male 또는 female이어야 합니다' })
  gender?: Gender;
}
