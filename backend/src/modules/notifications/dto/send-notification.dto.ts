import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * POST /notifications/send/async 요청.
 * N4: 실제 푸시 게이트웨이 연동 전, 선호설정 게이트 + 발송 시뮬레이션.
 */
export class SendNotificationDto {
  @ApiProperty({
    description: '알림 종류',
    enum: ['uv', 'dust', 'morning', 'generic'],
    example: 'uv',
  })
  @IsString()
  @IsIn(['uv', 'dust', 'morning', 'generic'])
  kind!: 'uv' | 'dust' | 'morning' | 'generic';

  @ApiPropertyOptional({ description: '알림 제목(선택)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ description: '알림 본문(선택)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  body?: string;
}
