import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

const PHONE_PATTERN = /^01[016789]-?\d{3,4}-?\d{4}$/;

export class LoginDto {
  @ApiProperty({ type: String, example: '010-1234-5678', description: '가입된 휴대폰 번호' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(PHONE_PATTERN, { message: '올바른 휴대폰 번호 형식이 아닙니다 (예: 010-1234-5678)' })
  phoneNumber!: string;
}
