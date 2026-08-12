import { ApiProperty } from '@nestjs/swagger';

/** 성공 안내 문구만 돌려주는 엔드포인트의 공통 응답. */
export class MessageResponseDto {
  @ApiProperty({ example: 'OTP 검증이 완료되었습니다' })
  message!: string;
}
