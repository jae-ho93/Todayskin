import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SkinPartMetricDto } from './skin-part-metric.dto';

/**
 * 5클래스(건선/아토피/주사/지루/정상) 질환 분류 결과. confidence: 0~1.
 */
export class DiseaseClassificationDto {
  @ApiProperty({ example: '정상' })
  label!: string;

  @ApiProperty({ type: Number, example: 0.98 })
  confidence!: number;
}

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

  // 신규(검증 단계): YOLO 여드름 구역 리포트 텍스트 + 5클래스 질환 분류.
  // 둘 다 optional — 값이 없어도 진단 자체는 정상.
  @ApiPropertyOptional({ type: String, nullable: true, example: '이마에 비염증성 여드름 1개가 있습니다.' })
  acneReport?: string | null;

  @ApiPropertyOptional({ type: DiseaseClassificationDto, nullable: true })
  diseaseClassification?: DiseaseClassificationDto | null;
}
