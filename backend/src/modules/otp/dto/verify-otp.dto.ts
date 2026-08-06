import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsString, Length, Matches } from 'class-validator';
import { OtpPurpose } from '../enums/otp-purpose.enum';

const PHONE_PATTERN = /^01[016789]-?\d{3,4}-?\d{4}$/;

/**
 * OTP 검증 요청 DTO.
 */
export class VerifyOtpDto {
  @ApiProperty({ example: '010-1234-5678' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(PHONE_PATTERN, {
    message: '올바른 휴대폰 번호 형식이 아닙니다 (예: 010-1234-5678)',
  })
  phoneNumber!: string;

  @ApiProperty({ example: '123456', description: '6자리 OTP 코드' })
  @IsString()
  @Length(6, 6, { message: 'OTP 코드는 6자리여야 합니다' })
  code!: string;

  @ApiProperty({ enum: OtpPurpose, example: 'login' })
  @IsEnum(OtpPurpose, { message: 'purpose는 signup 또는 login이어야 합니다' })
  purpose!: OtpPurpose;
}
