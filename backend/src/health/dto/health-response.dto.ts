import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok', description: '서버 상태' })
  status!: string;

  @ApiProperty({ example: '2026-08-04T10:00:00.000Z', description: '응답 시각' })
  timestamp!: string;
}
