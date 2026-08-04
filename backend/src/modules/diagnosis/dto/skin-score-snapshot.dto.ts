import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SkinPartMetricDto } from './skin-part-metric.dto';

/**
 * 진단 결과 스냅샷 — 기존 FastAPI SkinScoreSnapshot 계약 유지(camelCase).
 * POST /diagnosis, GET /diagnosis/latest 응답에 사용한다.
 */
export class SkinScoreSnapshotDto {
  @ApiProperty({ example: 'snap-2026-08-03' })
  id!: string;

  @ApiProperty({ example: '2026-08-03T00:00:00.000Z' })
  capturedAt!: string;

  @ApiProperty({ type: Number, example: 78 })
  overallScore!: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  thumbnailUri?: string | null;

  @ApiProperty({ type: [SkinPartMetricDto] })
  parts!: SkinPartMetricDto[];
}
