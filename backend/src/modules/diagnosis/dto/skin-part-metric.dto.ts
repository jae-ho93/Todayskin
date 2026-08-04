import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FacePart } from '@prisma/client';

/**
 * 부위별 측정값 — 기존 FastAPI SkinPartMetric 계약 유지(camelCase).
 * 6개 부위(forehead/glabella/eyeArea/cheek/lips/jaw)를 유지한다.
 */
export class SkinPartMetricDto {
  @ApiProperty({ enum: FacePart, example: 'forehead' })
  part!: FacePart;

  @ApiProperty({ example: '이마' })
  label!: string;

  @ApiProperty({ example: '양호' })
  grade!: string;

  @ApiPropertyOptional({ type: Number, example: 72, nullable: true })
  moisture?: number | null;

  @ApiPropertyOptional({ type: Number, example: 68, nullable: true })
  elasticity?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  note?: string | null;
}
