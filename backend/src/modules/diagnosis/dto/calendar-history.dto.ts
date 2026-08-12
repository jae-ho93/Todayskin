import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsOptional,
  Matches,
} from 'class-validator';
import { SkinPartMetricDto } from './skin-part-metric.dto';

/**
 * N8: 캘린더 날짜 파라미터 — Asia/Seoul 달력 기준 YYYY-MM-DD.
 */
export const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 점수 시계열 쿼리.
 */
export class ScoreSeriesQueryDto {
  @ApiPropertyOptional({
    example: '2026-07-01',
    description: '시작일(YYYY-MM-DD, Asia/Seoul). 미지정 시 90일 전.',
  })
  @IsOptional()
  @Matches(DATE_PARAM_PATTERN, { message: 'from은 YYYY-MM-DD 형식이어야 합니다' })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-08-06',
    description: '종료일(YYYY-MM-DD, Asia/Seoul). 미지정 시 오늘.',
  })
  @IsOptional()
  @Matches(DATE_PARAM_PATTERN, { message: 'to는 YYYY-MM-DD 형식이어야 합니다' })
  to?: string;
}

export class CalendarWeatherDto {
  @ApiProperty({ example: '2026-08-06T03:00:00.000Z' })
  observedAt!: string;

  @ApiProperty({ example: '서울특별시' })
  regionName!: string;

  /** F56: 시/군/구 표시명 (예: '해운대구'). 없으면 null. */
  @ApiPropertyOptional({ type: String, example: '해운대구', nullable: true })
  districtName?: string | null;

  @ApiProperty({ type: String, example: 'LIVE' })
  source!: string;

  /**
   * N42/F70: 값이 비어 있는 이유. true면 "측정값 없음"이 아니라 "수집 실패"다.
   * 둘 다 null로만 내리면 화면이 똑같이 `-`로 그려서 사용자가 구별할 수 없다.
   */
  @ApiPropertyOptional({ type: Boolean })
  uvCollectionFailed?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  airCollectionFailed?: boolean;

  @ApiPropertyOptional({ type: Number, nullable: true })
  uvIndex?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  uvStatus?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  uvIndexPeak?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  uvStatusPeak?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  uvIndexPeakHour?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  ozonePpm?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  ozoneStatus?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  pm25?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  pm25Status?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  pm10?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  pm10Status?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  caiValue?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  caiStatus?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  no2Value?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  so2Value?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  coValue?: number | null;
}

export class CalendarProductDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  brand!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  imageUri?: string | null;

  // N24: 실제 구매 URL — FE가 Linking.openURL로 연다.
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: '구매 페이지 URL (Linking.openURL로 직접 열 수 있는 값)',
  })
  purchaseUrl?: string | null;

  @ApiProperty()
  category!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  reason?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  timing?: string | null;
}

export class CalendarRecommendationDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: ['A', 'B', 'C'] })
  grade!: string;

  @ApiProperty()
  sourceLabel!: string;

  @ApiProperty()
  explanation!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  observationalNote?: string | null;

  @ApiProperty({ type: [String] })
  ingredientTags!: string[];

  @ApiPropertyOptional({ type: String, nullable: true })
  timing?: string | null;

  @ApiProperty({ type: [CalendarProductDto] })
  @Type(() => CalendarProductDto)
  products!: CalendarProductDto[];
}

export class CalendarImageDto {
  @ApiProperty({ description: 'S3/Memory presigned URL' })
  url!: string;

  @ApiProperty()
  contentType!: string;

  @ApiProperty({ description: 'URL 만료 시각(ISO8601)' })
  expiresAt!: string;
}

/**
 * 랜드마크 페이로드 — Diagnosis.landmarks Json 계약.
 */
export class LandmarksDto {
  @ApiProperty({ example: 'mediapipe-face-landmarker-v1' })
  version!: string;

  @ApiProperty({
    type: 'array',
    items: { type: 'array', items: { type: 'number' } },
    description: '정규화 캔버스 좌표 [[x,y], ...]',
  })
  points!: number[][];
}

export class CalendarDiagnosisDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  capturedAt!: string;

  @ApiProperty({ type: Number })
  overallScore!: number;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  modelVersion?: string | null;

  @ApiProperty({ type: [SkinPartMetricDto] })
  @Type(() => SkinPartMetricDto)
  parts!: SkinPartMetricDto[];

  @ApiPropertyOptional({ type: CalendarWeatherDto, nullable: true })
  weather!: CalendarWeatherDto | null;

  @ApiProperty({ type: [CalendarRecommendationDto] })
  @Type(() => CalendarRecommendationDto)
  recommendations!: CalendarRecommendationDto[];

  /** 저장 동의 + 이미지 존재 시에만 채워짐. 미동의면 null. */
  @ApiPropertyOptional({ type: CalendarImageDto, nullable: true })
  image!: CalendarImageDto | null;

  /**
   * 저장 동의 + 이미지 존재 + landmarks 존재 시에만 채워짐 (N26: 이미지 없으면 미노출).
   * 미동의면 null.
   */
  @ApiPropertyOptional({ type: LandmarksDto, nullable: true })
  landmarks!: LandmarksDto | null;
}

/**
 * GET /diagnosis/history/:date 응답.
 */
export class CalendarDayHistoryDto {
  @ApiProperty({ example: '2026-08-06', description: '조회 날짜(Asia/Seoul)' })
  date!: string;

  @ApiProperty({ type: [CalendarDiagnosisDto] })
  @Type(() => CalendarDiagnosisDto)
  diagnoses!: CalendarDiagnosisDto[];
}

export class ScoreSeriesPointDto {
  @ApiProperty({ example: '2026-08-06' })
  date!: string;

  @ApiProperty()
  diagnosisId!: string;

  @ApiProperty()
  @IsISO8601()
  capturedAt!: string;

  @ApiProperty({ type: Number })
  overallScore!: number;
}

/**
 * GET /diagnosis/score-series 응답.
 */
export class ScoreSeriesDto {
  @ApiProperty({ example: '2026-07-01' })
  from!: string;

  @ApiProperty({ example: '2026-08-06' })
  to!: string;

  @ApiProperty({ type: [ScoreSeriesPointDto] })
  @Type(() => ScoreSeriesPointDto)
  points!: ScoreSeriesPointDto[];
}
