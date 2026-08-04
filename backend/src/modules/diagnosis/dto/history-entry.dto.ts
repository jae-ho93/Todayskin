import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 진단 이력 한 줄 요약 — 마이 히스토리 화면용.
 * 기존 FastAPI HistoryEntry 계약 유지(camelCase).
 */
export class HistoryEntryDto {
  @ApiProperty({ example: 'snap-2026-08-03' })
  id!: string;

  @ApiProperty({ example: '2026-08-03T00:00:00.000Z' })
  capturedAt!: string;

  @ApiProperty({ type: Number, example: 78 })
  overallScore!: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  thumbnailUri?: string | null;
}
