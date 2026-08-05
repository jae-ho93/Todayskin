
import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
} from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { AirStatus } from '../../../common/enums/air-status.enum';
import { WeatherSource } from '../../../common/enums/weather-source.enum';

/**
 * 날씨 스냅샷 응답 — 기존 FastAPI WeatherSnapshot(camelCase) 계약 유지.
 * 각 지표는 정부 API 실패 시 목업으로 채우지 않고 null(프론트: 측정 불가)로 둔다.
 */
export class WeatherSnapshotDto {
  @ApiProperty({ example: '2026-08-04T03:00:00.000Z', description: '관측 시각(ISO8601, UTC)' })
  @IsISO8601()
  observedAt!: string;

  @ApiProperty({ example: '서울특별시', description: '표시용 지역명' })
  @IsString()
  regionName!: string;

  @ApiProperty({ enum: WeatherSource, example: WeatherSource.LIVE, description: '데이터 출처' })
  @IsEnum(WeatherSource)
  source!: WeatherSource;

  @ApiPropertyOptional({ type: Number, description: '자외선 지수(현재 시점 예보)' })
  @IsOptional()
  @IsNumber()
  uvIndex?: number | null;

  @ApiPropertyOptional({ enum: AirStatus, description: '자외선 등급' })
  @IsOptional()
  @IsEnum(AirStatus)
  uvStatus?: AirStatus | null;

  @ApiPropertyOptional({ type: Number, description: '오늘 남은 시간대 중 예상 자외선 최댓값' })
  @IsOptional()
  @IsNumber()
  uvIndexPeak?: number | null;

  @ApiPropertyOptional({ enum: AirStatus, description: '자외선 피크 등급' })
  @IsOptional()
  @IsEnum(AirStatus)
  uvStatusPeak?: AirStatus | null;

  @ApiPropertyOptional({ type: Number, description: '피크 자외선이 나오는 시각(0~23시)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  uvIndexPeakHour?: number | null;

  @ApiPropertyOptional({ type: Number, description: '오존(ppm)' })
  @IsOptional()
  @IsNumber()
  ozonePpm?: number | null;

  @ApiPropertyOptional({ enum: AirStatus, description: '오존 등급' })
  @IsOptional()
  @IsEnum(AirStatus)
  ozoneStatus?: AirStatus | null;

  @ApiPropertyOptional({ type: Number, description: '초미세먼지(PM2.5)' })
  @IsOptional()
  @IsNumber()
  pm25?: number | null;

  @ApiPropertyOptional({ enum: AirStatus, description: '초미세먼지 등급' })
  @IsOptional()
  @IsEnum(AirStatus)
  pm25Status?: AirStatus | null;

  @ApiPropertyOptional({ type: Number, description: '미세먼지(PM10)' })
  @IsOptional()
  @IsNumber()
  pm10?: number | null;

  @ApiPropertyOptional({ enum: AirStatus, description: '미세먼지 등급' })
  @IsOptional()
  @IsEnum(AirStatus)
  pm10Status?: AirStatus | null;

  @ApiPropertyOptional({ type: Number, description: '통합대기환경지수(CAI)' })
  @IsOptional()
  @IsNumber()
  caiValue?: number | null;

  @ApiPropertyOptional({ enum: AirStatus, description: 'CAI 등급' })
  @IsOptional()
  @IsEnum(AirStatus)
  caiStatus?: AirStatus | null;

  @ApiPropertyOptional({ type: Number, description: '이산화질소(NO2)' })
  @IsOptional()
  @IsNumber()
  no2Value?: number | null;

  @ApiPropertyOptional({ type: Number, description: '아황산가스(SO2)' })
  @IsOptional()
  @IsNumber()
  so2Value?: number | null;

  @ApiPropertyOptional({ type: Number, description: '일산화탄소(CO)' })
  @IsOptional()
  @IsNumber()
  coValue?: number | null;
}

/**
 * 기존 날씨 기반 제품 API는 WeatherSnapshot의 일부 필드만 보내는 호출도
 * 허용했다. 필드 계약은 재사용하되 모두 선택으로 만들어 호환성을 유지한다.
 */
export class WeatherInputDto extends PartialType(WeatherSnapshotDto) {}
