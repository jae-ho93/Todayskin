import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
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
import { UvLevel } from '../../../common/enums/uv-level.enum';
import { WeatherSource } from '../../../common/enums/weather-source.enum';

/**
 * 날씨 스냅샷 응답 — 기존 FastAPI WeatherSnapshot(camelCase) 계약 유지.
 * 각 지표는 정부 API 실패 시 목업으로 채우지 않고 null(프론트: 측정 불가)로 둔다.
 */
export class WeatherSnapshotDto {
  @ApiProperty({
    example: '2026-08-04T03:00:00.000Z',
    description: '관측 시각(ISO8601, UTC)',
  })
  @IsISO8601()
  observedAt!: string;

  @ApiProperty({ example: '서울특별시', description: '표시용 지역명(시/도)' })
  @IsString()
  regionName!: string;

  @ApiPropertyOptional({
    type: String,
    example: '해운대구',
    description: '시/군/구 표시명 (없으면 null)',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  districtName?: string | null;

  @ApiProperty({
    enum: WeatherSource,
    example: WeatherSource.LIVE,
    description: '데이터 출처',
  })
  @IsEnum(WeatherSource)
  source!: WeatherSource;

  @ApiPropertyOptional({
    description:
      'N42: 자외선 수집이 실패했는지. true면 값이 비어 있는 이유가 "측정값 없음"이 아니라 "수집 실패"다.',
  })
  @IsOptional()
  @IsBoolean()
  uvCollectionFailed?: boolean;

  @ApiPropertyOptional({
    description: 'N42: 대기질 수집이 실패했는지.',
  })
  @IsOptional()
  @IsBoolean()
  airCollectionFailed?: boolean;

  @ApiPropertyOptional({
    description: 'N53: 기온·습도(초단기실황) 수집이 실패했는지.',
  })
  @IsOptional()
  @IsBoolean()
  nowcastCollectionFailed?: boolean;

  @ApiPropertyOptional({
    type: Number,
    description: '자외선 지수(현재 시점 예보)',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  uvIndex?: number | null;

  @ApiPropertyOptional({
    enum: UvLevel,
    description: '자외선 등급 (기상청 5단계: 낮음·보통·높음·매우높음·위험)',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(UvLevel)
  uvStatus?: UvLevel | null;

  @ApiPropertyOptional({
    type: Number,
    description: '오늘 남은 시간대 중 예상 자외선 최댓값',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  uvIndexPeak?: number | null;

  @ApiPropertyOptional({
    enum: UvLevel,
    description: '자외선 피크 등급 (기상청 5단계)',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(UvLevel)
  uvStatusPeak?: UvLevel | null;

  @ApiPropertyOptional({
    type: Number,
    description: '피크 자외선이 나오는 시각(0~23시)',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  uvIndexPeakHour?: number | null;

  @ApiPropertyOptional({
    type: Number,
    description: '오존(ppm)',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  ozonePpm?: number | null;

  @ApiPropertyOptional({
    enum: AirStatus,
    description: '오존 등급',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(AirStatus)
  ozoneStatus?: AirStatus | null;

  @ApiPropertyOptional({
    type: Number,
    description: '초미세먼지(PM2.5)',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  pm25?: number | null;

  @ApiPropertyOptional({
    enum: AirStatus,
    description: '초미세먼지 등급',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(AirStatus)
  pm25Status?: AirStatus | null;

  @ApiPropertyOptional({
    type: Number,
    description: '미세먼지(PM10)',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  pm10?: number | null;

  @ApiPropertyOptional({
    enum: AirStatus,
    description: '미세먼지 등급',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(AirStatus)
  pm10Status?: AirStatus | null;

  @ApiPropertyOptional({
    type: Number,
    description: '통합대기환경지수(CAI)',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  caiValue?: number | null;

  @ApiPropertyOptional({
    enum: AirStatus,
    description: 'CAI 등급',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(AirStatus)
  caiStatus?: AirStatus | null;

  @ApiPropertyOptional({
    type: Number,
    description: '이산화질소(NO2)',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  no2Value?: number | null;

  @ApiPropertyOptional({
    type: Number,
    description: '아황산가스(SO2)',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  so2Value?: number | null;

  @ApiPropertyOptional({
    type: Number,
    description: '일산화탄소(CO)',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  coValue?: number | null;

  @ApiPropertyOptional({
    type: Number,
    description: 'N53: 기온(°C, 기상청 초단기실황 T1H)',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  temperature?: number | null;

  @ApiPropertyOptional({
    type: Number,
    description: 'N53: 상대습도(%, 기상청 초단기실황 REH)',
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  humidity?: number | null;
}

/**
 * 기존 날씨 기반 제품 API는 WeatherSnapshot의 일부 필드만 보내는 호출도
 * 허용했다. 필드 계약은 재사용하되 모두 선택으로 만들어 호환성을 유지한다.
 */
export class WeatherInputDto extends PartialType(WeatherSnapshotDto) {}
