import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsNotEmpty,
  IsObject,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { WeatherInputDto } from '../../weather/dto/weather-snapshot.dto';

/**
 * POST /recommendations/generate 요청.
 *
 * 현재 프론트는 skinScore + weather 전체를 보낸다(기존 FastAPI 계약).
 * 최종 NestJS 계약은 diagnosisId만 받는 방향이지만, 프론트 contract migration이
 * 완료되기 전까지 두 형태를 모두 허용한다.
 *
 * - diagnosisId가 있으면 서버가 diagnosis 소유권 확인 후 DB에서 측정값/날씨를 조회한다(최종 계약).
 * - diagnosisId가 없고 skinScore+weather가 있으면 기존 방식으로 동작한다(호환).
 *
 * TODO(T8): diagnosisId 전용으로 전환하고 skinScore/weather 직접 수신을 제거한다.
 */
export class GenerateRecommendationDto {
  @ApiPropertyOptional({ description: '진단 ID (최종 계약 — 서버가 소유권 확인 후 DB에서 조회)' })
  @ValidateIf((dto: GenerateRecommendationDto) => dto.diagnosisId !== undefined)
  @IsString()
  @IsNotEmpty()
  diagnosisId?: string;

  @ApiPropertyOptional({
    description: '피부 측정값 스냅샷 (기존 프론트 호환 — diagnosisId 있으면 무시)',
  })
  @ValidateIf(
    (dto: GenerateRecommendationDto) =>
      dto.diagnosisId === undefined || dto.skinScore !== undefined,
  )
  @IsDefined({ message: 'diagnosisId가 없으면 skinScore가 필요합니다' })
  @IsObject()
  skinScore?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: '날씨 스냅샷 (기존 프론트 호환 — diagnosisId 있으면 서버가 DB에서 조회)',
  })
  @ValidateIf(
    (dto: GenerateRecommendationDto) =>
      dto.diagnosisId === undefined || dto.weather !== undefined,
  )
  @IsDefined({ message: 'diagnosisId가 없으면 weather가 필요합니다' })
  @ValidateNested()
  @Type(() => WeatherInputDto)
  weather?: WeatherInputDto;
}
