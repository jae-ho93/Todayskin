import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok', description: '서버 상태' })
  status!: string;

  @ApiProperty({ example: '2026-08-04T10:00:00.000Z', description: '응답 시각' })
  timestamp!: string;
}

export class HealthLiveResponseDto extends HealthResponseDto {
  @ApiProperty({ example: 'live', description: 'probe 종류' })
  probe!: 'live';
}

export class HealthDependencyDto {
  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['up', 'down', 'skipped'] })
  status!: 'up' | 'down' | 'skipped';

  @ApiPropertyOptional()
  required?: boolean;

  @ApiPropertyOptional()
  detail?: string;
}

export class HealthReadyResponseDto {
  @ApiProperty({ enum: ['ok', 'degraded', 'error'] })
  status!: 'ok' | 'degraded' | 'error';

  @ApiProperty()
  timestamp!: string;

  @ApiProperty({ example: 'ready' })
  probe!: 'ready';

  @ApiProperty({ type: [HealthDependencyDto] })
  dependencies!: HealthDependencyDto[];
}
