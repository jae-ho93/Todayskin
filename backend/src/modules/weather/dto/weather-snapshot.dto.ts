
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AirStatus } from '../../../common/enums/air-status.enum';
import { WeatherSource } from '../../../common/enums/weather-source.enum';

/**
 * 날씨 스냅샷 응답 — 기존 FastAPI WeatherSnapshot(camelCase) 계약 유지.
 * 각 지표는 정부 API 실패 시 목업으로 채우지 않고 null(프론트: 측정 불가)로 둔다.
 */
export class WeatherSnapshotDto {
  @ApiProperty({ example: '2026-08-04T03:00:00.000Z', description: '관측 시각(ISO8601, UTC)' })
  observedAt!: string;

  @ApiProperty({ example: '서울특별시', description: '표시용 지역명' })
  regionName!: string;

  @ApiProperty({ enum: WeatherSource, example: WeatherSource.LIVE, description: '데이터 출처' })
  source!: WeatherSource;

  @ApiPropertyOptional({ type: Number, description: '자외선 지수(현재 시점 예보)' })
  uvIndex?: number | null;

  @ApiPropertyOptional({ enum: AirStatus, description: '자외선 등급' })
  uvStatus?: AirStatus | null;

  @ApiPropertyOptional({ type: Number, description: '오늘 남은 시간대 중 예상 자외선 최댓값' })
  uvIndexPeak?: number | null;

  @ApiPropertyOptional({ enum: AirStatus, description: '자외선 피크 등급' })
  uvStatusPeak?: AirStatus | null;

  @ApiPropertyOptional({ type: Number, description: '피크 자외선이 나오는 시각(0~23시)' })
  uvIndexPeakHour?: number | null;

  @ApiPropertyOptional({ type: Number, description: '오존(ppm)' })
  ozonePpm?: number | null;

  @ApiPropertyOptional({ enum: AirStatus, description: '오존 등급' })
  ozoneStatus?: AirStatus | null;

  @ApiPropertyOptional({ type: Number, description: '초미세먼지(PM2.5)' })
  pm25?: number | null;

  @ApiPropertyOptional({ enum: AirStatus, description: '초미세먼지 등급' })
  pm25Status?: AirStatus | null;

  @ApiPropertyOptional({ type: Number, description: '미세먼지(PM10)' })
  pm10?: number | null;

  @ApiPropertyOptional({ enum: AirStatus, description: '미세먼지 등급' })
  pm10Status?: AirStatus | null;

  @ApiPropertyOptional({ type: Number, description: '통합대기환경지수(CAI)' })
  caiValue?: number | null;

  @ApiPropertyOptional({ enum: AirStatus, description: 'CAI 등급' })
  caiStatus?: AirStatus | null;

  @ApiPropertyOptional({ type: Number, description: '이산화질소(NO2)' })
  no2Value?: number | null;

  @ApiPropertyOptional({ type: Number, description: '아황산가스(SO2)' })
  so2Value?: number | null;

  @ApiPropertyOptional({ type: Number, description: '일산화탄소(CO)' })
  coValue?: number | null;
}
