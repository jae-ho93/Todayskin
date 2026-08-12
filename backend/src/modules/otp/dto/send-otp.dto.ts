import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsString, Matches } from 'class-validator';
import { OtpPurpose } from '../enums/otp-purpose.enum';

const PHONE_PATTERN = /^01[016789]-?\d{3,4}-?\d{4}$/;

/**
 * OTP 발송 요청 DTO.
 * 회원가입·로그인 모두 전화번호로 OTP를 발송한다.
 */
export class SendOtpDto {
  @ApiProperty({ type: String, example: '010-1234-5678', description: '휴대폰 번호' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(PHONE_PATTERN, {
    message: '올바른 휴대폰 번호 형식이 아닙니다 (예: 010-1234-5678)',
  })
  phoneNumber!: string;

  @ApiProperty({ enum: OtpPurpose, example: 'login', description: 'OTP 용도' })
  @IsEnum(OtpPurpose, { message: 'purpose는 signup, login 또는 social_link여야 합니다' })
  purpose!: OtpPurpose;
}
