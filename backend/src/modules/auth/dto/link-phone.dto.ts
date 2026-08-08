import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, Matches } from 'class-validator';
import { PHONE_PATTERN } from './signup.dto';

/**
 * POST /auth/social/link-phone 요청 (N33 온보딩).
 *
 * 소셜 계정에 전화번호를 연결한다. 사전에 /otp/send·/otp/verify를 purpose
 * 'social_link'로 완료해 본인확인을 마쳐야 한다. 생년월일은 선택 — 제공하면 함께 저장.
 */
export class LinkPhoneDto {
  @ApiProperty({ example: '010-1234-5678', description: '연결할 휴대폰 번호 (OTP 본인확인 필요)' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(PHONE_PATTERN, { message: '올바른 휴대폰 번호 형식이 아닙니다 (예: 010-1234-5678)' })
  phoneNumber!: string;

  @ApiPropertyOptional({ example: '2000-01-01', description: '생년월일 (선택, YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsISO8601({ strict: true }, { message: '생년월일 형식이 올바르지 않습니다 (예: 2000-01-01)' })
  birthDate?: string;
}
